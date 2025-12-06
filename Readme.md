<div align="center">

  <img src="https://api.iconify.design/game-icons:sea-dragon.svg?color=%2300eaff&width=200" style="filter: drop-shadow(0 0 10px rgba(0, 234, 255, 0.4)); margin-bottom: 15px;" />

  <h1 style="font-size: 5rem; font-weight: 800; margin: 0; line-height: 1; letter-spacing: -2px; color: #fff;">
    LEVIATHAN
  </h1>

  <div style="font-size: 1.1rem; color: #94a3b8; margin-top: 10px; font-weight: 400; letter-spacing: 1px;">
    ADVANCED TORRENT AGGREGATION PROTOCOL
  </div>

  <br>

  <p>
    <img src="https://img.shields.io/badge/Real_Debrid-NATIVE_SUPPORT-A2B9F0?style=for-the-badge&logo=realdebrid&logoColor=black" />
    <img src="https://img.shields.io/badge/AllDebrid-MODULE_ACTIVE-F5A623?style=for-the-badge&logo=alldebrid&logoColor=white" />
    <img src="https://img.shields.io/badge/TorBox-COMPATIBLE-7A4EE3?style=for-the-badge&logo=torbox&logoColor=white" />
  </p>

  <p>
    <img src="https://img.shields.io/badge/Node.js-v18_LTS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
    <img src="https://img.shields.io/badge/Architecture-HyperMode_v3.5-8A2BE2?style=for-the-badge&logo=dependabot&logoColor=white" />
    <img src="https://img.shields.io/badge/Status-OPERATIONAL-success?style=for-the-badge&logo=githubactions&logoColor=white" />
  </p>

  <br>

  <div style="background: #050a10; border: 1px solid rgba(0, 234, 255, 0.15); border-radius: 8px; padding: 25px; width: 85%; max-width: 800px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
    <strong style="font-size: 1.3rem; color: #00eaff; display: block; margin-bottom: 10px;">
      🇮🇹 Engineered for Italian Content Precision
    </strong>
    <span style="color: #cbd5e1; line-height: 1.6; font-size: 1rem;">
      Leviathan ridefinisce lo standard dei metamotori torrent attraverso un'architettura <b>Italy-First</b>.
      Integra un sistema di validazione semantica dei titoli, gestione automatizzata delle challenge WAF e un algoritmo di routing a bassa latenza per garantire risultati pertinenti e immediati.
    </span>
  </div>

  <br>

  <p>
    <img src="https://img.shields.io/badge/⚡_Adaptive-Latency_Scaling-000?style=for-the-badge&labelColor=00eaff" />
    <img src="https://img.shields.io/badge/🔍_Smart-Query_Morphing-000?style=for-the-badge&labelColor=00eaff" />
    <img src="https://img.shields.io/badge/🛡️_WAF-Bypass_Protocol-000?style=for-the-badge&labelColor=00eaff" />
    <img src="https://img.shields.io/badge/🔗_Magnet-Fusion_Engine-000?style=for-the-badge&labelColor=00eaff" />
  </p>

  <hr style="border: 0; height: 1px; background: linear-gradient(to right, transparent, #00eaff, transparent); margin: 40px auto; width: 60%; opacity: 0.5;">

</div>

## ⚡ Architettura del Sistema

> **Leviathan trascende il concetto di scraper tradizionale.** È un motore di aggregazione predittivo progettato per navigare ecosistemi torrent complessi, restituendo dataset puliti, validati e ordinati per rilevanza.

Il core, sviluppato in **Node.js**, orchestra scansioni parallele sui principali index mondiali e italiani. Utilizza una logica proprietaria per distinguere le sorgenti in base alla latenza di risposta, applicando timeout dinamici e tecniche di evasione anti-bot.

### 🔥 Release 2.0 Highlights

* 🚀 **Core Refactoring:** Motore riscritto per massimizzare stabilità e concorrenza.
* 🏎️ **Fast Lane Mode:** Gestione intelligente dei timeout per API ad alta velocità.
* 🇮🇹 **Strict ITA Validation:** Filtri regex chirurgici per l'eliminazione dei falsi positivi.
* 🛡️ **Cloudscraper Integration:** Ottimizzazione avanzata per il superamento dei controlli Cloudflare.
* 💉 **Magnet Injection:** Arricchimento automatico dei metadati con tracker UDP Tier-1.

---

## 🔱 Core Capabilities

> Il sistema si distingue per un approccio algoritmico proprietario che privilegia la **precisione semantica** sulla forza bruta.

### 1. 🇮🇹 ITA-Strict Validation Protocol
L'algoritmo `isItalianResult()` non esegue una semplice ricerca di stringhe. Applica un filtro **semantico** che analizza il payload per garantire la pertinenza.
* **Positive Matching:** Targetizza tag specifici come `AC3`, `DTS`, `MULTI`, `SUB-ITA`.
* **False Positive Kill-Switch:** Elimina automaticamente release `CAM`, `TS`, e fake files o re-encode di bassa qualità.
* **Risultato:** Dataset pulito al 99.9%. Se non è italiano, non passa.

### 2. ⚡ Adaptive Latency Architecture
Leviathan non tratta tutte le sorgenti allo stesso modo. Utilizza un'euristica predittiva per modulare i timeout:
* 🟢 **Fast Lane (3000ms):** Canale prioritario per API JSON e indici ottimizzati *(Knaben, TPB, Corsaro)*.
* 🔵 **Deep Scan (5000ms):** Scansione profonda per portali HTML complessi o protetti *(1337x, Galaxy)*.
* *Il sistema bilancia automaticamente velocità e completezza.*

### 3. 🛡️ Advanced WAF Evasion
Un layer di sicurezza integrato gestisce l'interazione con i sistemi di protezione perimetrale (Web Application Firewalls).
* **Cloudflare Bypass:** Risoluzione automatica delle challenge JS tramite `cloudscraper`.
* **Identity Rotation:** Rotazione dinamica degli `User-Agent` per simulare traffico organico.
* **Resilience:** Fallback intelligenti che scartano i nodi morti senza interrompere il ciclo di ricerca.

### 4. 🧬 Metadata Fusion & Tracker Injection
Non si limita a trovare il link. Lo potenzia.
* **Smart Parsing:** Normalizzazione regex per Stagioni/Episodi (`S01E01`, `1x01`) indipendentemente dal formato sorgente.
* **Magnet Boosting:** Inietta nel payload una lista curata di **Tracker UDP Tier-1** *(OpenTrackr, Quad, Lubitor)* per massimizzare la velocità di aggancio dei peer e ridurre il tempo di pre-buffering.

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

> [!TIP]
> **Status Operativo:**
> * ✔️ **Full Auto:** Avvio completamente automatizzato senza intervento umano.
> * ✔️ **Zero Config:** Nessuna configurazione manuale complessa richiesta.
> * ✔️ **High Performance:** Ideale per Server VPS, NAS e ambienti Home Lab 24/7.


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

<div align="center"> <sub>Engineered with ❤️ & ☕ by the Leviathan Team</sub> </div>
