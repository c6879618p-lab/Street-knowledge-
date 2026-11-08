'use strict';
/* ===== Street Knowledge ===== */
const $ = id => document.getElementById(id);
const STYLES = { light: 'https://tiles.openfreemap.org/styles/liberty', dark: 'https://tiles.openfreemap.org/styles/dark' };
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const PHOTON = 'https://photon.komoot.io/api/';
const BLUE = '#1a73e8';

/* ---------- geometry helpers ---------- */
const R = 6371000, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
function dist(a, b) { // [lon,lat]
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
// nearest point on polyline -> {d (distance off), along (m from start), idx}
function snap(p, line, cum) {
  let best = { d: Infinity, along: 0, idx: 0, pt: line[0] };
  const kx = Math.cos(rad(p[1])) * 111320, ky = 110540;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
    if (d < best.d) best = { d, idx: i, along: cum[i] + (cum[i + 1] - cum[i]) * t, pt: lerp(a, b, t) };
  }
  return best;
}
function pointAt(line, cum, m) {
  if (m <= 0) return { pt: line[0], brg: bearing(line[0], line[1]) };
  for (let i = 0; i < line.length - 1; i++) if (cum[i + 1] >= m) {
    const seg = cum[i + 1] - cum[i] || 1;
    return { pt: lerp(line[i], line[i + 1], (m - cum[i]) / seg), brg: bearing(line[i], line[i + 1]) };
  }
  const n = line.length; return { pt: line[n - 1], brg: bearing(line[n - 2], line[n - 1]) };
}
const fmtDist = m => { // imperial like US Google Maps
  const ft = m * 3.28084;
  if (ft < 1000) return Math.max(10, Math.round(ft / 10) * 10) + ' ft';
  const mi = m / 1609.34; return (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi';
};
const fmtDur = s => { const m = Math.round(s / 60); if (m < 60) return Math.max(1, m) + ' min'; return Math.floor(m / 60) + ' hr ' + (m % 60) + ' min'; };
const fmtClock = s => new Date(Date.now() + s * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function toast(msg, ms = 2500) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms); }

/* ---------- default car icons (top-down, nose up) ---------- */
function carSvg(body, roof) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 110">
<rect x="4" y="22" width="6" height="16" rx="2" fill="#222"/><rect x="50" y="22" width="6" height="16" rx="2" fill="#222"/>
<rect x="4" y="74" width="6" height="16" rx="2" fill="#222"/><rect x="50" y="74" width="6" height="16" rx="2" fill="#222"/>
<rect x="7" y="4" width="46" height="102" rx="18" fill="${body}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
<path d="M14 34 Q30 26 46 34 L43 48 Q30 44 17 48Z" fill="#9fd3ff" stroke="#333" stroke-width="1"/>
<rect x="15" y="48" width="30" height="30" rx="5" fill="${roof}"/>
<path d="M17 80 Q30 84 43 80 L45 92 Q30 96 15 92Z" fill="#9fd3ff" stroke="#333" stroke-width="1"/>
<circle cx="15" cy="10" r="3" fill="#fff7c2"/><circle cx="45" cy="10" r="3" fill="#fff7c2"/>
<rect x="13" y="101" width="7" height="3" fill="#e53935"/><rect x="40" y="101" width="7" height="3" fill="#e53935"/></svg>`);
}
const ARROW = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#fff"/><circle cx="50" cy="50" r="40" fill="${BLUE}"/><path d="M50 18 L74 76 L50 64 L26 76Z" fill="#fff"/></svg>`);
const DEFAULTS = [carSvg('#d32f2f', '#b71c1c'), carSvg('#1565c0', '#0d47a1'), carSvg('#fafafa', '#e0e0e0'), carSvg('#212121', '#000'), carSvg('#fbc02d', '#f9a825'), ARROW];

/* ---------- settings persistence ---------- */
const settings = Object.assign({ img: DEFAULTS[0], size: 64, rot: 0, mode: 'cutout', turn: true, dark: false, voice: true, bg: true },
  JSON.parse(localStorage.getItem('carSettings') || '{}'));
function save() { try { localStorage.setItem('carSettings', JSON.stringify(settings)); } catch (e) { toast('Could not save image (storage full)'); } }

/* ---------- map ---------- */
const startCenter = JSON.parse(localStorage.getItem('lastPos') || 'null') || [-73.9857, 40.7484];
document.body.classList.toggle('dark', settings.dark);
const map = new maplibregl.Map({ container: 'map', style: settings.dark ? STYLES.dark : STYLES.light, center: startCenter, zoom: 15, attributionControl: { compact: true }, pitchWithRotate: true });
window.__map = map;

/* car marker */
const carEl = document.createElement('div'); carEl.className = 'car-marker';
const carInner = document.createElement('div'); carInner.className = 'car-inner';
const carImg = document.createElement('img'); carInner.appendChild(carImg); carEl.appendChild(carInner);
const car = new maplibregl.Marker({ element: carEl, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(startCenter);
let carShown = false;
function applyCar() {
  carImg.src = settings.img; $('carBtnImg').src = settings.img; $('previewImg').src = settings.img;
  carEl.style.width = carEl.style.height = settings.size + 'px';
  carInner.classList.toggle('badge', settings.mode === 'badge');
  carInner.style.transform = `rotate(${settings.rot}deg)`;
  $('previewImg').style.transform = `rotate(${settings.rot}deg)`;
  $('previewImg').style.borderRadius = settings.mode === 'badge' ? '50%' : '0';
  $('previewImg').style.border = settings.mode === 'badge' ? '4px solid #fff' : '0';
  $('sizeRange').value = settings.size; $('rotRange').value = settings.rot; $('rotVal').textContent = settings.rot + '°';
  $('frameMode').value = settings.mode; $('rotateWithHeading').checked = settings.turn; $('bgRemove').checked = settings.bg;
}
applyCar();

/* route layers (re-added after style switch) */
let routeGeo = null, destMarker = null;
function addRouteLayers() {
  if (map.getSource('route')) return;
  map.addSource('route', { type: 'geojson', data: routeGeo || { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1557b0', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 18, 18] } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#4285f4', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 18, 13] } });
}
map.on('style.load', addRouteLayers);
map.on('rotate', () => { $('compassNeedle').style.transform = `rotate(${-90 - map.getBearing()}deg)`; });

/* ---------- location state ---------- */
let pos = null, heading = 0, speed = 0, follow = true, lastFix = null, watchId = null;
function onPosition(lon, lat, hdg, spd, simulated) {
  const p = [lon, lat];
  if (lastFix) {
    const moved = dist(lastFix, p);
    if (hdg == null || isNaN(hdg)) { if (moved > 2) heading = bearing(lastFix, p); } else heading = hdg;
  } else if (hdg != null && !isNaN(hdg)) heading = hdg;
  if (!lastFix || dist(lastFix, p) > 2) lastFix = p;
  pos = p; speed = spd || 0;
  car.setLngLat(p); if (!carShown) { car.addTo(map); carShown = true; }
  car.setRotation(settings.turn ? heading : 0);
  $('speedVal').textContent = Math.round(speed * 2.23694);
  if (follow) {
    const opts = { center: p, duration: simulated ? 0 : 900, essential: true };
    if (nav.active) { opts.bearing = heading; opts.pitch = 55; opts.zoom = Math.max(map.getZoom(), 16.5); opts.offset = [0, window.innerHeight * 0.2]; }
    if (simulated) map.jumpTo(opts); else map.easeTo(opts);
  }
  if (nav.active) navUpdate();
  if (window.presenceOnPos) window.presenceOnPos();
  if (!simulated) try { localStorage.setItem('lastPos', JSON.stringify(p)); } catch (e) {}
}
function startGeo() {
  if (!('geolocation' in navigator)) { toast('Location not supported on this device'); return; }
  if (watchId != null) return;
  watchId = navigator.geolocation.watchPosition(
    g => { if (!sim.on) onPosition(g.coords.longitude, g.coords.latitude, g.coords.heading, g.coords.speed, false); },
    e => toast(e.code === 1 ? 'Allow location access to see your car on the map' : 'Waiting for GPS…', 4000),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function setFollow(on) { follow = on; $('locateBtn').classList.toggle('active', on); }
map.on('dragstart', e => { if (e.originalEvent) setFollow(false); });
$('locateBtn').onclick = () => {
  startGeo(); setFollow(true);
  if (pos) map.easeTo({ center: pos, zoom: Math.max(map.getZoom(), 16), bearing: nav.active ? heading : map.getBearing(), duration: 800 });
};
$('compassBtn').onclick = () => map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
$('darkBtn').onclick = () => {
  settings.dark = !settings.dark; save(); document.body.classList.toggle('dark', settings.dark);
  $('darkBtn').textContent = settings.dark ? '☀️' : '🌙';
  map.setStyle(settings.dark ? STYLES.dark : STYLES.light);
};
$('darkBtn').textContent = settings.dark ? '☀️' : '🌙';

/* ---------- search (Photon, debounced) ---------- */
let searchTimer = null, searchCtl = null;
$('searchInput').addEventListener('input', () => {
  const q = $('searchInput').value.trim();
  $('clearSearch').classList.toggle('hidden', !q);
  clearTimeout(searchTimer);
  if (q.length < 3) { $('suggestions').classList.add('hidden'); return; }
  searchTimer = setTimeout(() => doSearch(q), 400);
});
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const f = $('suggestions').querySelector('.sug'); if (f) f.click(); } });
$('clearSearch').onclick = () => { $('searchInput').value = ''; $('clearSearch').classList.add('hidden'); $('suggestions').classList.add('hidden'); };
async function doSearch(q) {
  if (searchCtl) searchCtl.abort(); searchCtl = new AbortController();
  const c = pos || map.getCenter().toArray();
  const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=${c[1]}&lon=${c[0]}`;
  try {
    const r = await fetch(url, { signal: searchCtl.signal }); const j = await r.json();
    const box = $('suggestions'); box.innerHTML = '';
    if (!j.features.length) { box.innerHTML = '<div class="sug"><span class="s">No results</span></div>'; }
    j.features.forEach(f => {
      const p = f.properties, name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.city;
      const sub = [p.housenumber && p.name ? null : null, p.street, p.city || p.county, p.state, p.country].filter(Boolean).filter(x => x !== name).join(', ');
      const d = document.createElement('div'); d.className = 'sug';
      d.innerHTML = `<span class="pin">📍</span><div><div class="t"></div><div class="s"></div></div>`;
      d.querySelector('.t').textContent = name; d.querySelector('.s').textContent = sub;
      d.onclick = () => { box.classList.add('hidden'); $('searchInput').value = name; $('searchInput').blur(); chooseDest(f.geometry.coordinates, name, sub); };
      box.appendChild(d);
    });
    box.classList.remove('hidden');
  } catch (e) { if (e.name !== 'AbortError') toast('Search unavailable, try again'); }
}

/* ---------- routing (OSRM) ---------- */
let route = null, dest = null, destInfo = null;
async function chooseDest(coord, name, sub) {
  dest = coord; destInfo = { name, sub };
  if (destMarker) destMarker.remove();
  const el = document.createElement('div'); el.className = 'dest-pin'; el.textContent = '📍';
  destMarker = new maplibregl.Marker({ element: el }).setLngLat(coord).addTo(map);
  $('placeName').textContent = name; $('placeAddr').textContent = sub || '';
  const from = pos || map.getCenter().toArray();
  if (!pos) toast('Location not found yet — routing from map center');
  await getRoute(from, coord, true);
}
async function getRoute(from, to, fit) {
  const url = `${OSRM}${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`;
  let j;
  try { const r = await fetch(url); j = await r.json(); } catch (e) { toast('Routing server busy, try again'); return false; }
  if (!j.routes || !j.routes.length) { toast('No driving route found'); return false; }
  const rt = j.routes[0], line = rt.geometry.coordinates;
  const cum = [0]; for (let i = 1; i < line.length; i++) cum[i] = cum[i - 1] + dist(line[i - 1], line[i]);
  const steps = []; let acc = 0;
  rt.legs[0].steps.forEach(s => { steps.push({ text: instr(s), icon: icon(s.maneuver), at: acc, len: s.distance, loc: s.maneuver.location, dur: s.duration }); acc += s.distance; });
  // align step start distances to our geometry
  steps.forEach(s => s.at = snap(s.loc, line, cum).along);
  route = { line, cum, steps, total: cum[cum.length - 1], duration: rt.duration };
  routeGeo = { type: 'Feature', geometry: rt.geometry, properties: {} };
  addRouteLayers(); map.getSource('route').setData(routeGeo);
  renderSheet();
  if (fit) {
    const b = new maplibregl.LngLatBounds(); line.forEach(c => b.extend(c)); setFollow(false);
    map.fitBounds(b, { padding: { top: 90, bottom: 280, left: 50, right: 90 }, bearing: 0, pitch: 0, duration: 800 });
  }
  return true;
}
function instr(s) {
  const m = s.maneuver, name = s.name || s.ref || '', on = name ? ' onto ' + name : '', mod = m.modifier || '';
  const dir = { left: 'left', right: 'right', 'slight left': 'slightly left', 'slight right': 'slightly right', 'sharp left': 'sharp left', 'sharp right': 'sharp right', uturn: 'U-turn', straight: 'straight' }[mod] || mod;
  switch (m.type) {
    case 'depart': return 'Head ' + compass(m.bearing_after) + (name ? ' on ' + name : '');
    case 'arrive': return 'You have arrived' + (destInfo ? ' at ' + destInfo.name : '');
    case 'turn': case 'end of road': return (mod === 'uturn' ? 'Make a U-turn' : 'Turn ' + dir) + on;
    case 'continue': case 'new name': return 'Continue' + (mod && mod !== 'straight' ? ' ' + dir : '') + (name ? ' on ' + name : '');
    case 'merge': return 'Merge' + (dir ? ' ' + dir : '') + on;
    case 'on ramp': return 'Take the ramp' + (dir ? ' on the ' + dir.replace('slightly ', '') : '') + on;
    case 'off ramp': return 'Take the exit' + (dir ? ' on the ' + dir.replace('slightly ', '') : '') + on;
    case 'fork': return 'Keep ' + dir.replace('slightly ', '') + ' at the fork' + on;
    case 'roundabout': case 'rotary': return 'At the roundabout, take exit ' + (m.exit || 1) + on;
    case 'exit roundabout': case 'exit rotary': return 'Exit the roundabout' + on;
    default: return (dir ? 'Go ' + dir : 'Continue') + on;
  }
}
const compass = b => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(b / 45) % 8];
function icon(m) {
  if (m.type === 'arrive') return '🏁'; if (m.type === 'roundabout' || m.type === 'rotary') return '⟳';
  return { left: '↰', right: '↱', 'slight left': '↖', 'slight right': '↗', 'sharp left': '↰', 'sharp right': '↱', uturn: '↶', straight: '↑' }[m.modifier] || '↑';
}
function renderSheet() {
  $('eta').textContent = fmtDur(route.duration); $('dist').textContent = '(' + fmtDist(route.total) + ')';
  $('arrive').textContent = 'Arrive around ' + fmtClock(route.duration) + ' · Fastest route';
  const ol = $('steps'); ol.innerHTML = '';
  route.steps.forEach(s => { const li = document.createElement('li'); li.textContent = s.icon + '  ' + s.text; const sm = document.createElement('small'); sm.textContent = s.len ? fmtDist(s.len) : ''; li.appendChild(sm); ol.appendChild(li); });
  $('sheet').classList.remove('hidden'); document.body.classList.add('sheet-open');
}
$('stepsBtn').onclick = () => $('steps').classList.toggle('hidden');
$('closeRoute').onclick = clearRoute;
function clearRoute() {
  stopNav(); route = null; routeGeo = null; dest = null;
  if (map.getSource('route')) map.getSource('route').setData({ type: 'FeatureCollection', features: [] });
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $('sheet').classList.add('hidden'); document.body.classList.remove('sheet-open');
}

/* ---------- navigation ---------- */
const nav = { active: false, stepIdx: 0, spoken: {}, offCount: 0, rerouting: false };
$('startBtn').onclick = startNav;
function startNav() {
  if (!route) return;
  nav.active = true; nav.stepIdx = 0; nav.spoken = {}; nav.offCount = 0;
  document.body.classList.add('navigating'); document.body.classList.remove('sheet-open');
  $('sheet').classList.add('hidden'); $('navBanner').classList.remove('hidden'); $('navBar').classList.remove('hidden'); $('speedPill').classList.remove('hidden');
  setFollow(true);
  if (!pos) { const p = pointAt(route.line, route.cum, 0); onPosition(p.pt[0], p.pt[1], p.brg, 0, true); }
  else { map.easeTo({ center: pos, bearing: heading, pitch: 55, zoom: 17, duration: 1000 }); navUpdate(); }
  say(route.steps[0].text);
}
function stopNav() {
  nav.active = false; document.body.classList.remove('navigating');
  $('navBanner').classList.add('hidden'); $('navBar').classList.add('hidden'); $('speedPill').classList.add('hidden');
  speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel();
  map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
}
$('exitNav').onclick = () => { stopSim(); stopNav(); if (route) renderSheet(); };
$('voiceBtn').onclick = () => { settings.voice = !settings.voice; save(); $('voiceBtn').textContent = settings.voice ? '🔊' : '🔇'; };
$('voiceBtn').textContent = settings.voice ? '🔊' : '🔇';
function say(t) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  try { const u = new SpeechSynthesisUtterance(t); u.rate = 1; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
}
function navUpdate() {
  if (!route || !pos) return;
  const s = snap(pos, route.line, route.cum);
  // off-route detection -> reroute
  if (s.d > 45 && !sim.on) { if (++nav.offCount >= 3 && !nav.rerouting) reroute(); } else nav.offCount = 0;
  const along = s.along, steps = route.steps;
  let i = steps.findIndex(st => st.at > along + 5); if (i < 0) i = steps.length - 1;
  nav.stepIdx = i;
  const next = steps[i], toNext = Math.max(0, next.at - along), remain = route.total - along;
  $('nbIcon').textContent = next.icon; $('nbDist').textContent = fmtDist(toNext); $('nbInstr').textContent = next.text;
  const remSec = route.duration * (remain / route.total);
  $('navEta').textContent = fmtDur(remSec); $('navRemain').textContent = fmtDist(remain) + ' · ' + fmtClock(remSec);
  const key = i + ':';
  if (toNext < 400 && toNext > 120 && !nav.spoken[key + 'far']) { nav.spoken[key + 'far'] = 1; say('In ' + fmtDist(toNext).replace('ft', 'feet').replace('mi', 'miles') + ', ' + next.text); }
  if (toNext <= 60 && !nav.spoken[key + 'now']) { nav.spoken[key + 'now'] = 1; say(next.text); }
  if (remain < 25) { say('You have arrived'); toast('You have arrived! 🎉', 4000); stopSim(); setTimeout(() => { stopNav(); clearRoute(); }, 2500); nav.active = false; }
}
async function reroute() {
  nav.rerouting = true; toast('Rerouting…');
  const ok = await getRoute(pos, dest, false);
  nav.rerouting = false; nav.offCount = 0; nav.spoken = {};
  if (ok) { $('sheet').classList.add('hidden'); document.body.classList.remove('sheet-open'); say('Rerouting'); }
}

/* ---------- simulate drive ---------- */
const sim = { on: false, raf: 0, m: 0, t: 0, speed: 20 };
$('simBtn').onclick = () => sim.on ? stopSim() : startSim();
function startSim() {
  sim.on = true; $('simBtn').classList.add('active'); $('simBtn').textContent = '■';
  if (route) { sim.m = pos ? snap(pos, route.line, route.cum).along : 0; if (!nav.active) startNav(); }
  else toast('Demo: driving in circles. Search a place to simulate a route.');
  sim.center = pos || map.getCenter().toArray(); sim.ang = 0;
  setFollow(true); sim.t = performance.now(); sim.raf = requestAnimationFrame(simStep);
}
function stopSim() { sim.on = false; cancelAnimationFrame(sim.raf); $('simBtn').classList.remove('active'); $('simBtn').textContent = '▶︎'; }
function simStep(now) {
  if (!sim.on) return;
  const dt = Math.min(0.1, (now - sim.t) / 1000); sim.t = now;
  if (route) {
    // slow down near turns for realism
    const next = route.steps[nav.stepIdx]; const toNext = next ? next.at - sim.m : 999;
    const target = toNext < 60 ? 9 : 22; sim.speed += (target - sim.speed) * dt;
    sim.m += sim.speed * dt * (window.SIM_MULT || 3);
    const p = pointAt(route.line, route.cum, Math.min(sim.m, route.total));
    onPosition(p.pt[0], p.pt[1], p.brg, sim.speed, true);
    if (sim.m >= route.total) { stopSim(); return; }
  } else {
    sim.ang += dt * 0.25; const r = 0.003;
    const p = [sim.center[0] + r * Math.cos(sim.ang) / Math.cos(rad(sim.center[1])), sim.center[1] + r * Math.sin(sim.ang)];
    onPosition(p[0], p[1], null, 15, true);
  }
  sim.raf = requestAnimationFrame(simStep);
}

/* ---------- My Car panel ---------- */
$('carBtn').onclick = () => $('carPanel').classList.remove('hidden');
$('closeCar').onclick = () => $('carPanel').classList.add('hidden');
$('carPanel').onclick = e => { if (e.target.id === 'carPanel') $('carPanel').classList.add('hidden'); };
$('sizeRange').oninput = e => { settings.size = +e.target.value; applyCar(); save(); };
$('rotRange').oninput = e => { settings.rot = +e.target.value; applyCar(); save(); };
$('frameMode').onchange = e => { settings.mode = e.target.value; applyCar(); save(); };
$('rotateWithHeading').onchange = e => { settings.turn = e.target.checked; save(); car.setRotation(settings.turn ? heading : 0); };
$('bgRemove').onchange = e => { settings.bg = e.target.checked; save(); };
DEFAULTS.forEach((src, i) => {
  const b = document.createElement('button'); b.innerHTML = `<img src="${src}" alt="car ${i + 1}">`;
  b.onclick = () => { Object.assign(settings, { vehicleOk: true, img: src, rot: 0, mode: 'cutout', size: i === DEFAULTS.length - 1 ? 44 : 64 }); applyCar(); save(); };
  $('defaults').appendChild(b);
});
PhotoPick.wirePhotoSources({
  galleryBtn: $('carGalleryBtn'), cameraBtn: $('carCameraBtn'),
  galleryInput: $('fileInput'), cameraInput: $('fileInputCamera'),
  setStatus: msg => { if (msg) $('procStatus').textContent = msg; },
  nativePick: window.__nativePickPhoto || null,
  onFile: file => processCarFile(file)
});

function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function toCanvas(img, max) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
}
function trimTransparent(c) {
  const ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w * h < c.width * c.height * 0.03) return null; // too little left: removal failed
  const o = document.createElement('canvas'); o.width = w; o.height = h; o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h); return o;
}
function squareCrop(c, out) { // center-crop to square for badge
  const s = Math.min(c.width, c.height), o = document.createElement('canvas'); o.width = o.height = out;
  o.getContext('2d').drawImage(c, (c.width - s) / 2, (c.height - s) / 2, s, s, 0, 0, out, out); return o;
}
let bgLib = null;
async function processCarFile(file) {
  const st = $('procStatus');
  try {
    st.textContent = 'Loading photo…';
    const url = URL.createObjectURL(file); const img = await loadImg(url);
    const base = toCanvas(img, 1024);
    let result = null;
    if (settings.bg) {
      st.textContent = 'Removing background… (first time downloads ~40 MB, may take a minute)';
      try {
        bgLib = bgLib || await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
        const blob = await new Promise(r => base.toBlob(r, 'image/png'));
        const out = await Promise.race([bgLib.removeBackground(blob, { output: { format: 'image/png' } }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 120000))]);
        const cut = await loadImg(URL.createObjectURL(out));
        const trimmed = trimTransparent(toCanvas(cut, 1024));
        if (trimmed) result = { canvas: toCanvas(trimmed, 256), mode: 'cutout' };
      } catch (err) { console.warn('bg removal failed', err); }
    }
    if (!result) { result = { canvas: squareCrop(base, 256), mode: 'badge' }; if (settings.bg) st.textContent = 'Background removal not available here — using round badge.'; }
    settings.img = result.canvas.toDataURL('image/png'); settings.mode = result.mode;
    // Car photos are usually side-on; with a cut-out we guess the nose should point up
    if (result.mode === 'cutout' && result.canvas.width > result.canvas.height * 1.2) settings.rot = -90; else settings.rot = 0;
    settings.size = result.mode === 'badge' ? 60 : 80;
    settings.vehicleOk = undefined; applyCar(); save();
    const bgMsg = st.textContent.startsWith('Background removal not') ? st.textContent + ' ' : '';
    st.textContent = bgMsg + 'Checking that this is a vehicle…';
    const chk = window.carCheck ? await window.carCheck(settings.img) : { ok: null };
    settings.vehicleOk = chk.ok; save();
    if (chk.ok === false) { st.innerHTML = ''; const w = document.createElement('div'); w.className = 'warn'; w.textContent = `⚠️ This doesn't look like a vehicle (looks like: ${chk.label}). You can still use it on your own map and in private groups, but the public map will show a default car instead. Try another photo?`; st.appendChild(w); }
    else st.textContent = bgMsg + (chk.ok === null ? 'Done! (vehicle check unavailable — public map will show a default car until it can be checked) ' : 'Vehicle detected ✓ ') + 'Use “Rotate” so the front of your car points up ▲';
  } catch (e) { console.warn(e); st.textContent = 'Could not read that image — try another photo.'; }
}
window.__processCarFile = processCarFile;

/* ---------- boot ---------- */
map.on('load', () => { startGeo(); setFollow(true); });
const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
if (!IS_NATIVE && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
