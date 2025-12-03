/**
 * smart_parser.js – Versione Potenziata by ChatGPT x Luca
 * Hybrid NLP + Fuzzy + Token Intelligence (Con Fix Anti-Spinoff)
 */

const FuzzySet = require("fuzzyset");

// Junk tecnico
const JUNK_TOKENS = new Set([
    "h264","x264","h265","x265","hevc","1080p","720p","4k","2160p",
    "hdr","web","web-dl","bluray","rip","ita","eng","multi","sub",
    "ac3","aac","mkv","mp4","avi","divx","xvid","dts","truehd",
    "atmos","vision","repack","remux","proper","complete","pack",
    "uhd","sdr","season","stagione","episode","episodio","cam","ts",
    "hdtv", "amzn", "dsnp", "nf" // (Opzionale: aggiunti junk comuni streaming per pulizia)
]);

// Stop words
const STOP_WORDS = new Set([
    "il","lo","la","i","gli","le","un","uno","una",
    "the","a","an","of","in","on","at","to","for","by","with","and","&"
]);

// --- [INIZIO CORREZIONE: LISTA NERA & SPINOFF] ---
const FORBIDDEN_EXPANSIONS = new Set([
    "new","blood","resurrection","returns","reborn",
    "origins","legacy","revival","sequel",
    "redemption", "evolution", "dead city", "world beyond", "fear the"
]);

const SPINOFF_KEYWORDS = {
    "dexter": ["new blood"],
    "the walking dead": ["dead city", "world beyond", "fear", "daryl"],
    "breaking bad": ["better call saul"],
    "game of thrones": ["house of the dragon"],
    "csi": ["miami", "ny", "cyber", "vegas"],
    "ncis": ["los angeles", "new orleans", "hawaii", "sydney"]
};
// --- [FINE CORREZIONE] ---

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

// --- [INIZIO CORREZIONE: Funzione Helper] ---
function isUnwantedSpinoff(cleanMeta, cleanFile) {
    for (const [parent, spinoffs] of Object.entries(SPINOFF_KEYWORDS)) {
        if (cleanMeta.includes(parent)) {
            for (const sp of spinoffs) {
                // Se il file ha lo spinoff (es. "new blood") MA la ricerca NON lo aveva -> VERO (è indesiderato)
                if (cleanFile.includes(sp) && !cleanMeta.includes(sp)) {
                    return true; 
                }
            }
        }
    }
    return false;
}
// --- [FINE CORREZIONE] ---

function smartMatch(metaTitle, filename, isSeries = false, metaSeason = null, metaEpisode = null) {
    if (!filename) return false;
    
    // Reject file non validi (sample, trailer)
    const fLower = filename.toLowerCase();
    if (fLower.includes("sample") || fLower.includes("trailer")) return false;

    // --- [INIZIO CORREZIONE: Blocco Preventivo Spinoff] ---
    const cleanMetaString = normalizeTitle(metaTitle);
    const cleanFileString = normalizeTitle(filename);

    if (isUnwantedSpinoff(cleanMetaString, cleanFileString)) {
        return false;
    }
    // --- [FINE CORREZIONE] ---

    // Tokenizzazione
    const fTokensRaw = tokenize(filename);
    const mTokensRaw = tokenize(metaTitle);

    const fTokens = fTokensRaw.filter(t => !JUNK_TOKENS.has(t));
    const mTokens = mTokensRaw.filter(t => !STOP_WORDS.has(t));

    if (mTokens.length === 0) return false;

    // --- [INIZIO CORREZIONE: Controllo Parole Proibite] ---
    // Se trovo parole della lista nera (es. "new", "blood") nel file, 
    // ma NON le stavo cercando, rifiuto il file.
    const isCleanSearch = !mTokens.some(mt => FORBIDDEN_EXPANSIONS.has(mt));
    if (isCleanSearch) {
        for (const ft of fTokens) {
            if (FORBIDDEN_EXPANSIONS.has(ft)) return false; // File rifiutato
        }
    }
    // --- [FINE CORREZIONE] ---

    const cleanF = fTokens.join(" ");
    const cleanM = mTokens.join(" ");

    // ---------------------------------------------------------
    // 1) FUZZY MATCH BIDIREZIONALE (Identico a prima)
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
    // 2) TOKEN OVERLAP (Identico a prima)
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
    // 3) SERIE TV: Matching Episodio (Identico a prima)
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
    // 4) Serie TV: fallback solo titolo (Identico a prima)
    // ---------------------------------------------------------
    if (isSeries) {
        const simpleMeta = mTokens.join("");
        const simpleFile = fTokens.join("");
        if (simpleFile.includes(simpleMeta)) return true;
    }

    return false;
}

module.exports = { smartMatch };
