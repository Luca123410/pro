🐉 Leviathan – ItaMagnet Scraper

<div align="center">
  <img src="https://img.shields.io/badge/Project-Leviathan-darkred?style=for-the-badge&logo=dragon" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js" />
  <img src="https://img.shields.io/badge/Status-ACTIVE-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Language-JavaScript-F7DF1E?style=for-the-badge&logo=javascript" />
  <img src="https://img.shields.io/badge/Engine-AI%20Enhanced-blueviolet?style=for-the-badge" />
</div><div align="center">
  <h3>🇮🇹 Il Metamotore Torrent Italiano più potente mai creato.</h3>
  <b>Adaptive Timeout • Italian-First Engine • Anti-Bot Intelligence • Magnet Boosting</b><br><br>
</div>
---

⚡ Cos’è Leviathan?

Leviathan è un metamotore avanzato scritto in Node.js che aggrega i migliori index torrent italiani e internazionali, filtrando e raffinando in modo intelligente tutti i risultati.

Leviathan non è uno scraper.
È un motore predittivo, aggressivo e intelligente, costruito per restituire risultati italiani affidabili e ultra-puliti.

🔥 Novità nella Release LEVIATHAN

Engine rinominato e consolidato nel formato Leviathan Core

Timeout adattivi di nuova generazione (Fast Lane Mode)

Filtro Italiano migliorato per ZERO falsi positivi

Ottimizzazione Cloudflare Bypass

Magnet Injection con tracker premium rivisti e aggiornati



---

🐉 Perché Leviathan È Diverso?

🇮🇹 Italian First (ITA ONLY Engine)

Il suo algoritmo isItalianResult() filtra con precisione chirurgica:

ITA

AC3 / DTS

MULTI (con ITA)

SUB-ITA

audio CAM/TS filtrati automaticamente


🏎️ Adaptive Latency Engine

Leviathan misura dinamicamente la velocità delle fonti:

Fast Lane – 3000ms
Perfetto per API e siti rapidi → Knaben, TPB, Il Corsaro Nero

Deep Scan – 5000ms
Per siti lenti o con Cloudflare → TorrentGalaxy, 1337x, Lime


🛡️ Anti-Bot Intelligence

cloudscraper automatico

rotazione UA randomizzata

fallback intelligente in caso di challenge


🧠 Smart Parsing Potenziato

riconoscimento stagioni/episodi

parsing anno reale

merge anti-duplicati

normalizzazione titoli


💉 Tracker Magnet Injection

Aggiunge ai magnet solo tracker performanti, testati su reti reali:

OpenTrackr

Quad Tracker

Lubitor

Stagnet & altri UDP ottimizzati



---

📦 Installazione

npm install axios cheerio cloudscraper


---

💻 Utilizzo

const { searchMagnet } = require("./engines.js");

async function main() {
    console.log("🔍 Leviathan sta scandagliando le profondità...");

    const results = await searchMagnet("Inception", "2010", "movie", null);

    // Serie con ID IMDb (estrae automaticamente season/episode)
    // const results = await searchMagnet("Breaking Bad", null, "series", "tt0903747:1:1");

    console.log(`\n🐉 Leviathan ha riportato ${results.length} risultati:\n`);

    results.slice(0, 5).forEach(t => {
        console.log(`📄 Titolo: ${t.title}`);
        console.log(`💾 Size: ${t.size} | 🌱 Seeders: ${t.seeders}`);
        console.log(`🔗 Magnet: ${t.magnet.substring(0, 80)}...`);
        console.log(`🏗️ Fonte: ${t.source}\n`);
    });
}

main();


---

🌐 Motori Supportati (Leviathan Network)

Motore	Area	Timeout	Stato

Il Corsaro Nero	🇮🇹 ITA Only	3000ms	🟢 FAST
Knaben (API)	🌍 Global	3000ms	🟢
The Pirate Bay	🌍 API	3000ms	🟢
UIndex	🌍 Aggr.	4000ms	🟢
1337x	🌍 General	5000ms	🟡 Cloudflare
TorrentGalaxy	🌍 General	5000ms	🟢
Nyaa	🇯🇵 Anime	5000ms	🟢
BitSearch	🌍 General	5000ms	🟢
LimeTorrents	🌍 General	5000ms	🟢
GloTorrents	🌍 General	5000ms	🟢



---

⚙️ Configurazione Avanzata

const CONFIG = {
    TIMEOUT: 5000,
    TIMEOUT_API: 3000,
    USER_AGENTS: [...],
    TRACKERS: [...],  
};


---

⚠️ Disclaimer

Leviathan è uno strumento di ricerca pensato solo per scopi educativi e di test.
L’autore non incoraggia l’utilizzo improprio.
Scaricare contenuti protetti da copyright è illegale.


---

<div align="center">
  <h3>🐉 Leviathan vive nelle profondità del web… e porta a galla solo il meglio.</h3>
  <sub>Made with ❤️, ☕ e pura ingegneria aggressiva.</sub>
</div>
