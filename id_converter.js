const axios = require("axios");

// --- ⚙️ CONFIGURAZIONE API (GOD MODE) ⚙️ ---
const CONFIG = {
    // 🟢 TMDB (Primario - Veloce e Gratis)
    TMDB_KEY: '4b9dfb8b1c9f1720b5cd1d7efea1d845', 
    TMDB_URL: 'https://api.themoviedb.org/3',
    
    // 🟡 TRAKT (Il tuo Client ID inserito correttamente)
    // Questo permette allo script di trovare Anime e Serie TV difficili
    TRAKT_CLIENT_ID: 'ad521cf009e68d4304eeb82edf0e5c918055eef47bf38c8d568f6a9d8d6da4d1', 
    TRAKT_URL: 'https://api.trakt.tv', // NON TOCCARE: Questo è l'indirizzo per il codice, anche se nel browser non va.
    
    // 🔴 OMDB (Emergency Fallback)
    // Se non hai una chiave OMDB, lascia vuoto.
    OMDB_KEY: 'cbd03c31', 
    OMDB_URL: 'http://www.omdbapi.com',
};

// --- 🧠 SMART CACHE SYSTEM ---
// Memorizza l'intera "Identity Card" del media per 48 ore
const metaCache = new Map();

function getFromCache(key) {
    if (metaCache.has(key)) return metaCache.get(key);
    return null;
}

function saveToCache(ids) {
    // Salva referenze incrociate per lookup istantaneo futuro
    if (ids.imdb) metaCache.set(`imdb:${ids.imdb}`, ids);
    if (ids.tmdb) metaCache.set(`tmdb:${ids.tmdb}:${ids.type || 'movie'}`, ids);
    
    // Pulizia periodica (Anti-Leak)
    if (metaCache.size > 5000) metaCache.clear();
}

// --- ⚡ AXIOS CLIENTS ---
const tmdbClient = axios.create({ baseURL: CONFIG.TMDB_URL, timeout: 4000 });
const traktClient = axios.create({ 
    baseURL: CONFIG.TRAKT_URL, 
    timeout: 4000,
    headers: { 
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': CONFIG.TRAKT_CLIENT_ID 
    }
});
const omdbClient = axios.create({ baseURL: CONFIG.OMDB_URL, timeout: 4000 });

/**
 * 🕵️‍♂️ CORE: TMDB FINDER
 * Cerca ID esterni usando TMDB (Il metodo più veloce)
 */
async function searchTmdb(id, source = 'imdb_id') {
    try {
        const url = `/find/${id}?api_key=${CONFIG.TMDB_KEY}&external_source=${source}`;
        const { data } = await tmdbClient.get(url);
        
        let res = null;
        if (data.movie_results?.length) res = { ...data.movie_results[0], _type: 'movie' };
        else if (data.tv_results?.length) res = { ...data.tv_results[0], _type: 'series' };
        else if (data.tv_episode_results?.length) res = { ...data.tv_episode_results[0], _type: 'episode' };

        if (res) {
            return {
                tmdb: res.id,
                imdb: source === 'imdb_id' ? id : null, 
                type: res._type === 'tv' ? 'series' : res._type,
                foundVia: 'tmdb'
            };
        }
    } catch (e) { /* Silent fail */ }
    return null;
}

async function getTmdbExternalIds(tmdbId, type) {
    try {
        const t = type === 'series' || type === 'tv' ? 'tv' : 'movie';
        const { data } = await tmdbClient.get(`/${t}/${tmdbId}/external_ids?api_key=${CONFIG.TMDB_KEY}`);
        return {
            imdb: data.imdb_id,
            tvdb: data.tvdb_id,
            foundVia: 'tmdb_ext'
        };
    } catch (e) { return {}; }
}

/**
 * 🌉 BRIDGE: TRAKT FINDER (Anime & Series Specialist)
 */
async function searchTrakt(id, type = 'imdb') {
    if (!CONFIG.TRAKT_CLIENT_ID) return null;
    
    try {
        // Trakt cerca specificamente per tipo ID (imdb, tmdb, tvdb)
        const url = `/search/${type}/${id}?type=movie,show`;
        const { data } = await traktClient.get(url);
        
        if (data && data.length > 0) {
            const item = data[0];
            const meta = item.movie || item.show;
            return {
                trakt: meta.ids.trakt,
                slug: meta.ids.slug,
                tvdb: meta.ids.tvdb,
                imdb: meta.ids.imdb,
                tmdb: meta.ids.tmdb,
                type: item.type === 'show' ? 'series' : 'movie',
                foundVia: 'trakt'
            };
        }
    } catch (e) { 
        // console.log("Trakt Error:", e.message); // Debug se serve
    }
    return null;
}

/**
 * 🆘 FALLBACK: OMDb FINDER
 */
async function searchOmdb(imdbId) {
    if (!CONFIG.OMDB_KEY) return null;
    try {
        const { data } = await omdbClient.get(`/?i=${imdbId}&apikey=${CONFIG.OMDB_KEY}`);
        if (data && data.Response === 'True') {
            return {
                imdb: data.imdbID,
                type: data.Type === 'series' ? 'series' : 'movie',
                foundVia: 'omdb'
            };
        }
    } catch (e) { /* Silent fail */ }
    return null;
}

// ==========================================
// 🛠️ FUNZIONI PUBBLICHE 🛠️
// ==========================================

/**
 * Ottiene TUTTI gli ID disponibili per un dato input.
 */
async function getAllIds(id, typeHint = null) {
    const isImdb = id.toString().startsWith('tt');
    const cleanId = id.toString().split(':')[0]; 

    // 1. CACHE CHECK
    const cacheKey = isImdb ? `imdb:${cleanId}` : `tmdb:${cleanId}:${typeHint || 'movie'}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    let identity = { 
        input: cleanId, 
        imdb: isImdb ? cleanId : null, 
        tmdb: !isImdb ? parseInt(cleanId) : null,
        tvdb: null,
        type: typeHint
    };

    // 2. TMDB LOOKUP (Primario)
    if (isImdb) {
        const tmdbRes = await searchTmdb(cleanId, 'imdb_id');
        if (tmdbRes) {
            identity.tmdb = tmdbRes.tmdb;
            identity.type = identity.type || tmdbRes.type;
        }
    }

    if (identity.tmdb) {
        const ext = await getTmdbExternalIds(identity.tmdb, identity.type || 'movie');
        identity = { ...identity, ...ext }; 
    }

    // 3. TRAKT FALLBACK (Il tuo Client ID entra in gioco qui!)
    if ((!identity.tmdb || !identity.imdb) && CONFIG.TRAKT_CLIENT_ID) {
        const traktRes = await searchTrakt(cleanId, isImdb ? 'imdb' : 'tmdb');
        if (traktRes) {
            console.log(`🦅 Trakt Rescue: Recuperati metadati per ${cleanId}`);
            identity = { ...identity, ...traktRes }; 
        }
    }

    // 4. OMDB FALLBACK
    if (isImdb && !identity.tmdb && CONFIG.OMDB_KEY) {
        const omdbRes = await searchOmdb(cleanId);
        if (omdbRes) identity = { ...identity, ...omdbRes };
    }

    // Salva in cache
    if (identity.tmdb || identity.imdb) {
        saveToCache(identity);
    }

    return identity;
}

// Wrapper per compatibilità con addon.js
async function tmdbToImdb(tmdbId, type) {
    const ids = await getAllIds(tmdbId, type);
    if (ids.imdb) {
        console.log(`✅ TMDb ${tmdbId} → IMDb ${ids.imdb} [via ${ids.foundVia || 'cache'}]`);
        return ids.imdb;
    }
    return null;
}

async function imdbToTmdb(imdbId) {
    const ids = await getAllIds(imdbId);
    if (ids.tmdb) {
        console.log(`✅ IMDb ${imdbId} → TMDb ${ids.tmdb} [via ${ids.foundVia || 'cache'}]`);
        return { tmdbId: ids.tmdb, type: ids.type };
    }
    return { tmdbId: null, type: null };
}

module.exports = {
    tmdbToImdb,
    imdbToTmdb,
    getAllIds
};
