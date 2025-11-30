const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");

// --- CONFIGURAZIONE GLOBALE ULTERIORMENTE OTTIMIZZATA ---
const TIMEOUT = 5500; // Ridotto a 5.5s: Fast fail
const TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.coppersurfer.tk:6969/announce",
    "udp://tracker.leechers-paradise.org:6969/announce",
    "udp://p4p.arenabg.com:1337/announce",
    "udp://tracker.internetwarriors.net:1337/announce"
];
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
const COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com/'
};

// --- HELPER (NON MODIFICATO) ---
function clean(title) {
    return title.replace(/[:"'’]/g, "").replace(/[^a-zA-Z0-9\s\-.\[\]]/g, " ").replace(/\s+/g, " ").trim();
}

function isItalianResult(name) {
    const nameUpper = name.toUpperCase();
    if (/\b(ENG|ENGLISH)\b/i.test(nameUpper) && !/\b(ITA|MULTI|DUAL)\b/i.test(nameUpper)) return false;
    const regex = /\b(ITA|ITALIAN|ITALIANO|MULTI|DUAL|MD|SUB.?ITA|SUBITA|SUB-ITA|ITALUB|FORCED|AC3.?ITA|DTS.?ITA|AUDIO.?ITA|ITA.?AC3|ITA.?HD|BDMUX|DVDRIP.?ITA|CiNEFiLE|NovaRip|MeM|robbyrs|iDN_CreW)\b/i;
    return regex.test(nameUpper);
}

function checkYear(name, year) {
    if (!year) return true;
    const y = parseInt(year);
    return [y - 1, y, y + 1].some(ay => name.includes(ay.toString()));
}

function isCorrectFormat(name, type, title) {
    if (type !== 'tv') return true;
    const upperName = name.toUpperCase();
    const upperTitle = title.toUpperCase();
    const seasonRegex = /S(\d{1,2})/g;
    const episodeRegex = /E(\d{1,2})/g;
    const seasons = upperTitle.match(seasonRegex) || [];
    const episodes = upperTitle.match(episodeRegex) || [];
    if (seasons.length > 0 && !seasons.some(s => upperName.includes(s))) return false;
    if (episodes.length > 0 && !episodes.some(e => upperName.includes(e))) return false;
    return true;
}

function parseSize(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.toString().match(/([\d.,]+)\s*(TB|GB|MB|KB|B)/i);
    if (!match) return 0;
    let val = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toUpperCase();
    if (unit.includes('T')) val *= 1024 ** 4;
    else if (unit.includes('G')) val *= 1024 ** 3;
    else if (unit.includes('M')) val *= 1024 ** 2;
    else if (unit.includes('K')) val *= 1024;
    return Math.round(val);
}

function bytesToSize(bytes) {
    return (bytes / 1073741824).toFixed(2) + " GB";
}

// --- MOTORI DI RICERCA AGGIORNATI (Timeout di dettaglio ridotto a 3000ms) ---

async function searchCorsaro(title, year, type) {
    try {
        const url = `https://ilcorsaronero.link/search?q=${encodeURIComponent(clean(title))}`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: TIMEOUT });
        if (data.includes("Cloudflare")) return [];
        const $ = cheerio.load(data);
        let items = [];
        $('a').each((i, elem) => {
            if (items.length >= 20) return;
            const href = $(elem).attr('href');
            const text = $(elem).text().trim();
            if (!isItalianResult(text) || !checkYear(text, year) || !isCorrectFormat(text, type, title)) return;
            if (href && (href.includes('/torrent/') || href.includes('details.php')) && text.length > 5) {
                let fullUrl = href.startsWith('http') ? href : `https://ilcorsaronero.link${href.startsWith('/') ? '' : '/'}${href}`;
                if (!items.some(p => p.url === fullUrl)) items.push({ url: fullUrl, title: text });
            }
        });
        const promises = items.map(async (item) => {
            try {
                const detailPage = await axios.get(item.url, { headers: COMMON_HEADERS, httpsAgent, timeout: 3000 }); // Ultra fast detail
                const magnetMatch = detailPage.data.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]{40})/i);
                if (!magnetMatch) return null;
                const sizeMatch = detailPage.data.match(/(\d+(\.\d+)?)\s?(GB|MB|KB)/i);
                const seedersMatch = detailPage.data.match(/Seeders:\s*(\d+)/i);
                return {
                    title: item.title,
                    magnet: `magnet:?xt=urn:btih:${magnetMatch[1]}&dn=${encodeURIComponent(item.title)}`,
                    size: sizeMatch ? sizeMatch[0] : "??",
                    sizeBytes: parseSize(sizeMatch ? sizeMatch[0] : "0"),
                    seeders: seedersMatch ? parseInt(seedersMatch[1]) : 0,
                    source: "Corsaro"
                };
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

async function searchKnaben(title, year, type) {
    try {
        const url = `https://knaben.org/search/${encodeURIComponent(clean(title))}/0/1/seeders`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: TIMEOUT });
        const $ = cheerio.load(data);
        const results = [];
        $('table.table tbody tr').each((_, row) => {
            const tds = $(row).find('td');
            if (tds.length < 5) return;
            const name = tds.eq(1).find('a[title]').text().trim();
            const magnet = $(row).find('a[href^="magnet:"]').attr('href');
            const sizeStr = tds.eq(2).text().trim();
            const seeders = parseInt(tds.eq(4).text().trim()) || 0;
            if (name && magnet && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                results.push({ title: name, magnet, size: sizeStr, sizeBytes: parseSize(sizeStr), seeders, source: "Knaben" });
            }
        });
        return results;
    } catch { return []; }
}

async function searchUindex(title, year, type) {
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
                if (name && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                    const sizeStr = cells[2].match(/([\d.,]+\s*(?:B|KB|MB|GB|TB))/i)?.[1].trim() || "??";
                    const seeders = parseInt(cells[4]?.match(/(\d+)/)?.[1] || 0);
                    results.push({ title: name, magnet, size: sizeStr, sizeBytes: parseSize(sizeStr), seeders, source: "UIndex" });
                }
            } catch {}
        }
        return results;
    } catch { return []; }
}

async function searchNyaa(title, year, type) {
    try {
        let q = clean(title);
        if (!q.toLowerCase().includes("ita")) q += " ita";
        const url = `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(q)}&s=seeders&o=desc`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: TIMEOUT });
        const $ = cheerio.load(data);
        const results = [];
        $("tr.default, tr.success, tr.danger").each((i, el) => {
            const tds = $(el).find("td");
            if (tds.length < 8) return;
            const name = $(tds.eq(1)).find("a:not(.comments)").last().text().trim();
            const magnet = $(tds.eq(2)).find('a[href^="magnet:"]').attr("href");
            const sizeStr = $(tds.eq(3)).text().trim();
            const seeders = parseInt($(tds.eq(5)).text().trim(), 10);
            if (name && magnet && seeders > 0 && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                results.push({ title: name, magnet, size: sizeStr, sizeBytes: parseSize(sizeStr), seeders, source: "Nyaa" });
            }
        });
        return results;
    } catch { return []; }
}

async function searchTPB(title, year, type) {
    try {
        const q = `${clean(title)} ${year || ""} ITA`;
        const { data } = await axios.get("https://apibay.org/q.php", { params: { q, cat: type === 'tv' ? 205 : 201 }, timeout: TIMEOUT }).catch(() => ({ data: [] }));
        if (!Array.isArray(data) || data[0]?.name === "No results returned") return [];
        return data.filter(i => i.info_hash !== "0000000000000000000000000000000000000000" && isItalianResult(i.name) && checkYear(i.name, year) && isCorrectFormat(i.name, type, title))
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

async function search1337x(title, year, type) {
    try {
        const url = `https://1337x.to/search/${encodeURIComponent(clean(title) + " ITA")}/1/`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS, httpsAgent });
        const $ = cheerio.load(data || "");
        const candidates = [];
        $("table.table-list tbody tr").slice(0, 8).each((i, row) => {
            const name = $(row).find("td.name a").last().text().trim();
            const link = $(row).find("td.name a").last().attr("href");
            const seeders = parseInt($(row).find("td.seeds").text().replace(/,/g, "")) || 0;
            if (name && link && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) candidates.push({ name, link: `https://1337x.to${link}`, seeders });
        });
        const promises = candidates.map(async (cand) => {
            try {
                const { data } = await axios.get(cand.link, { timeout: 3000, headers: COMMON_HEADERS, httpsAgent }); // Ultra fast detail
                const $d = cheerio.load(data);
                const magnet = $d("a[href^='magnet:?']").first().attr("href");
                const sizeStr = $d("ul.list li").filter((i, el) => $(el).text().includes("Size")).text().replace(/.*Size:\s*/,'').trim();
                return magnet ? { title: cand.name, magnet, seeders: cand.seeders, size: sizeStr || "?", sizeBytes: parseSize(sizeStr), source: "1337x" } : null;
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

async function searchTorrentGalaxy(title, year, type) {
    try {
        const url = `https://torrentgalaxy.to/torrents.php?search=${encodeURIComponent(clean(title) + " ITA")}&sort=seeders&order=desc`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS, httpsAgent });
        const $ = cheerio.load(data);
        const results = [];
        $('div.tgxtablerow').each((i, row) => {
            const name = $(row).find('div a b').text().trim();
            const magnet = $(row).find('a[href^="magnet:"]').attr('href');
            const sizeStr = $(row).find('div td div span font').first().text().trim();
            const seedersStr = $(row).find('div td span font[color="green"]').text().trim();
            const seeders = parseInt(seedersStr) || 0;
            if (name && magnet && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                results.push({ title: name, magnet, size: sizeStr, sizeBytes: parseSize(sizeStr), seeders, source: "TorrentGalaxy" });
            }
        });
        return results;
    } catch { return []; }
}

async function searchBitSearch(title, year, type) {
    try {
        const url = `https://bitsearch.to/search?q=${encodeURIComponent(clean(title) + " ITA")}`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS, httpsAgent }).catch(() => ({ data: "" }));
        const $ = cheerio.load(data || "");
        const results = [];
        $("li.search-result").each((i, el) => {
            const name = $(el).find("h5 a").text().trim();
            const magnet = $(el).find("a.dl-magnet").attr("href");
            const seeders = parseInt($(el).find(".stats div").first().text().replace(/,/g, "")) || 0;
            const sizeStr = $(el).find(".stats div").eq(1).text();
            if (name && magnet && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                results.push({ title: name, magnet, seeders, size: sizeStr, sizeBytes: parseSize(sizeStr), source: "BitSearch" });
            }
        });
        return results;
    } catch { return []; }
}

async function searchLime(title, year, type) {
    try {
        const url = `https://limetorrents.info/search/all/${encodeURIComponent(clean(title) + " ITA")}/seeds/1/`;
        const { data } = await axios.get(url, { timeout: TIMEOUT, headers: COMMON_HEADERS, httpsAgent }).catch(() => ({ data: "" }));
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
            if (name && link && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                candidates.push({ name, link: `https://limetorrents.info${link}`, seeders, sizeStr });
            }
        });
        const promises = candidates.slice(0, 5).map(async (cand) => {
            try {
                const { data } = await axios.get(cand.link, { timeout: 3000, headers: COMMON_HEADERS, httpsAgent }); // Ultra fast detail
                const magnet = cheerio.load(data)("a[href^='magnet:?']").first().attr("href");
                return magnet ? { title: cand.name, magnet, seeders: cand.seeders, size: cand.sizeStr, sizeBytes: parseSize(cand.sizeStr), source: "Lime" } : null;
            } catch { return null; }
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

async function searchGlo(title, year, type) {
    try {
        let q = clean(title);
        if (!q.toLowerCase().includes("ita")) q += " ITA";
        const url = `https://glotorrents.com/search_results.php?search=${encodeURIComponent(q)}&incldead=0&sort=seeders&order=desc`;
        const { data } = await axios.get(url, { headers: COMMON_HEADERS, httpsAgent, timeout: TIMEOUT });
        const $ = cheerio.load(data);
        const candidates = [];
        $('tr.t-row').each((i, el) => {
            const nameA = $(el).find('td.ttitle a b');
            const name = nameA.text().trim();
            const detailLink = nameA.parent().attr('href');
            const sizeStr = $(el).find('td').eq(4).text().trim();
            const seeders = parseInt($(el).find('td').eq(5).text().trim()) || 0;
            if (name && detailLink && isItalianResult(name) && checkYear(name, year) && isCorrectFormat(name, type, title)) {
                candidates.push({ name, detailLink: `https://glotorrents.com/${detailLink}`, sizeStr, seeders });
            }
        });
        const promises = candidates.slice(0, 5).map(async (cand) => {
            try {
                const { data } = await axios.get(cand.detailLink, { headers: COMMON_HEADERS, httpsAgent, timeout: 3000 }); // Ultra fast detail
                const magnet = cheerio.load(data)('a[href^="magnet:"]').attr('href');
                if (magnet) {
                    return { title: cand.name, magnet, size: cand.sizeStr, sizeBytes: parseSize(cand.sizeStr), seeders: cand.seeders, source: "Glo" };
                }
            } catch {}
            return null;
        });
        return (await Promise.all(promises)).filter(Boolean);
    } catch { return []; }
}

// --- MAIN AGGREGATOR (NON MODIFICATO) ---
async function searchMagnet(title, year, type, imdbId) {
    console.log(`\n🚀 [HYPER FAST ENGINE] Ricerca: "${title}" [${year || "N/A"}]`);
    
    const promises = [
        searchCorsaro(title, year, type),
        searchTPB(title, year, type),
        search1337x(title, year, type),
        searchBitSearch(title, year, type),
        searchTorrentGalaxy(title, year, type),
        searchNyaa(title, year, type),
        searchLime(title, year, type),
        searchGlo(title, year, type),
        searchKnaben(title, year, type),
        searchUindex(title, year, type)
    ];
    
    const resultsArrays = await Promise.allSettled(promises);
    
    let allResults = resultsArrays
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value)
        .flat();
    
    const topResults = allResults.sort((a, b) => (b.seeders || 0) - (a.seeders || 0)).slice(0, 50);

    topResults.forEach(r => {
        if (r.magnet && !r.magnet.includes("&tr=")) {
            TRACKERS.forEach(tr => r.magnet += `&tr=${encodeURIComponent(tr)}`);
        }
    });
    
    const seenHashes = new Set();
    const finalResults = topResults.filter(r => {
        const hashMatch = r.magnet.match(/btih:([a-f0-9]{40})/i);
        const hash = hashMatch ? hashMatch[1].toLowerCase() : null;
        if (hash && seenHashes.has(hash)) return false;
        if (hash) seenHashes.add(hash);
        return true;
    });
    
    console.log(`✅ [HYPER FAST ENGINE] Trovati: ${finalResults.length}`);
    return finalResults;
}

module.exports = { searchMagnet };
