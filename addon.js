// Corsaro Brain - HYPER FAST EDITION
// Versione: 29.0.0-INTELLIGENT-CORE
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const axios = require("axios");
const Bottleneck = require("bottleneck");
const FuzzySet = require("fuzzyset");

// 🔥 IMPORTIAMO IL CONVERTITORE 🔥
// Assicurati che il file id_converter.js esista nella stessa cartella
const { tmdbToImdb } = require("./id_converter");

// --- CONFIGURAZIONE HYPER FAST ---
const CONFIG = {
  CINEMETA_URL: "https://v3-cinemeta.strem.io",
  REAL_SIZE_FILTER: 80 * 1024 * 1024, // Filtra file < 80MB (spazzatura)
  TIMEOUT_TMDB: 1500,
  SCRAPER_TIMEOUT: 6000, // 6s totali per dare tempo ai motori (che ne usano 5.5)
  MAX_RESULTS: 40, 
  FUZZY_THRESHOLD: 0.6,
};

// --- LIMITERS ESTREMI ---
const LIMITERS = {
  scraper: new Bottleneck({ maxConcurrent: 40, minTime: 10 }), 
  rd: new Bottleneck({ maxConcurrent: 25, minTime: 40 }), 
};

// --- MODULI SCRAPER  ---
const SCRAPER_MODULES = [
  require("./rd"),     // Modulo RealDebrid (cache check)
  require("./engines") // 🔥 IL TUO NUOVO MOTORE POTENZIATO
];

const FALLBACK_SCRAPERS = [
  require("./external"), // Fallback se non trova nulla
];

// --- APP ---
const app = express();
app.use(helmet({
  contentSecurityPolicy: false, 
}));
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// --- UTILITIES  ---
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

// ** SMART MATCHING (Seconda Barriera) **
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

// 🔥🔥 FILTRO SEVERO (Seconda Barriera) 🔥🔥
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
    // Aggiunti pattern extra per sicurezza
    /\b(SPEEDVIDEO|WMS|TRIDIM|iDN_CreW)\b/
  ];
  
  return itaPatterns.some(p => p.test(t));
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

function formatStreamTitleCinePro(fileTitle, source, size, seeders) {
    const { quality, qIcon, info, lang } = extractStreamInfo(fileTitle, source);
    const sizeStr = size ? `📦 ${formatBytes(size)}` : "📦 ❓"; 
    const seedersStr = seeders ? `👤 ${seeders}` : "";

    const name = `[RD ${qIcon} ${quality}] ${source}`;
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

// ** QUERY SERIES BOOSTED **
function buildSeriesQueries(meta) {
  const { title, originalTitle: orig, season: s, episode: e } = meta;
  const ss = String(s).padStart(2, "0");
  const ee = String(e).padStart(2, "0");
  
  let queries = new Set();
  
  // Query specifica prioritaria
  queries.add(`${title} S${ss}E${ee}`);
  
  // Varianti
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

// Questa funzione ora si aspetta quasi sempre un ID IMDb valido
async function getMetadata(id, type) {
  try {
    let tmdbId = id, s = 1, e = 1;
    // Se è serie, l'ID è del tipo "tt12345:1:5"
    if (type === "series" && id.includes(":")) [tmdbId, s, e] = id.split(":");
    
    // Cinemeta lavora bene con tt12345
    const { data: cData } = await axios.get(`${CONFIG.CINEMETA_URL}/meta/${type}/${tmdbId.split(":")[0]}.json`, { timeout: CONFIG.TIMEOUT_TMDB }).catch(() => ({ data: {} }));
    
    return cData?.meta ? {
      title: cData.meta.name,
      originalTitle: cData.meta.name,
      year: cData.meta.year?.split("–")[0],
      imdb_id: tmdbId.split(":")[0], // ID base per i metadati
      isSeries: type === "series",
      season: parseInt(s),
      episode: parseInt(e)
    } : null;
  } catch { return null; }
}

// 🔥 FUNZIONE PRINCIPALE MODIFICATA PER GESTIRE TMDB E SMART ENGINE 🔥
async function generateStream(type, id, config, userConfStr) {
  if (!config.rd) return { streams: [{ name: "⚠️ CONFIG", title: "Serve RealDebrid API Key" }] };
  
  let finalId = id; // Default: usiamo l'ID in ingresso (es. tt12345:1:5 o tt12345)
  
  // 1. RILEVAMENTO TMDB (es. tmdb:12345 o tmdb:12345:1:5)
  if (id.startsWith("tmdb:")) {
      console.log(`\n🕵️ Rilevato ID TMDB: ${id}`);
      try {
          const parts = id.split(":");
          const tmdbId = parts[1];
          // Chiamata al convertitore esterno
          const imdbId = await tmdbToImdb(tmdbId, type);
          
          if (imdbId) {
              // Ricostruzione ID in formato IMDb compatibile con Stremio
              if (type === "series" && parts.length >= 4) {
                  const s = parts[2];
                  const e = parts[3];
                  // ID COMPLETO per il motore Smart (tt12345:1:5)
                  finalId = `${imdbId}:${s}:${e}`; 
              } else {
                  finalId = imdbId; // Esempio: tt12345
              }
              console.log(`✅ Convertito con successo: TMDB ${tmdbId} -> IMDB ${finalId}`);
          } else {
              console.log(`⚠️ Impossibile convertire TMDB ${tmdbId}. Procedo con ID originale.`);
          }
      } catch (err) {
          console.error("❌ Errore critico durante la conversione ID:", err.message);
      }
  }

  // 2. RECUPERO METADATI (Usa finalId, che ora è preferibilmente un tt...)
  const meta = await getMetadata(finalId, type); 
  
  if (!meta) return { streams: [] };
  
  const queries = meta.isSeries ? buildSeriesQueries(meta) : buildMovieQueries(meta);
  const onlyIta = config.filters?.onlyIta !== false;

  console.log(`\n🔎 CERCO: "${meta.title}" [${meta.year}] (ID: ${finalId})`);

  let promises = [];
  queries.forEach(q => {
    SCRAPER_MODULES.forEach(scraper => {
      if (scraper.searchMagnet) {
        promises.push(
          LIMITERS.scraper.schedule(() => 
            // 🔥 MODIFICA CRUCIALE: Passiamo finalId (con :s:e) al motore 🔥
            withTimeout(scraper.searchMagnet(q, meta.year, type, finalId), CONFIG.SCRAPER_TIMEOUT)
            .catch(err => [])
          )
        );
      }
    });
  });

  let resultsRaw = (await Promise.all(promises)).flat();
  console.log(`📥 TOTALE GREZZI DAL MOTORE: ${resultsRaw.length}`);

  // Filtro "Seconda Barriera" (nel caso il motore lasci passare qualcosa di strano)
  resultsRaw = resultsRaw.filter(item => {
    if (!item?.magnet) return false;
    if (!isTitleSafe(meta.title, item.title)) return false;
    if (onlyIta && !isSafeForItalian(item)) return false;
    
    // Per le serie, il motore fa già il lavoro sporco su S/E, 
    // ma qui manteniamo un controllo di sicurezza sui Pack.
    return true;
  });

  // 🔥 FALLBACK EXTERNAL (con Timeout gestito) 🔥
  if (resultsRaw.length <= 5) {
    console.log(`⚠️ Risultati scarsi (${resultsRaw.length}). Attivo External (ID Search)...`);
    
    const extPromises = FALLBACK_SCRAPERS.map(fb => {
        return LIMITERS.scraper.schedule(async () => {
            try {
                // Passiamo finalId anche qui
                return await withTimeout(fb.searchMagnet(queries[0], meta.year, type, finalId), CONFIG.SCRAPER_TIMEOUT);
            } catch (err) {
                console.log(`❌ External Error: ${err.message}`);
                return [];
            }
        });
    });

    try {
        let timeoutHandle;
        const timeoutPromise = new Promise(resolve => {
            timeoutHandle = setTimeout(() => {
                console.log("⏰ External Search TEMPO SCADUTO");
                resolve([]);
            }, CONFIG.SCRAPER_TIMEOUT + 1500); 
        });

        const searchPromise = Promise.all(extPromises).then(res => {
            clearTimeout(timeoutHandle);
            return res;
        });

        const extResultsRaw = await Promise.race([searchPromise, timeoutPromise]);

        if (Array.isArray(extResultsRaw)) {
             const extFlat = extResultsRaw.flat();
             console.log(`✅ External ha trovato: ${extFlat.length} nuovi risultati`);
             resultsRaw = [...resultsRaw, ...extFlat];
        }
    } catch (e) {
        console.log("❌ Errore critico nel blocco External:", e.message);
    }
  }

  const seen = new Set(); 
  let cleanResults = [];
  
  // Pulizia finale duplicati
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
  
  const rdPromises = ranked.map(item => LIMITERS.rd.schedule(() => resolveRdLinkOptimized(config.rd, item, config.filters?.showFake)));
  const streams = (await Promise.all(rdPromises)).filter(Boolean);
  
  return { streams }; 
}

// FUNZIONE CLASSIFICA AGGIORNATA PER EVITARE I PACK QUANDO SERVE EPISODIO
function rankAndFilterResults(results, meta) {
  return results.map(item => {
    const info = extractStreamInfo(item.title, item.source);
    let score = 0;
    
    if (info.lang.includes("ITA")) score += 5000;
    else if (info.lang.includes("MULTI")) score += 3000;
    
    if (info.quality === "4K") score += 1200;
    else if (info.quality === "1080p") score += 800;
    
    if (item.source === "Corsaro") score += 1000;

    // --- FIX SERIE TV ---
    if (meta.isSeries) {
        const sStr = String(meta.season).padStart(2, '0');
        const eStr = String(meta.episode).padStart(2, '0');
        
        // Regex stretta per l'episodio esatto (es. S01E05)
        const exactEpRegex = new RegExp(`S${sStr}[^0-9]*E${eStr}`, "i");
        const xEpRegex = new RegExp(`${meta.season}x${eStr}`, "i");

        if (exactEpRegex.test(item.title) || xEpRegex.test(item.title)) {
            score += 5000; // SUPER BOOST per l'episodio esatto
        } else if (/pack|stagione|season/i.test(item.title)) {
            // Se è un pack e stiamo cercando un episodio, penalizzalo pesantemente
            // così se ci sono episodi singoli, vinceranno sempre loro.
            score -= 2000; 
        }
    }
    
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
app.get("/:conf/manifest.json", (req, res) => { const m = { id: "org.corsaro.brain.v29.0", version: "29.0.0", name: "Corsaro Brain (Smart Core)", resources: ["catalog", "stream"], types: ["movie", "series"], catalogs: [] }; m.behaviorHints = { configurable: true, configurationRequired: false }; res.setHeader("Access-Control-Allow-Origin", "*"); res.json(m); });
app.get("/:conf/catalog/:type/:id/:extra?.json", async (req, res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.json({metas:[]}); });
app.get("/:conf/stream/:type/:id.json", async (req, res) => { const result = await generateStream(req.params.type, req.params.id.replace(".json", ""), getConfig(req.params.conf), req.params.conf); res.setHeader("Access-Control-Allow-Origin", "*"); res.json(result); });

function getConfig(configStr) { try { return JSON.parse(Buffer.from(configStr, "base64").toString()); } catch { return {}; } }
function withTimeout(promise, ms) { return Promise.race([promise, new Promise(r => setTimeout(() => r([]), ms))]); }

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`🚀 Corsaro Brain v29.0.0 (Smart Core) su porta ${PORT}`));
