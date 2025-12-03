/**
 * smart_parser.js – Versione Potenziata by ChatGPT x Luca
 * Hybrid NLP + Fuzzy + Token Intelligence
 */

const FuzzySet = require("fuzzyset");

// Junk tecnico
const JUNK_TOKENS = new Set([
    "h264","x264","h265","x265","hevc","1080p","720p","4k","2160p",
    "hdr","web","web-dl","bluray","rip","ita","eng","multi","sub",
    "ac3","aac","mkv","mp4","avi","divx","xvid","dts","truehd",
    "atmos","vision","repack","remux","proper","complete","pack",
    "uhd","sdr","season","stagione","episode","episodio","cam","ts"
]);

// Stop words
const STOP_WORDS = new Set([
    "il","lo","la","i","gli","le","un","uno","una",
    "the","a","an","of","in","on","at","to","for","by","with","and","&"
]);

// Trasformazione numeri romani → arabi
function romanToArabic(str) {
    const map = { i:1,v:5,x:10,l:50,c:100 };
    let total = 0;
    let prev = 0;
    str = str.toLowerCase();

    for (let c of str.split("").reverse()) {
        const val = map[c] || 0;
        total += val < prev ? -val : val;
        prev = val;
    }
    return total;
}

function normalizeTitle(t) {
    return t
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // rimuove accenti
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\b(ii|iii|iv|vi|vii|viii|ix|x)\b/gi, r => romanToArabic(r))
        .replace(/\b(l|il|lo|la|i|gli|le|the)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(str) {
    return normalizeTitle(str).split(/\s+/).filter(Boolean);
}

function extractEpisodeInfo(str) {
    const lower = str.toLowerCase();
    const sxe = lower.match(/s(\d{1,2})e(\d{1,2})/);
    const xformat = lower.match(/(\d{1,2})x(\d{1,2})/);
    if (sxe) return { season: parseInt(sxe[1]), episode: parseInt(sxe[2]) };
    if (xformat) return { season: parseInt(xformat[1]), episode: parseInt(xformat[2]) };
    return null;
}

function smartMatch(metaTitle, filename, isSeries = false, metaSeason = null, metaEpisode = null) {
    if (!filename) return false;
    
    // Reject file non validi (sample, trailer)
    const fLower = filename.toLowerCase();
    if (fLower.includes("sample") || fLower.includes("trailer")) return false;

    // Tokenizzazione
    const fTokensRaw = tokenize(filename);
    const mTokensRaw = tokenize(metaTitle);

    const fTokens = fTokensRaw.filter(t => !JUNK_TOKENS.has(t));
    const mTokens = mTokensRaw.filter(t => !STOP_WORDS.has(t));

    if (mTokens.length === 0) return false;

    const cleanF = fTokens.join(" ");
    const cleanM = mTokens.join(" ");

    // ---------------------------------------------------------
    // 1) FUZZY MATCH BIDIREZIONALE
    // ---------------------------------------------------------
    const fuzzyA = FuzzySet([cleanM]).get(cleanF);
    const fuzzyB = FuzzySet([cleanF]).get(cleanM);

    const fuzzyScore = Math.max(
        fuzzyA?.[0]?.[0] || 0,
        fuzzyB?.[0]?.[0] || 0
    );

    const threshold = cleanM.length < 5 ? 0.90 : 0.65;

    if (fuzzyScore >= threshold) return true;

    // ---------------------------------------------------------
    // 2) TOKEN OVERLAP
    // ---------------------------------------------------------
    let found = 0;
    fTokens.forEach(ft => {
        if (mTokens.some(mt => mt === ft || (mt.length > 4 && ft.includes(mt)))) {
            found++;
        }
    });

    const ratio = found / mTokens.length;
    if (ratio >= 0.60) return true;
    if (mTokens.length === 1 && ratio === 1) return true;

    // ---------------------------------------------------------
    // 3) SERIE TV: Matching Episodio
    // ---------------------------------------------------------
    if (isSeries && (metaSeason !== null && metaEpisode !== null)) {
        const epInfo = extractEpisodeInfo(filename);
        if (!epInfo) return false; // Il file non contiene episodio → reject
        if (epInfo.season === metaSeason && epInfo.episode === metaEpisode) {
            // Controllo titolo semplice
            const simpleMeta = mTokens.join("");
            const simpleFile = fTokens.join("");
            return simpleFile.includes(simpleMeta);
        }
        return false;
    }

    // ---------------------------------------------------------
    // 4) Serie TV: fallback solo titolo
    // ---------------------------------------------------------
    if (isSeries) {
        const simpleMeta = mTokens.join("");
        const simpleFile = fTokens.join("");
        if (simpleFile.includes(simpleMeta)) return true;
    }

    return false;
}

module.exports = { smartMatch };
