<div align="center">
  <img src="https://api.iconify.design/fa6-solid:dragon.svg?color=%2300f2ea&width=140" alt="Leviathan Logo" />

  <h1 style="margin-top: 10px;">LEVIATHAN CORE</h1>

  <img src="https://img.shields.io/badge/Project-Leviathan-darkred?style=for-the-badge&logo=dragon&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Status-ACTIVE-success?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Engine-V2.0-blueviolet?style=for-the-badge" />

  <h3>🇮🇹 Il Metamotore Torrent Italiano più potente mai creato.</h3>

  <b>Adaptive Timeout • Italian-First Engine • Anti-Bot Intelligence • Magnet Boosting</b>
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

📦 Deployment Protocol
<div align="center"> <img src="https://img.shields.io/badge/Docker-Container-2496ED?style=for-the-badge&logo=docker&logoColor=white" /> <img src="https://img.shields.io/badge/Git-Clone-F05032?style=for-the-badge&logo=git&logoColor=white" /> <img src="https://img.shields.io/badge/System-Ready-success?style=for-the-badge" /> </div>

Leviathan è progettato per operare in container isolati. Segui la procedura di inizializzazione per avviare il nucleo.

1. 📡 Inizializzazione Repository
Clona il codice sorgente nel tuo ambiente locale.

```bash
git clone https://github.com/tuo-user/leviathan-core.git
cd leviathan-core

```
2. 🐳 Container Ignition
Compila l'immagine e avvia il demone in background tramite Docker Compose.

```bash
docker-compose up -d --build
```
3. 🖥️ System Status
Verifica che il Leviathan sia emerso correttamente monitorando i log in tempo reale.

```bash
docker logs -f leviathan-core
```
Nota: Il servizio sarà accessibile all'indirizzo http://localhost:7000 (o alla porta configurata nel docker-compose.yml).


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

