// rd.js - versione FIXATA per evitare errori 403 e 429

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
            
            // 403 → non abbiamo accesso, inutile riprovare
            if (status === 403) return null;

            // 429 → rate limit → aspetta e ritenta
            if (status === 429) {
                await sleep(1000 + Math.random() * 1000);
                attempt++;
                continue;
            }

            // 500 → ritenta
            if (status >= 500) {
                await sleep(500 + Math.random() * 500);
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
            const data = await rdRequest('GET', url, token);
            return data || {};
        } catch (e) {
            return {};
        }
    },

    getStreamLink: async (token, magnet) => {
        // PRIMA: verifica se RD è online→ se no non tentare
        try {
            const ping = await rdRequest('GET', 'https://api.real-debrid.com/rest/1.0/user', token);
            if (!ping) return null;
        } catch {
            return null;
        }

        try {
            const addUrl = "https://api.real-debrid.com/rest/1.0/torrents/addMagnet";
            const body = new URLSearchParams();
            body.append("magnet", magnet);

            const addRes = await rdRequest('POST', addUrl, token, body);
            if (!addRes || !addRes.id) return null;
            const torrentId = addRes.id;

            let info = await rdRequest('GET', `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, token);
            if (!info) return null;

            if (info.status === 'waiting_files_selection') {
                const selUrl = `https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`;
                const selBody = new URLSearchParams();
                selBody.append("files", "all");
                await rdRequest('POST', selUrl, token, selBody);
                info = await rdRequest('GET', `https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, token);
            }

            if (!info || !info.links?.length) return null;

            const linkToUnrestrict = info.links[0];

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
