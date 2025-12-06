const axios = require("axios");
const crypto = require("crypto"); 

// --- CONFIGURAZIONE STEALTH ---
const TIMEOUT_MS = 6000; 
const MIN_DELAY = 400;   
const MAX_DELAY = 1200;  

// --- POOL DI USER AGENTS ---
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
];

// --- UTILITIES ---
function getRandomHeader() {
    const agent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    return {
        'User-Agent': agent,
        'Accept': 'application/json, text/plain, */*',
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

// 🔥 FILTRO STRICT ITA (Lo stesso di engines.js) 🔥
function isStrictItalian(title) {
    if (!title) return false;
    const t = title.toUpperCase();
    
    // 1. BLOCCO IMMEDIATO INGLESE ESPLICITO
    if (/\b(ENG|ENGLISH|GB)\b/.test(t) && !/\b(ITA|MULTI|DUAL|IT)\b/.test(t)) {
        return false;
    }

    // 2. LISTA POSITIVA (Deve esserci almeno uno)
    const itaRegex = /\b(ITA|ITALIAN|ITALIANO|MULTI|DUAL|MD|SUB.?ITA|SUBITA|SUB-ITA|AUDIO.?ITA|ITA.?AC3|ITA.?HD|BDMUX|DVDRIP.?ITA|CORSARO|COLOMBO|PEPPEN1202|DNA)\b/;
    
    if (t.includes("🇮🇹")) return true;
    return itaRegex.test(t);
}

/* ===========================================================
   PART 1: STEALTH SCRAPERS (API Pubbliche)
   =========================================================== */

const BitSearch = {
    search: async (query) => {
        if (!query) return [];
        try {
            // Aggiungiamo "ITA" alla query per aiutare il motore
            const q = `${query} ITA`; 
            const url = `https://bitsearch.to/api/v1/torrents/search?q=${encodeURIComponent(q)}&sort=size`;
            const { data } = await axios.get(url, { headers: getRandomHeader(), timeout: TIMEOUT_MS });
            if (!data || !data.results) return [];
            
            return data.results
                .filter(item => isStrictItalian(item.name)) // Filtro Strict
                .map(item => ({
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
            const q = `${query} ITA`;
            const url = `https://solidtorrents.to/api/v1/search?q=${encodeURIComponent(q)}&sort=size`;
            const { data } = await axios.get(url, { headers: getRandomHeader(), timeout: TIMEOUT_MS });
            if (!data || !data.results) return [];
            
            return data.results
                .filter(item => isStrictItalian(item.title)) // Filtro Strict
                .map(item => ({
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

// NOTA: YTS RIMOSSO PERCHÉ SOLO ENG

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

        // Filtriamo e Mappiamo in un colpo solo
        let cleanStreams = [];

        for (const stream of data.streams) {
            let title = "Unknown";
            let size = "Unknown";
            let sizeBytes = 0;
            let seeders = 0;
            let source = provider.name === "Torrentio" ? "External" : provider.name;

            // --- PARSING ---
            if (provider.parseType === "torrentio") {
                const lines = stream.title.split('\n');
                title = lines[0] || stream.title;
                
                // 🔥 FILTRO STRICT IMMEDIATO 🔥
                // Se il titolo originale contiene GB ENG o non ha traccia di ITA, lo saltiamo subito.
                if (!isStrictItalian(stream.title) && !isStrictItalian(title)) continue;

                const metaLine = lines.find(l => l.includes('💾'));
                if (metaLine) {
                    const sizeMatch = metaLine.match(/💾\s+(.*?)(?:\s|$)/);
                    if (sizeMatch) size = sizeMatch[1];
                    const seedMatch = metaLine.match(/👤\s+(\d+)/);
                    if (seedMatch) seeders = parseInt(seedMatch[1]);
                    
                    const sourceMatch = metaLine.match(/⚙️\s+(.*)/);
                    if (sourceMatch) {
                        let rawSource = sourceMatch[1];
                        if (rawSource.toLowerCase().includes("corsaronero")) rawSource = "Corsaro Nero";
                        else if (rawSource.toLowerCase().includes("1337")) rawSource = "1337x";
                        source = rawSource; 
                    }
                }
            } 
            else if (provider.parseType === "mediafusion") {
                const desc = stream.description || stream.title; 
                
                // Check ITA su tutto il blocco descrizione per sicurezza
                if (!isStrictItalian(desc)) continue;

                const lines = desc.split('\n');
                title = lines[0].replace("📂 ", "").replace("/", "").trim();
                
                const seedLine = lines.find(l => l.includes("👤"));
                if (seedLine) seeders = parseInt(seedLine.split("👤 ")[1]) || 0;

                const sourceLine = lines.find(l => l.includes("🔗"));
                source = sourceLine ? sourceLine.split("🔗 ")[1] : "MediaFusion";

                if (stream.behaviorHints && stream.behaviorHints.videoSize) {
                    sizeBytes = stream.behaviorHints.videoSize;
                    size = formatBytes(sizeBytes);
                }
            }

            // Normalizzazione Size
            if (sizeBytes === 0 && size !== "Unknown") {
                const num = parseFloat(size);
                if (size.includes("GB")) sizeBytes = num * 1024 * 1024 * 1024;
                else if (size.includes("MB")) sizeBytes = num * 1024 * 1024;
            }

            cleanStreams.push({
                title: title,
                size: size,
                sizeBytes: sizeBytes,
                seeders: seeders,
                magnet: stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}` : stream.url,
                source: source
            });
        }

        return cleanStreams;

    } catch (e) { return []; }
}

/* ===========================================================
   MAIN FUNCTION 
   =========================================================== */

async function searchMagnet(query, year, type, id) {
    let promises = [];
    
    // 1. Lancia i Proxy Addon
    ADDON_PROVIDERS.forEach(p => {
        promises.push(fetchFromAddon(p, id, type));
    });

    // 2. Lancia gli Scraper Testuali (Se query presente)
    if (query) {
        promises.push(BitSearch.search(query));
        promises.push(SolidTorrents.search(query));
    }

    // NIENTE YTS (Solo ENG)

    const results = await Promise.allSettled(promises);
    
    let allMagnets = [];
    results.forEach(res => {
        if (res.status === 'fulfilled' && Array.isArray(res.value)) {
            allMagnets.push(...res.value);
        }
    });

    const randomDelay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1) + MIN_DELAY);
    await wait(randomDelay);

    return allMagnets.map(item => ({
        ...item,
        _brain_id: generateFakeHash(), 
        _stealth: true 
    }));
}

module.exports = { searchMagnet };
