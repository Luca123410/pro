const axios = require("axios");
const crypto = require("crypto"); 

// --- CONFIGURAZIONE STEALTH ---
const TIMEOUT_MS = 6000; 
const MIN_DELAY = 400;   // Jitter minimo
const MAX_DELAY = 1200;  // Jitter massimo

// --- POOL DI USER AGENTS (Anti-Blocking) ---
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0"
];

// --- UTILITIES ---
function getRandomHeader() {
    const agent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    return {
        'User-Agent': agent,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };
}

function generateFakeHash() {
    return `BRN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* ===========================================================
   PART 1: STEALTH SCRAPERS (API Pubbliche)
   =========================================================== */

const BitSearch = {
    search: async (query) => {
        if (!query) return [];
        try {
            const url = `https://bitsearch.to/api/v1/torrents/search?q=${encodeURIComponent(query)}&sort=size`;
            const { data } = await axios.get(url, { headers: getRandomHeader(), timeout: TIMEOUT_MS });
            if (!data || !data.results) return [];
            return data.results.map(item => ({
                title: item.name,
                size: formatBytes(item.size),
                sizeBytes: item.size,
                magnet: item.magnet,
                seeders: parseInt(item.seeders || 0),
                source: "BitSearch"
            }));
        } catch (e) { return []; }
    }
};

const SolidTorrents = {
    search: async (query) => {
        if (!query) return [];
        try {
            const url = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(query)}&sort=size`;
            const { data } = await axios.get(url, { headers: getRandomHeader(), timeout: TIMEOUT_MS });
            if (!data || !data.results) return [];
            return data.results.map(item => ({
                title: item.title,
                size: formatBytes(item.size),
                sizeBytes: item.size,
                magnet: item.magnet,
                seeders: parseInt(item.swarm?.seeders || 0),
                source: "SolidTorrents"
            }));
        } catch (e) { return []; }
    }
};

const YTS = {
    search: async (imdbId) => {
        if (!imdbId || !imdbId.startsWith('tt')) return [];
        try {
            const url = `https://yts.mx/api/v2/list_movies.json?query_term=${imdbId}`;
            const { data } = await axios.get(url, { headers: getRandomHeader(), timeout: TIMEOUT_MS });
            if (!data || !data.data || !data.data.movies) return [];
            let results = [];
            data.data.movies.forEach(movie => {
                if (movie.torrents) {
                    movie.torrents.forEach(t => {
                        const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}&tr=udp://open.demonii.com:1337/announce`;
                        results.push({
                            title: `${movie.title} ${t.quality} ${t.type.toUpperCase()} YTS`,
                            size: t.size,
                            sizeBytes: t.size_bytes,
                            magnet: magnet,
                            seeders: t.seeds || 0,
                            source: "YTS"
                        });
                    });
                }
            });
            return results;
        } catch (e) { return []; }
    }
};

/* ===========================================================
   PART 2: ADDON PROXIES (Interroga Torrentio/KC/MF)
   =========================================================== */

const ADDON_PROVIDERS = [
    { name: "Torrentio", url: "https://torrentio.strem.fun", parseType: "torrentio" },
    { name: "KnightCrawler", url: "https://knightcrawler.elfhosted.com", parseType: "torrentio" },
    { name: "MediaFusion", url: "https://mediafusion.elfhosted.com", parseType: "mediafusion" }
];

async function fetchFromAddon(provider, id, type) {
    try {
        const url = `${provider.url}/stream/${type}/${id}.json`;
        const { data } = await axios.get(url, { headers: getRandomHeader(), timeout: TIMEOUT_MS }); 

        if (!data || !data.streams) return [];

        return data.streams.map(stream => {
            let title = "Unknown";
            let size = "Unknown";
            let sizeBytes = 0;
            let seeders = 0;
            // Default: se non troviamo info, usiamo il nome del provider ma pulito
            let source = provider.name === "Torrentio" ? "External" : provider.name;

            // --- PARSING INTELLIGENTE PER ESTRARRE INFO DAI TITOLI ---
            if (provider.parseType === "torrentio") {
                const lines = stream.title.split('\n');
                title = lines[0] || stream.title;
                
                const metaLine = lines.find(l => l.includes('💾'));
                if (metaLine) {
                    const sizeMatch = metaLine.match(/💾\s+(.*?)(?:\s|$)/);
                    if (sizeMatch) size = sizeMatch[1];
                    const seedMatch = metaLine.match(/👤\s+(\d+)/);
                    if (seedMatch) seeders = parseInt(seedMatch[1]);
                    
                    // 🔥 MODIFICA QUI: RIMOZIONE PREFISSI E PULIZIA NOMI 🔥
                    const sourceMatch = metaLine.match(/⚙️\s+(.*)/);
                    if (sourceMatch) {
                        let rawSource = sourceMatch[1];
                        
                        // Rinomina ilCorSaRoNeRo in "Corsaro Nero"
                        if (rawSource.toLowerCase().includes("corsaronero")) {
                            rawSource = "Corsaro Nero";
                        }
                        // Rinomina altri tracker se vuoi
                        else if (rawSource.toLowerCase().includes("1337")) {
                            rawSource = "1337x";
                        }
                        
                        source = rawSource; // Assegna DIRETTAMENTE il nome senza "Tio|"
                    }
                }
            } 
            else if (provider.parseType === "mediafusion") {
                const desc = stream.description || stream.title; 
                const lines = desc.split('\n');
                title = lines[0].replace("📂 ", "").replace("/", "").trim();
                
                const fullText = desc.toLowerCase();
                const hasHiddenIta = fullText.includes("🇮🇹") || fullText.includes("italian") || (fullText.includes("audio") && fullText.includes("ita"));
                if (hasHiddenIta && !title.toLowerCase().includes("ita")) title += " [ITA]";

                const seedLine = lines.find(l => l.includes("👤"));
                if (seedLine) seeders = parseInt(seedLine.split("👤 ")[1]) || 0;

                const sourceLine = lines.find(l => l.includes("🔗"));
                // 🔥 MODIFICA QUI: RIMOSSO "MF|" 🔥
                source = sourceLine ? sourceLine.split("🔗 ")[1] : "MediaFusion";

                if (stream.behaviorHints && stream.behaviorHints.videoSize) {
                    sizeBytes = stream.behaviorHints.videoSize;
                    size = formatBytes(sizeBytes);
                }
            }

            if (sizeBytes === 0 && size !== "Unknown") {
                const num = parseFloat(size);
                if (size.includes("GB")) sizeBytes = num * 1024 * 1024 * 1024;
                else if (size.includes("MB")) sizeBytes = num * 1024 * 1024;
            }

            return {
                title: title,
                size: size,
                sizeBytes: sizeBytes,
                seeders: seeders,
                magnet: stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}` : stream.url,
                source: source
            };
        });

    } catch (e) { return []; }
}

/* ===========================================================
   MAIN FUNCTION (Adattata per addon.js)
   =========================================================== */

// Parametri uniformati a engines.js: query, year, type, fullId
async function searchMagnet(query, year, type, id) {
    let promises = [];
    
    // Per YTS serve solo la parte tt12345
    const baseImdbId = id.includes(':') ? id.split(':')[0] : id;

    // 1. Lancia i Proxy Addon (Usano ID completo per le serie: tt123:1:1)
    ADDON_PROVIDERS.forEach(p => {
        promises.push(fetchFromAddon(p, id, type));
    });

    // 2. Lancia gli Scraper Testuali (Se c'è una query)
    if (query) {
        promises.push(BitSearch.search(query));
        promises.push(SolidTorrents.search(query));
    }

    // 3. Lancia YTS (Solo film)
    if (type === 'movie' && baseImdbId) {
        promises.push(YTS.search(baseImdbId));
    }

    // Attendi tutti i risultati (Settled per non bloccare se uno fallisce)
    const results = await Promise.allSettled(promises);
    
    let allMagnets = [];
    results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            allMagnets.push(...res.value);
        }
    });

    // --- STEALTH DELAY (Evita blocchi IP) ---
    const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1) + MIN_DELAY);
    await wait(randomDelay);

    // --- STEALTH MARKERS ---
    return allMagnets.map(item => ({
        ...item,
        _brain_id: generateFakeHash(), 
        _stealth: true 
    }));
}

module.exports = { searchMagnet };
