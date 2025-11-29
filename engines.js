const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");

// --- CONFIGURAZIONE GLOBALE ---
const TIMEOUT = 12000; // Tempo massimo per richiesta

// Tracker list per rivitalizzare i magnet
const TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.tracker.cl:1337/announce",
    "udp://tracker.openbittorrent.com:80/announce",
    "udp://tracker.torrent.eu.org:451/announce",
    "udp://tracker.moeking.me:6969/announce",
    "udp://ipv4.tracker.harry.lu:80/announce",
    "udp://9.rarbg.me:2970/announce"
];

// Agent HTTPS permissivo (per siti con certificati strani come Corsaro/Knaben)
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

// Headers realistici per evitare blocchi (Cloudflare)
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com/'
};

// --- HELPER CONDIVISI ---

function clean(title) {
    return title.replace(/[:"'’]/g, "").replace(/[^a-zA-Z0-9\s\-.\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

// 🔥 FILTRO RIGOROSO PER "SOLO ITA" (Applicato a tutti i motori internazionali)
function isItalianResult(name) {
    const nameUpper = name.toUpperCase();
    const regex = /\b(ITA|ITALIAN|ITALIANO|MULTI|DUAL|MD|SUB.?ITA|FORCED|AC3.?ITA|DTS.?ITA|CiNEFiLE|NovaRip|MeM|robbyrs|iDN_CreW)\b/i;
    return regex.test(nameUpper);
}

function checkYear(name, year) {
    if (!year) return true;
    const y = parseInt(year);
    return [y - 1, y, y + 1].some(ay => name.includes(ay.toString()));
}

function parseSize(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.toString().match(/([\d.,]+)\s*(TB|GB|MB|KB|B)/i);
    if (!match) return 0;
    let val = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toUpperCase();
    if (unit.includes('T')) val *= 1024**4;
    else if (unit.includes('G')) val *= 1024**3;
    else if (unit.includes('M')) val *= 1024**2;
    else if (unit.includes('K')) val *= 1024;
    return Math.round(val);
}

function bytesToSize(bytes) {
    return (bytes / 1073741824).toFixed(2) + " GB";
}

// ==========================================
// GRUPPO 1: MOTORI SPECIALIZZATI (Corsaro, Knaben, UIndex, Nyaa)
// ==========================================

async function searchCorsaro(title) {
    try {
        const url = `https://ilcorsaronero.link/search?q=${encodeURIComponent(clean(title))}`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: TIMEOUT });
        if (data.includes("Cloudflare")) return [];

        const $ = cheerio.load(data);
        let items = [];
        
        $('a').each((i, elem) => {
            if (items.length >= 30) return;
            const href = $(elem).attr('href');
            const text = $(elem).text().trim();
            if (href && (href.includes('/torrent/') || href.includes('details.php')) && text.length > 5) {
                let fullUrl = href.startsWith('http') ? href : `https://ilcorsaronero.link${href.startsWith('/') ? '' : '/'}${href}`;
                if (!items.some(p => p.url === fullUrl)) items.push({ url: fullUrl, title: text });
            }
        });

        const promises = items.map(async (item) => {
            try {
                const detailPage = await axios.get(item.url, { headers: COMMON_HEADERS, httpsAgent, timeout: 8000 });
                const magnetMatch = detailPage.data.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{40})/i);
                if (!magnetMatch) return null;
                const sizeMatch = detailPage.data.match(/(\d+(\.\d+)?)\s?(GB|MB|KB)/i);
                return {
                    title: item.title,
                    magnet: `magnet:?xt=urn:btih:${magnetMatch[1]}&dn=${encodeURIComponent(item.title)}`,
                    size: sizeMatch ? sizeMatch[0] : "??",
                    sizeBytes: parseSize(sizeMatch ? sizeMatch[0] : "0"),
                    source: "Corsaro"
                };
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

async function searchKnaben(title, year) {
    try {
        const url = `https://knaben.org/search/${encodeURIComponent(clean(title))}/0/1/seeders`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: 5000 });
        const $ = cheerio.load(data);
        const results = [];
        $('table.table tbody tr').each((_, row) => {
            const tds = $(row).find('td');
            if (tds.length < 5) return;
            const name = tds.eq(1).find('a[title]').text().trim();
            const magnet = $(row).find('a[href^="magnet:"]').attr('href');
            const sizeStr = tds.eq(2).text().trim();
            const seeders = parseInt(tds.eq(4).text().trim()) || 0;
            if (name && magnet && isItalianResult(name) && checkYear(name, year)) {
                results.push({ title: name, magnet, size: sizeStr, sizeBytes: parseSize(sizeStr), seeders, source: "Knaben" });
            }
        });
        return results;
    } catch { return []; }
}

async function searchUindex(title, year) {
    try {
        const url = `https://uindex.org/search.php?search=${encodeURIComponent(clean(title) + " ITA")}&c=0`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: TIMEOUT, validateStatus: s => s < 500 });
        if (!data || typeof data !== 'string') return [];
        const rows = data.split(/<tr[^>]*>/gi).filter(row => row.includes('magnet:?xt=urn:btih:') && row.includes('<td'));
        let results = [];
        for (const row of rows) {
            try {
                const magnet = row.match(/href=["'](magnet:\?xt=urn:btih:[^"']+)["']/i)?.[1].replace(/&amp;/g, '&');
                if (!magnet) continue;
                const cells = [];
                let m; const regex = /<td[^>]*>(.*?)<\/td>/gis;
                while ((m = regex.exec(row)) !== null) cells.push(m[1].trim());
                if (cells.length < 3) continue;
                const name = cells[1].match(/>([^<]+)<\/a>/)?.[1].trim();
                if (name && isItalianResult(name) && checkYear(name, year)) {
                     const sizeStr = cells[2].match(/([\d.,]+\s*(?:B|KB|MB|GB|TB))/i)?.[1].trim() || "??";
                     const seeders = parseInt(cells[4]?.match(/(\d+)/)?.[1] || "0");
                     results.push({ title: name, magnet, size: sizeStr, sizeBytes: parseSize(sizeStr), seeders, source: "UIndex" });
                }
            } catch {}
        }
        return results;
    } catch { return []; }
}

async function searchNyaa(title) {
    try {
        let q = clean(title);
        if (!q.toLowerCase().includes("ita")) q += " ita";
        const url = `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(q)}&s=seeders&o=desc`;
        const { data } = await axios.get(url, { timeout: 5000 });
        const $ = cheerio.load(data);
        const results = [];
        $("tr.default, tr.success, tr.danger").each((i, el) => {
            const tds = $(el).find("td");
            if (tds.length < 8) return;
            const title = $(tds.eq(1)).find("a:not(.comments)").last().text().trim();
            const magnet = $(tds.eq(2)).find('a[href^="magnet:"]').attr("href");
            const size = $(tds.eq(3)).text().trim();
            const seeders = parseInt($(tds.eq(5)).text().trim(), 10);
            if (title && magnet && seeders > 0) {
                results.push({ title, magnet, size, sizeBytes: parseSize(size), seeders, source: "Nyaa" });
            }
        });
        return results;
    } catch { return []; }
}

// ==========================================
// GRUPPO 2: MOTORI INTERNAZIONALI (da TorrentMagnet)
// ==========================================

async function searchTPB(title, year) {
    try {
        // Cerca SOLO "Titolo ITA" per filtrare alla fonte
        const q = `${clean(title)} ${year || ""} ITA`;
        const { data } = await axios.get("https://apibay.org/q.php", { params: { q, cat: 200 }, timeout: TIMEOUT }).catch(() => ({ data: [] }));
        if (!Array.isArray(data) || data[0]?.name === "No results returned") return [];
        
        return data.filter(i => i.info_hash !== "0000000000000000000000000000000000000000" && isItalianResult(i.name) && checkYear(i.name, year))
            .map(i => ({
                title: i.name,
                magnet: `magnet:?xt=urn:btih:${i.info_hash}&dn=${encodeURIComponent(i.name)}`,
                size: bytesToSize(i.size),
                sizeBytes: parseInt(i.size),
                seeders: parseInt(i.seeders),
                source: "TPB"
            }));
    } catch { return []; }
}

async function search1337x(title, year) {
    try {
        const url = `https://1337x.st/category-search/${encodeURIComponent(clean(title) + " ITA")}/Movies/1/`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        const $ = cheerio.load(data || "");
        const candidates = [];
        $("table.table-list tbody tr").slice(0, 8).each((i, row) => {
            const name = $(row).find("td").eq(0).find("a").eq(1).text().trim();
            const link = $(row).find("td").eq(0).find("a").eq(1).attr("href");
            const seeders = parseInt($(row).find("td").eq(1).text().replace(/,/g, "")) || 0;
            if (isItalianResult(name) && checkYear(name, year)) candidates.push({ name, link: `https://1337x.st${link}`, seeders });
        });

        const promises = candidates.map(async (cand) => {
            try {
                const { data } = await axios.get(cand.link, { timeout: 6000, headers: COMMON_HEADERS });
                const magnet = cheerio.load(data)("a[href^='magnet:?']").first().attr("href");
                return magnet ? { title: cand.name, magnet, seeders: cand.seeders, size: "?", sizeBytes: 0, source: "1337x" } : null;
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

async function searchRARBG(title, year) {
    try {
        const url = `https://rargb.to/search/?search=${encodeURIComponent(clean(title) + " ITA")}`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        const $ = cheerio.load(data || "");
        const candidates = [];
        $("table.lista2t tr.lista2").each((i, row) => {
            const tds = $(row).find("td");
            const name = tds.eq(1).find("a").first().text().trim();
            const link = tds.eq(1).find("a").first().attr("href");
            const seeders = parseInt(tds.eq(4).text()) || 0;
            if (isItalianResult(name) && checkYear(name, year)) candidates.push({ name, link: `https://rargb.to${link}`, seeders });
        });

        const promises = candidates.slice(0, 5).map(async (cand) => {
            try {
                await new Promise(r => setTimeout(r, Math.random() * 800)); // Throttle
                const { data } = await axios.get(cand.link, { timeout: 6000, headers: COMMON_HEADERS });
                const magnet = cheerio.load(data)("a[href^='magnet:?']").first().attr("href");
                return magnet ? { title: cand.name, magnet, seeders: cand.seeders, size: "?", sizeBytes: 0, source: "RARBG" } : null;
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

async function searchBitSearch(title, year) {
    try {
        const url = `https://bitsearch.to/search?q=${encodeURIComponent(clean(title) + " ITA")}`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        const $ = cheerio.load(data || "");
        const results = [];
        $("li.search-result").each((i, el) => {
            const name = $(el).find("h5 a").text().trim();
            const magnet = $(el).find("a.dl-magnet").attr("href");
            const seeders = parseInt($(el).find(".stats div").first().text().replace(/,/g, "")) || 0;
            const sizeStr = $(el).find(".stats div").eq(1).text();
            if (name && magnet && isItalianResult(name) && checkYear(name, year)) {
                results.push({ title: name, magnet, seeders, size: sizeStr, sizeBytes: parseSize(sizeStr), source: "BitSearch" });
            }
        });
        return results;
    } catch { return []; }
}

async function searchLime(title, year) {
    try {
        const url = `https://www.limetorrents.lol/search/all/${encodeURIComponent(clean(title) + " ITA")}/`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS }).catch(() => ({ data: "" }));
        const $ = cheerio.load(data || "");
        const candidates = [];
        $("table.table2 tbody tr").each((i, row) => {
            const tds = $(row).find("td");
            if (tds.length < 4) return;
            const nameLink = tds.eq(0).find("div.tt-name a").eq(1);
            const name = nameLink.text().trim();
            const link = nameLink.attr("href");
            const seeders = parseInt(tds.eq(3).text().replace(/,/g, "")) || 0;
            const sizeStr = tds.eq(2).text();
            if (name && link && isItalianResult(name) && checkYear(name, year)) {
                 candidates.push({ name, link: `https://www.limetorrents.lol${link}`, seeders, sizeStr });
            }
        });

        const promises = candidates.slice(0, 6).map(async (cand) => {
            try {
                const { data } = await axios.get(cand.link, { timeout: 6000, headers: COMMON_HEADERS });
                const magnet = cheerio.load(data)("a[href^='magnet:?']").first().attr("href");
                return magnet ? { title: cand.name, magnet, seeders: cand.seeders, size: cand.sizeStr, sizeBytes: parseSize(cand.sizeStr), source: "Lime" } : null;
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

// ==========================================
// MAIN AGGREGATOR
// ==========================================
async function searchMagnet(title, year, type, imdbId) {
    console.log(`\n🚀 [MEGA ENGINE] Ricerca Globale: "${title}" [${year || "N/A"}]`);
    
    const promises = [
        searchCorsaro(title),       // ITA Locale
        searchKnaben(title, year),  // ITA/Multi Fast
        searchUindex(title, year),  // ITA/Multi Advanced
        searchNyaa(title),          // Anime ITA
        searchTPB(title, year),     // International (Strict ITA)
        search1337x(title, year),   // International (Strict ITA)
        searchRARBG(title, year),   // International (Strict ITA)
        searchBitSearch(title, year),// International (Strict ITA)
        searchLime(title, year)     // International (Strict ITA)
    ];

    // Eseguiamo tutto con allSettled per non bloccarci se un sito è down
    const resultsArrays = await Promise.allSettled(promises);
    
    // Uniamo tutto
    const allResults = resultsArrays
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .flat();

    // Aggiungi tracker se mancano
    allResults.forEach(r => {
        if (r.magnet && !r.magnet.includes("tr=")) {
            TRACKERS.forEach(tr => r.magnet += `&tr=${encodeURIComponent(tr)}`);
        }
    });

    console.log(`✅ [MEGA ENGINE] Totale risultati: ${allResults.length}`);
    return allResults;
}

module.exports = { searchMagnet };
