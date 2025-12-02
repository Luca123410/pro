// Corsaro Brain - HYPER FAST EDITION (Multi-Debrid)
// Versione: 30.1.0-ORGANIZED
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const axios = require("axios");
const Bottleneck = require("bottleneck");
const FuzzySet = require("fuzzyset");

// 🔥 IMPORTIAMO IL CONVERTITORE 🔥
const { tmdbToImdb } = require("./id_converter");

// 🔥 IMPORTIAMO I MODULI DEBRID (DALLA CARTELLA DEDICATA) 🔥
const RD = require("./debrid/realdebrid");
const AD = require("./debrid/alldebrid");
const TB = require("./debrid/torbox");

// --- CONFIGURAZIONE ---
const CONFIG = {
  CINEMETA_URL: "https://v3-cinemeta.strem.io",
  REAL_SIZE_FILTER: 80 * 1024 * 1024, 
  TIMEOUT_TMDB: 1500,
  SCRAPER_TIMEOUT: 6000, 
  MAX_RESULTS: 40, 
  FUZZY_THRESHOLD: 0.6,
};

// --- LIMITERS ---
const LIMITERS = {
  scraper: new Bottleneck({ maxConcurrent: 40, minTime: 10 }), 
  rd: new Bottleneck({ maxConcurrent: 25, minTime: 40 }), 
};

// --- MOTORI DI RICERCA ---
const SCRAPER_MODULES = [
  require("./engines") 
];

const FALLBACK_SCRAPERS = [
  require("./external"),
];

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

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

  let words = q.split(/\s+/);
  if (words.length > 1) {
      words = words.filter(w => !["it", "the", "a", "an", "le", "la", "il", "lo"].includes(w));
  }

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

function isSafeForItalian(item) {
  if (!item || !item.title) return false;
  const t = item.title.toUpperCase();
  const itaPatterns = [
    /\b(ITA|ITALIAN|IT|ITL|ITALY)\b/,
    /\b(MULTI|MUII|MUL|MULTILANGUAGE)\b.*\b(ITA|IT|ITALIAN)\b/,
    /\b(AC3|DTS).*\b(ITA|IT|ITALIAN)\b/, 
    /\b(SUB.?ITA|SUBS.?ITA|SOTTOTITOLI.?ITA)\b/,
    /\b(VC[._-]?I|VO.?ITA|AUD.?ITA)\b/,            
    /\b(ITA.?ENG)\b/,                      
    /ITALIAN.*(DL|Mux|WEBRip|BluRay)/i,
    /\b(SPEEDVIDEO|WMS|TRIDIM|iDN_CreW)\b/
  ];
  return itaPatterns.some(p => p.test(t));
}

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
  if (source === "Corsaro") {
      lang = "🇮🇹 ITA";
      if (/multi|mui/i.test(t)) lang = "🇮🇹 MULTI";
  } 
  else if (/\b(ita|italian|it)\b/i.test(t)) {
      lang = "🇮🇹 ITA";
  } else if (/multi|mui/i.test(t)) {
      lang = "🌐 MULTI"; 
  }

  let detailsParts = [];
  if (videoTags.length) detailsParts.push(`✨ ${videoTags.join(" ")}`);
  if (audioTags.length) detailsParts.push(`🔊 ${audioTags.join(" ")}`);
  
  return { quality: q, qIcon, info: detailsParts.join(" • "), lang };
}

function formatStreamTitleCinePro(fileTitle, source, size, seeders, serviceTag = "RD") {
    const { quality, qIcon, info, lang } = extractStreamInfo(fileTitle, source);
    const sizeStr = size ? `📦 ${formatBytes(size)}` : "📦 ❓"; 
    const seedersStr = seeders ? `👤 ${seeders}` : "";

    const name = `[${serviceTag} ${qIcon} ${quality}] ${source}`;
    const detailLines = [];

    let cleanName = cleanFilename(fileTitle)
        .replace(/s\d+e\d+/i, "")
        .replace(/s\d+/i, "")
        .trim();
    const epTag = getEpisodeTag(fileTitle);
    detailLines.push(`🎬 ${cleanName}${epTag ? ` ${epTag}` : ""} • ${quality}`);

    let sizeSeedLine = sizeStr;
    if (seedersStr) sizeSeedLine += ` • ${seedersStr}`;
    detailLines.push(sizeSeedLine);

    const langTag = lang.replace('🌐', '').replace('🇮🇹', 'IT').replace('🇬🇧', 'GB').trim();
    detailLines.push(`🔍 ${source} • 🗣️ ${langTag}`);

    if (info) {
        const tags = info.split(' • ');
        const videoTags = tags.filter(t => t.includes('✨')).map(t => t.replace('✨', ''));
        const audioTags = tags.filter(t => t.includes('🔊'));
        if (videoTags.length) detailLines.push(`🎞️ ${videoTags.join(' • ')}`);
        if (audioTags.length) detailLines.push(`🔊 ${audioTags.join(' • ')}`);
    }

    const fullTitle = detailLines.join('\n');
    return { name, title: fullTitle };
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
  queries.add(`${title} Stagione ${s} ITA`);
  queries.add(`${title} Stagione ${s} COMPLETE`);
  queries.add(`${title} Stagione ${s} PACK`);
  queries.add(`${title} Season ${s} ITA`);
  if (orig && orig !== title) {
    queries.add(`${orig} Stagione ${s} ITA`);
    queries.add(`${orig} Season ${s} ITA`);
  }
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
    
    const { data: cData } = await axios.get(`${CONFIG.CINEMETA_URL}/meta/${type}/${tmdbId.split(":")[0]}.json`, { timeout: CONFIG.TIMEOUT_TMDB }).catch(() => ({ data: {} }));
    
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

// 🔥 ROUTER DEBRID INTELLIGENTE 🔥
async function resolveDebridLink(config, item, showFake) {
    try {
        const service = config.service || 'rd'; // Default RD
        const apiKey = config.key || config.rd; // Compatibilità
        
        if (!apiKey) return null;

        let streamData = null;

        // Routing del servizio
        if (service === 'rd') {
            streamData = await RD.getStreamLink(apiKey, item.magnet, item.season, item.episode);
        } else if (service === 'ad') {
            streamData = await AD.getStreamLink(apiKey, item.magnet, item.season, item.episode);
        } else if (service === 'tb') {
            streamData = await TB.getStreamLink(apiKey, item.magnet, item.season, item.episode);
        }

        if (!streamData || (streamData.type === "ready" && streamData.size < CONFIG.REAL_SIZE_FILTER)) return null;

        let serviceTag = "RD";
        if (service === 'ad') serviceTag = "AD";
        if (service === 'tb') serviceTag = "TB";

        const { name, title } = formatStreamTitleCinePro(streamData.filename || item.title, item.source, streamData.size || item.size, item.seeders, serviceTag);
        
        return { 
            name, 
            title, 
            url: streamData.url, 
            behaviorHints: { notWebReady: false, bingieGroup: `corsaro-${service}` } 
        };

    } catch (e) {
        if (showFake) return { name: `[P2P ⚠️]`, title: `${item.title}\n⚠️ Cache Assente`, url: item.magnet, behaviorHints: { notWebReady: true } };
        return null;
    }
}

// 🔥 FUNZIONE PRINCIPALE GENERATE STREAM 🔥
async function generateStream(type, id, config, userConfStr) {
  if (!config.key && !config.rd) return { streams: [{ name: "⚠️ CONFIG", title: "Inserisci API Key nel configuratore" }] };
  
  let finalId = id; 
  
  // 1. RILEVAMENTO TMDB 
  if (id.startsWith("tmdb:")) {
      try {
          const parts = id.split(":");
          const tmdbId = parts[1];
          const imdbId = await tmdbToImdb(tmdbId, type);
          
          if (imdbId) {
              if (type === "series" && parts.length >= 4) {
                  const s = parts[2];
                  const e = parts[3];
                  finalId = `${imdbId}:${s}:${e}`; 
              } else {
                  finalId = imdbId; 
              }
          } 
      } catch (err) { console.error("ID Convert Error"); }
  }

  const meta = await getMetadata(finalId, type); 
  if (!meta) return { streams: [] };
  
  const queries = meta.isSeries ? buildSeriesQueries(meta) : buildMovieQueries(meta);
  const onlyIta = config.filters?.onlyIta !== false;

  console.log(`\n🔎 [${config.service || 'rd'}] CERCO: "${meta.title}" (ID: ${finalId})`);

  let promises = [];
  queries.forEach(q => {
    SCRAPER_MODULES.forEach(scraper => {
      if (scraper.searchMagnet) {
        promises.push(
          LIMITERS.scraper.schedule(() => 
            withTimeout(scraper.searchMagnet(q, meta.year, type, finalId), CONFIG.SCRAPER_TIMEOUT).catch(err => [])
          )
        );
      }
    });
  });

  let resultsRaw = (await Promise.all(promises)).flat();

  resultsRaw = resultsRaw.filter(item => {
    if (!item?.magnet) return false;
    if (!isTitleSafe(meta.title, item.title)) return false;
    if (onlyIta && !isSafeForItalian(item)) return false;
    return true;
  });

  if (resultsRaw.length <= 5) {
    const extPromises = FALLBACK_SCRAPERS.map(fb => {
        return LIMITERS.scraper.schedule(async () => {
            try {
                return await withTimeout(fb.searchMagnet(queries[0], meta.year, type, finalId), CONFIG.SCRAPER_TIMEOUT);
            } catch (err) { return []; }
        });
    });

    try {
        let timeoutHandle;
        const timeoutPromise = new Promise(resolve => {
            timeoutHandle = setTimeout(() => { resolve([]); }, CONFIG.SCRAPER_TIMEOUT + 1500); 
        });
        const searchPromise = Promise.all(extPromises).then(res => { clearTimeout(timeoutHandle); return res; });
        const extResultsRaw = await Promise.race([searchPromise, timeoutPromise]);
        if (Array.isArray(extResultsRaw)) resultsRaw = [...resultsRaw, ...extResultsRaw.flat()];
    } catch (e) {}
  }

  const seen = new Set(); 
  let cleanResults = [];
  for (const item of resultsRaw) {
    if (!item || !item.magnet) continue;
    try {
        const hashMatch = item.magnet.match(/btih:([a-f0-9]{40})/i);
        const hash = hashMatch ? hashMatch[1].toUpperCase() : item.magnet;
        if (seen.has(hash)) continue;
        seen.add(hash);
        item._size = parseSize(item.size || item.sizeBytes);
        cleanResults.push(item);
    } catch (err) { continue; }
  }
  if (!cleanResults.length) return { streams: [{ name: "⛔", title: "Nessun risultato trovato" }] };

  const ranked = rankAndFilterResults(cleanResults, meta).slice(0, CONFIG.MAX_RESULTS);
  
  // Risoluzione Link (Multi-Service)
  const rdPromises = ranked.map(item => {
      // Passiamo metadati S/E all'item per i moduli AD/TB
      item.season = meta.season;
      item.episode = meta.episode;
      return LIMITERS.rd.schedule(() => resolveDebridLink(config, item, config.filters?.showFake));
  });
  
  const streams = (await Promise.all(rdPromises)).filter(Boolean);
  return { streams }; 
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

// --- ROUTES ---
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/:conf/manifest.json", (req, res) => { const m = { id: "org.corsaro.brain.v30.0", version: "30.0.0", name: "Corsaro Unleashed (Multi-Debrid)", resources: ["catalog", "stream"], types: ["movie", "series"], catalogs: [] }; m.behaviorHints = { configurable: true, configurationRequired: false }; res.setHeader("Access-Control-Allow-Origin", "*"); res.json(m); });
app.get("/:conf/catalog/:type/:id/:extra?.json", async (req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.json({metas:[]}); });
app.get("/:conf/stream/:type/:id.json", async (req, res) => { const result = await generateStream(req.params.type, req.params.id.replace(".json", ""), getConfig(req.params.conf), req.params.conf); res.setHeader("Access-Control-Allow-Origin", "*"); res.json(result); });

function getConfig(configStr) { try { return JSON.parse(Buffer.from(configStr, "base64").toString()); } catch { return {}; } }
function withTimeout(promise, ms) { return Promise.race([promise, new Promise(r => setTimeout(() => r([]), ms))]); }

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`🚀 Corsaro Unleashed v30.0 (Multi-Debrid) su porta ${PORT}`));
