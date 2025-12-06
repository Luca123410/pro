<div align="center"> <img src="https://api.iconify.design/game-icons:sea-dragon.svg?color=%2300eaff&width=200" alt="Leviathan Logo" /> <h1 style="font-size: 4.5rem; font-weight: 900; margin: 0; letter-spacing: -4px; text-transform: uppercase;"> L E V I A T H A N </h1> <div style="font-size: 1.25rem; margin-top: -5px; opacity: 0.85;"> <em>Italian Torrent Intelligence Engine</em> </div> <br> <p> <img src="https://img.shields.io/badge/Real_Debrid-Enhanced_Access-19C2F2?style=for-the-badge&logo=realdebrid&logoColor=000" /> <img src="https://img.shields.io/badge/AllDebrid-Full_Integration-F5A623?style=for-the-badge&logo=alldebrid&logoColor=fff" /> <img src="https://img.shields.io/badge/TorBox-Core_Support-7A4EE3?style=for-the-badge" /> </p> <p> <img src="https://img.shields.io/badge/Node.js-18%2B-3C873A?style=for-the-badge&logo=node.js&logoColor=fff" /> <img src="https://img.shields.io/badge/Engine-HyperMode_3.5-8A2BE2?style=for-the-badge" /> <img src="https://img.shields.io/badge/Status-ONLINE-success?style=for-the-badge" /> </p> <br> <div style="background:#0a0f14; border:1px solid #00eaff33; padding:20px 28px; border-radius:12px; width:80%; max-width:780px; color:#d3faff;"> <strong style="font-size:1.45rem; color:#00eaff;">🇮🇹 L’Engine di Ricerca Torrent Progettato per l’Ecosistema Italiano</strong> <br><br> Leviathan combina un motore multicrawler avanzato, tecniche di fingerprint evasive e un sistema di filtraggio semantico ottimizzato per contenuti italiani. Architettura scalabile, latenza minima e risultati accurati in ogni condizione di rete. Perfetto per integrazione in servizi, app e piattaforme autonome. </div> <br> <p style="font-size: 1.15rem; max-width: 700px;"> <code>Adaptive Payload Routing</code> ⚡ <code>Query Morphing Engine</code> ⚡ <code>Stealth Header Rotation</code> ⚡ <code>Magnet Fusion Core</code> </p> <br> <hr style="border:0;height:1px;width:75%;background:linear-gradient(to right,transparent,#00eaff,transparent);margin:35px auto;" /> </div>
⚡ Cos’è Leviathan?

Leviathan è un torrent intelligence engine, progettato per fornire risultati affidabili, contestuali e ottimizzati per il mercato italiano.

Basato su Node.js, sfrutta un'architettura multi-provider con scoring dinamico che:

valuta la qualità degli index in tempo reale

applica timeout progressivi

aggira meccanismi anti-bot e rate-limit

ripulisce automaticamente i risultati non pertinenti

privilegia fonti ad alta velocità e basso rumore semantico

🔥 Novità della Release LEVIATHAN

🚀 Core Engine 3.5: Riscrittura del motore con stabilità superiore e pipeline parallela ottimizzata.

🏎️ Fast Lane Mode: Sistema intelligente di priorità basato su latenza e affidabilità del provider.

🇮🇹 ITA Semantic Filter: Nuovo modello di filtraggio linguistico per eliminare falsi positivi.

🛡️ Cloudflare Bypass v2: Ottimizzazione di chiamate cloudscraper e fallback automatici.

💉 Magnet Injection 2.0: Integration tier di tracker UDP affidabili e ad alta resa.

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

