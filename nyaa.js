const axios = require("axios");
const cheerio = require("cheerio");

async function searchMagnet(query, year) {
    try {
        // Aggiungiamo "ita" alla query per focalizzarci su contenuti italiani, come nel tuo esempio
        let searchQuery = query.trim();
        if (!searchQuery.toLowerCase().includes("ita")) {
            searchQuery += " ita";
        }
        const encodedQuery = encodeURIComponent(searchQuery);
        
        // URL di ricerca: prima pagina, ordinata per seeders descending (meglio per qualità)
        // (Ho cambiato dal tuo esempio con leechers asc, per prioritarizzare torrent vivi)
        const url = `https://nyaa.si/?f=0&c=0_0&q=${encodedQuery}&s=seeders&o=desc`;
        
        const { data } = await axios.get(url, { timeout: 5000 });
        const $ = cheerio.load(data);
        
        const results = [];
        $("tr.default, tr.success, tr.danger").each((i, el) => {
            const tds = $(el).find("td");
            if (tds.length < 8) return;
            
            // Title: prendi l'ultimo link nel secondo td (spesso c'è group + title)
            const titleLink = $(tds.eq(1)).find("a:not(.comments)").last();
            const title = titleLink.text().trim();
            if (!title) return;
            
            // Magnet link
            const magnetLink = $(tds.eq(2)).find('a[href^="magnet:"]').attr("href");
            if (!magnetLink) return;
            
            // Size
            const size = $(tds.eq(3)).text().trim();
            
            // Seeders (filtra se <1 per evitare torrent morti)
            const seeders = parseInt($(tds.eq(5)).text().trim(), 10);
            if (isNaN(seeders) || seeders < 1) return;
            
            results.push({
                title,
                magnet: magnetLink,
                size,
                source: "Nyaa"
            });
        });
        
        return results;
    } catch (e) {
        console.error(`Errore Nyaa: ${e.message}`);
        return [];
    }
}

module.exports = { searchMagnet };
