const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const NodeCache = require("node-cache");
const Bottleneck = require("bottleneck"); 

// --- MODULI ESTERNI ---
const RD = require("./rd");
const Corsaro = require("./corsaro");
const Knaben = require("./knaben"); 
const TorrentMagnet = require("./torrentmagnet"); 
const UIndex = require("./uindex"); 
const External = require("./external"); 

// --- COSTANTI & CONFIGURAZIONE ---
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const REAL_SIZE_FILTER = 150 * 1024 * 1024; // 150MB
const TIMEOUT_TMDB = 4000;

const internalCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// LIMITATORE SCRAPER
const scraperLimiter = new Bottleneck({
    maxConcurrent: 5,
    minTime: 200
});

// LIMITATORE REAL-DEBRID (Veloce per evitare timeout)
const rdLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 160 
});

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- MANIFEST ---
const manifestBase = {
    id: "org.community.corsaro-brain-ita-strict-restore",
    version: "25.3.0", // Update: Sorting by Size
    name: "Corsaro + TorrentMagnet (SIZE SORTING)",
    description: "🇮🇹 Motore V25.3.0: Brain Full v3. Ordinamento per DIMENSIONE (Dal più grande al più piccolo).",
    resources: ["catalog", "stream"],
    types: ["movie", "series"],
    catalogs: [
        { type: "movie", id: "tmdb_trending", name: "🇮🇹 Top Film Italia" },
        { type: "series", id: "tmdb_series_trending", name: "📺 Serie TV del Momento" },
        { type: "movie", id: "tmdb_4k", name: "🌟 4K UHD Italia" },
        { type: "movie", id: "tmdb_anime", name: "⛩️ Anime Movies" }
    ],
    idPrefixes: ["tmdb", "tt"],
    behaviorHints: { configurable: true, configurationRequired: true }
};

// --- UTILITIES ---
function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Nuova funzione per capire la dimensione e ordinare
function parseSize(sizeStr) {
    if (!sizeStr) return 0;
    if (typeof sizeStr === 'number') return sizeStr;
    
    // Rimuove spazi e converte virgole in punti
    let cleanStr = sizeStr.toString().replace(/,/g, '.').toUpperCase();
    
    // Estrae numero e unità
    const match = cleanStr.match(/([\d.]+)\s*([KMGTP]?B)/);
    if (!match) return 0;
    
    let val = parseFloat(match[1]);
    const unit = match[2];

    if (unit.includes('TB')) return val * 1024 * 1024 * 1024 * 1024;
    if (unit.includes('GB')) return val * 1024 * 1024 * 1024;
    if (unit.includes('MB')) return val * 1024 * 1024;
    if (unit.includes('KB')) return val * 1024;
    
    return val;
}

function getConfig(configStr) {
    try { 
        return JSON.parse(Buffer.from(configStr, 'base64').toString()); 
    } catch (e) { return {}; }
}

function applyCacheHeaders(res, data) {
    const cacheHeaders = { cacheMaxAge: 'max-age', staleRevalidate: 'stale-while-revalidate', staleError: 'stale-if-error' };
    const defaults = { cacheMaxAge: 14400, staleRevalidate: 86400, staleError: 604800 };
    const parts = [];
    Object.keys(cacheHeaders).forEach(prop => {
        const value = (data[prop] !== undefined) ? data[prop] : defaults[prop];
        if (Number.isInteger(value)) parts.push(`${cacheHeaders[prop]}=${value}`);
    });
    if (parts.length > 0) res.setHeader('Cache-Control', `${parts.join(', ')}, public`);
}

// ═══════════════════════════════════════════════════════════════════
// BRAIN QUERY ENGINE v3 – SERIE TV
// ═══════════════════════════════════════════════════════════════════
function buildSeriesQueriesForSeries(metadata) {
    const title = metadata.title.trim();
    const original = (metadata.originalTitle || "").trim();
    const year = metadata.year || "";
    const season = String(metadata.season).padStart(2, '0');
    const episode = String(metadata.episode).padStart(2, '0');
    let queries = new Set();

    queries.add(`${title} S${season}E${episode}`);
    queries.add(`${title} ${season}x${episode}`);
    queries.add(`${title} Stagione ${metadata.season} Episodio ${metadata.episode}`);

    queries.add(`${title} S${season}E${episode} ITA`);
    queries.add(`${title} ${season}x${episode} ITA`);
    queries.add(`${title} S${season}E${episode} 1080p`);

    if (metadata.episode === 1) {
        queries.add(`${title} Stagione ${metadata.season} Completa`);
        queries.add(`${title} Stagione ${metadata.season} ITA`);
        queries.add(`${title} S${season} Completa`);
    }

    if (original && original !== title) {
        queries.add(`${original} S${season}E${episode}`);
        queries.add(`${original} ${season}x${episode}`);
        if (year) queries.add(`${original} ${year} S${season}E${episode}`);
    }

    const abbreviations = {
        "The Walking Dead": ["TWD"], "Game of Thrones": ["GoT", "GOT"], "Breaking Bad": ["BB"],
        "Stranger Things": ["ST"], "The Boys": ["Boys"], "House of the Dragon": ["HotD", "HOD"],
        "The Last of Us": ["TLOU"], "Loki": ["Loki"], "Wandavision": ["WandaVision"],
        "The Mandalorian": ["Mando"], "One Piece": ["OnePiece", "OP"], "Attack on Titan": ["AoT"],
        "Demon Slayer": ["Kimetsu"], "Jujutsu Kaisen": ["JJK"], "Chainsaw Man": ["CSM"]
    };

    for (const [full, abbs] of Object.entries(abbreviations)) {
        if (title.toLowerCase().includes(full.toLowerCase()) || (original && original.toLowerCase().includes(full.toLowerCase()))) {
            abbs.forEach(abb => {
                queries.add(`${abb} S${season}E${episode}`);
                queries.add(`${abb} S${season}E${episode} ITA`);
            });
        }
    }

    queries.add(`${title.replace(/[^\w]/g, ".")}S${season}E${episode}`);
    return Array.from(queries);
}

// ═══════════════════════════════════════════════════════════════════
// BRAIN QUERY ENGINE v3 – FILM
// ═══════════════════════════════════════════════════════════════════
function buildMovieQueries(metadata) {
    const title = metadata.title.trim();
    const original = (metadata.originalTitle || "").trim();
    const year = metadata.year || "";
    let queries = new Set();

    queries.add(`${title} ${year}`);
    if (original && original !== title) {
        queries.add(`${original} ${year}`);
    }

    queries.add(`${title} ${year} ITA`);
    queries.add(`${title} ITA`); 
    if (original && original !== title) {
        queries.add(`${original} ${year} ITA`);
    }

    queries.add(`${title} ${year} Multi`);
    queries.add(`${title} Multi`);

    queries.add(`${title} ${year} 1080p`);
    queries.add(`${title} ${year} 4k`);
    queries.add(`${title} ${year} UHD`);

    const cleanTitle = title.replace(/['’:\-]/g, " ").replace(/\s+/g, " ").trim();
    if (cleanTitle !== title) {
        queries.add(`${cleanTitle} ${year}`);
        queries.add(`${cleanTitle} ${year} ITA`);
    }

    return Array.from(queries);
}

// --- LOGICA STRICT ITA ---
function isSafeForItalian(item) {
    if (item.source === "Corsaro") return true;
    const t = item.title.toUpperCase();
    const hasIta = t.includes("ITA") || t.includes("ITALIAN") || t.includes("IT-EN") || (t.includes("MULTI") && !t.includes("FRENCH") && !t.includes("SPANISH"));
    if (hasIta) return true;
    const isForeignOnly = (t.includes("ENG") || t.includes("VOST") || t.includes("VOSUB")) && !t.includes("MULTI");
    if (isForeignOnly) return false;
    return false; 
}

// --- METADATA ---
async function getCinemetaMetadata(id, type) {
    try {
        const cleanId = id.split(':')[0]; 
        const res = await axios.get(`${CINEMETA_URL}/meta/${type}/${cleanId}.json`);
        const meta = res.data.meta;
        if (!meta) return null;
        return {
            title: meta.name,
            originalTitle: meta.name,
            year: meta.year ? (meta.year.includes('–') ? meta.year.split('–')[0] : meta.year) : null,
            isSeries: type === 'series'
        };
    } catch (e) { return null; }
}

async function getMetadata(id, type, tmdbKey) {
    let seasonNum = 1, episodeNum = 1, tmdbId = id;
    if (type === 'series' && id.includes(':')) {
        const parts = id.split(':');
        tmdbId = parts[0]; seasonNum = parseInt(parts[1]); episodeNum = parseInt(parts[2]);
    }

    try {
        if (tmdbKey) {
            let details;
            if (tmdbId.startsWith('tt')) {
                const res = await axios.get(`https://api.themoviedb.org/3/find/${tmdbId}?api_key=${tmdbKey}&language=it-IT&external_source=imdb_id`, { timeout: TIMEOUT_TMDB });
                details = (type === 'movie') ? res.data.movie_results[0] : res.data.tv_results[0];
            } else if (tmdbId.startsWith('tmdb:')) {
                const cleanId = tmdbId.split(':')[1];
                const res = await axios.get(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${cleanId}?api_key=${tmdbKey}&language=it-IT`, { timeout: TIMEOUT_TMDB });
                details = res.data;
            }
            if (details) {
                return {
                    title: details.title || details.name, 
                    originalTitle: details.original_title || details.original_name, 
                    year: (details.release_date || details.first_air_date)?.split('-')[0],
                    isSeries: type === 'series', season: seasonNum, episode: episodeNum
                };
            }
        }
    } catch (e) {}

    if (tmdbId.startsWith('tt')) {
        const cinemeta = await getCinemetaMetadata(tmdbId, type);
        if (cinemeta) return { ...cinemeta, season: seasonNum, episode: episodeNum };
    }
    return null;
}

// --- CATALOGHI ---
async function generateCatalog(type, id, config, skip = 0) {
    const page = Math.floor(skip / 20) + 1;
    const cacheKey = `catalog:${type}:${id}:${page}`;
    if (internalCache.has(cacheKey)) return internalCache.get(cacheKey);
    if (!config.tmdb) return { metas: [] };

    let url = '';
    switch(id) {
        case 'tmdb_trending': url = `https://api.themoviedb.org/3/trending/movie/day?api_key=${config.tmdb}&language=it-IT&page=${page}`; break;
        case 'tmdb_series_trending': url = `https://api.themoviedb.org/3/trending/tv/day?api_key=${config.tmdb}&language=it-IT&page=${page}`; break;
        case 'tmdb_4k': url = `https://api.themoviedb.org/3/discover/movie?api_key=${config.tmdb}&language=it-IT&sort_by=popularity.desc&primary_release_date.gte=2022-01-01&page=${page}`; break;
        case 'tmdb_anime': url = `https://api.themoviedb.org/3/discover/movie?api_key=${config.tmdb}&language=it-IT&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`; break;
        default: return { metas: [], cacheMaxAge: 3600 };
    }

    try {
        const r = await axios.get(url);
        const metas = r.data.results.map(m => ({
            id: `tmdb:${m.id}`,
            type: type,
            name: m.title || m.name,
            poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            description: m.overview
        })).filter(m => m.poster);

        const result = { metas, cacheMaxAge: 14400, staleRevalidate: 86400 };
        internalCache.set(cacheKey, result);
        return result;
    } catch (e) { return { metas: [] }; }
}

// --- STREAM & LOGIC ---
function isExactEpisodeMatch(torrentTitle, season, episode) {
    if (!torrentTitle) return false;
    const t = torrentTitle.toLowerCase();
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');
    if (new RegExp(`s${s}e${e}`, 'i').test(t)) return true;
    if (new RegExp(`${season}x${e}`, 'i').test(t)) return true;
    if (episode === 1 && new RegExp(`(stagione|season|s[0-9]{2}\\s+completa|complete)`, 'i').test(t)) return true;
    return false;
}

function extractStreamInfo(title) {
    const t = title.toLowerCase();
    let quality = "Unknown";
    if (/2160p|4k|uhd/.test(t)) quality = "4k";
    else if (/1080p/.test(t)) quality = "1080p";
    else if (/720p/.test(t)) quality = "720p";
    else if (/480p|sd/.test(t)) quality = "SD";
     
    let extra = [];
    if (/hdr|10bit/.test(t)) extra.push("HDR");
    if (/dolby|vision/.test(t)) extra.push("DV");
    if (/hevc|x265/.test(t)) extra.push("HEVC");
    if (/5.1|ac3/.test(t)) extra.push("5.1");

    let lang = [];
    if (t.includes("ita")) lang.push("ITA 🇮🇹");
    if (t.includes("multi") && t.includes("ita")) lang.push("MULTI 🌐");
     
    return { quality, lang, extraInfo: extra.join(" | ") };
}

async function generateStream(type, id, config, userConfStr) {
    const { rd, tmdb } = config || {};
    const onlyIta = config.filters?.onlyIta !== false; 
    const filters = config.filters || {}; 

    if (!rd) return { streams: [{ title: "⚠️ Configura RealDebrid nel Manifest" }], cacheMaxAge: 300 };

    const cacheKey = `stream:${userConfStr}:${type}:${id}`;
    if (internalCache.has(cacheKey)) return internalCache.get(cacheKey);

    console.log(`⚡ STREAM: ${id} | Mode: ${onlyIta ? 'STRICT' : 'GLOBAL'}`);

    try {
        const metadata = await getMetadata(id, type, tmdb);
        if (!metadata) return { streams: [{ title: "⚠️ Metadata non trovato" }], cacheMaxAge: 300 };

        let queries = [];

        // --- BRAIN QUERY ENGINE v3 (FULL) ---
        if (metadata.isSeries) {
            queries = buildSeriesQueriesForSeries(metadata);
        } else {
            queries = buildMovieQueries(metadata);
        }
        
        if (onlyIta) {
            const strictVersions = queries.map(q => {
                 if (!q.toUpperCase().includes("ITA")) return q + " ITA";
                 return q;
            });
            queries = [...queries, ...strictVersions];
        }

        queries = [...new Set(queries)];
        console.log(`🧠 Brain Engine v3 - Query generate: ${queries.length} varianti`);

        // --- FASE 1: SCRAPER INTERNI ---
        let internalPromises = [];
        queries.forEach(q => {
            internalPromises.push(scraperLimiter.schedule(() => Corsaro.searchMagnet(q, metadata.year).catch(() => [])));
            internalPromises.push(scraperLimiter.schedule(() => UIndex.searchMagnet(q, metadata.year).catch(() => [])));
            internalPromises.push(scraperLimiter.schedule(() => Knaben.searchMagnet(q, metadata.year).catch(() => [])));
            internalPromises.push(scraperLimiter.schedule(() => TorrentMagnet.searchMagnet(q, metadata.year).catch(() => [])));
        });

        const internalResultsRaw = (await Promise.all(internalPromises)).flat();

        const validInternalResults = internalResultsRaw.filter(item => {
            if (!item || !item.magnet || !item.title) return false;
            if (onlyIta && !isSafeForItalian(item)) return false;
            return true;
        });

        let allResults = [...validInternalResults];
        console.log(`🔍 Risultati Interni Validi: ${validInternalResults.length}`);

        // --- FASE 2: EXTERNAL ---
        if (validInternalResults.length <= 4) {
            console.log("🚨 Pochi risultati interni. Attivo External Brain (Stealth Mode)...");
            const imdbId = (id.startsWith('tt')) ? id.split(':')[0] : null;
            const mainQuery = queries[0]; 
            try {
                let externalResults = await External.searchMagnet(id, type, imdbId, mainQuery);
                externalResults = externalResults.map(item => { item.source = "Brain P2P"; return item; });
                allResults = [...allResults, ...externalResults];
            } catch (err) { console.error("External Error:", err.message); }
        }

        if (allResults.length === 0) return { streams: [{ title: `🚫 Nessun risultato` }], cacheMaxAge: 120 };

        // --- DEDUPLICAZIONE ---
        let uniqueResults = [];
        const magnetSet = new Set();
        
        for (const item of allResults) {
            if (!item || !item.title || !item.magnet) continue;
            if (onlyIta && !isSafeForItalian(item)) continue;
            
            const hashMatch = item.magnet.match(/btih:([A-F0-9]{40})/i);
            const key = hashMatch ? hashMatch[1].toUpperCase() : item.magnet;
            
            if (!magnetSet.has(key)) {
                magnetSet.add(key);
                uniqueResults.push(item);
            }
        }

        if (metadata.isSeries) uniqueResults = uniqueResults.filter(item => isExactEpisodeMatch(item.title, metadata.season, metadata.episode));
        if (filters.no4k) uniqueResults = uniqueResults.filter(i => !/2160p|4k|uhd/i.test(i.title));
        if (filters.noCam) uniqueResults = uniqueResults.filter(i => !/cam|dvdscr|hdcam|telesync|tc|ts/i.test(i.title));

        // ═══════════════════════════════════════════════════════════════════
        // ORDINAMENTO PER DIMENSIONE (Size Sorting)
        // ═══════════════════════════════════════════════════════════════════
        uniqueResults.sort((a, b) => {
            const sizeA = parseSize(a.size);
            const sizeB = parseSize(b.size);
            // Ordine decrescente (B è più grande di A -> viene prima)
            return sizeB - sizeA;
        });

        // --- LIMITATORE CRITICO ---
        const topResults = uniqueResults.slice(0, 20); 

        let streams = [];
        const resolutionPromises = topResults.map(item => {
            return rdLimiter.schedule(async () => {
                try {
                    const streamData = await RD.getStreamLink(config.rd, item.magnet);
                    if (streamData && streamData.type === 'ready' && streamData.size < REAL_SIZE_FILTER) return null;
                    if (streamData && streamData.filename && streamData.filename.toLowerCase().match(/\.rar|\.zip/)) return null;
                     
                    const fileTitle = streamData?.filename || item.title;
                    const { quality, lang, extraInfo } = extractStreamInfo(fileTitle);
                    let displayLang = lang.join(" / ") || "ITA 🇮🇹";
                    
                    let nameTag = streamData ? `[RD ⚡] ${item.source}` : `[RD ⏳] ${item.source}`;
                    nameTag += `\n${quality}`;
                    let finalSize = streamData?.size ? formatBytes(streamData.size) : (item.size || "?? GB");
                     
                    let titleStr = `📄 ${fileTitle}\n💾 ${finalSize}`;
                    if (extraInfo) titleStr += ` | ${extraInfo}`;
                    if (fileTitle.toUpperCase().includes("AC3") || fileTitle.toUpperCase().includes("DTS")) titleStr += " | 🔊 AUDIO PRO";
                    titleStr += `\n🔊 ${displayLang}`;

                    if (streamData) {
                        return { name: nameTag, title: titleStr, url: streamData.url, behaviorHints: { notWebReady: false } };
                    } else if (filters.showFake) {
                        return { name: nameTag.replace('⚡', '⚠️'), title: `${titleStr}\n⚠️ Link Magnet (Download Richiesto)`, url: item.magnet, behaviorHints: { notWebReady: true } };
                    }
                } catch (e) { return null; }
            });
        });

        const resolvedStreams = (await Promise.all(resolutionPromises)).filter(s => s !== null && s !== undefined);
        streams = resolvedStreams;

        const finalResponse = { 
            streams: streams.length > 0 ? streams : [{ title: "🚫 Nessun file valido su RD." }],
            cacheMaxAge: streams.length > 0 ? 1800 : 120, 
            staleRevalidate: streams.length > 0 ? 3600 : 0
        };
        internalCache.set(cacheKey, finalResponse);
        return finalResponse;

    } catch (error) {
        console.error("🔥 Errore:", error.message);
        return { streams: [{ title: `Errore: ${error.message}` }], cacheMaxAge: 60 };
    }
}

// --- ROUTES ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/:userConf/manifest.json', (req, res) => {
    const config = getConfig(req.params.userConf);
    const m = { ...manifestBase };
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    m.logo = `${protocol}://${host}/logo.png`;
    if (config.tmdb && config.rd) m.behaviorHints = { configurable: true, configurationRequired: false };
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(m);
});
app.get('/:userConf/catalog/:type/:id/:extra?.json', async (req, res) => {
    let skip = 0;
    if (req.params.extra) { const match = req.params.extra.match(/skip=(\d+)/); if (match) skip = parseInt(match[1]); }
    const result = await generateCatalog(req.params.type, req.params.id, getConfig(req.params.userConf), skip);
    res.setHeader('Access-Control-Allow-Origin', '*');
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});
app.get('/:userConf/catalog/:type/:id.json', async (req, res) => {
    const result = await generateCatalog(req.params.type, req.params.id, getConfig(req.params.userConf));
    res.setHeader('Access-Control-Allow-Origin', '*');
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});
app.get('/:userConf/stream/:type/:id.json', async (req, res) => {
    const result = await generateStream(req.params.type, req.params.id.replace('.json', ''), getConfig(req.params.userConf), req.params.userConf);
    res.setHeader('Access-Control-Allow-Origin', '*');
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon v25.3.0 (Size Sorting) avviato su porta ${PORT}!`));
