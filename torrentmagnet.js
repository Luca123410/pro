const axios = require("axios");
const cheerio = require("cheerio"); // <-- npm i cheerio

// --- CONFIGURAZIONE URL ---
const API_URL = "https://apibay.org/q.php";
const BASE_1337X = "https://1337x.st"; 
const BASE_RARBG = "https://rargb.to"; 
const BASE_BITSEARCH = "https://bitsearch.to";
const BASE_LIME = "https://www.limetorrents.lol";

// Tracker list per "revitalizzare" magnet morti
const TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.tracker.cl:1337/announce",
    "udp://tracker.openbittorrent.com:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.moeking.me:6969/announce",
    "udp://ipv4.tracker.harry.lu:80/announce"
];

// Headers realistici per evitare blocchi (Cloudflare è severo su Lime/BitSearch)
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': 'https://www.google.com/'
};

// --- HELPER CONDIVISI ---
function cleanTitleForSearch(title) {
    return title.replace(/[:"'’]/g, "").replace(/[^a-zA-Z0-9\s\-.\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function isItalianResult(name) {
    const nameUpper = name.toUpperCase();
    return /ITA|ITALIAN|ITALIANO|MULTI|DUAL|MD|SUB.?ITA|FORCED|AC3.ITA|DTS.ITA|CiNEFiLE|NovaRip|MeM|robbyrs|iDN_CreW/i.test(nameUpper);
}

function checkYear(name, year) {
    if (!year) return true;
    const y = parseInt(year);
    // Accetta anno esatto, precedente o successivo (per release ritardate)
    return [y - 1, y, y + 1].some(ay => name.includes(ay.toString()));
}

function bytesToSize(bytes) {
    return (bytes / 1073741824).toFixed(2) + " GB";
}

// ==========================================
// 1. THE PIRATE BAY (API)
// ==========================================
async function searchTPB(title, year) {
    try {
        const cleanTitle = cleanTitleForSearch(title);
        let baseQuery = cleanTitle;
        if (year) baseQuery += ` ${year}`;

        const queries = [baseQuery, `${baseQuery} ITA`]; // Teniamo poche query per velocità

        const requests = queries.map(q => axios.get(API_URL, { params: { q, cat: 200 }, timeout: 10000 }).catch(() => ({ data: [] })));
        const responses = await Promise.all(requests);
        const results = [];

        for (const res of responses) {
            const data = res.data;
            if (!Array.isArray(data) || data[0]?.name === "No results returned") continue;

            for (const item of data) {
                if (item.info_hash === "0000000000000000000000000000000000000000") continue;
                if (!isItalianResult(item.name) || !checkYear(item.name, year)) continue;

                const hash = item.info_hash.toUpperCase();
                let magnet = `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(item.name)}`;
                TRACKERS.forEach(tr => magnet += `&tr=${encodeURIComponent(tr)}`);

                results.push({
                    title: item.name,
                    magnet,
                    size: bytesToSize(item.size),
                    sizeBytes: parseInt(item.size),
                    seeders: parseInt(item.seeders || "0"),
                    source: "TPB"
                });
            }
        }
        return results;
    } catch (e) { return []; }
}

// ==========================================
// 2. 1337X
// ==========================================
async function search1337x(title, year) {
    try {
        const q = `${cleanTitleForSearch(title)} ITA`;
        // Cerca nella categoria Movies (1)
        const url = `${BASE_1337X}/category-search/${encodeURIComponent(q)}/Movies/1/`;
        
        const { data } = await axios.get(url, { timeout: 15000, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        if (!data) return [];

        const $ = cheerio.load(data);
        const candidates = [];

        $("table.table-list tbody tr").each((i, row) => {
            if (i > 10) return; // Limitiamo il parsing ai primi 10
            const tds = $(row).find("td");
            const nameLink = tds.eq(0).find("a").eq(1);
            const name = nameLink.text().trim();
            const link = nameLink.attr("href");
            
            if (!isItalianResult(name) || !checkYear(name, year)) return;

            const seeders = parseInt(tds.eq(1).text().replace(/,/g, "")) || 0;
            const sizeText = tds.eq(4).text(); 
            // Parsing size approssimativo per sorting, non critico qui
            
            candidates.push({ name, link: BASE_1337X + link, seeders });
        });

        // Fetch dettagli per magnet
        const magnetPromises = candidates.map(async (cand) => {
            try {
                const { data } = await axios.get(cand.link, { timeout: 8000, headers: COMMON_HEADERS });
                const $ = cheerio.load(data);
                const magnet = $("a[href^='magnet:?']").first().attr("href");
                if (!magnet) return null;

                const hashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/i);
                const hash = hashMatch ? hashMatch[1].toUpperCase() : null;

                return {
                    title: cand.name,
                    magnet,
                    seeders: cand.seeders,
                    sizeBytes: 0, // 1337x parsing size è noioso, lo lasciamo a 0 per ora
                    source: "1337x",
                    hash
                };
            } catch (e) { return null; }
        });

        return (await Promise.all(magnetPromises)).filter(Boolean);
    } catch (e) { return []; }
}

// ==========================================
// 3. RARBG
// ==========================================
async function searchRARBG(title, year) {
    // RARBG è molto sensibile, facciamo una sola chiamata specifica
    const q = `${cleanTitleForSearch(title)}`;
    const url = `${BASE_RARBG}/search/?search=${encodeURIComponent(q)}`;
    
    try {
        const { data } = await axios.get(url, { timeout: 15000, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        if (!data) return [];
        const $ = cheerio.load(data);
        
        const candidates = [];
        $("table.lista2t tr.lista2").each((i, row) => {
            const tds = $(row).find("td");
            const nameLink = tds.eq(1).find("a").first();
            const name = nameLink.text().trim();
            const link = nameLink.attr("href");
            const seeders = parseInt(tds.eq(4).text()) || 0;

            if (isItalianResult(name) && checkYear(name, year)) {
                candidates.push({ name, link: BASE_RARBG + link, seeders });
            }
        });

        // Limitiamo a 5 richieste dettaglio per non essere bannati
        const magnetPromises = candidates.slice(0, 5).map(async (cand) => {
            try {
                await new Promise(r => setTimeout(r, Math.random() * 1000)); // throttle
                const { data } = await axios.get(cand.link, { timeout: 8000, headers: COMMON_HEADERS });
                const $ = cheerio.load(data);
                const magnet = $("a[href^='magnet:?']").first().attr("href");
                return magnet ? {
                    title: cand.name,
                    magnet,
                    seeders: cand.seeders,
                    sizeBytes: 0,
                    source: "RARBG"
                } : null;
            } catch (e) { return null; }
        });

        return (await Promise.all(magnetPromises)).filter(Boolean);
    } catch (e) { return []; }
}

// ==========================================
// 4. BITSEARCH (NUOVO)
// ==========================================
async function searchBitSearch(title, year) {
    try {
        // BitSearch supporta operatori logici semplici.
        const q = `${cleanTitleForSearch(title)} ITA`;
        const url = `${BASE_BITSEARCH}/search?q=${encodeURIComponent(q)}`;

        const { data } = await axios.get(url, { timeout: 15000, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        if (!data) return [];

        const $ = cheerio.load(data);
        const results = [];

        $("li.search-result").each((i, el) => {
            const row = $(el);
            const name = row.find("h5 a").text().trim();
            
            if (!name || !isItalianResult(name) || !checkYear(name, year)) return;

            // BitSearch ha spesso il magnet direttamente nei link
            const magnet = row.find("a.dl-magnet").attr("href");
            if (!magnet) return; // Se non c'è, saltiamo per velocità (evitiamo il view page)

            const seedersText = row.find(".stats div").first().text(); 
            const seeders = parseInt(seedersText.replace(/,/g, "")) || 0;

            const sizeText = row.find(".stats div").eq(1).text();
            
            // Parsing size Bitsearch (es: 2.3 GB)
            let sizeBytes = 0;
            const sizeMatch = sizeText.match(/([\d.]+)\s*(GB|MB)/i);
            if (sizeMatch) {
                const num = parseFloat(sizeMatch[1]);
                sizeBytes = sizeMatch[2] === "GB" ? num * 1073741824 : num * 1048576;
            }

            results.push({
                title: name,
                magnet,
                seeders,
                sizeBytes,
                size: bytesToSize(sizeBytes),
                source: "BitSearch"
            });
        });

        return results;
    } catch (e) { return []; }
}

// ==========================================
// 5. LIMETORRENTS (NUOVO)
// ==========================================
async function searchLimeTorrents(title, year) {
    try {
        const q = `${cleanTitleForSearch(title)} ITA`;
        // Lime usa /search/all/QUERY/
        const url = `${BASE_LIME}/search/all/${encodeURIComponent(q)}/`;

        const { data } = await axios.get(url, { timeout: 15000, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        if (!data) return [];

        const $ = cheerio.load(data);
        const candidates = [];

        $("table.table2 tbody tr").each((i, row) => {
            // Lime spesso ha una prima riga di header o pubblicità
            const tds = $(row).find("td");
            if (tds.length < 4) return;

            const nameLink = tds.eq(0).find("div.tt-name a").eq(1); // Spesso il primo link è un anchor vuoto
            const name = nameLink.text().trim();
            const link = nameLink.attr("href"); // Relativo

            if (!name || !link) return;
            if (!isItalianResult(name) || !checkYear(name, year)) return;

            const seeders = parseInt(tds.eq(3).text().replace(/,/g, "")) || 0;
            const sizeText = tds.eq(2).text();

            // Calcolo Size
            let sizeBytes = 0;
            const sizeMatch = sizeText.match(/([\d.]+)\s*(GB|MB)/i);
            if (sizeMatch) {
                const num = parseFloat(sizeMatch[1]);
                sizeBytes = sizeMatch[2] === "GB" ? num * 1073741824 : num * 1048576;
            }

            candidates.push({ name, link: BASE_LIME + link, seeders, sizeBytes });
        });

        // Lime richiede di entrare nella pagina per il magnet
        // Limitiamo a 8 candidati per performance
        const magnetPromises = candidates.slice(0, 8).map(async (cand) => {
            try {
                const { data } = await axios.get(cand.link, { timeout: 8000, headers: COMMON_HEADERS });
                const $ = cheerio.load(data);
                
                // Cerca link magnet
                const magnet = $("a[href^='magnet:?']").first().attr("href");
                if (!magnet) return null;

                // Aggiungiamo i tracker personalizzati se mancano
                let fullMagnet = magnet;
                if (!fullMagnet.includes("tracker.opentrackr.org")) {
                     TRACKERS.forEach(tr => fullMagnet += `&tr=${encodeURIComponent(tr)}`);
                }

                return {
                    title: cand.name,
                    magnet: fullMagnet,
                    seeders: cand.seeders,
                    sizeBytes: cand.sizeBytes,
                    size: bytesToSize(cand.sizeBytes),
                    source: "Lime"
                };
            } catch (e) { return null; }
        });

        return (await Promise.all(magnetPromises)).filter(Boolean);
    } catch (e) { return []; }
}

// ==========================================
// MAIN AGGREGATOR
// ==========================================
async function searchMagnet(title, year) {
    console.log(`\n--- SEARCHING: ${title} [${year || "ALL"}] ---`);
    console.log(`Sources: TPB, 1337x, RARBG, BitSearch, LimeTorrents...`);

    // Eseguiamo tutte le ricerche in parallelo
    const resultsArrays = await Promise.all([
        searchTPB(title, year),
        search1337x(title, year),
        searchRARBG(title, year),
        searchBitSearch(title, year),
        searchLimeTorrents(title, year)
    ]);

    // Flatten array
    const allResults = resultsArrays.flat();

    console.log(`Found ${allResults.length} total raw results.`);

    // De-duplicazione basata sull'Hash (se presente nel magnet)
    const finalMap = new Map();

    allResults.forEach(r => {
        let hash = r.hash;
        if (!hash) {
            const match = r.magnet.match(/btih:([A-F0-9]{40})/i);
            if (match) hash = match[1].toUpperCase();
        }

        if (!hash) return; // Se non riusciamo a estrarre l'hash, scartiamo (raro)

        if (finalMap.has(hash)) {
            const existing = finalMap.get(hash);
            // Aggiorna seeders se il nuovo è maggiore
            if (r.seeders > existing.seeders) existing.seeders = r.seeders;
            // Unisci le label delle sorgenti
            if (!existing.source.includes(r.source)) existing.source += `+${r.source}`;
        } else {
            finalMap.set(hash, r);
        }
    });

    // Ordinamento: Seeders decrescenti -> Size decrescente
    const sortedResults = Array.from(finalMap.values())
        .sort((a, b) => b.seeders - a.seeders || b.sizeBytes - a.sizeBytes)
        .slice(0, 15); // Restituisci i migliori 15

    console.log(`\n--- TOP ${sortedResults.length} RESULTS ---`);
    sortedResults.forEach((r, i) => {
        console.log(`${i+1}. [${r.source}] S:${r.seeders} | ${r.size || '?'} | ${r.title.substring(0, 50)}...`);
    });

    return sortedResults;
}

module.exports = { searchMagnet };
