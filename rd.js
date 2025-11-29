// rd.js - VERSIONE CHIRURGICA (Supporta selezione file singolo)
const axios = require("axios");
const RD_TIMEOUT = 120000;

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
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
            if (status === 403) return null; // Token invalido
            if (status === 429 || status >= 500) { // Rate limit o Server error
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

    // MODIFICA CRUCIALE: Aggiunto parametro fileId con default "all"
    getStreamLink: async (token, magnet, fileId = "all") => {
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

            // 3. Seleziona File (Specifico o Tutti)
            if (info.status === 'waiting_files_selection') {
                const selUrl = `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`;
                const selBody = new URLSearchParams();
                selBody.append("files", fileId); // <--- USA L'ID SPECIFICO SE PASSATO
                await rdRequest('POST', selUrl, token, selBody);
                
                // Ricarica info dopo selezione
                info = await rdRequest('GET', `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, token);
            }

            if (!info || !info.links?.length) return null;

            // 4. Trova il link giusto
            // Se abbiamo selezionato un file specifico, RD genera solo quel link (di solito)
            // Se è "all", prende il primo (comportamento standard film)
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
        } catch (e) { return null; }
    }
};

module.exports = RD;
