// rd.js - VERSIONE 2.1 (DEBUG & ROBUST)
const axios = require("axios");

// --- CONFIGURAZIONE ---
const RD_TIMEOUT = 120000; 
// Estensioni video valide (aggiunto m2ts e vob per sicurezza)
const SUPPORTED_EXT = /\.(mkv|mp4|avi|mov|wmv|flv|webm|m2ts|vob|mpg|mpeg)$/i;
// Files da ignorare assolutamente
const IGNORED_FILES = /\b(sample|rarbg\.com|etrg|promo|trailer)\b/i;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getHashFromMagnet(magnet) {
    const match = magnet.match(/btih:([a-fA-F0-9]{40})/i);
    return match ? match[1].toLowerCase() : null;
}

// --- LOGICA DI MATCHING ---

function findCachedFileId(variants, season, episode, originalTitle) {
    if (!variants || !Array.isArray(variants)) return null;

    let bestFileId = null;
    let maxBytes = 0;
    
    // Normalizza numeri per regex (es. 1 -> "01")
    const sStr = season ? season.toString().padStart(2, '0') : null;
    const eStr = episode ? episode.toString().padStart(2, '0') : null;

    // Regex Stringenti (S01E01, 1x01)
    const strictRegex = (season && episode) 
        ? new RegExp(`(S${sStr}.?E${eStr}|${season}x${eStr})`, 'i') 
        : null;

    // Regex Lasche (E01, 101)
    const looseRegex = (season && episode)
        ? new RegExp(`\\b(${season}${eStr}|E${eStr})\\b`, 'i')
        : null;

    for (const variant of variants) {
        for (const fileId in variant) {
            const file = variant[fileId];
            const filename = file.filename;
            const bytes = file.filesize;

            // 1. Filtro Estensione & Spazzatura
            if (!SUPPORTED_EXT.test(filename)) continue;
            if (IGNORED_FILES.test(filename)) continue;

            // 2. LOGICA SERIE TV
            if (season && episode) {
                // Match Perfetto
                if (strictRegex && strictRegex.test(filename)) {
                    // console.log(`🎯 RD: Match Perfetto trovato: ${filename}`);
                    return fileId; 
                }
                // Match Lasco (Continua a cercare il migliore)
                if (looseRegex && looseRegex.test(filename)) {
                    if (bytes > maxBytes) {
                        maxBytes = bytes;
                        bestFileId = fileId;
                    }
                }
            } 
            // 3. LOGICA FILM (o Fallback Serie senza match)
            else {
                if (bytes > maxBytes) {
                    maxBytes = bytes;
                    bestFileId = fileId;
                }
            }
        }
    }

    // FALLBACK ESTREMO PER SERIE:
    // Se cerco un episodio ma non trovo match nel nome, ma il torrent ha SOLO file video validi, 
    // prendo il più grande (spesso nei pack c'è solo l'episodio giusto se selezionato dal magnet)
    if (season && episode && !bestFileId && maxBytes > 0) {
        // console.log(`⚠️ RD: Nessun match nome per S${season}E${episode}, uso il file più grande.`);
        return bestFileId; // Restituisce quello con maxBytes trovato nel loop
    }

    return bestFileId;
}

// --- API CLIENT ---

async function rdRequest(method, url, token, data = null) {
    let attempt = 0;
    while (attempt < 3) {
        try {
            const config = {
                method,
                url,
                headers: { Authorization: `Bearer ${token}` },
                timeout: 5000 // Timeout breve
            };
            if (data) config.data = data;
            const response = await axios(config);
            return response.data;
        } catch (error) {
            if (error.response && [401, 403].includes(error.response.status)) {
                console.error("⛔ RD: Token non valido o scaduto.");
                return null;
            }
            if (error.response && error.response.status === 429) {
                await sleep(1000); // Rate limit
                attempt++;
                continue;
            }
            // console.error(`⚠️ RD Req Error [${url}]:`, error.message);
            return null;
        }
    }
    return null;
}

const RD = {
    deleteTorrent: async (token, torrentId) => {
        try {
            await rdRequest('DELETE', `https://api.real-debrid.com/rest/1.0/torrents/delete/${torrentId}`, token);
        } catch (e) {}
    },

    checkInstantAvailability: async (token, hashes) => {
        try {
            const url = `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hashes.join('/')}`;
            return await rdRequest('GET', url, token);
        } catch { return null; }
    },

    getStreamLink: async (token, magnet, season = null, episode = null) => {
        let torrentId = null;
        try {
            const hash = getHashFromMagnet(magnet);
            if (!hash) return null;

            // 1. CHECK CACHE RAPIDO ⚡
            const instantData = await RD.checkInstantAvailability(token, [hash]);
            
            // Se non è in cache, usciamo subito (Per evitare attese inutili su Stremio)
            if (!instantData || !instantData[hash] || !instantData[hash].rd || instantData[hash].rd.length === 0) {
                // console.log(`⏩ RD: Hash ${hash.substring(0,6)}... non in cache. Skip.`);
                return null; 
            }

            // 2. CERCA FILE GIUSTO
            const cachedFileId = findCachedFileId(instantData[hash].rd, season, episode);
            
            if (!cachedFileId) {
                // console.log(`⚠️ RD: Hash in cache, ma nessun file video valido trovato.`);
                return null;
            }

            // 3. AGGIUNGI MAGNET
            const addUrl = "https://api.real-debrid.com/rest/1.0/torrents/addMagnet";
            const params = new URLSearchParams();
            params.append("magnet", magnet);
            const addRes = await rdRequest('POST', addUrl, token, params);
            
            if (!addRes || !addRes.id) return null;
            torrentId = addRes.id;

            // 4. SELEZIONA FILE (Sblocco Istantaneo)
            const selUrl = `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`;
            const selParams = new URLSearchParams();
            selParams.append("files", cachedFileId);
            await rdRequest('POST', selUrl, token, selParams);

            // 5. OTTIENI LINK
            const info = await rdRequest('GET', `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, token);
            
            if (!info || !info.links || info.links.length === 0) {
                await RD.deleteTorrent(token, torrentId);
                return null;
            }

            // 6. UNRESTRICT
            const unrestrictUrl = "https://api.real-debrid.com/rest/1.0/unrestrict/link";
            const unParams = new URLSearchParams();
            unParams.append("link", info.links[0]);
            
            const stream = await rdRequest('POST', unrestrictUrl, token, unParams);
            
            if (!stream || !stream.download) {
                await RD.deleteTorrent(token, torrentId);
                return null;
            }

            // console.log(`✅ RD: Stream Generato: ${stream.filename}`);
            return {
                type: 'ready',
                url: stream.download,
                filename: stream.filename,
                size: stream.filesize
            };

        } catch (e) {
            console.error("🔥 RD CRITICAL:", e.message);
            if (torrentId) await RD.deleteTorrent(token, torrentId);
            return null;
        }
    }
};

module.exports = RD;
