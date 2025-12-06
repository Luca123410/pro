<p align="center">
  <img src="https://svg-banners.vercel.app/api?type=glitch&text1=LEVIATHAN%20RD&width=1000&height=200" />
</p>

<div align="center">

  <img src="https://api.iconify.design/fa6-solid:dragon.svg?color=%2300f2ea&width=150" alt="Logo" />

  <h1>LEVIATHAN</h1>

  <p>
    <img src="https://img.shields.io/badge/Real_Debrid-Supported-A2B9F0?style=for-the-badge&logo=realdebrid&logoColor=black" />
    <img src="https://img.shields.io/badge/AllDebrid-Supported-F5A623?style=for-the-badge&logo=alldebrid&logoColor=white" />
    <img src="https://img.shields.io/badge/TorBox-Supported-6E45E2?style=for-the-badge&logo=torbox&logoColor=white" />
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
    <img src="https://img.shields.io/badge/Architecture-Multi_Provider-blueviolet?style=for-the-badge" />
    <img src="https://img.shields.io/badge/Status-OPERATIONAL-success?style=for-the-badge" />
  </p>

  <h3>🇮🇹 Il metamotore torrent italiano più potente mai creato.</h3>

  <p>
    <code>Adaptive Timeout</code> ⚡ 
    <code>Italian-First Engine</code> ⚡ 
    <code>Anti-Bot Intelligence</code> ⚡ 
    <code>Magnet Boosting</code>
  </p>

</div>


---

## ⚡ Cos’è Leviathan?

> **Leviathan non è un semplice scraper.** È un motore predittivo, aggressivo e intelligente, costruito per navigare nel caos dei torrent e restituire risultati italiani affidabili e ultra-puliti.

Scritto in Node.js, **Leviathan** aggrega i migliori index mondiali, filtrando i risultati in tempo reale con una logica proprietaria che distingue le fonti veloci da quelle lente, applicando timeout dinamici e bypassando le protezioni anti-bot.

### 🔥 Novità nella Release LEVIATHAN
* 🚀 **Core Engine:** Riscritto e consolidato per massima stabilità.
* 🏎️ **Fast Lane Mode:** Timeout adattivi per API ultra-rapide.
* 🇮🇹 **Zero False Positives:** Filtro ITA migliorato con regex chirurgiche.
* 🛡️ **Cloudflare Bypass:** Ottimizzazione delle chiamate `cloudscraper`.
* 💉 **Magnet Injection:** Nuova lista di tracker UDP Tier-1.

---

## 🐉 Perché Leviathan È Diverso?

### 1. 🇮🇹 Italian First (ITA ONLY Engine)
L'algoritmo `isItalianResult()` non si limita a cercare "ITA". Analizza il nome del file scartando i falsi positivi e cercando pattern specifici:
* `ITA`, `AC3`, `DTS`, `MULTI`, `SUB-ITA`
* Esclusione automatica di `CAM`, `TS` e fake files.

### 2. 🏎️ Adaptive Latency Engine
Leviathan sa che non tutti i siti sono uguali. Modula la pazienza in base alla fonte:
* **🟢 Fast Lane (3000ms):** Per API JSON e siti ottimizzati (Knaben, TPB, Corsaro Nero).
* **🔵 Deep Scan (5000ms):** Per il crawling pesante di siti HTML complessi o protetti (1337x, Galaxy).

### 3. 🛡️ Anti-Bot Intelligence
* Gestione automatica delle challenge Cloudflare.
* Rotazione randomizzata degli `User-Agent`.
* Fallback intelligenti in caso di errore di rete.

### 4. 🧠 Smart Parsing & Injection
* Riconoscimento automatico: `S01E01` / `1x01` / `Stagione 1`.
* **Magnet Boosting:** Inietta automaticamente tracker come *OpenTrackr*, *Quad Tracker* e *Lubitor* per massimizzare la velocità di download immediata.

---

## 🌐 Leviathan Network (Motori Supportati)

Leviathan bilancia il carico su questi nodi:

| Motore | Area | Timeout | Modalità | Stato |
| :--- | :---: | :---: | :---: | :---: |
| **Il Corsaro Nero** | 🇮🇹 ITA | **3000ms** | ⚡ Fast Lane | 🟢 ONLINE |
| **Knaben** | 🌍 Global | **3000ms** | ⚡ API Json | 🟢 ONLINE |
| **The Pirate Bay** | 🌍 Global | **3000ms** | ⚡ API Json | 🟢 ONLINE |
| **UIndex** | 🌍 Global | **4000ms** | 🔹 Aggregator | 🟢 ONLINE |
| **Nyaa** | 🇯🇵 Anime | **5000ms** | 🐢 Deep Scan | 🟢 ONLINE |
| **TorrentGalaxy** | 🌍 Global | **5000ms** | 🐢 Deep Scan | 🟢 ONLINE |
| **BitSearch** | 🌍 Global | **5000ms** | 🐢 Deep Scan | 🟢 ONLINE |
| **LimeTorrents** | 🌍 Global | **5000ms** | 🐢 Deep Scan | 🟢 ONLINE |
| **GloTorrents** | 🌍 Global | **5000ms** | 🐢 Deep Scan | 🟢 ONLINE |
| **1337x** | 🌍 Global | **5000ms** | 🛡️ Cloudflare | 🟡 WARN |

---

# 📦 Installazione

🔥 Metodo 1 — Clone & Docker Compose (Full Auto-Deploy)

Il modo più semplice, pulito e professionale per avviare Leviathan Core.

```bash

📂  Clona il repository:
git clone https://github.com/tuutente/Leviathan-Core.git

➡️  Entra nella cartella:
cd Leviathan-Core

```
# 🐳 Avvia Leviathan tramite Docker Compose

```bash
docker compose up -d --build

```

> ✔️ Avvio completamente automatizzato
✔️ Nessuna configurazione manuale
✔️ Perfetto per server, VPS, NAS, ambienti isolati


---

## ⚖️ Legal Disclaimer & Liability Warning

> [!WARNING]
> **LEGGERE ATTENTAMENTE PRIMA DELL'USO**
>
> **1. Natura del Software**
> **Leviathan** è un motore di ricerca e *web scraper* automatizzato. Funziona esclusivamente come aggregatore di metadati già disponibili pubblicamente sul World Wide Web.
> * **Nessun File Ospitato:** Leviathan **NON** ospita, carica o gestisce alcun file video, torrent o contenuto protetto sui propri server.
> * **Solo Indicizzazione:** Il software si limita a processare testo HTML e restituire Magnet Link (hash) trovati su siti di terze parti, agendo come un comune browser o motore di ricerca (es. Google).
>
> **2. Scopo Educativo**
> Questo progetto è stato sviluppato esclusivamente per fini di **ricerca, studio dell'architettura web, parsing HTML e test di automazione**. Il codice sorgente è fornito "così com'è" per dimostrare capacità tecniche.
>
> **3. Responsabilità dell'Utente**
> L'autore del repository e i contributori non hanno alcun controllo su come l'utente finale utilizzerà questo software.
> * L'utente si assume la **piena ed esclusiva responsabilità** legale per l'utilizzo di Leviathan.
> * È responsabilità dell'utente verificare la conformità con le leggi locali sul copyright e sulla proprietà intellettuale (es. DMCA, EU Copyright Directive).
>
> **4. Divieto di Pirateria**
> **Scaricare e condividere opere protette da diritto d'autore senza autorizzazione è un reato.** L'autore condanna fermamente la pirateria informatica e non incoraggia, supporta o facilita in alcun modo la violazione del copyright.
>
> **Se non accetti queste condizioni, disinstalla e cancella immediatamente questo software.**

---

