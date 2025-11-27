const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const NodeCache = require("node-cache");
const Bottleneck = require("bottleneck"); 

// --- MODULI ESTERNI (Presumo esistano) ---
const RD = require("./rd");
const Corsaro = require("./corsaro");
const Knaben = require("./knaben"); 
const TorrentMagnet = require("./torrentmagnet"); 
const UIndex = require("./uindex"); 

// --- COSTANTI & CONFIGURAZIONE ---
const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const REAL_SIZE_FILTER = 200 * 1024 * 1024; // 200 MB
const TIMEOUT_TMDB = 3500; // Aumentato leggermente per affidabilità
const TIMEOUT_CINEMETA = 2500; // Ridotto, è un fallback

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
    version: "24.1.0", // Versione aggiornata
    name: "Corsaro + TorrentMagnet (STRICT-PLUS)",
    description: "🇮🇹 Motore V24.1: Tolleranza Zero per i Multi stranieri. Strict Mode attivo di default.",
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
    try { 
        return JSON.parse(Buffer.from(configStr, 'base64').toString()); 
    } catch (e) { 
        console.error("⚠️ Errore Decodifica Config:", e.message);
        return {}; 
    }
}

// Helper per applicare header di cache dinamici
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

// --- 👮‍♂️ LA DOGANA (STRICT ITALIAN CHECK - VERSIONE MIGLIORATA) ---
function isSafeForItalian(item) {
    // 1. SOLO CORSARO è affidabile al 100% (Tracker solo ITA)
    if (item.source === "Corsaro") return true;

    const t = item.title.toUpperCase();

    // 2. Controllo Presenza ITA Esplicita
    const hasIta = t.includes("ITA") || t.includes("ITALIAN") || t.includes("IT-EN");

    // 3. REGOLA FERREA: Se c'è scritto ITA passa, altrimenti si scarta.
    // Questo elimina tutti i "Multi" generici che non specificano ITA.
    if (hasIta) return true;

    // 4. ULTIMO CONTROLLO: Escludi i formati noti per essere solo stranieri senza tag ITA
    const isForeignOnly = t.includes("ENG") || t.includes("VOST") || t.includes("VOSUB");
    if (isForeignOnly) return false;

    return false;
}

// --- METADATA HANDLER (TMDB + CINEMETA FALLBACK) ---
async function getCinemetaMetadata(id, type) {
    try {
        const cleanId = id.split(':')[0]; 
        console.log(`🛡️ Fallback su Cinemeta per ID: ${cleanId}`);
        const res = await axios.get(`${CINEMETA_URL}/meta/${type}/${cleanId}.json`, { timeout: TIMEOUT_CINEMETA });
        const meta = res.data.meta;
        if (!meta) return null;
        return {
            title: meta.name,
            originalTitle: meta.name,
            year: meta.year ? (meta.year.includes('–') ? meta.year.split('–')[0] : meta.year) : null,
            isSeries: type === 'series'
        };
    } catch (e) {
        // Log solo l'errore se non è un timeout per evitare spam
        if (e.code !== 'ECONNABORTED' && e.code !== 'ETIMEDOUT') {
            console.error("⚠️ Cinemeta Fallback fallito:", e.message);
        }
        return null;
    }
}

async function getMetadata(id, type, tmdbKey) {
    let seasonNum = 1, episodeNum = 1, tmdbId = id;

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
            // Lookup tramite IMDB ID (ttXXXX)
            if (tmdbId.startsWith('tt')) {
                const res = await axios.get(`https://api.themoviedb.org/3/find/${tmdbId}?api_key=${tmdbKey}&language=it-IT&external_source=imdb_id`, { timeout: TIMEOUT_TMDB });
                details = (type === 'movie') ? res.data.movie_results[0] : res.data.tv_results[0];
            // Lookup tramite TMDB ID (tmdb:XXXX)
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
                    isSeries: type === 'series', 
                    season: seasonNum, 
                    episode: episodeNum
                };
            }
        }
    } catch (e) { 
        // Log solo se non è un timeout/connessione fallita per pulizia
        if (e.code !== 'ECONNABORTED' && e.code !== 'ETIMEDOUT') {
             console.log("⚠️ TMDB Fallito/Key errata. Attivazione backup...");
        }
    }

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
                cacheMaxAge: 14400, 
                staleRevalidate: 86400 
            };
            internalCache.set(cacheKey, result);
            return result;
        } catch (e) { 
            console.error("Errore Catalogo TMDB:", e.message);
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
    
    // Pattern Stagione/Serie Completa - Permesso solo se l'episodio richiesto è il primo
    // Questo permette a RD di selezionare il file corretto dalla cartella, ma solo
    // per torrent di stagioni complete molto puliti che Stremio non ha già escluso.
    if (episode === 1) {
        if (new RegExp(`(stagione|season|s[0-9]{2}\\s+completa|complete)`, 'i').test(t)) return true;
    }
    
    return false;
}

function extractStreamInfo(title) {
    const t = title.toLowerCase();
    let quality = "Unknown";
    if (/2160p|4k|uhd/.test(t)) quality = "4k";
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
    if (t.includes("multi") && t.includes("ita")) lang.push("MULTI 🌐");
    
    return { quality, lang, extraInfo: extra.join(" | ") };
}

async function generateStream(type, id, config, userConfStr) {
    const { rd, tmdb } = config || {};
    // onlyIta: TRUE di default, disattivabile tramite interfaccia di configurazione
    const onlyIta = config.filters?.onlyIta !== false; 
    const filters = config.filters || {}; 

    // Controllo minimo di configurazione
    if (!rd) return { streams: [{ title: "⚠️ Configura RealDebrid nel Manifest" }], cacheMaxAge: 300 };

    const cacheKey = `stream:${userConfStr}:${type}:${id}`;
    if (internalCache.has(cacheKey)) {
        console.log(`🚀 STREAM CACHED (RAM): ${id}`);
        return internalCache.get(cacheKey);
    }

    console.log(`⚡ STREAM LIVE: ${id} | Strict Mode: ${onlyIta ? 'ON' : 'OFF'}`);

    try {
        const metadata = await getMetadata(id, type, tmdb);
        if (!metadata) return { streams: [{ title: "⚠️ Metadata non trovato" }], cacheMaxAge: 300 };

        let queries = [];
        const s = String(metadata.season).padStart(2, '0');
        const e = String(metadata.episode).padStart(2, '0');

        // Costruzione Query Intelligente
        if (metadata.isSeries) {
            // Priorità 1: Titolo ITA + SxxExx
            queries.push(`${metadata.title} S${s}E${e}`);
            // Priorità 2: Titolo ITA + Stagione Completa (cercata solo se episodio 1)
            if (metadata.episode === 1) queries.push(`${metadata.title} Stagione ${metadata.season} Completa`);
            // Priorità 3: Titolo Originale + SxxExx
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
        
        // Esecuzione parallela LIMITATA dal Bottleneck
        let promises = [];
        
        // Scrapers ITA-Focus (Sempre usati)
        queries.forEach(q => {
            promises.push(scraperLimiter.schedule(() => Corsaro.searchMagnet(q, metadata.year).catch((err) => { console.log(`Corsaro Fallito per ${q}: ${err.message}`); return []; })));
            promises.push(scraperLimiter.schedule(() => UIndex.searchMagnet(q, metadata.year).catch((err) => { console.log(`UIndex Fallito per ${q}: ${err.message}`); return []; })));
            promises.push(scraperLimiter.schedule(() => TorrentMagnet.searchMagnet(q, metadata.year).catch((err) => { console.log(`TorrentMagnet Fallito per ${q}: ${err.message}`); return []; })));
        });

        // Knaben (Global Backup) se Strict Mode è disattivato
        if (!onlyIta) {
            let globalQuery = metadata.originalTitle ? queries.find(q => q.includes(metadata.originalTitle)) || queries[0] : queries[0];
            
            promises.push(scraperLimiter.schedule(() => Knaben.searchMagnet(globalQuery, metadata.year).catch((err) => { console.log(`Knaben Fallito per ${globalQuery}: ${err.message}`); return []; })));
        }

        const resultsArray = await Promise.all(promises);
        let allResults = resultsArray.flat();

        if (allResults.length === 0) {
            return { 
                streams: [{ title: `🚫 Nessun risultato trovato (Query: ${queries.join(', ')})` }], 
                cacheMaxAge: 300, 
                staleRevalidate: 0 
            };
        }

        // --- FILTRI FINALI E DEDUPLICAZIONE ---
        let uniqueResults = [];
        const magnetSet = new Set();
        
        for (const item of allResults) {
            // 1. Applica la Dogana (Strict Mode)
            if (onlyIta && !isSafeForItalian(item)) continue;
            // 2. Deduplicazione per Hash
            const hashMatch = item.magnet.match(/btih:([A-F0-9]{40})/i);
            const key = hashMatch ? hashMatch[1].toUpperCase() : item.magnet;
            if (!magnetSet.has(key)) {
                magnetSet.add(key);
                uniqueResults.push(item);
            }
        }

        // 3. Match Episodi (per Serie)
        if (metadata.isSeries) {
            uniqueResults = uniqueResults.filter(item => isExactEpisodeMatch(item.title, metadata.season, metadata.episode));
        }

        // 4. Filtri Qualità/Scam
        if (filters.no4k) uniqueResults = uniqueResults.filter(i => !/2160p|4k|uhd/i.test(i.title));
        if (filters.noCam) {
            const bad = ['cam', 'dvdscr', 'hdcam', 'telesync', 'tc', 'ts'];
            uniqueResults = uniqueResults.filter(i => !bad.some(q => i.title.toLowerCase().includes(q)));
        }

        uniqueResults.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
        const topResults = uniqueResults.slice(0, 20); 

        // --- UNRESTRICTED LINK (REAL-DEBRID) ---
        let streams = [];
        for (const item of topResults) {
            try {
                // Presunto: RD.getStreamLink gestisce l'hash/magnet e risolve il link diretto (anche selezionando il file corretto in caso di stagione)
                const streamData = await RD.getStreamLink(config.rd, item.magnet);
                
                // Salta se è un RAR/ZIP o file troppo piccolo (sample)
                if (streamData && streamData.type === 'ready' && streamData.size < REAL_SIZE_FILTER) continue; 
                if (streamData && streamData.filename.toLowerCase().match(/\.rar|\.zip/)) continue;

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
                    // Link Magnet se l'hash non è su RD
                    streams.push({
                        name: nameTag.replace('⚡', '⚠️'),
                        title: `${titleStr}\n⚠️ Link Magnet (Download Richiesto)`,
                        url: item.magnet,
                        behaviorHints: { notWebReady: true }
                    });
                }
                await wait(50); // Piccolo delay gentile per non sovraccaricare il loop
            } catch (e) {
                 console.log(`Errore risoluzione RD per ${item.source}: ${e.message}`);
            }
        }

        const finalResponse = { 
            streams: streams.length > 0 ? streams : [{ title: "🚫 Nessun file valido trovato su Real-Debrid." }],
            // Cache intelligente: Lunga (30 min) se ci sono risultati, corta (2 min) altrimenti.
            cacheMaxAge: streams.length > 0 ? 1800 : 120, 
            staleRevalidate: streams.length > 0 ? 3600 : 0
        };

        internalCache.set(cacheKey, finalResponse);
        return finalResponse;

    } catch (error) {
        console.error("🔥 Errore fatale in generateStream:", error.message);
        return { streams: [{ title: `Errore Interno Addon: ${error.message}` }], cacheMaxAge: 60 };
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
    // Manifest non richiede configurazione se le chiavi sono presenti
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
    
    applyCacheHeaders(res, result);
    
    const { cacheMaxAge, staleRevalidate, staleError, ...cleanResult } = result;
    res.json(cleanResult);
});

// Compatibilità vecchia route /catalog/.../id.json
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
app.listen(PORT, () => console.log(`Addon The Brain v24.1.0 (Strict-Plus Mode) avviato su porta ${PORT}!`));
