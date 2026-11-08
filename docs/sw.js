const V='street-knowledge-v11';
const SHELL=['./','index.html','style.css','app.js','photo-pick.js','public-pins.js','presence.js','vision.js','social.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png',
'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js','https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css','https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  // never cache live APIs
  if(/photon\.komoot|router\.project-osrm|shiftr\.io|emqx|hivemq/.test(u.host))return;
  const isShell=u.origin===location.origin||u.host==='unpkg.com';
  const isTile=/openfreemap\.org/.test(u.host)||/transformers|onnxruntime|mobileclip/.test(u.href)||/huggingface\.co|hf\.co|cdn-lfs/.test(u.host);
  if(isShell){ // network first, fallback cache
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));
  } else if(isTile){ // cache first for map assets
    e.respondWith(caches.open(V+'-tiles').then(c=>c.match(e.request).then(m=>m||fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}))));
  }
});
