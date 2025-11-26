const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const NodeCache = require("node-cache");
const Bottleneck = require("bottleneck"); 

// --- MODULI ESTERNI ---
// Assicurati che questi file esistano nella stessa cartella
const RD = require("./rd");
const Corsaro = require("./corsaro");
const Knaben = require("./knaben"); 
const TorrentMagnet = require("./torrentmagnet"); 
const UIndex = require("./uindex"); 

// --- COSTANTI & CONFIGURAZIONE ---
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const REAL_SIZE_FILTER = 200 * 1024 * 1024; 

// Cache interna (RAM) per evitare di richiamare funzioni pesanti troppo spesso
const internalCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// --- RATE LIMITER (ANTI-FLOOD) ---
// Limita le richieste verso i siti esterni (max 5 contemporanee, min 200ms pausa)
const scraperLimiter = new Bottleneck({
    maxConcurrent: 5,
    minTime: 200
});

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- MANIFEST ---
const manifestBase = {
    id: "org.community.corsaro-brain-ita-strict-v2",
    version: "24.0.1",
    name: "Corsaro + TorrentMagnet (SUPER STRICT)",
    description: "🇮🇹 Motore V24.1: Tolleranza Zero per i Multi stranieri. Solo ITA Verificato.",
    resources: ["catalog", "stream"],
    types: ["movie", "series"],
    catalogs: [{ type: "movie", id: "tmdb_trending", name: "Popolari Italia" }],
    idPrefixes: ["tmdb", "tt"],
    behaviorHints: { configurable: true, configurationRequired: true }
};

// --- UTILITIES ---
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getConfig(configStr) {
    try { return JSON.parse(Buffer.from(configStr, 'base64').toString()); } catch (e) { return {}; }
}

// Helper per applicare header di cache dinamici (preso dallo snippet SDK)
function applyCacheHeaders(res, data) {
    const cacheHeaders = {
        cacheMaxAge: 'max-age',
        staleRevalidate: 'stale-while-revalidate',
        staleError: 'stale-if-error'
    };

    // Defaults: Cache lunga (4 ore) se non specificato diversamente
    const defaults = {
        cacheMaxAge: 14400,       
        staleRevalidate: 86400,   
        staleError: 604800        
    };

    const parts = [];
    Object.keys(cacheHeaders).forEach(prop => {
        const headerName = cacheHeaders[prop];
        // Se la funzione ha ritornato un valore specifico, usalo, altrimenti default
        const value = (data[prop] !== undefined) ? data[prop] : defaults[prop];
        if (Number.isInteger(value)) {
            parts.push(`${headerName}=${value}`);
        }
    });

    if (parts.length > 0) {
        res.setHeader('Cache-Control', `${parts.join(', ')}, public`);
    }
}

// --- 👮‍♂️ LA DOGANA (STRICT ITALIAN CHECK) ---
function isSafeForItalian(item) {
    // 1. SOLO CORSARO è affidabile al 100% (Tracker solo ITA)
    // TorrentMagnet, Knaben e UIndex sono misti, quindi devono passare il controllo.
    if (item.source === "Corsaro") return true;

    const t = item.title.toUpperCase();

    // 2. Controllo Presenza ITA Esplicita
    const hasIta = t.includes("ITA") || t.includes("ITALIAN") || t.includes("IT-EN");

    // 3. REGOLA FERREA: Se c'è scritto ITA passa, altrimenti si scarta.
    // Questo elimina tutti i "Multi" generici (Inglese/Russo/Francese) che non specificano ITA.
    if (hasIta) return true;

    return false;
}

// --- METADATA HANDLER (TMDB + CINEMETA FALLBACK) ---
async function getCinemetaMetadata(id, type) {
    try {
        const cleanId = id.split(':')[0]; // Rimuove stagioni/episodi se presenti
        console.log(`🛡️ Fallback su Cinemeta per ID: ${cleanId}`);
        const res = await axios.get(`${CINEMETA_URL}/meta/${type}/${cleanId}.json`, { timeout: 4000 });
        const meta = res.data.meta;
        if (!meta) return null;
        return {
            title: meta.name,
            originalTitle: meta.name,
            year: meta.year ? (meta.year.includes('–') ? meta.year.split('–')[0] : meta.year) : null,
            isSeries: type === 'series'
        };
    } catch (e) {
        console.error("⚠️ Cinemeta Fallback fallito:", e.message);
        return null;
    }
}

async function getMetadata(id, type, tmdbKey) {
    let seasonNum = 1, episodeNum = 1, tmdbId = id;

    // Parsing ID Serie (tt123:1:1)
    if (type === 'series' && id.includes(':')) {
        const parts = id.split(':');
        tmdbId = parts[0]; 
        seasonNum = parseInt(parts[1]); 
        episodeNum = parseInt(parts[2]);
    }

    // 1. TENTATIVO TMDB (Priorità ITA)
    try {
        if (tmdbKey) {
            let details;
            if (tmdbId.startsWith('tt')) {
                const res = await axios.get(`https://api.themoviedb.org/3/find/${tmdbId}?api_key=${tmdbKey}&language=it-IT&external_source=imdb_id`, { timeout: 3000 });
                details = (type === 'movie') ? res.data.movie_results[0] : res.data.tv_results[0];
            } else if (tmdbId.startsWith('tmdb:')) {
                const cleanId = tmdbId.split(':')[1];
                const res = await axios.get(`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/${cleanId}?api_key=${tmdbKey}&language=it-IT`, { timeout: 3000 });
                details = res.data;
            }

            if (details) {
                return {
                    title: details.title || details.name, 
                    originalTitle: details.original_title || details.original_name, 
                    year: (details.release_date || details.first_air_date)?.split('-')[0],
                    isSeries: type === 'series', 
                    season: seasonNum, 
                    episode: episodeNum
                };
            }
        }
    } catch (e) { console.log("⚠️ TMDB Irraggiungibile/Key errata. Attivazione backup..."); }

    // 2. TENTATIVO CINEMETA (Backup)
    if (tmdbId.startsWith('tt')) {
        const cinemeta = await getCinemetaMetadata(tmdbId, type);
        if (cinemeta) {
            return { ...cinemeta, season: seasonNum, episode: episodeNum };
        }
    }

    return null;
}

// --- CATALOG HANDLER (PAGINAZIONE + SMART CACHE) ---
async function generateCatalog(type, id, config, skip = 0) {
    const page = Math.floor(skip / 20) + 1;
    const cacheKey = `catalog:${type}:${id}:${page}`;

    if (internalCache.has(cacheKey)) return internalCache.get(cacheKey);

    if (id === "tmdb_trending" && config.tmdb) {
        try {
            console.log(`📚 Richiesta Catalogo Pagina ${page}`);
            const r = await axios.get(`https://api.themoviedb.org/3/trending/movie/day?api_key=${config.tmdb}&language=it-IT&page=${page}`);
            
            const result = { 
                metas: r.data.results.map(m => ({
                    id: `tmdb:${m.id}`,
                    type: "movie",
                    name: m.title,
                    poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
                    description: m.overview
                })),
                // Cache standard per cataloghi riusciti
                cacheMaxAge: 14400, // 4 ore
                staleRevalidate: 86400 
            };
            internalCache.set(cacheKey, result);
            return result;
        } catch (e) { 
            console.error("Errore Catalogo:", e.message);
            // In caso di errore, cache molto breve (1 min)
            return { metas: [], cacheMaxAge: 60, staleRevalidate: 0 }; 
        }
    }
    return { metas: [], cacheMaxAge: 3600 };
}

// --- STREAM HANDLER ---
function isExactEpisodeMatch(torrentTitle, season, episode) {
    if (!torrentTitle) return false;
    const t = torrentTitle.toLowerCase();
    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');

    // Pattern S01E01, 1x01, ecc.
    if (new RegExp(`s${s}e${e}`, 'i').test(t)) return true;
    if (new RegExp(`${season}x${e}`, 'i').test(t)) return true;
    
    // Pattern Stagione Completa
    if (new RegExp(`stagione\\s*${season}(?!\\d)`, 'i').test(t)) return true;
    if (new RegExp(`season\\s*${season}(?!\\d)`, 'i').test(t)) return true;
    
    return false;
}

function extractStreamInfo(title) {
    const t = title.toLowerCase();
    let quality = "Unknown";
    if (/2160p|4k/.test(t)) quality = "4k";
    else if (/1080p/.test(t)) quality = "1080p";
    else if (/720p/.test(t)) quality = "720p";
    else if (/480p|sd/.test(t)) quality = "SD";
    else if (/dvdrip/.test(t)) quality = "DVD";

    let extra = [];
    if (/hdr|10bit/.test(t)) extra.push("HDR");
    if (/dolby|vision/.test(t)) extra.push("DV");
    if (/hevc|x265/.test(t)) extra.push("HEVC");
    if (/5.1|ac3/.test(t)) extra.push("5.1");

    let lang = [];
    if (t.includes("ita")) lang.push("ITA 🇮🇹");
    // Ora MULTI lo mettiamo solo se c'è anche ITA, dato che abbiamo filtrato tutto prima
    if (t.includes("multi") && t.includes("ita")) lang.push("MULTI 🌐");
    
    return { quality, lang, extraInfo: extra.join(" | ") };
}

async function generateStream(type, id, config, userConfStr) {
    const { rd, tmdb } = config || {};
    const filters = config.filters || {}; 

    // Cache Key univoca
    const cacheKey = `stream:${userConfStr}:${type}:${id}`;
    if (internalCache.has(cacheKey)) {
        console.log(`🚀 STREAM CACHED (RAM): ${id}`);
        return internalCache.get(cacheKey);
    }

    console.log(`⚡ STREAM LIVE: ${id}`);
    if (!rd) return { streams: [{ title: "⚠️ Configura RealDebrid" }], cacheMaxAge: 300 };

    try {
        const metadata = await getMetadata(id, type, tmdb);
        if (!metadata) return { streams: [{ title: "⚠️ Metadata non trovato" }], cacheMaxAge: 300 };

        let queries = [];
        // Costruzione Query Intelligente
        if (metadata.isSeries) {
            const s = String(metadata.season).padStart(2, '0');
            const e = String(metadata.episode).padStart(2, '0');
            queries.push(`${metadata.title} S${s}E${e}`);
            queries.push(`${metadata.title} Stagione ${metadata.season}`);
            if (metadata.originalTitle && metadata.originalTitle !== metadata.title) {
                queries.push(`${metadata.originalTitle} S${s}E${e}`);
            }
        } else {
            queries.push(`${metadata.title} ${metadata.year}`);
            if (metadata.originalTitle && metadata.originalTitle !== metadata.title) {
                queries.push(`${metadata.originalTitle} ${metadata.year}`);
            }
        }
        queries = [...new Set(queries)];
        
        // Esecuzione parallela ma LIMITATA dal Bottleneck
        let promises = [];
        queries.forEach(q => {
            // Priorità ITA
            promises.push(scraperLimiter.schedule(() => Corsaro.searchMagnet(q, metadata.year).catch(()=>[])));
            promises.push(scraperLimiter.schedule(() => UIndex.searchMagnet(q, metadata.year).catch(()=>[])));
            promises.push(scraperLimiter.schedule(() => TorrentMagnet.searchMagnet(q, metadata.year).catch(()=>[])));
        });

        // Knaben (Global Backup) se non "Solo ITA"
        if (!filters.onlyIta) {
            let globalQuery = queries.length > 1 ? queries[queries.length - 1] : queries[0];
            if (metadata.originalTitle && metadata.isSeries) {
                const s = String(metadata.season).padStart(2, '0');
                const e = String(metadata.episode).padStart(2, '0');
                globalQuery = `${metadata.originalTitle} S${s}E${e}`;
            }
            promises.push(scraperLimiter.schedule(() => Knaben.searchMagnet(globalQuery, metadata.year).catch(()=>[])));
        }

        const resultsArray = await Promise.all(promises);
        let allResults = resultsArray.flat();

        if (allResults.length === 0) {
            return { 
                streams: [{ title: `🚫 Nessun risultato trovato` }], 
                cacheMaxAge: 300, // Riprova tra 5 min
                staleRevalidate: 0 
            };
        }

        // Filtri e Deduplicazione
        let uniqueResults = [];
        const magnetSet = new Set();
        
        for (const item of allResults) {
            if (!isSafeForItalian(item)) continue;

            const hashMatch = item.magnet.match(/btih:([A-F0-9]{40})/i);
            const key = hashMatch ? hashMatch[1].toUpperCase() : item.magnet;
            if (!magnetSet.has(key)) {
                magnetSet.add(key);
                uniqueResults.push(item);
            }
        }

        if (metadata.isSeries) {
            uniqueResults = uniqueResults.filter(item => isExactEpisodeMatch(item.title, metadata.season, metadata.episode));
        }

        if (filters.no4k) uniqueResults = uniqueResults.filter(i => !/2160p|4k|uhd/i.test(i.title));
        if (filters.noCam) {
            const bad = ['cam', 'dvdscr', 'hdcam', 'telesync', 'tc', 'ts'];
            uniqueResults = uniqueResults.filter(i => !bad.some(q => i.title.toLowerCase().includes(q)));
        }

        uniqueResults.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
        const topResults = uniqueResults.slice(0, 20); 

        // Unrestricted Link (RealDebrid)
        let streams = [];
        for (const item of topResults) {
            try {
                const streamData = await RD.getStreamLink(config.rd, item.magnet);
                
                // Salta se è un RAR o file troppo piccolo (sample)
                if (streamData && streamData.type === 'ready' && streamData.size < REAL_SIZE_FILTER) continue; 

                const fileTitle = streamData?.filename || item.title;
                const { quality, lang, extraInfo } = extractStreamInfo(fileTitle);
                
                let displayLang = lang.join(" / ") || "ITA 🇮🇹";
                let nameTag = streamData ? `[RD ⚡] ${item.source}` : `[RD ⏳] ${item.source}`;
                nameTag += `\n${quality}`;
                let finalSize = streamData?.size ? formatBytes(streamData.size) : (item.size || "?? GB");

                let titleStr = `📄 ${fileTitle}\n💾 ${finalSize}`;
                if (extraInfo) titleStr += ` | ${extraInfo}`;
                titleStr += `\n⚙️ ${item.source}\n`;
                titleStr += `🔊 ${displayLang}`;

                if (streamData) {
                    streams.push({
                        name: nameTag,
                        title: titleStr,
                        url: streamData.url,
                        behaviorHints: { notWebReady: false }
                    });
                } else if (filters.showFake) {
                    streams.push({
                        name: nameTag.replace('⚡', '⚠️'),
                        title: `${titleStr}\n⚠️ Link Diretto (Download Richiesto)`,
                        url: item.magnet,
                        behaviorHints: { notWebReady: true }
                    });
                }
                await wait(50); // Piccolo delay gentile
            } catch (e) {}
        }

        const finalResponse = { 
            streams: streams.length > 0 ? streams : [{ title: "🚫 Nessun file valido." }],
            // Cache intelligente:
            // Se abbiamo risultati: cache 30 min, stale 1 ora
            // Se vuoto: cache corta (definita sopra)
            cacheMaxAge: streams.length > 0 ? 1800 : 120, 
            staleRevalidate: streams.length > 0 ? 3600 : 0
        };

        internalCache.set(cacheKey, finalResponse);
        return finalResponse;

    } catch (error) {
        console.error("🔥 Errore fatale:", error.message);
        return { streams: [{ title: "Errore Interno Addon" }], cacheMaxAge: 60 };
    }
}

// --- ROUTES EXPRESS ---

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

// ROUTE CATALOGO (Gestisce SKIP + Cache Headers)
app.get('/:userConf/catalog/:type/:id/:extra?.json', async (req, res) => {
    let skip = 0;
    if (req.params.extra) {
        const match = req.params.extra.match(/skip=(\d+)/);
        if (match) skip = parseInt(match[1]);
    }
    
    const result = await generateCatalog(req.params.type, req.params.id, getConfig(req.params.userConf), skip);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Applica header cache dinamici
    applyCacheHeaders(res, result);
    
    // Pulisci l'oggetto JSON da inviare a Stremio (rimuovi campi tecnici cache)
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});

// Compatibilità vecchia route
app.get('/:userConf/catalog/:type/:id.json', async (req, res) => {
    const result = await generateCatalog(req.params.type, req.params.id, getConfig(req.params.userConf));
    res.setHeader('Access-Control-Allow-Origin', '*');
    applyCacheHeaders(res, result);
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});

// ROUTE STREAM (Gestisce Cache Headers)
app.get('/:userConf/stream/:type/:id.json', async (req, res) => {
    const result = await generateStream(
        req.params.type, 
        req.params.id.replace('.json', ''), 
        getConfig(req.params.userConf),
        req.params.userConf 
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    applyCacheHeaders(res, result);

    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon The Brain v24.0.1 (Strict Mode) avviato su porta ${PORT}!`));
