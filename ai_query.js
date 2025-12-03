/**
 * ai_query.js
 * Il "Cervello Semantico" di Leviathan
 * Espande le query usando alias noti e logica fuzzy.
 */

// Dizionario AI statico (espandibile via API in futuro)
const SEMANTIC_ALIASES = {
    // Serie Popolari
    "la casa di carta": ["money heist", "la casa de papel"],
    "il trono di spade": ["game of thrones"],
    "l'attacco dei giganti": ["attack on titan", "shingeki no kyojin"],
    "demon slayer": ["kimetsu no yaiba"],
    "jujutsu kaisen": ["sorcery fight"],
    "my hero academia": ["boku no hero academia"],
    "one piece": ["one piece ita"],
    // Film / Franchise complessi
    "fast and furious": ["fast & furious", "f9", "fast x"],
    "harry potter": ["hp"],
    // Correzioni comuni
    "dr house": ["house md", "house m.d.", "dr. house"]
};

function generateSmartQueries(meta) {
    const { title, originalTitle, year, season, episode, isSeries } = meta;
    const cleanTitle = title.toLowerCase().trim();
    
    // 1. Base Set: Titolo Italiano e Originale
    let titles = new Set();
    titles.add(title);
    if (originalTitle) titles.add(originalTitle);

    // 2. Espansione Semantica (AI Dictionary)
    if (SEMANTIC_ALIASES[cleanTitle]) {
        SEMANTIC_ALIASES[cleanTitle].forEach(alias => titles.add(alias));
    }

    // 3. Generazione Query Combinate
    let queries = new Set();
    const sStr = season ? String(season).padStart(2, "0") : "";
    const eStr = episode ? String(episode).padStart(2, "0") : "";

    titles.forEach(t => {
        if (isSeries) {
            // Standard: Titolo SxxExx
            queries.add(`${t} S${sStr}E${eStr}`);
            
            // Varianti Anno (Critico per reboot)
            if (year) queries.add(`${t} ${year} S${sStr}E${eStr}`);
            
            // Formato XxY (vecchi tracker)
            queries.add(`${t} ${season}x${eStr}`);
            
            // Pack Stagionali (Fallback intelligente)
            queries.add(`${t} Stagione ${season}`);
            queries.add(`${t} Season ${season}`);
        } else {
            // Film
            queries.add(`${t} ${year}`);
            if (!t.toLowerCase().includes("ita")) queries.add(`${t} ITA`);
        }
    });

    // Converte in array e prioritizza il titolo esatto originale
    return Array.from(queries).sort((a, b) => {
        // Mette in cima le query che iniziano con il titolo originale
        if (originalTitle && a.startsWith(originalTitle)) return -1;
        return 0;
    });
}

module.exports = { generateSmartQueries };
