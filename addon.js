// Corsaro Brain - NO CACHE EDITION
// Versione: 28.1.0-nocache
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const axios = require("axios");
// const NodeCache = require("node-cache"); // <-- RIMOSSO
const Bottleneck = require("bottleneck");
const FuzzySet = require("fuzzyset");

// --- CONFIGURAZIONE ---
const CONFIG = {
  CINEMETA_URL: "https://v3-cinemeta.strem.io",
  REAL_SIZE_FILTER: 80 * 1024 * 1024,
  TIMEOUT_TMDB: 4000,
  SCRAPER_TIMEOUT: 15000, 
  MAX_RESULTS: 100,
  FUZZY_THRESHOLD: 0.6,
};

// const CACHE_TTL = { STD: 300, CHECK: 60 }; // <-- RIMOSSO

// --- LIMITERS ---
const LIMITERS = {
  scraper: new Bottleneck({ maxConcurrent: 20, minTime: 50 }),
  rd: new Bottleneck({ maxConcurrent: 10, minTime: 100 }),
};

// --- MODULI SCRAPER ---
const SCRAPER_MODULES = [
  require("./rd"),
  require("./engines") 
];

const FALLBACK_SCRAPERS = [
  require("./external"),
];

// --- APP ---
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
// const internalCache = new NodeCache({ stdTTL: CACHE_TTL.STD, checkperiod: CACHE_TTL.CHECK, useClones: false }); // <-- RIMOSSO

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

// ** SMART MATCHING **
function isTitleSafe(metaTitle, filename) {
  const clean = (str) => String(str).toLowerCase()
    .replace(/\b(dr\.|doctor|m\.d\.|md|us|uk|20\d{2})\b/g, "") 
    .replace(/[^a-z0-9\s]/g, "") 
    .trim();

  const q = clean(metaTitle);
  const f = clean(filename);

  if (q === "house") {
      if (f.includes("dragon") || f.includes("cards") || f.includes("guinness") || f.includes("full house")) return false;
      if (f.includes("dr") || f.includes("md") || f.includes("medical")) return true;
  }

  const words = q.split(/\s+/);
  const allWordsFound = words.every(w => new RegExp(`\\b${w}\\b`, 'i').test(f));
  if (allWordsFound) return true;

  if (q.length > 5) {
      try {
        const fs = FuzzySet([q]);
        const match = fs.get(f);
        if (match && match[0][0] > CONFIG.FUZZY_THRESHOLD) return true;
      } catch (e) { return false; }
  }
  return false;
}

// 🔥🔥 FILTRO SEVERO 🔥🔥
function isSafeForItalian(item) {
  if (!item || !item.title) return false;
  return /\b(ITA|ITALIAN|IT|MULTI|MUI|AC3|DTS)\b/i.test(item.title);
}

// --- VISUALS ---
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
  cleanTitle = cleanTitle.replace(/\b(ita|eng|sub|h264|h265|x264|x265|1080p|720p|4k|bluray|webdl|rip)\b.*/yi, "");
  return `${cleanTitle.trim()}${year}`;
}

function getEpisodeTag(filename) {
    const f = filename.toLowerCase();
    const matchEp = f.match(/s(\d+)[ex](\d+)/i);
    if (matchEp) return `🍿 S${matchEp[1]}E${matchEp[2]}`;
    const matchX = f.match(/(\d+)x(\d+)/i);
    if (matchX) return `🍿 S${matchX[1].padStart(2, '0')}E${matchX[2].padStart(2, '0')}`;
    if (/s(\d+)\b|stagione (\d+)|season (\d+)/i.test(f)) {
        const s = f.match(/s(\d+)|stagione (\d+)|season (\d+)/i);
        const num = s[1] || s[2] || s[3];
        return `📦 STAGIONE ${num}`;
    }
    return "";
}

function extractStreamInfo(title, source) {
  const t = String(title).toLowerCase();
  let q = "HD"; let qIcon = "📺";
  if (/2160p|4k|uhd/.test(t)) { q = "4K"; qIcon = "✨"; }
  else if (/1080p/.test(t)) { q = "1080p"; qIcon = "🌕"; }
  else if (/720p/.test(t)) { q = "720p"; qIcon = "🌗"; }
  else if (/480p|\bsd\b/.test(t)) { q = "SD"; qIcon = "🌑"; }

  const videoTags = []; const audioTags = [];
  if (/hdr/.test(t)) videoTags.push("HDR");
  if (/dolby|vision|\bdv\b/.test(t)) videoTags.push("DV");
  if (/imax/.test(t)) videoTags.push("IMAX");
  if (/h265|hevc|x265/.test(t)) videoTags.push("HEVC");
  
  if (/atmos/.test(t)) audioTags.push("Atmos");
  if (/dts:?x?|\bdts\b/.test(t)) audioTags.push("DTS");
  if (/dd\+|eac3/.test(t)) audioTags.push("DD+");
  if (/5\.1/.test(t)) audioTags.push("5.1");

  let lang = "🇬🇧 ENG"; 
  if (/\b(ita|italian|it)\b/i.test(t)) {
      lang = "🇮🇹 ITA";
  } else if (/multi|mui/i.test(t)) {
      if (source === "Corsaro") lang = "🇮🇹 MULTI"; 
      else lang = "🌐 MULTI"; 
  }

  let detailsParts = [];
  if (videoTags.length) detailsParts.push(`✨ ${videoTags.join(" ")}`);
  if (audioTags.length) detailsParts.push(`🔊 ${audioTags.join(" ")}`);
  
  return { quality: q, qIcon, info: detailsParts.join(" • "), lang };
}

function formatStreamTitleCinePro(fileTitle, source, size) {
  const { quality, qIcon, info, lang } = extractStreamInfo(fileTitle, source);
  const sizeStr = size ? `💾 ${formatBytes(size)}` : "💾 ?";
  let cleanName = cleanFilename(fileTitle).replace(/s\d+e\d+/yi, "").replace(/s\d+/yi, "").trim();
  const epTag = getEpisodeTag(fileTitle);
  const name = `[RD 🌠 ${qIcon} ${quality}] ${source}`;
  const titleLine = epTag ? `${cleanName} • ${epTag}` : cleanName;
  const detailsLine = [sizeStr, info, lang].filter(Boolean).join(" • ");
  return { name, title: `${titleLine}\n${detailsLine}` };
}

function buildSeriesQueries(meta) {
  const { title, originalTitle: orig, season: s, episode: e } = meta;
  const ss = String(s).padStart(2, "0");
  const ee = String(e).padStart(2, "0");
  
  let queries = new Set();
  queries.add(`${title} S${ss}E${ee}`);
  queries.add(`${title} S${ss}`); 

  if (title.toLowerCase().includes("house")) {
      queries.add(`Dr House S${ss}E${ee}`);
      queries.add(`Dr House S${ss}`);
      queries.add(`House MD S${ss}E${ee}`);
  }

  if (orig && orig !== title) {
    queries.add(`${orig} S${ss}E${ee}`);
    queries.add(`${orig} S${ss}`);
  }
  queries.add(`${title} ${s}x${ee}`);
  return [...queries];
}

function buildMovieQueries(meta) {
  const { title, originalTitle: orig, year } = meta;
  const q = [`${title} ${year}`, `${title} ITA`];
  if (orig && orig !== title) q.push(`${orig} ${year}`);
  return q.filter(Boolean);
}

async function getMetadata(id, type) {
  try {
    let tmdbId = id, s = 1, e = 1;
    if (type === "series" && id.includes(":")) [tmdbId, s, e] = id.split(":");
    
    const { data: cData } = await axios.get(`${CONFIG.CINEMETA_URL}/meta/${type}/${tmdbId.split(":")[0]}.json`, { timeout: 2000 }).catch(() => ({ data: {} }));
    
    return cData?.meta ? {
      title: cData.meta.name,
      originalTitle: cData.meta.name,
      year: cData.meta.year?.split("–")[0],
      imdb_id: tmdbId.split(":")[0],
      isSeries: type === "series",
      season: parseInt(s),
      episode: parseInt(e)
    } : null;
  } catch { return null; }
}

async function generateStream(type, id, config, userConfStr) {
  if (!config.rd) return { streams: [{ name: "⚠️ CONFIG", title: "Serve RealDebrid API Key" }] };
  
  // --- CACHE RIMOSSA ---
  // const cacheKey = `str:${userConfStr}:${type}:${id}`;
  // const cached = internalCache.get(cacheKey); if (cached) return cached;

  const meta = await getMetadata(id, type); if (!meta) return { streams: [] };
  const queries = meta.isSeries ? buildSeriesQueries(meta) : buildMovieQueries(meta);
  const onlyIta = config.filters?.onlyIta !== false;

  console.log(`\n🔎 CERCO: "${meta.title}" (ID: ${meta.imdb_id}) | Queries: ${queries.join(", ")}`);

  let promises = [];
  queries.forEach(q => {
    SCRAPER_MODULES.forEach(scraper => {
      if (scraper.searchMagnet) {
        promises.push(
          LIMITERS.scraper.schedule(() => 
            withTimeout(scraper.searchMagnet(q, meta.year, type, meta.imdb_id), CONFIG.SCRAPER_TIMEOUT)
            .catch(err => [])
          )
        );
      }
    });
  });

  let resultsRaw = (await Promise.all(promises)).flat();
  console.log(`📥 TOTALE GREZZI: ${resultsRaw.length}`);

  // 2. Filtro
  resultsRaw = resultsRaw.filter(item => {
    if (!item?.magnet) return false;
    if (!isTitleSafe(meta.title, item.title)) return false;
    if (onlyIta && !isSafeForItalian(item)) return false;
    
    if (meta.isSeries) {
        const s = meta.season;
        const regex = new RegExp(`(s0?${s}[xe]0?${meta.episode}|s0?${s}\\b|stagione ${s}\\b|season ${s}\\b|complete|pack)`, "i");
        if (!regex.test(item.title)) return false;
    }
    return true;
  });

  console.log(`✅ SOPRAVVISSUTI: ${resultsRaw.length}`);

  if (resultsRaw.length < 2) {
    console.log("⚠️ Attivo External (ID Search)...");
    const extPromises = [];
    FALLBACK_SCRAPERS.forEach(fb => {
        extPromises.push(LIMITERS.scraper.schedule(() => withTimeout(fb.searchMagnet(null, meta.year, type, meta.imdb_id), CONFIG.SCRAPER_TIMEOUT).catch(() => [])));
    });
    const extResults = (await Promise.all(extPromises)).flat();
    resultsRaw = [...resultsRaw, ...extResults];
  }

  const seen = new Set(); 
  let cleanResults = [];
  for (const item of resultsRaw) {
    const hash = item.magnet.match(/btih:([a-f0-9]{40})/i)?.[1].toUpperCase() || item.magnet;
    if (seen.has(hash)) continue;
    seen.add(hash);
    item._size = parseSize(item.size || item.sizeBytes);
    cleanResults.push(item);
  }

  if (!cleanResults.length) return { streams: [{ name: "⛔", title: "Nessun risultato trovato" }] };

  const ranked = rankAndFilterResults(cleanResults, meta).slice(0, CONFIG.MAX_RESULTS);
  const rdPromises = ranked.map(item => LIMITERS.rd.schedule(() => resolveRdLinkOptimized(config.rd, item, config.filters?.showFake)));
  const streams = (await Promise.all(rdPromises)).filter(Boolean);
  
  const res = { streams }; // Rimosso behaviorHints di cache
  // internalCache.set(cacheKey, res); // <-- RIMOSSO
  return res;
}

function rankAndFilterResults(results, meta) {
  return results.map(item => {
    const info = extractStreamInfo(item.title, item.source);
    let score = 0;
    
    if (info.lang.includes("ITA")) score += 5000;
    else if (info.lang.includes("MULTI")) score += 3000;
    
    if (info.quality === "4K") score += 1200;
    else if (info.quality === "1080p") score += 800;
    
    if (item.source === "Corsaro") score += 1000;

    if (meta.isSeries && new RegExp(`S${String(meta.season).padStart(2,'0')}E${String(meta.episode).padStart(2,'0')}`, "i").test(item.title)) score += 1500;
    
    if (/cam|ts/i.test(item.title)) score -= 10000;
    
    return { item, score };
  }).sort((a, b) => b.score - a.score).map(x => x.item);
}

async function resolveRdLinkOptimized(rdKey, item, showFake) {
  try {
    const streamData = await SCRAPER_MODULES[0].getStreamLink(rdKey, item.magnet);
    if (!streamData || (streamData.type === "ready" && streamData.size < CONFIG.REAL_SIZE_FILTER)) return null;
    const { name, title } = formatStreamTitleCinePro(streamData.filename || item.title, item.source, streamData.size || item.size);
    return { name, title, url: streamData.url, behaviorHints: { notWebReady: false, bingieGroup: "corsaro-rd" } };
  } catch (e) {
    if (showFake) return { name: `[P2P ⚠️] ${item.source}`, title: `${item.title}\n⚠️ Cache RD Assente`, url: item.magnet, behaviorHints: { notWebReady: true } };
    return null;
  }
}

// --- ROUTES ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/:conf/manifest.json", (req, res) => { const m = { id: "org.corsaro.brain.v28.1", version: "28.1.0", name: "Corsaro Brain (No Cache)", resources: ["catalog", "stream"], types: ["movie", "series"], catalogs: [] }; m.behaviorHints = { configurable: true, configurationRequired: false }; res.setHeader("Access-Control-Allow-Origin", "*"); res.json(m); });
app.get("/:conf/catalog/:type/:id/:extra?.json", async (req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.json({metas:[]}); });
app.get("/:conf/stream/:type/:id.json", async (req, res) => { const result = await generateStream(req.params.type, req.params.id.replace(".json", ""), getConfig(req.params.conf), req.params.conf); res.setHeader("Access-Control-Allow-Origin", "*"); res.json(result); });

function getConfig(configStr) { try { return JSON.parse(Buffer.from(configStr, "base64").toString()); } catch { return {}; } }
function withTimeout(promise, ms) { return Promise.race([promise, new Promise(r => setTimeout(() => r([]), ms))]); }

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`🚀 Corsaro Brain v28.1.0 (No Cache) su porta ${PORT}`));
