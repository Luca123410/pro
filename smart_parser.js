/**
 * smart_parser.js
 * NLP-Lite Parser per Leviathan (Hybrid Mode)
 * Più permissivo: Fuzzy + Percentuale di Parole Chiave
 */

const FuzzySet = require("fuzzyset");

// Token che consideriamo "rumore tecnico" e ignoriamo completamente
const JUNK_TOKENS = new Set([
    "h264", "x264", "h265", "x265", "hevc", "1080p", "720p", "4k", "2160p", 
    "hdr", "web", "web-dl", "bluray", "rip", "ita", "eng", "multi", "sub", 
    "ac3", "aac", "mkv", "mp4", "avi", "divx", "xvid", "dts", "truehd",
    "atmos", "vision", "repack", "remux", "proper", "complete", "pack",
    "uhd", "sdr", "season", "stagione", "episode", "episodio"
]);

// Parole comuni da ignorare nel conteggio delle parole chiave
const STOP_WORDS = new Set([
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
    "the", "a", "an", "of", "in", "on", "at", "to", "for", "by", "with", "and", "&"
]);

function tokenize(str) {
    return str.toLowerCase()
        .replace(/['"._\[\]()\-:;]/g, " ") // Rimuove punteggiatura estesa
        .split(/\s+/)
        .filter(t => t.length > 0);
}

/**
 * Analizza se il filename corrisponde al metadata
 */
function smartMatch(metaTitle, filename, isSeries = false) {
    if (!filename) return false;
    
    // 1. Pulizia Token
    const fTokensRaw = tokenize(filename);
    const mTokensRaw = tokenize(metaTitle);

    // Rimuoviamo Junk tecnico dal filename
    const fTokens = fTokensRaw.filter(t => !JUNK_TOKENS.has(t));
    // Rimuoviamo Stop Words dal titolo cercato (per il calcolo percentuale)
    const mTokens = mTokensRaw.filter(t => !STOP_WORDS.has(t));

    // Ricostruiamo le stringhe pulite
    const cleanF = fTokens.join(" ");
    const cleanM = mTokensRaw.join(" "); // Teniamo il titolo originale tokenizzato per il Fuzzy

    // ---------------------------------------------------------
    // STRATEGIA 1: FUZZY MATCH (Per typo e titoli simili)
    // ---------------------------------------------------------
    // Abbassiamo la soglia: 0.65 è abbastanza permissivo ma sicuro
    const minThreshold = cleanM.length < 5 ? 0.90 : 0.65; 
    const fs = FuzzySet([cleanM]);
    const match = fs.get(cleanF);

    if (match && match[0][0] >= minThreshold) {
        return true; // Match Fuzzy Accettato
    }

    // ---------------------------------------------------------
    // STRATEGIA 2: TOKEN OVERLAP (Per abbreviazioni e ordine sparso)
    // ---------------------------------------------------------
    // Contiamo quante parole significative del titolo sono presenti nel filename
    
    if (mTokens.length === 0) return true; // Titolo fatto solo di stop words? Accetta (caso raro)

    let foundCount = 0;
    fTokens.forEach(ft => {
        // Cerchiamo match esatti o parziali forti (es. "avenger" in "avengers")
        if (mTokens.some(mt => mt === ft || (mt.length > 4 && ft.includes(mt)))) {
            foundCount++;
        }
    });

    // Calcolo percentuale di presenza
    // Se il titolo è "Mission Impossible Dead Reckoning", mTokens = 4.
    // Se trovo "Mission" e "Impossible", ho 2/4 = 0.5.
    
    const overlapRatio = foundCount / mTokens.length;

    // Regole di accettazione:
    // - Se il titolo ha solo 1 parola significativa: deve esserci (Ratio 1.0)
    // - Se ha 2 parole: ne basta 1 se il fuzzy non era disastroso, ma meglio richiederne 2.
    // - Se > 2 parole: accettiamo se il 60% delle parole c'è.
    
    if (mTokens.length === 1 && overlapRatio >= 1) return true;
    if (mTokens.length > 1 && overlapRatio >= 0.60) return true;

    // ---------------------------------------------------------
    // STRATEGIA 3: SALVAGENTE PER LE SERIE TV
    // ---------------------------------------------------------
    // Se è una serie, e il nome della serie è contenuto esattamente nel filename (anche con junk intorno)
    // Accettiamo quasi sempre, perché il filtro SxxExx viene fatto altrove o nel ranking.
    if (isSeries) {
        // Ricostruiamo titolo semplice senza spazi per check brutale
        const simpleMeta = mTokens.join("");
        const simpleFile = fTokens.join("");
        if (simpleFile.includes(simpleMeta)) return true;
    }

    return false;
}

module.exports = { smartMatch };
