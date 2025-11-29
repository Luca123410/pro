// Corsaro Brain - CAPOLAVORO (Stile: CINEMA PRO + SECURITY + MULTI FORZATO)
// Versione: 25.8.4-multi-ita
// Features: Fuzzy Match, Helmet Security, Cinema Layout, MULTI=ITA

const express = require("express");
const cors = require("cors");
const helmet = require("helmet"); // SICUREZZA
const path = require("path");
const axios = require("axios");
const NodeCache = require("node-cache");
const Bottleneck = require("bottleneck");
const FuzzySet = require("fuzzyset");

// --- CONFIGURAZIONE ---
const CONFIG = {
  CINEMETA_URL: "https://v3-cinemeta.strem.io",
  REAL_SIZE_FILTER: 80 * 1024 * 1024, // Filtra file < 80MB (fake/sample)
  TIMEOUT_TMDB: 4000,
  SCRAPER_TIMEOUT: 5000, // Tempo max per ogni scraper
  MAX_RESULTS: 100,      // Limite risultati processati
  FUZZY_THRESHOLD: 0.7,  // 70% di somiglianza richiesta per il titolo
};

const CACHE_TTL = { STD: 300, CHECK: 60 };
const CACHE_HEADERS = { cacheMaxAge: 7200, staleRevalidate: 43200, staleError: 86400 };

// --- LIMITERS (Anti-Ban) ---
const LIMITERS = {
  scraper: new Bottleneck({ maxConcurrent: 40, minTime: 10 }), // Aggressivo ma controllato
  rd: new Bottleneck({ maxConcurrent: 10, minTime: 100 }),     // Rispetta rate-limit RD
};

// --- MODULI SCRAPER (Array Dinamico) ---
const SCRAPER_MODULES = [
  require("./rd"),            // Modulo RD interno
  require("./corsaro"),       // Corsaro (Main)
  require("./knaben"),        // Knaben
  require("./torrentmagnet"), // TorrentMagnet
  require("./uindex"),        // UIndex
];

// Fallback usati solo se i principali trovano < 5 risultati
const FALLBACK_SCRAPERS = [
  require("./external"),
];

// --- APP & CACHE ---
const app = express();
app.use(helmet()); // ATTIVA PROTEZIONE HEADER
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
const internalCache = new NodeCache({ stdTTL: CACHE_TTL.STD, checkperiod: CACHE_TTL.CHECK, useClones: false });

// --- MANIFEST ---
const MANIFEST_BASE = Object.freeze({
  id: "org.community.corsaro-brain-ita-capolavoro",
  version: "25.8.4",
  name: "Corsaro + TorrentMagnet (CINEMA PRO)",
  description: "🇮🇹 Risultati ITA, Fuzzy Match, RD Instant, Layout Cinema",
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

// --- UTILITIES ---

const UNITS = ["B", "KB", "MB", "GB", "TB"];
function formatBytes(bytes) {
  if (!+bytes) return "0 B";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${UNITS[i]}`;
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0;
  if (typeof sizeStr === "number") return sizeStr;
  const m = sizeStr.toString().match(/([\d.]+)\s*([KMGTP]?B)/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const mult = { TB: 1099511627776, GB: 1073741824, MB: 1048576, KB: 1024, B: 1 };
  return val * (mult[unit] || 1);
}

function normalize(str = "") {
  return String(str).toLowerCase()
    .replace(/\./g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ** FUZZY MATCHING **
function isTitleSafe(metaTitle, filename) {
  const q = normalize(metaTitle);
  const f = normalize(filename);

  if (q.length < 5) return f.includes(q);
  if (f.includes(q)) return true;

  try {
    const fs = FuzzySet([q]);
    const match = fs.get(f);
    if (match && match[0][0] > CONFIG.FUZZY_THRESHOLD) return true;
  } catch (e) {
    const kws = q.split(" ").filter(w => w.length > 3);
    const matches = kws.filter(k => f.includes(k));
    return matches.length >= Math.ceil(kws.length * 0.7);
  }
  return false;
}

// ** ITALIAN FILTER (ACCETTA TUTTO I MULTI) **
function isSafeForItalian(item) {
  if (!item || !item.title) return false;
  
  const trusted = ["Corsaro", "Gams", "TorrentMagnet", "Marrow", "P2P"];
  if (trusted.includes(item.source)) return true;

  // Accetta ITA, ITALIAN, IT e anche MULTI/MUI
  const strictRegex = /\b(ITA|ITALIAN|IT|MULTI|MUI)\b/i;
  
  return strictRegex.test(item.title);
}

// --- NUOVE UTILITIES PER UN LOOK "FIGHISSIMO" ---

function cleanFilename(filename) {
  if (!filename) return "";
  const yearMatch = filename.match(/(19|20)\d{2}/);
  let cleanTitle = filename;
  let year = "";
  
  if (yearMatch) {
    year = ` (${yearMatch[0]})`;
    cleanTitle = filename.substring(0, yearMatch.index);
  }

  cleanTitle = cleanTitle.replace(/[._]/g, " ").trim();
  cleanTitle = cleanTitle.replace(/ s\d+e\d+.*$/i, ""); 
  
  return `${cleanTitle}${year}`;
}

// ** EXTENDED MEDIA TAGS (MULTI = BANDIERA ITA) **
function extractStreamInfo(title) {
  const t = String(title).toLowerCase();
  
  // Video Resolution
  let q = "HD";
  let qIcon = "📺";
  if (/2160p|4k|uhd/.test(t)) { q = "4K"; qIcon = "✨"; }
  else if (/1080p/.test(t)) { q = "1080p"; qIcon = "🌕"; }
  else if (/720p/.test(t)) { q = "720p"; qIcon = "🌗"; }
  else if (/480p|\bsd\b/.test(t)) { q = "SD"; qIcon = "🌑"; }

  const videoTags = [];
  const audioTags = [];
  
  // Video Tech
  if (/hdr/.test(t)) videoTags.push("HDR");
  if (/dolby|vision|\bdv\b/.test(t)) videoTags.push("DV");
  if (/imax/.test(t)) videoTags.push("IMAX");
  if (/h265|hevc|x265/.test(t)) videoTags.push("HEVC");
  if (/10bit/.test(t)) videoTags.push("10bit");
  if (/3d/.test(t)) videoTags.push("3D");

  // Audio Tech
  if (/atmos/.test(t)) audioTags.push("Atmos");
  if (/dts:?x?|\bdts\b/.test(t)) audioTags.push("DTS");
  if (/truehd/.test(t)) audioTags.push("TrueHD");
  if (/dd\+|eac3/.test(t)) audioTags.push("DD+");
  if (/5\.1/.test(t)) audioTags.push("5.1");
  if (/7\.1/.test(t)) audioTags.push("7.1");

  // --- LOGICA LINGUA FORZATA ---
  let lang = "🇬🇧 ENG"; 

  // Se c'è ITA
  if (/\b(ita|italian|it)\b/i.test(t)) {
      lang = "🇮🇹 ITA";
  } 
  // Se c'è MULTI -> FORZIAMO LA BANDIERA ITA
  else if (/multi|mui/i.test(t)) {
      lang = "🇮🇹 MULTI"; 
  }

  let detailsParts = [];
  if (videoTags.length) detailsParts.push(`✨ ${videoTags.join(" ")}`);
  if (audioTags.length) detailsParts.push(`🔊 ${audioTags.join(" ")}`);
  
  const info = detailsParts.join(" • ");

  return { quality: q, qIcon, info, lang };
}

// ** FORMATTAZIONE OUTPUT (Layout 🌠) **
function formatStreamTitleCinePro(fileTitle, source, size) {
  const { quality, qIcon, info, lang } = extractStreamInfo(fileTitle);
  
  const sizeStr = size ? `📦 ${formatBytes(size)}` : "📦 ?";
  const cleanTitleDisplay = cleanFilename(fileTitle);
  
  // Layout: [RD 🌠 ✨ 4K] Fonte
  const name = `[RD 🌠 ${qIcon} ${quality}] ${source}`;
  
  const detailsLine = [sizeStr, info, lang].filter(Boolean).join(" • ");
  const title = `${cleanTitleDisplay}\n${detailsLine}`;
  
  return { name, title };
}

// --- QUERY BUILDERS ---
function buildSeriesQueries(meta) {
  const { title, originalTitle: orig, season: s, episode: e } = meta;
  const ss = String(s).padStart(2, "0");
  const ee = String(e).padStart(2, "0");
  const queries = new Set([
    `${title} S${ss}E${ee}`,
    `${title} ${s}x${ee}`,
    `${title} S${ss}`,
    `${title} Season ${s}`
  ]);
  if (orig && orig !== title) {
    queries.add(`${orig} S${ss}E${ee}`);
    queries.add(`${orig} S${ss}`);
  }
  return [...queries];
}

function buildMovieQueries(meta) {
  const { title, originalTitle: orig, year } = meta;
  const q = [`${title} ${year}`, `${title} ITA`];
  if (orig && orig !== title) q.push(`${orig} ${year}`);
  return q.filter(Boolean);
}

// --- METADATA ---
async function getMetadata(id, type, tmdbKey) {
  try {
    let tmdbId = id, s = 1, e = 1;
    if (type === "series" && id.includes(":")) [tmdbId, s, e] = id.split(":");
    
    // Cinemeta Base
    const { data: cData } = await axios.get(`${CONFIG.CINEMETA_URL}/meta/${type}/${tmdbId.split(":")[0]}.json`, { timeout: 2000 }).catch(() => ({ data: {} }));
    
    let meta = cData?.meta ? {
      title: cData.meta.name,
      originalTitle: cData.meta.name,
      year: cData.meta.year?.split("–")[0],
      isSeries: type === "series",
      season: parseInt(s),
      episode: parseInt(e)
    } : null;

    // Arricchimento TMDB
    if (tmdbKey) {
      let url;
      if (tmdbId.startsWith("tt")) url = `https://api.themoviedb.org/3/find/${tmdbId}?api_key=${tmdbKey}&language=it-IT&external_source=imdb_id`;
      else if (tmdbId.startsWith("tmdb:")) url = `https://api.themoviedb.org/3/${type === "movie" ? "movie" : "tv"}/${tmdbId.split(":")[1]}?api_key=${tmdbKey}&language=it-IT`;
      
      if (url) {
        const { data } = await axios.get(url, { timeout: CONFIG.TIMEOUT_TMDB }).catch(() => ({ data: null }));
        if (data) {
          const det = data.movie_results?.[0] || data.tv_results?.[0] || data;
          if (det) {
            meta = {
              ...meta,
              title: det.title || det.name || meta?.title,
              originalTitle: det.original_title || det.original_name || meta?.originalTitle,
              year: (det.release_date || det.first_air_date)?.split("-")[0] || meta?.year,
              isSeries: type === "series",
              season: parseInt(s),
              episode: parseInt(e)
            };
          }
        }
      }
    }
    return meta;
  } catch { return null; }
}

// --- REAL-DEBRID: INSTANT AVAILABILITY CHECK ---
async function resolveRdLinkOptimized(rdKey, item, meta, showFake) {
  try {
    const hash = item.magnet.match(/btih:([a-f0-9]{40})/i)?.[1];
    let isInstant = false;
    
    if (hash) {
      const ia = await SCRAPER_MODULES[0].checkInstantAvailability(rdKey, [hash]); 
      if (ia && ia[hash] && ia[hash].rd && ia[hash].rd.length > 0) {
        isInstant = true;
      }
    }

    const streamData = await SCRAPER_MODULES[0].getStreamLink(rdKey, item.magnet);
    if (!streamData) return null;

    if (streamData.type === "ready" && streamData.size < CONFIG.REAL_SIZE_FILTER) return null;
    if (streamData.filename?.match(/\.(rar|zip|exe|txt|nfo|jpg)$/i)) return null;

    const fileTitle = streamData.filename || item.title;
    const sizeVal = streamData.size || item.size;
    
    const { name, title } = formatStreamTitleCinePro(fileTitle, item.source, sizeVal);
    
    return { 
      name: name, 
      title: title, 
      url: streamData.url, 
      behaviorHints: { notWebReady: false, bingieGroup: "corsaro-rd" } 
    };

  } catch (e) {
    if (showFake) {
       return { 
         name: `[P2P ⚠️] ${item.source}`, 
         title: `${item.title}\n⚠️ Cache RD Assente`, 
         url: item.magnet, 
         behaviorHints: { notWebReady: true } 
       };
    }
    return null;
  }
}

// --- RANKING ALGORITHM (BOOST MULTI & ITA) ---
function rankAndFilterResults(results, meta, config) {
  return results.map(item => {
    const info = extractStreamInfo(item.title || "");
    const size = item._size || parseSize(item.size) || 0;
    let score = 0;

    // 1. Language Boost (ITA e MULTI valgono uguale ora)
    if (info.lang.includes("ITA") || info.lang.includes("MULTI")) {
        score += 5000;
    }

    // 2. Resolution
    if (info.quality === "4K") score += 1200;
    else if (info.quality === "1080p") score += 800;
    else if (info.quality === "720p") score += 400;

    // 3. Tech Boost
    if (/atmos/i.test(info.info)) score += 300;
    if (/vision|dv/i.test(info.info)) score += 250;
    if (/hdr/i.test(info.info)) score += 200;
    if (/dts/i.test(info.info)) score += 100;

    // 4. Source Reliability
    if (item.source === "Corsaro") score += 500;

    // 5. Size Logic
    score += Math.min(Math.floor(size / (1024 * 1024 * 100)), 1000);

    // 6. Keywords
    if (/remux/i.test(item.title)) score += 400;
    
    // Series Logic
    if (meta.isSeries) {
        const s = String(meta.season).padStart(2, "0");
        const e = String(meta.episode).padStart(2, "0");
        const exactEpRegex = new RegExp(`S${s}E${e}|${meta.season}x${e}\\b`, "i");
        
        if (exactEpRegex.test(item.title)) {
            score += 1500;
        } else if (/pack|season|stagione|complete/i.test(item.title)) {
            score -= 200; 
        }
    }

    // Penalties
    if (/cam|ts|tc|screener/i.test(item.title)) score -= 10000;

    return { item, score };
  })
  .filter(x => x.item)
  .sort((a, b) => b.score - a.score)
  .map(x => x.item);
}

// --- MAIN GENERATOR ---
async function generateStream(type, id, config, userConfStr) {
  if (!config.rd) return { streams: [{ name: "⚠️ CONFIG", title: "Serve RealDebrid API Key" }] };
  
  const cacheKey = `str:${userConfStr}:${type}:${id}`;
  const cached = internalCache.get(cacheKey); if (cached) return cached;

  const meta = await getMetadata(id, type, config.tmdb); if (!meta) return { streams: [] };
  const queries = meta.isSeries ? buildSeriesQueries(meta) : buildMovieQueries(meta);
  const onlyIta = config.filters?.onlyIta !== false;

  // --- ESECUZIONE DINAMICA SCRAPER ---
  let promises = [];
  queries.forEach(q => {
    SCRAPER_MODULES.forEach(scraper => {
      if (scraper.searchMagnet) {
        promises.push(
          LIMITERS.scraper.schedule(() => 
            withTimeout(scraper.searchMagnet(q, meta.year, type, id.split(":")[0]), CONFIG.SCRAPER_TIMEOUT)
            .catch(err => [])
          )
        );
      }
    });
  });

  let resultsRaw = (await Promise.all(promises)).flat();
  
  // Clean preliminare
  resultsRaw = resultsRaw.filter(item => 
    item?.magnet && 
    isTitleSafe(meta.title, item.title) && 
    (!onlyIta || isSafeForItalian(item)) // Ora isSafeForItalian accetta MULTI
  );

  // Fallback
  if (resultsRaw.length < 5) {
    const extPromises = [];
    queries.forEach(q => {
      FALLBACK_SCRAPERS.forEach(fb => extPromises.push(LIMITERS.scraper.schedule(() => withTimeout(fb.searchMagnet(q, meta.year, type, id.split(":")[0]), CONFIG.SCRAPER_TIMEOUT).catch(() => []))));
    });
    const extResults = (await Promise.all(extPromises)).flat();
    resultsRaw = [...resultsRaw, ...extResults.filter(i => i?.magnet && isSafeForItalian(i) && isTitleSafe(meta.title, i.title))];
  }

  // Deduplica & Clean Avanzato
  const seen = new Set(); 
  let cleanResults = [];
  
  for (const item of resultsRaw) {
    if (!item?.magnet) continue;
    const hash = item.magnet.match(/btih:([a-f0-9]{40})/i)?.[1].toUpperCase() || item.magnet;
    if (seen.has(hash)) continue;
    
    if (config.filters?.no4k && /2160p|4k|uhd/i.test(item.title)) continue;
    if (config.filters?.noCam && /cam|tc|ts/i.test(item.title)) continue;
    
    if (meta.isSeries) {
      const s = meta.season, e = meta.episode;
      const matchEp = new RegExp(`s0?${s}[xe]0?${e}`, "i").test(item.title);
      const matchPack = /complete|completa|pack|stagione/i.test(item.title);
      if (!matchEp && !matchPack) continue;
    }

    seen.add(hash);
    item._size = parseSize(item.size);
    cleanResults.push(item);
  }

  if (!cleanResults.length) return { streams: [{ name: "⛔", title: "Nessun risultato trovato" }] };

  // Ranking
  const ranked = rankAndFilterResults(cleanResults, meta, config).slice(0, CONFIG.MAX_RESULTS);

  // Resolve RD
  const rdPromises = ranked.map(item => 
    LIMITERS.rd.schedule(() => resolveRdLinkOptimized(config.rd, item, meta, config.filters?.showFake))
  );
  
  const streams = (await Promise.all(rdPromises)).filter(Boolean);
  
  if (!streams.length) streams.push({ name: "⚠️ INFO", title: "Trovati torrent ma nessun link RD attivo." });

  const res = { streams, cacheMaxAge: 1800, staleRevalidate: 3600 };
  internalCache.set(cacheKey, res);
  return res;
}

// --- CATALOG GENERATOR ---
async function generateCatalog(type, id, config, skip = 0) {
  const page = Math.floor(skip / 20) + 1;
  const key = `c:${type}:${id}:${page}`;
  const cached = internalCache.get(key); if (cached) return cached;
  
  if (!config.tmdb) return { metas: [] };
  
  const endpoints = { 
    tmdb_trending: "/trending/movie/day", 
    tmdb_series_trending: "/trending/tv/day", 
    tmdb_4k: "/discover/movie?sort_by=popularity.desc&primary_release_date.gte=2023-01-01", 
    tmdb_anime: "/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc" 
  };
  
  try {
    const { data } = await axios.get(`https://api.themoviedb.org/3${endpoints[id]}`, { 
      params: { api_key: config.tmdb, language: "it-IT", page }, 
      timeout: 3000 
    });
    
    const metas = data.results.map(m => ({ 
      id: `tmdb:${m.id}`, 
      type, 
      name: m.title || m.name, 
      poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null, 
      description: m.overview 
    })).filter(m => m.poster);
    
    const res = { metas, cacheMaxAge: 3600 }; 
    internalCache.set(key, res); 
    return res;
  } catch { return { metas: [] }; }
}

// --- HELPER: Promise with Timeout ---
function timeoutPromise(ms) { return new Promise(r => setTimeout(() => r([]), ms)); }
function withTimeout(promise, ms) { return Promise.race([promise, timeoutPromise(ms)]); }

// --- ROUTES ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.get("/:conf/manifest.json", (req, res) => { 
  const m = { ...MANIFEST_BASE }; 
  m.behaviorHints = { configurable: true, configurationRequired: false }; 
  res.setHeader("Access-Control-Allow-Origin", "*"); 
  res.json(m); 
});

app.get("/:conf/catalog/:type/:id/:extra?.json", async (req, res) => { 
  const skip = req.params.extra?.match(/skip=(\d+)/)?.[1] || 0; 
  const result = await generateCatalog(req.params.type, req.params.id, getConfig(req.params.conf), parseInt(skip)); 
  res.setHeader("Access-Control-Allow-Origin", "*"); 
  applyCacheHeaders(res, result); 
  res.json(result); 
});

app.get("/:conf/stream/:type/:id.json", async (req, res) => { 
  const result = await generateStream(req.params.type, req.params.id.replace(".json", ""), getConfig(req.params.conf), req.params.conf); 
  res.setHeader("Access-Control-Allow-Origin", "*"); 
  applyCacheHeaders(res, result); 
  res.json(result); 
});

// --- HELPERS SERVER ---
function applyCacheHeaders(res, data) { 
  if (!data) return; 
  const maxAge = data.cacheMaxAge ?? CACHE_HEADERS.cacheMaxAge; 
  const stale = data.staleRevalidate ?? CACHE_HEADERS.staleRevalidate; 
  res.setHeader("Cache-Control", `max-age=${maxAge}, stale-while-revalidate=${stale}, public`); 
}
function getConfig(configStr) { 
  try { return JSON.parse(Buffer.from(configStr, "base64").toString()); } catch { return {}; } 
}

// --- START ---
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`🚀 Corsaro Brain CAPOLAVORO v25.8.4 su porta ${PORT}`));
