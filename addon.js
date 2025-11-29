// addon.js - Corsaro Brain ITA FULL WAIT v25.8.2
const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const NodeCache = require("node-cache");
const Bottleneck = require("bottleneck");

// --- SCRAPER ---
const scrapers = {
  RD: require("./rd"),
  Corsaro: require("./corsaro"),
  Knaben: require("./knaben"),
  TorrentMagnet: require("./torrentmagnet"),
  UIndex: require("./uindex"),
  External: require("./external"),
};

// --- CONFIG ---
const CONFIG = {
  CINEMETA_URL: "https://v3-cinemeta.strem.io",
  REAL_SIZE_FILTER: 80 * 1024 * 1024,
  TIMEOUT_TMDB: 4000,
  SCRAPER_TIMEOUT: 4500,
  MAX_RESULTS: 100,
};

const CACHE_TTL = { STD: 300, CHECK: 60 };
const CACHE_HEADERS = { cacheMaxAge: 7200, staleRevalidate: 43200, staleError: 86400 };

// --- LIMITERS ---
const LIMITERS = {
  scraper: new Bottleneck({ maxConcurrent: 40, minTime: 10 }),
  rd: new Bottleneck({ maxConcurrent: 8, minTime: 100 }),
};

// --- APP ---
const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
const internalCache = new NodeCache({ stdTTL: CACHE_TTL.STD, checkperiod: CACHE_TTL.CHECK, useClones: false });

// --- MANIFEST ---
const MANIFEST_BASE = Object.freeze({
  id: "org.community.corsaro-brain-ita-fullwait",
  version: "25.8.2",
  name: "Corsaro + TorrentMagnet (FULL WAIT)",
  description: "🇮🇹 Tutti i risultati ITA, RD sicuri, risposta solo quando tutto pronto",
  resources: ["catalog", "stream"],
  types: ["movie","series"],
  catalogs:[
    { type:"movie", id:"tmdb_trending", name:"🇮🇹 Top Film Italia" },
    { type:"series", id:"tmdb_series_trending", name:"📺 Serie TV del Momento" },
    { type:"movie", id:"tmdb_4k", name:"🌟 4K UHD Italia" },
    { type:"movie", id:"tmdb_anime", name:"⛩️ Anime Movies" }
  ],
  idPrefixes:["tmdb","tt"],
  behaviorHints:{ configurable:true, configurationRequired:true },
});

// --- UTILITIES ---
const UNITS = ["B","KB","MB","GB","TB"];
const formatBytes=bytes=>{ if(!+bytes) return "0 B"; const i=Math.floor(Math.log(bytes)/Math.log(1024)); return `${(bytes/Math.pow(1024,i)).toFixed(2)} ${UNITS[i]}`; }
const parseSize=sizeStr=>{ if(!sizeStr) return 0; if(typeof sizeStr==="number") return sizeStr; const m=sizeStr.toString().match(/([\d.]+)\s*([KMGTP]?B)/i); if(!m) return 0; const val=parseFloat(m[1]); const unit=m[2].toUpperCase(); const mult={TB:1099511627776,GB:1073741824,MB:1048576,KB:1024,B:1}; return val*(mult[unit]||1); }
const getConfig=configStr=>{ try{ return JSON.parse(Buffer.from(configStr,"base64").toString()); } catch{return {};} }
const applyCacheHeaders=(res,data)=>{ if(!data) return; const maxAge=data.cacheMaxAge??CACHE_HEADERS.cacheMaxAge; const stale=data.staleRevalidate??CACHE_HEADERS.staleRevalidate; res.setHeader("Cache-Control",`max-age=${maxAge}, stale-while-revalidate=${stale}, public`); }
const timeoutPromise=ms=>new Promise(r=>setTimeout(()=>r([]),ms));
const withTimeout=(promise,ms)=>Promise.race([promise,timeoutPromise(ms)]);

// --- NORMALIZE & FILTER ---
const R_NORM=/[^a-z0-9]/g;
const normalize=str=>str.toLowerCase().replace(R_NORM,"");
const isTitleSafe=(q,f)=>{ q=normalize(q); f=normalize(f); if(q.length<5) return f.includes(q); if(f.includes(q)) return true; const kws=q.split(/[^a-z0-9]/).filter(w=>w.length>3); const matches=kws.filter(k=>f.includes(k)); return matches.length>=Math.ceil(kws.length*0.7);}
const isSafeForItalian=item=>{ if(item.source==="Corsaro") return true; const t=item.title.toUpperCase(); if(t.includes("ITA")||t.includes("ITALIAN")||t.includes("MULTI")) return true; if(item.source==="Brain P2P"&&!t.includes("VOSTFR")&&!t.includes("SUBSPA")) return true; return false; }

// --- QUERY BUILDER ---
function buildSeriesQueries(meta){
  const { title, originalTitle: orig, season: s, episode: e }=meta;
  const ss=String(s).padStart(2,"0"), ee=String(e).padStart(2,"0");
  const queries=new Set([`${title} S${ss}E${ee}`,`${title} ${s}x${ee}`,`${title} S${ss}`]);
  if(orig && orig!==title){ queries.add(`${orig} S${ss}E${ee}`); queries.add(`${orig} S${ss}`); }
  return [...queries];
}
function buildMovieQueries(meta){
  const { title, originalTitle: orig, year }=meta;
  const q=[`${title} ${year}`, orig?`${orig} ${year}`:null, `${title} ITA`].filter(Boolean);
  return [...q];
}

// --- METADATA ---
async function getMetadata(id,type,tmdbKey){
  try{
    let tmdbId=id,s=1,e=1;
    if(type==="series" && id.includes(":")) [tmdbId,s,e]=id.split(":"), s=parseInt(s), e=parseInt(e);
    const { data:cData }=await axios.get(`${CONFIG.CINEMETA_URL}/meta/${type}/${tmdbId.split(":")[0]}.json`,{timeout:2000}).catch(()=>({data:{}}));
    let meta=cData?.meta?{title:cData.meta.name,originalTitle:cData.meta.name,year:cData.meta.year?.split("–")[0],isSeries:type==="series",season:s,episode:e}:null;
    if(tmdbKey){
      let url;
      if(tmdbId.startsWith("tt")) url=`https://api.themoviedb.org/3/find/${tmdbId}?api_key=${tmdbKey}&language=it-IT&external_source=imdb_id`;
      else if(tmdbId.startsWith("tmdb:")) url=`https://api.themoviedb.org/3/${type==="movie"?"movie":"tv"}/${tmdbId.split(":")[1]}?api_key=${tmdbKey}&language=it-IT`;
      if(url){
        const { data }=await axios.get(url,{timeout:CONFIG.TIMEOUT_TMDB}).catch(()=>({data:null}));
        if(data){
          const det=data.movie_results?.[0]||data.tv_results?.[0]||data;
          if(det) meta={...meta,title:det.title||det.name||meta?.title,originalTitle:det.original_title||det.original_name||meta?.originalTitle,year:(det.release_date||det.first_air_date)?.split("-")[0]||meta?.year,isSeries:type==="series",season:s,episode:e};
        }
      }
    }
    return meta;
  }catch{return null;}
}

// --- STREAM INFO ---
function extractStreamInfo(title){
  const t=title.toLowerCase(); let q="HD"; if(/2160p|4k|uhd/.test(t)) q="4K"; else if(/1080p/.test(t)) q="1080p"; else if(/720p/.test(t)) q="720p"; else if(/480p|sd/.test(t)) q="SD";
  const extras=[]; if(/hdr|10bit/.test(t)) extras.push("HDR"); if(/dolby|vision|dv/.test(t)) extras.push("DV"); if(/h265|hevc/.test(t)) extras.push("HEVC");
  let lang=""; if(/ita/.test(t)) lang="ITA 🇮🇹"; else if(/multi/.test(t)) lang="MULTI 🌐"; else lang="ENG/SUB 🇬🇧";
  return { quality:q, info:extras.join(" | "), lang };
}

async function resolveRdLink(rdKey,item,meta,showFake){
  try{
    const streamData=await scrapers.RD.getStreamLink(rdKey,item.magnet);
    if(!streamData) return null;
    if(streamData.type==="ready" && streamData.size<CONFIG.REAL_SIZE_FILTER) return null;
    if(streamData.filename?.match(/\.(rar|zip|exe|txt)$/i)) return null;
    const fileTitle=streamData.filename||item.title;
    const { quality, info, lang }=extractStreamInfo(fileTitle);
    const size=streamData.size?formatBytes(streamData.size):(item.size||"?? GB");
    let titleStr=`📄 ${fileTitle}\n💾 ${size} | ${quality}`;
    if(info) titleStr+=` | ${info}`; titleStr+=`\n🔊 ${lang}`;
    return { name:`[RD ⚡] ${item.source}`, title:titleStr, url:streamData.url, behaviorHints:{notWebReady:false,bingieGroup:"corsaro-rd"} };
  }catch(e){
    if(showFake) return { name:`[P2P ⚠️] ${item.source}`, title:`${item.title}\n⚠️ Cache RD Assente`, url:item.magnet, behaviorHints:{notWebReady:true} };
    return null;
  }
}

// --- STREAM GENERATOR FULL WAIT ---
async function generateStream(type,id,config,userConfStr){
  if(!config.rd) return { streams:[{ name:"⚠️ CONFIG", title:"Serve RealDebrid API Key" }] };
  const cacheKey=`str:${userConfStr}:${type}:${id}`;
  const cached=internalCache.get(cacheKey); if(cached) return cached;
  const meta=await getMetadata(id,type,config.tmdb); if(!meta) return { streams:[] };
  const queries=meta.isSeries?buildSeriesQueries(meta):buildMovieQueries(meta);
  const onlyIta=config.filters?.onlyIta!==false;

  // 1. Raccogli tutti i principali scraper
  const mainScrapers=[scrapers.Corsaro,scrapers.UIndex,scrapers.TorrentMagnet,scrapers.Knaben];
  let promises=[];
  queries.forEach(q=>mainScrapers.forEach(s=>promises.push(LIMITERS.scraper.schedule(()=>withTimeout(s.searchMagnet(q,meta.year,type,id.split(":")[0]),CONFIG.SCRAPER_TIMEOUT).catch(()=>[])))));
  let resultsRaw=(await Promise.all(promises)).flat();
  resultsRaw=resultsRaw.filter(item=>item?.magnet && isTitleSafe(meta.title,item.title) && (!onlyIta || isSafeForItalian(item)));

  // 2. External se risultati <5
  if(resultsRaw.length<5){
    const extPromises=[];
    queries.forEach(q=>extPromises.push(LIMITERS.scraper.schedule(()=>withTimeout(scrapers.External.searchMagnet(q,meta.year,type,id.split(":")[0]),CONFIG.SCRAPER_TIMEOUT).catch(()=>[]))));
    const extResults=(await Promise.all(extPromises)).flat();
    resultsRaw=[...resultsRaw,...extResults.filter(i=>i?.magnet && isSafeForItalian(i) && isTitleSafe(meta.title,i.title))];
  }

  // 3. Filtri finali e ordinamento
  const seen=new Set(); let cleanResults=[];
  for(const item of resultsRaw){
    if(!item?.magnet) continue;
    const hash=item.magnet.match(/btih:([a-f0-9]{40})/i)?.[1].toUpperCase()||item.magnet;
    if(seen.has(hash)) continue;
    if(onlyIta && !isSafeForItalian(item)) continue;
    if(!isTitleSafe(meta.title,item.title)) continue;
    if(config.filters?.no4k && /2160p|4k|uhd/i.test(item.title)) continue;
    if(config.filters?.noCam && /cam|tc|ts/i.test(item.title)) continue;
    if(meta.isSeries){
      const s=meta.season,e=meta.episode;
      const matchEp=new RegExp(`s0?${s}[xe]0?${e}`,"i").test(item.title);
      const matchPack=/complete|completa|pack|stagione/i.test(item.title);
      if(!matchEp && !matchPack) continue;
    }
    seen.add(hash);
    item._size=parseSize(item.size);
    cleanResults.push(item);
  }
  cleanResults.sort((a,b)=>b._size-a._size);
  cleanResults=cleanResults.slice(0,CONFIG.MAX_RESULTS);
  if(!cleanResults.length) return { streams:[{ name:"⛔", title:"Nessun risultato trovato" }] };

  // 4. RD link: attendi tutti prima di rispondere
  const rdPromises=cleanResults.map(item=>LIMITERS.rd.schedule(()=>resolveRdLink(config.rd,item,meta,config.filters?.showFake)));
  const streams=(await Promise.all(rdPromises)).filter(Boolean);
  if(!streams.length) streams.push({ name:"⚠️ INFO", title:"Trovati torrent ma nessun link RD attivo." });

  const res={ streams, cacheMaxAge:1800, staleRevalidate:3600 };
  internalCache.set(cacheKey,res);
  return res;
}

// --- CATALOG GENERATOR ---
async function generateCatalog(type,id,config,skip=0){
  const page=Math.floor(skip/20)+1;
  const key=`c:${type}:${id}:${page}`;
  const cached=internalCache.get(key); if(cached) return cached;
  if(!config.tmdb) return { metas:[] };
  const endpoints={ tmdb_trending:"/trending/movie/day", tmdb_series_trending:"/trending/tv/day", tmdb_4k:"/discover/movie?sort_by=popularity.desc&primary_release_date.gte=2023-01-01", tmdb_anime:"/discover/movie?with_genres=16&with_original_language=ja&sort_by=popularity.desc" };
  try{
    const { data }=await axios.get(`https://api.themoviedb.org/3${endpoints[id]}`,{ params:{ api_key:config.tmdb, language:"it-IT", page }, timeout:3000 });
    const metas=data.results.map(m=>({ id:`tmdb:${m.id}`, type, name:m.title||m.name, poster:m.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:null, description:m.overview })).filter(m=>m.poster);
    const res={ metas, cacheMaxAge:3600 }; internalCache.set(key,res); return res;
  }catch{return { metas:[] }; }
}

// --- ROUTES ---
app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.get("/:conf/manifest.json",(req,res)=>{ const m={...MANIFEST_BASE}; m.behaviorHints={ configurable:true, configurationRequired:false }; m.logo=`${req.protocol}://${req.get("host")}/logo.png`; res.setHeader("Access-Control-Allow-Origin","*"); res.json(m); });
app.get("/:conf/catalog/:type/:id/:extra?.json",async(req,res)=>{ const skip=req.params.extra?.match(/skip=(\d+)/)?.[1]||0; const result=await generateCatalog(req.params.type,req.params.id,getConfig(req.params.conf),parseInt(skip)); res.setHeader("Access-Control-Allow-Origin","*"); applyCacheHeaders(res,result); res.json(result); });
app.get("/:conf/stream/:type/:id.json",async(req,res)=>{ const result=await generateStream(req.params.type,req.params.id.replace(".json",""),getConfig(req.params.conf),req.params.conf); res.setHeader("Access-Control-Allow-Origin","*"); applyCacheHeaders(res,result); res.json(result); });

// --- START SERVER ---
const PORT=process.env.PORT||7000;
app.listen(PORT,()=>console.log(`🚀 Corsaro Brain FULL WAIT v25.8.2 on port ${PORT}`));
