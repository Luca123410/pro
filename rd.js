// rd.js - VERSIONE CHIRURGICA & INTELLIGENTE
const axios = require("axios");
const RD_TIMEOUT = 120000;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// Helper per trovare il file giusto dentro il torrent
function matchFile(files, season, episode) {
    if (!files || !season || !episode) return null;

    const sStr = season.toString().padStart(2, '0');
    const eStr = episode.toString().padStart(2, '0');

    // Priorità 1: Formato Standard S01E01
    const regexStandard = new RegExp(`S${sStr}[^0-9]*E${eStr}`, 'i');
    
    // Priorità 2: Formato 1x01
    const regexX = new RegExp(`${season}x${eStr}`, 'i');

    // Filtriamo file video validi (evita .txt, .jpg, sample)
    const videoFiles = files.filter(f => {
        const name = f.path.toLowerCase();
        return name.match(/\.(mkv|mp4|avi|mov|wmv)$/) && !name.includes("sample");
    });

    // Cerca match perfetto
    let found = videoFiles.find(f => regexStandard.test(f.path));
    if (!found) found = videoFiles.find(f => regexX.test(f.path));

    // Fallback disperato: se non trovo il pattern, cerco solo il numero episodio se i file sono pochi
    if (!found && videoFiles.length > 0) {
        // Cerca "E01" o " 01 "
        const looseRegex = new RegExp(`[Ee]${eStr}|\\b${eStr}\\b`);
        found = videoFiles.find(f => looseRegex.test(f.path));
    }

    return found ? found.id : null;
}

async function rdRequest(method, url, token, data = null) {
    let attempt = 0;
    while (attempt < 4) {
        try {
            const config = {
                method,
                url,
                headers: { Authorization: `Bearer ${token}` },
                timeout: RD_TIMEOUT
            };
            if (data) config.data = data;
            const response = await axios(config);
            return response.data;
        } catch (error) {
            const status = error.response?.status;
            if (status === 403) return null;
            if (status === 429 || status >= 500) {
                await sleep(1000 + Math.random() * 1000);
                attempt++;
                continue;
            }
            return null;
        }
    }
    return null;
}

const RD = {
    checkInstantAvailability: async (token, hashes) => {
        try {
            const hashString = hashes.join('/');
            const url = `https://api.real-debrid.com/rest/1.0/torrents/instantAvailability/${hashString}`;
            return await rdRequest('GET', url, token) || {};
        } catch (e) { return {}; }
    },

    // MODIFICA: Ora accetta season ed episode opzionali
    getStreamLink: async (token, magnet, season = null, episode = null) => {
        try {
            // 1. Aggiungi Magnet
            const addUrl = "https://api.real-debrid.com/rest/1.0/torrents/addMagnet";
            const body = new URLSearchParams();
            body.append("magnet", magnet);
            
            const addRes = await rdRequest('POST', addUrl, token, body);
            if (!addRes || !addRes.id) return null;
            const torrentId = addRes.id;

            // 2. Info Torrent
            let info = await rdRequest('GET', `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, token);
            if (!info) return null;

            // 3. Seleziona File (Intelligente)
            if (info.status === 'waiting_files_selection') {
                let fileIdToSelect = "all";

                // Se abbiamo info su stagione/episodio, cerchiamo il file specifico
                if (season && episode && info.files) {
                    const matchedId = matchFile(info.files, season, episode);
                    if (matchedId) {
                        fileIdToSelect = matchedId;
                        console.log(`🎯 RD Match: Selezionato file ID ${matchedId} per S${season}E${episode}`);
                    }
                } else if (info.files) {
                     // Se è un film o non abbiamo info, prendiamo il file più grande (evita sample)
                     const sortedFiles = info.files.sort((a, b) => b.bytes - a.bytes);
                     if(sortedFiles.length > 0) fileIdToSelect = sortedFiles[0].id;
                }

                const selUrl = `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`;
                const selBody = new URLSearchParams();
                selBody.append("files", fileIdToSelect);
                await rdRequest('POST', selUrl, token, selBody);
                
                // Ricarica info dopo selezione
                info = await rdRequest('GET', `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, token);
            }

            if (!info || !info.links?.length) return null;

            // 4. Trova il link giusto
            // Se abbiamo selezionato un file specifico, info.links[0] è quello giusto.
            const linkToUnrestrict = info.links[0]; 

            // 5. Unrestrict
            const unrestrictUrl = "https://api.real-debrid.com/rest/1.0/unrestrict/link";
            const unResBody = new URLSearchParams();
            unResBody.append("link", linkToUnrestrict);

            const unrestrictRes = await rdRequest('POST', unrestrictUrl, token, unResBody);
            if (!unrestrictRes) return null;

            return {
                type: 'ready',
                url: unrestrictRes.download,
                filename: unrestrictRes.filename,
                size: unrestrictRes.filesize
            };
        } catch (e) { 
            console.error("RD Error:", e.message);
            return null; 
        }
    }
};

module.exports = RD;
