const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const NodeCache = require("node-cache");
const Bottleneck = require("bottleneck");

// Moduli esterni (organizzati in un array per facile espansione)
const scrapers = {
  RD: require("./rd"),
  Corsaro: require("./corsaro"),
  Knaben: require("./knaben"),
  TorrentMagnet: require("./torrentmagnet"),
  UIndex: require("./uindex"),
  External: require("./external"),
};

// Costanti e configurazione (raggruppate per chiarezza)
const CONFIG = {
  CINEMETA_URL: "https://v3-cinemeta.strem.io",
  REAL_SIZE_FILTER: 150 * 1024 * 1024, // 150MB threshold for filtering small files
  TIMEOUT_TMDB: 3000, // Timeout for TMDB API requests
  SCRAPER_TIMEOUT: 4000, // Increased timeout for thorough pack searches
};

const CACHE_TTL = {
  STD: 300, // Standard TTL for internal cache
  CHECK_PERIOD: 60, // Cache check period
};

const CACHE_HEADERS_DEFAULTS = {
  cacheMaxAge: 14400,
  staleRevalidate: 86400,
  staleError: 604800,
};

const LIMITERS = {
  scraper: new Bottleneck({ maxConcurrent: 20, minTime: 20 }), // Ultrafast scraper limiter
  rd: new Bottleneck({ maxConcurrent: 3, minTime: 50 }), // Real-Debrid limiter to prevent rate limiting
};

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const internalCache = new NodeCache({
  stdTTL: CACHE_TTL.STD,
  checkperiod: CACHE_TTL.CHECK_PERIOD,
});

// Manifest base (immutable, con deep freeze per prevenire modifiche accidentali)
const MANIFEST_BASE = Object.freeze({
  id: "org.community.corsaro-brain-ita-strict-restore",
  version: "25.5.5", // Pack Hunter Edition
  name: "Corsaro + TorrentMagnet (PACK HUNTER)",
  description:
    "🇮🇹 Motore V25.5.5: Trova intere stagioni (Pack) sui tracker italiani se il singolo episodio manca.",
  resources: ["catalog", "stream"],
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "tmdb_trending", name: "🇮🇹 Top Film Italia" },
    { type: "series", id: "tmdb_series_trending", name: "📺 Serie TV del Momento" },
    { type: "movie", id: "tmdb_4k", name: "🌟 4K UHD Italia" },
    { type: "movie", id: "tmdb_anime", name: "⛩️ Anime Movies" },
  ],
  idPrefixes: ["tmdb", "tt"],
  behaviorHints: { configurable: true, configurationRequired: true },
});

// Utilities (funzioni helper ottimizzate e riutilizzabili)
function formatBytes(bytes) {
  if (!+bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0;
  if (typeof sizeStr === "number") return sizeStr;
  const cleanStr = sizeStr.toString().replace(/,/g, ".").toUpperCase();
  const match = cleanStr.match(/([\d.]+)\s*([KMGTP]?B)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2];
  const multipliers = {
    TB: 1024 ** 4,
    GB: 1024 ** 3,
    MB: 1024 ** 2,
    KB: 1024,
    B: 1,
  };
  return val * (multipliers[unit] || 1);
}

function getConfig(configStr) {
  try {
    return JSON.parse(Buffer.from(configStr, "base64").toString());
  } catch (e) {
    console.error("Invalid config:", e.message);
    return {};
  }
}

function applyCacheHeaders(res, data) {
  const cacheHeaders = {
    cacheMaxAge: "max-age",
    staleRevalidate: "stale-while-revalidate",
    staleError: "stale-if-error",
  };
  const parts = Object.entries(cacheHeaders)
    .map(([prop, header]) => {
      const value =
        data[prop] !== undefined ? data[prop] : CACHE_HEADERS_DEFAULTS[prop];
      return Number.isInteger(value) ? `${header}=${value}` : null;
    })
    .filter(Boolean);
  if (parts.length > 0) {
    res.setHeader("Cache-Control", `${parts.join(", ")}, public`);
  }
}

function withTimeout(promise, ms) {
  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve([]), ms)
  );
  return Promise.race([promise, timeoutPromise]);
}

// Logica Pack Hunter (ottimizzata con regex precompilate e caching interno)
const REGEX_CACHE = {
  normalize: /[^a-z0-9\s]/g,
  safeTitle: (title) => new RegExp(title.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i"),
};

function normalize(str) {
  return str
    .toLowerCase()
    .replace(REGEX_CACHE.normalize, " ")
    .split(" ")
    .filter((w) => w.length > 1);
}

function isTitleSafe(queryTitle, fileTitle) {
  const queryTokens = normalize(queryTitle);
  const fileTokens = normalize(fileTitle);
  if (queryTokens.length === 0) return true;
  const matchCount = queryTokens.filter((token) =>
    fileTokens.includes(token)
  ).length;
  return matchCount > 0;
}

const FALSE_POSITIVES = new Map([
  ["DR. HOUSE", /ANUBIS/i],
  ["HOUSE", /ANUBIS/i],
]);

function isFalsePositive(queryTitle, itemTitle) {
  const q = queryTitle.toUpperCase();
  const t = itemTitle.toUpperCase();
  for (const [key, regex] of FALSE_POSITIVES) {
    if (q.includes(key) && regex.test(t)) return true;
  }
  return false;
}

function buildSeriesQueriesForSeries(metadata) {
  const { title, originalTitle: original, season, episode } = metadata;
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  let queries = new Set([
    `${title} S${s}E${e}`,
    `${title} ${season}x${e}`,
    `${title} Stagione ${season}`,
    `${title} Season ${season}`,
    `${title} S${s}`,
  ]);

  if (original && original !== title) {
    queries.add(`${original} S${s}E${e}`);
    queries.add(`${original} Season ${season}`);
  }

  const abbreviations = {
    "The Walking Dead": "TWD",
    "Game of Thrones": "GoT",
    "Breaking Bad": "BB",
    "The Boys": "Boys",
    "House of the Dragon": "HotD",
    "The Last of Us": "TLOU",
    "Loki": "Loki",
    "One Piece": "OnePiece",
    "Attack on Titan": "AoT",
    "Demon Slayer": "Kimetsu",
    "Jujutsu Kaisen": "JJK",
  };

  Object.entries(abbreviations).forEach(([full, abb]) => {
    if (title.toLowerCase().includes(full.toLowerCase())) {
      queries.add(`${abb} S${s}E${e}`);
    }
  });

  return Array.from(queries);
}

function buildMovieQueries(metadata) {
  const { title, originalTitle: original, year } = metadata;
  let queries = new Set([`${title} ${year}`]);
  if (!title.toUpperCase().includes("ITA")) {
    queries.add(`${title} ITA`);
  }
  if (original && original !== title) {
    queries.add(`${original} ${year}`);
  }
  return Array.from(queries);
}

function isSafeForItalian(item) {
  if (item.source === "Corsaro") return true;
  const t = item.title.toUpperCase();
  if (
    t.includes("ITA") ||
    t.includes("ITALIAN") ||
    t.includes("IT-EN") ||
    (t.includes("MULTI") && !t.includes("FRENCH"))
  )
    return true;
  if (item.source === "Brain P2P" && !t.includes("VOST")) return true;
  if (
    (t.includes("ENG") || t.includes("VOST") || t.includes("VOSUB")) &&
    !t.includes("MULTI")
  )
    return false;
  return false;
}

// Cataloghi (ottimizzati con caching e error handling robusto)
async function generateCatalog(type, id, config, skip = 0) {
  const page = Math.floor(skip / 20) + 1;
  const cacheKey = `catalog:${type}:${id}:${page}`;
  const cached = internalCache.get(cacheKey);
  if (cached) return cached;

  if (!config.tmdb) return { metas: [] };

  const urls = {
    tmdb_trending: `https://api.themoviedb.org/3/trending/movie/day?api_key=${config.tmdb}&language=it-IT&page=${page}`,
    tmdb_series_trending: `https://api.themoviedb.org/3/trending/tv/day?api_key=${config.tmdb}&language=it-IT&page=${page}`,
    tmdb_4k: `https://api.themoviedb.org/3/discover/movie?api_key=${config.tmdb}&language=it-IT&sort_by=popularity.desc&primary_release_date.gte=2022-01-01&page=${page}`,
    tmdb_anime: `https://api.themoviedb.org/3/discover/movie?api_key=${config.tmdb}&language=it-IT&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`,
  };

  const url = urls[id];
  if (!url) return { metas: [], cacheMaxAge: 3600 };

  try {
    const { data } = await axios.get(url);
    const metas = data.results
      .map((m) => ({
        id: `tmdb:${m.id}`,
        type,
        name: m.title || m.name,
        poster: m.poster_path
          ? `https://image.tmdb.org/t/p/w500${m.poster_path}`
          : null,
        description: m.overview,
      }))
      .filter((m) => m.poster);

    const result = {
      metas,
      cacheMaxAge: CACHE_HEADERS_DEFAULTS.cacheMaxAge,
      staleRevalidate: CACHE_HEADERS_DEFAULTS.staleRevalidate,
    };
    internalCache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.error(`Catalog error for ${id}:`, e.message);
    return { metas: [] };
  }
}

// Stream & Logic (core ottimizzato: parallelismo massimo, filtri efficienti)
async function getCinemetaMetadata(id, type) {
  try {
    const cleanId = id.split(":")[0];
    const { data } = await axios.get(
      `${CONFIG.CINEMETA_URL}/meta/${type}/${cleanId}.json`
    );
    const meta = data.meta;
    if (!meta) return null;
    return {
      title: meta.name,
      originalTitle: meta.name,
      year: meta.year
        ? meta.year.includes("–")
          ? meta.year.split("–")[0]
          : meta.year
        : null,
      isSeries: type === "series",
    };
  } catch (e) {
    console.error("Cinemeta error:", e.message);
    return null;
  }
}

async function getMetadata(id, type, tmdbKey) {
  let seasonNum = 1,
    episodeNum = 1,
    tmdbId = id;
  if (type === "series" && id.includes(":")) {
    const parts = id.split(":");
    tmdbId = parts[0];
    seasonNum = parseInt(parts[1]);
    episodeNum = parseInt(parts[2]);
  }

  try {
    if (tmdbKey) {
      let url;
      if (tmdbId.startsWith("tt")) {
        url = `https://api.themoviedb.org/3/find/${tmdbId}?api_key=${tmdbKey}&language=it-IT&external_source=imdb_id`;
      } else if (tmdbId.startsWith("tmdb:")) {
        const cleanId = tmdbId.split(":")[1];
        url = `https://api.themoviedb.org/3/${type === "movie" ? "movie" : "tv"}/${cleanId}?api_key=${tmdbKey}&language=it-IT`;
      }
      if (url) {
        const { data } = await axios.get(url, { timeout: CONFIG.TIMEOUT_TMDB });
        const details =
          type === "movie"
            ? data.movie_results[0]
            : data.tv_results[0] || data;
        if (details) {
          return {
            title: details.title || details.name,
            originalTitle: details.original_title || details.original_name,
            year: (details.release_date || details.first_air_date)?.split(
              "-"
            )[0],
            isSeries: type === "series",
            season: seasonNum,
            episode: episodeNum,
          };
        }
      }
    }
  } catch (e) {
    console.error("TMDB error:", e.message);
  }

  if (tmdbId.startsWith("tt")) {
    const cinemeta = await getCinemetaMetadata(tmdbId, type);
    if (cinemeta)
      return { ...cinemeta, season: seasonNum, episode: episodeNum };
  }
  return null;
}

function isExactEpisodeMatch(torrentTitle, season, episode) {
  if (!torrentTitle) return false;
  const t = torrentTitle.toLowerCase();
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");

  const regexPatterns = [
    new RegExp(`s${s}e${e}`, "i"),
    new RegExp(`${season}x${e}`, "i"),
    new RegExp(`(stagione|season|s)${season}\\s*(completa|complete|pack|tutta)`, "i"),
  ];

  if (regexPatterns.some((regex) => regex.test(t))) return true;

  if (t.includes(`s${s}`) && !t.match(/e\d{2}/i)) return true;
  if (t.includes(`stagione ${season}`) && !t.match(/episodio/i)) return true;

  return false;
}

function extractStreamInfo(title) {
  const t = title.toLowerCase();
  let quality = "Unknown";
  if (/2160p|4k|uhd/.test(t)) quality = "4k";
  else if (/1080p/.test(t)) quality = "1080p";
  else if (/720p/.test(t)) quality = "720p";
  else if (/480p|sd/.test(t)) quality = "SD";

  const extra = [];
  if (/hdr|10bit/.test(t)) extra.push("HDR");
  if (/dolby|vision/.test(t)) extra.push("DV");
  if (/hevc|x265/.test(t)) extra.push("HEVC");
  if (/5.1|ac3/.test(t)) extra.push("5.1");

  const lang = [];
  if (t.includes("ita")) lang.push("ITA 🇮🇹");
  if (t.includes("multi") && t.includes("ita")) lang.push("MULTI 🌐");

  return { quality, lang, extraInfo: extra.join(" | ") };
}

async function generateStream(type, id, config, userConfStr) {
  const { rd, tmdb } = config;
  const onlyIta = config.filters?.onlyIta !== false;
  const filters = config.filters || {};

  if (!rd)
    return {
      streams: [{ title: "⚠️ Configura RealDebrid nel Manifest" }],
      cacheMaxAge: 300,
    };

  const cacheKey = `stream:${userConfStr}:${type}:${id}`;
  const cached = internalCache.get(cacheKey);
  if (cached) return cached;

  console.log(`⚡ STREAM: ${id} | Mode: ${onlyIta ? "STRICT" : "GLOBAL"}`);

  try {
    const metadata = await getMetadata(id, type, tmdb);
    if (!metadata)
      return {
        streams: [{ title: "⚠️ Metadata non trovato" }],
        cacheMaxAge: 300,
      };

    let queries = metadata.isSeries
      ? buildSeriesQueriesForSeries(metadata)
      : buildMovieQueries(metadata);
    queries = [...new Set(queries)]; // Deduplica queries
    console.log(`🧠 Brain Engine v4 (Pack Hunter) - Query: ${queries.length}`);

    // Fase 1: Scrapers interni (parallelizzati con limiter)
    const internalPromises = queries.flatMap((q) =>
      [
        scrapers.Corsaro,
        scrapers.UIndex,
        scrapers.Knaben,
        scrapers.TorrentMagnet,
      ].map((scraper) =>
        LIMITERS.scraper.schedule(() =>
          withTimeout(scraper.searchMagnet(q, metadata.year), CONFIG.SCRAPER_TIMEOUT).catch(() => [])
        )
      )
    );

    const internalResultsRaw = (await Promise.all(internalPromises)).flat();

    const validInternalResults = internalResultsRaw.filter((item) => {
      if (!item?.magnet || !item.title) return false;
      if (onlyIta && !isSafeForItalian(item)) return false;
      if (isFalsePositive(metadata.title, item.title)) return false;
      if (
        metadata.originalTitle &&
        isFalsePositive(metadata.originalTitle, item.title)
      )
        return false;
      if (!isTitleSafe(metadata.title, item.title)) return false;
      return true;
    });

    let allResults = [...validInternalResults];
    console.log(
      `🔍 Risultati Interni (Inclusi Pack): ${validInternalResults.length}`
    );

    // Fase 2: External scraper (solo se risultati insufficienti)
    if (validInternalResults.length <= 2) {
      const mainQuery = queries[0];
      const imdbId = id.startsWith("tt") ? id.split(":")[0] : null;
      try {
        let externalResults = await withTimeout(
          scrapers.External.searchMagnet(id, type, imdbId, mainQuery),
          CONFIG.SCRAPER_TIMEOUT
        );
        externalResults = externalResults
          .map((item) => ({ ...item, source: "Brain P2P" }))
          .filter(
            (item) =>
              !isFalsePositive(metadata.title, item.title) &&
              isTitleSafe(metadata.title, item.title)
          );
        allResults = [...allResults, ...externalResults];
      } catch (err) {
        console.error("External Timeout/Error:", err.message);
      }
    }

    if (allResults.length === 0)
      return { streams: [{ title: `🚫 Nessun risultato (Riprova)` }], cacheMaxAge: 10 };

    // Deduplicazione (usando Map per efficienza)
    const uniqueResultsMap = new Map();
    allResults.forEach((item) => {
      if (!item?.title || !item.magnet) return;
      if (onlyIta && !isSafeForItalian(item)) return;
      const hashMatch = item.magnet.match(/btih:([A-F0-9]{40})/i);
      const key = hashMatch ? hashMatch[1].toUpperCase() : item.magnet;
      if (!uniqueResultsMap.has(key)) uniqueResultsMap.set(key, item);
    });

    let uniqueResults = Array.from(uniqueResultsMap.values());

    // Applicazione filtri (in chain per efficienza)
    if (metadata.isSeries)
      uniqueResults = uniqueResults.filter((item) =>
        isExactEpisodeMatch(item.title, metadata.season, metadata.episode)
      );
    if (filters.no4k)
      uniqueResults = uniqueResults.filter(
        (i) => !/2160p|4k|uhd/i.test(i.title)
      );
    if (filters.noCam)
      uniqueResults = uniqueResults.filter(
        (i) => !/cam|dvdscr|hdcam|telesync|tc|ts/i.test(i.title)
      );

    // Sorting per size descending
    uniqueResults.sort((a, b) => parseSize(b.size) - parseSize(a.size));

    const topResults = uniqueResults.slice(0, 70);

    // Risoluzione streams con RD (parallelizzata)
    const resolutionPromises = topResults.map((item) =>
      LIMITERS.rd.schedule(async () => {
        try {
          const streamData = await scrapers.RD.getStreamLink(rd, item.magnet);
          if (streamData?.type === "ready" && streamData.size < CONFIG.REAL_SIZE_FILTER)
            return null;
          if (streamData?.filename?.toLowerCase().match(/\.rar|\.zip/))
            return null;

          const fileTitle = streamData?.filename || item.title;
          const { quality, lang, extraInfo } = extractStreamInfo(fileTitle);
          const displayLang = lang.join(" / ") || "ITA 🇮🇹";
          let nameTag = streamData
            ? `[RD ⚡] ${item.source}`
            : `[RD ⏳] ${item.source}`;
          nameTag += `\n${quality}`;
          let finalSize = streamData?.size
            ? formatBytes(streamData.size)
            : item.size || "?? GB";

          let titleStr;
          const isPack =
            finalSize.includes("GB") && parseFloat(finalSize) > 5;
          if (isPack) {
            titleStr = `📦 STAGIONE PACK\n📄 ${fileTitle}\n💾 ${finalSize}`;
          } else {
            titleStr = `📄 ${fileTitle}\n💾 ${finalSize}`;
          }

          if (extraInfo) titleStr += ` | ${extraInfo}`;
          if (
            /AC3|DTS/i.test(fileTitle.toUpperCase())
          )
            titleStr += " | 🔊 AUDIO PRO";
          titleStr += `\n🔊 ${displayLang}`;

          if (streamData) {
            return {
              name: nameTag,
              title: titleStr,
              url: streamData.url,
              behaviorHints: { notWebReady: false },
            };
          } else if (filters.showFake) {
            return {
              name: nameTag.replace("⚡", "⚠️"),
              title: `${titleStr}\n⚠️ Link Magnet (Download Richiesto)`,
              url: item.magnet,
              behaviorHints: { notWebReady: true },
            };
          }
          return null;
        } catch (e) {
          console.error("RD error for item:", e.message);
          return null;
        }
      })
    );

    const resolvedStreams = (await Promise.all(resolutionPromises)).filter(
      Boolean
    );

    const finalResponse = {
      streams:
        resolvedStreams.length > 0
          ? resolvedStreams
          : [{ title: "🚫 Nessun file valido su RD." }],
      cacheMaxAge: resolvedStreams.length > 0 ? 1800 : 30,
      staleRevalidate: resolvedStreams.length > 0 ? 3600 : 0,
    };
    internalCache.set(cacheKey, finalResponse);
    return finalResponse;
  } catch (error) {
    console.error("🔥 Errore generale:", error.message);
    return {
      streams: [{ title: `Errore: ${error.message}` }],
      cacheMaxAge: 60,
    };
  }
}

// Routes (con error handling e logging)
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.get("/:userConf/manifest.json", (req, res) => {
  const config = getConfig(req.params.userConf);
  const m = { ...MANIFEST_BASE };
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.get("host");
  m.logo = `${protocol}://${host}/logo.png`;
  if (config.tmdb && config.rd)
    m.behaviorHints = { configurable: true, configurationRequired: false };
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json(m);
});

app.get("/:userConf/catalog/:type/:id/:extra?.json", async (req, res) => {
  try {
    let skip = 0;
    if (req.params.extra) {
      const match = req.params.extra.match(/skip=(\d+)/);
      if (match) skip = parseInt(match[1]);
    }
    const result = await generateCatalog(
      req.params.type,
      req.params.id,
      getConfig(req.params.userConf),
      skip
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
  } catch (e) {
    res.status(500).json({ metas: [] });
  }
});

app.get("/:userConf/catalog/:type/:id.json", async (req, res) => {
  try {
    const result = await generateCatalog(
      req.params.type,
      req.params.id,
      getConfig(req.params.userConf)
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
  } catch (e) {
    res.status(500).json({ metas: [] });
  }
});

app.get("/:userConf/stream/:type/:id.json", async (req, res) => {
  try {
    const result = await generateStream(
      req.params.type,
      req.params.id.replace(".json", ""),
      getConfig(req.params.userConf),
      req.params.userConf
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
  } catch (e) {
    res.status(500).json({ streams: [{ title: "Errore interno" }] });
  }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () =>
  console.log(`Addon v25.5.5 (PACK HUNTER) avviato su porta ${PORT}!`)
);
