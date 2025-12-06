/**
 * smart_parser.js 
 * Hybrid NLP + Fuzzy + Token Intelligence
 * FIXED: Tolleranza titoli parziali (es. "Welcome to Derry" vs "IT: Welcome to Derry")
 */

const FuzzySet = require("fuzzyset");

// Junk tecnico
const JUNK_TOKENS = new Set([
    "h264","x264","h265","x265","hevc","1080p","720p","4k","2160p",
    "hdr","web","web-dl","bluray","rip","ita","eng","multi","sub",
    "ac3","aac","mkv","mp4","avi","divx","xvid","dts","truehd",
    "atmos","vision","repack","remux","proper","complete","pack",
    "uhd","sdr","season","stagione","episode","episodio","cam","ts",
    "hdtv", "amzn", "dsnp", "nf"
]);

// Stop words
const STOP_WORDS = new Set([
    "il","lo","la","i","gli","le","un","uno","una",
    "the","a","an","of","in","on","at","to","for","by","with","and","&",
    "it" // Aggiunto "it" come stop word per evitare problemi con "IT:"
]);

// Blacklist Spinoff/Sequel
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
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\b(ii|iii|iv|vi|vii|viii|ix|x)\b/gi, r => romanToArabic(r))
        .replace(/\b(l|il|lo|la|i|gli|le|the)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenize(str) {
    return normalizeTitle(str).split(/\s+/).filter(Boolean);
}

// --- ESTRAZIONE EPISODIO ---
function extractEpisodeInfo(filename) {
    const upper = filename.toUpperCase();
    let s = null, e = null;

    const sxeMatch = upper.match(/S(\d{1,2})(?:[._\s-]*E|x)(\d{1,3})/i);
    if (sxeMatch) {
        s = parseInt(sxeMatch[1]);
        e = parseInt(sxeMatch[2]);
        return { season: s, episode: e };
    }

    const xMatch = upper.match(/(\d{1,2})X(\d{1,3})/i);
    if (xMatch) {
        s = parseInt(xMatch[1]);
        e = parseInt(xMatch[2]);
        return { season: s, episode: e };
    }
    
    const itMatch = upper.match(/STAGIONE\s*(\d{1,2}).*?EPISODIO\s*(\d{1,3})/i);
    if (itMatch) {
        return { season: parseInt(itMatch[1]), episode: parseInt(itMatch[2]) };
    }

    return null;
}

function isUnwantedSpinoff(cleanMeta, cleanFile) {
    for (const [parent, spinoffs] of Object.entries(SPINOFF_KEYWORDS)) {
        if (cleanMeta.includes(parent)) {
            for (const sp of spinoffs) {
                if (cleanFile.includes(sp) && !cleanMeta.includes(sp)) {
                    return true; 
                }
            }
        }
    }
    return false;
}

function smartMatch(metaTitle, filename, isSeries = false, metaSeason = null, metaEpisode = null) {
    if (!filename) return false;
    
    const fLower = filename.toLowerCase();
    if (fLower.includes("sample") || fLower.includes("trailer")) return false;

    // 1. Check Spinoff e Keywords proibite
    const cleanMetaString = normalizeTitle(metaTitle);
    const cleanFileString = normalizeTitle(filename);

    if (isUnwantedSpinoff(cleanMetaString, cleanFileString)) return false;

    // Tokenizzazione
    const fTokensRaw = tokenize(filename);
    const mTokensRaw = tokenize(metaTitle);

    const fTokens = fTokensRaw.filter(t => !JUNK_TOKENS.has(t));
    const mTokens = mTokensRaw.filter(t => !STOP_WORDS.has(t));

    if (mTokens.length === 0) return false;

    const isCleanSearch = !mTokens.some(mt => FORBIDDEN_EXPANSIONS.has(mt));
    if (isCleanSearch) {
        for (const ft of fTokens) {
            if (FORBIDDEN_EXPANSIONS.has(ft)) return false;
        }
    }

    const cleanF = fTokens.join(" ");
    const cleanM = mTokens.join(" ");

    // 2. Controllo Serie TV STRICT (Fix "IT: Welcome to Derry")
    if (isSeries && metaSeason !== null && metaEpisode !== null) {
        const epInfo = extractEpisodeInfo(filename);
        
        if (epInfo) {
            // Se i numeri non coincidono, rifiuta SEMPRE.
            if (epInfo.season !== metaSeason || epInfo.episode !== metaEpisode) {
                return false; 
            }
            
            // 🔥 MODIFICA QUI: Flessibilità sul titolo se i numeri sono perfetti 🔥
            // Invece di richiedere che il file contenga TUTTO il titolo meta,
            // controlliamo se la maggior parte delle parole coincidono.
            // Questo salva "Welcome to Derry" quando cerchi "IT: Welcome to Derry".
            
            let matchCount = 0;
            mTokens.forEach(mt => {
                if (fTokens.some(ft => ft.includes(mt) || mt.includes(ft))) matchCount++;
            });

            // Se almeno il 60% delle parole del titolo sono nel file, è buono.
            // Es. "IT Welcome Derry" (3 token). File: "Welcome Derry" (2 token). 2/3 = 0.66 -> OK.
            // Es. "Dexter" (1 token). File: "Dexter" (1 token). 1/1 = 1.0 -> OK.
            if (matchCount / mTokens.length >= 0.6) return true;

            // Fallback Fuzzy per titoli strani (ma con numeri giusti)
            const fuz = FuzzySet([cleanM]).get(cleanF);
            if (fuz && fuz[0][0] > 0.75) return true;

            return false;
        } 
        
        // Gestione Season Pack (nessun episodio nel nome file)
        const seasonMatch = filename.match(/S(?:eason|tagione)?\s*(\d{1,2})/i);
        if (seasonMatch) {
             const foundSeason = parseInt(seasonMatch[1]);
             if (foundSeason !== metaSeason) return false;
        }
    }

    // 3. Fuzzy Match (Algoritmo standard per Film)
    const fuzzyA = FuzzySet([cleanM]).get(cleanF);
    const fuzzyB = FuzzySet([cleanF]).get(cleanM);
    const fuzzyScore = Math.max(fuzzyA?.[0]?.[0] || 0, fuzzyB?.[0]?.[0] || 0);
    const threshold = cleanM.length < 5 ? 0.90 : 0.75;

    if (fuzzyScore >= threshold) return true;

    // 4. Token Overlap (Solo per FILM)
    if (!isSeries) {
        let found = 0;
        fTokens.forEach(ft => {
            if (mTokens.some(mt => mt === ft || (mt.length > 4 && ft.includes(mt)))) found++;
        });
        const ratio = found / mTokens.length;
        if (ratio >= 0.75) return true;
    }

    return false;
}

module.exports = { smartMatch };
