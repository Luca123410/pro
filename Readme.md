<div align="center" style="font-family: 'Segoe UI', sans-serif;">

  <!-- Logo -->
  <img src="https://api.iconify.design/game-icons:sea-dragon.svg?color=%2300eaff&width=220" alt="Leviathan Logo" style="filter: drop-shadow(0 0 14px #00eaff); animation: glowPulse 2.5s infinite alternate;" />

  <!-- Title -->
  <h1 style="font-size: 4.8rem; font-weight: 900; margin: 10px 0 0; letter-spacing: -4px; text-transform: uppercase; color: #00eaff; text-shadow: 0 0 8px #00eaff, 0 0 16px #19f2ff; animation: glowPulse 3s infinite alternate;">
    L E V I A T H A N
  </h1>

  <div style="font-size: 1.25rem; margin-top: -5px; opacity: 0.85; font-style: italic;">
    Deep-Web Torrent Metacrawler • Italian Cyber Engine
  </div>

  <br>

  <!-- Badges -->
  <p>
    <img src="https://img.shields.io/badge/Real_Debrid-ENHANCED_Access-19C2F2?style=for-the-badge&logo=realdebrid&logoColor=000" alt="RealDebrid Badge" />
    <img src="https://img.shields.io/badge/AllDebrid-Integrated-F5A623?style=for-the-badge&logo=alldebrid&logoColor=fff" alt="AllDebrid Badge" />
    <img src="https://img.shields.io/badge/TorBox-Core_Support-7A4EE3?style=for-the-badge" alt="TorBox Badge" />
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-18%2B-3C873A?style=for-the-badge&logo=node.js&logoColor=fff" alt="Node.js Badge" />
    <img src="https://img.shields.io/badge/Engine_HyperMode-v3.5-8A2BE2?style=for-the-badge" alt="Engine Badge" />
    <img src="https://img.shields.io/badge/Status-ONLINE-success?style=for-the-badge" alt="Status Badge" />
  </p>

  <br>

  <!-- Main Feature Box -->
  <div style="background:#0a0f14; border:1px solid #00eaff44; padding:22px 30px; border-radius:16px; width:80%; max-width:780px; color:#d3faff; box-shadow: 0 0 18px #00eaff55; transition: all 0.3s ease; animation: glowPulse 4s infinite alternate;">
    <strong style="font-size:1.5rem; color:#00eaff; text-shadow: 0 0 6px #00eaff;">
      🇮🇹 Il Nuovo Standard dei Metamotori Torrent
    </strong>
    <br><br>
    Progettato con un approccio <em>Italy-First</em>, Leviathan integra un sistema avanzato di mitigazione anti-bot, un motore multi-provider ad alte prestazioni e un framework di scraping stealth di nuova generazione.  
    Risultati accurati, affidabili e ottimizzati per la massima efficienza nella ricerca di contenuti italiani.
  </div>

  <br>

  <!-- Neon Feature Boxes -->
  <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:18px; max-width:760px;">
    <div class="neon-box" style="--neon:#00eaff;">AI Timeout Scaling</div>
    <div class="neon-box" style="--neon:#19f2ff;">Smart Query Morphing</div>
    <div class="neon-box" style="--neon:#00d1ff;">Ultra Stealth Headers</div>
    <div class="neon-box" style="--neon:#00aaff;">Magnet Fusion Engine</div>
  </div>

  <br>

  <!-- Separator -->
  <hr style="border:0;height:2px;width:75%;background:linear-gradient(to right,transparent,#00eaff,transparent);margin:35px auto; box-shadow: 0 0 10px #00eaff33;" />

</div>

<!-- Neon Animation CSS -->
<style>
  @keyframes glowPulse {
    0% { filter: drop-shadow(0 0 8px var(--neon, #00eaff)); }
    50% { filter: drop-shadow(0 0 18px var(--neon, #00eaff)); }
    100% { filter: drop-shadow(0 0 8px var(--neon, #00eaff)); }
  }

  .neon-box {
    background:#00111a; 
    color: var(--neon); 
    padding:14px 22px; 
    border-radius:14px; 
    font-weight:600; 
    box-shadow:0 0 12px var(--neon)66; 
    transition: all 0.3s ease; 
    cursor:pointer;
    animation: neonPulse 3s infinite alternate;
  }

  .neon-box:hover {
    transform: scale(1.08);
    box-shadow: 0 0 25px var(--neon), 0 0 40px var(--neon)77;
  }

  @keyframes neonPulse {
    0% { box-shadow:0 0 8px var(--neon)55; }
    50% { box-shadow:0 0 20px var(--neon)77; }
    100% { box-shadow:0 0 8px var(--neon)55; }
  }
</style>



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

