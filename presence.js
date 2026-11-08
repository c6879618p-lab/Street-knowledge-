'use strict';
/* ===== Live presence: see other Street Knowledge users ===== */
(() => {
const MQTT_JS = 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js';
const BROKERS = [ // tried in order; all users normally land on the first
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' }];
const ROOT = 'mcgps1', SALT = 'MyCarGPS::v1::7f3a91c2';
const PUB_MS = 2000, HEARTBEAT_MS = 10000, STALE_MS = 30000, DROP_MS = 60000, MAX_PEERS = 50, ANIM_MS = 2000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const st = Object.assign({ mode: 'public', name: '', code: '', cid: '', noticed: false }, JSON.parse(localStorage.getItem('presence') || '{}'));
if (!st.cid) st.cid = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
if (!st.name) st.name = 'Driver ' + st.cid.slice(0, 3).toUpperCase();
const urlCode = new URLSearchParams(location.search).get('group');
if (urlCode && /^[A-Za-z0-9]{4,8}$/.test(urlCode)) { st.mode = 'private'; st.code = urlCode.toUpperCase(); st.noticed = true; }
const persist = () => localStorage.setItem('presence', JSON.stringify(st));
persist();

let client = null, base = '', cells = [], subs = new Set(), connecting = false, imgData = null, lastPub = null, pubTimer = 0, sweepTimer = 0;
const peers = new Map();

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => CODE_CHARS[b % CODE_CHARS.length]).join('');
async function sha(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('').slice(0, 32); }
function loadScript(src) { return new Promise((res, rej) => { if (window.mqtt) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
const cellOf = p => `${Math.floor(p[1])}_${Math.floor(p[0])}`; // 1°x1° grid
const neighborCells = p => { const a = Math.floor(p[1]), o = Math.floor(p[0]), r = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) r.push(`${a + i}_${((o + j + 180) % 360 + 360) % 360 - 180}`); return r; };
const myPos = () => (typeof pos !== 'undefined' && pos) ? pos : null;

/* compact car image (rotation baked in, nose up) */
let pubFallback = false;
async function makeImage() {
  try {
    let src = settings.img; pubFallback = false;
    if (st.mode === 'public' && !DEFAULTS.includes(src)) { // never broadcast a non-vehicle publicly
      let ok = settings.vehicleOk;
      if (ok !== true && window.carCheck) { const r = await window.carCheck(src); ok = r.ok; if (r.ok !== null) { settings.vehicleOk = r.ok; try { localStorage.setItem('carSettings', JSON.stringify(settings)); } catch (e) {} } }
      if (ok !== true) { src = DEFAULTS[0]; pubFallback = true; }
    }
    const img = await loadImg(src);
    const rot = src === settings.img ? settings.rot : 0, badge = src === settings.img && settings.mode === 'badge'; const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'); x.translate(S / 2, S / 2); x.rotate(rot * Math.PI / 180);
    if (badge) { x.beginPath(); x.arc(0, 0, S / 2 - 2, 0, 7); x.clip(); x.drawImage(img, -S / 2, -S / 2, S, S); }
    else { const k = Math.min(S / img.width, S / img.height) * 0.98; x.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k); }
    for (const q of [0.8, 0.6, 0.4]) { const d = c.toDataURL('image/webp', q); if (d.startsWith('data:image/webp') && d.length < 20000) return d; }
    const d = c.toDataURL('image/png'); return d.length < 24000 ? d : null;
  } catch (e) { return null; }
}

/* ---------- connection ---------- */
async function connect() {
  if (st.mode === 'off' || client || connecting) return;
  connecting = true; status('Connecting…');
  try { await loadScript(MQTT_JS); } catch (e) { connecting = false; status('Could not load sharing library (offline?)'); return; }
  base = st.mode === 'private' ? `${ROOT}/g/${await sha(SALT + st.code)}` : `${ROOT}/pub`;
  imgData = await makeImage();
  for (const b of BROKERS) {
    if (st.mode === 'off') break;
    const c = await new Promise(res => {
      const cl = mqtt.connect(b.url, { clientId: 'mcg_' + st.cid + '_' + Math.random().toString(36).slice(2, 6), username: b.username, password: b.password,
        clean: true, keepalive: 30, connectTimeout: 8000, reconnectPeriod: 0,
        will: { topic: `${base}/bye/${st.cid}`, payload: '1', qos: 0, retain: false } });
      const t = setTimeout(() => { cl.end(true); res(null); }, 9000);
      cl.once('connect', () => { clearTimeout(t); res(cl); });
      cl.once('error', () => { clearTimeout(t); cl.end(true); res(null); });
    });
    if (c) { client = c; client.__url = b.url; break; }
  }
  connecting = false;
  if (!client) { status('Could not reach the sharing server — retrying…'); setTimeout(connect, 15000); return; }
  client.on('message', onMessage);
  client.on('close', () => { if (client) { status('Disconnected — reconnecting…'); const old = client; client = null; subs.clear(); old.end(true); setTimeout(connect, 3000); } });
  subscribeFor(myPos());
  client.subscribe(`${base}/bye/+`);
  client.publish(`${base}/img/${st.cid}`, JSON.stringify({ img: imgData, name: st.name }), { retain: true });
  publishProfile();
  status(st.mode === 'public' ? (pubFallback ? 'Sharing publicly 🌍 — your photo didn\'t pass the vehicle check, so others see a default car' : 'Sharing publicly 🌍') : `Sharing with group ${st.code} 🔒`);
  lastPub = null; publish(true);
  clearInterval(pubTimer); pubTimer = setInterval(() => publish(false), PUB_MS);
  clearInterval(sweepTimer); sweepTimer = setInterval(sweep, 3000);
  updateUI();
}
function subscribeFor(p) {
  if (!client) return;
  const want = new Set(st.mode === 'private' ? [`${base}/p/+`] : (p ? neighborCells(p) : []).map(c => `${base}/c/${c}/+`));
  for (const t of subs) if (!want.has(t)) client.unsubscribe(t);
  for (const t of want) if (!subs.has(t)) client.subscribe(t);
  subs = want; cells = p ? cellOf(p) : '';
  hooks.sub.forEach(f => { try { f(); } catch (e) { console.warn(e); } });
}
function posTopic(p) { return st.mode === 'private' ? `${base}/p/${st.cid}` : `${base}/c/${cellOf(p)}/${st.cid}`; }
function publish(force) {
  const p = myPos(); if (!client || !p) return;
  if (st.mode === 'public' && cellOf(p) !== cells) subscribeFor(p);
  const now = Date.now(), h = typeof heading !== 'undefined' ? heading : 0, sp = typeof speed !== 'undefined' ? speed : 0;
  if (!force && lastPub) {
    const moved = dist(lastPub.p, p), dh = Math.abs(((h - lastPub.h) + 540) % 360 - 180);
    if (moved < 3 && dh < 10 && now - lastPub.t < HEARTBEAT_MS) return;
    if (now - lastPub.t < PUB_MS - 50) return;
  }
  lastPub = { p, h, t: now };
  client.publish(posTopic(p), JSON.stringify({ id: st.cid, n: st.name, lon: +p[0].toFixed(6), lat: +p[1].toFixed(6), h: Math.round(h), s: +sp.toFixed(1), t: now }));
}
window.presenceOnPos = () => { if (client && (!lastPub || Date.now() - lastPub.t > PUB_MS)) publish(false); };

function disconnect(sayBye) {
  clearInterval(pubTimer); clearInterval(sweepTimer);
  const c = client; client = null; subs.clear(); cells = '';
  if (c) { if (sayBye) { c.publish(`${base}/bye/${st.cid}`, '1'); c.publish(`${base}/img/${st.cid}`, '', { retain: true }); c.publish(`${base}/prof/${st.cid}`, '', { retain: true }); } setTimeout(() => c.end(), 300); }
  for (const id of [...peers.keys()]) removePeer(id);
  hooks.off.forEach(f => { try { f(); } catch (e) { console.warn(e); } });
  updateUI();
}

/* ---------- peers ---------- */
const hooks = { msg: [], sub: [], off: [] };
function onMessage(topic, buf) {
  for (const h of hooks.msg) if (h(topic, buf)) return;
  const parts = topic.split('/'), id = parts[parts.length - 1];
  if (id === st.cid) return;
  if (topic.includes('/bye/')) { removePeer(id); return; }
  if (topic.includes('/prof/')) {
    const pr = peers.get(id); if (!pr) return;
    if (!buf.length) pr.prof = null; else { try { pr.prof = sanitizeProfile(JSON.parse(buf.toString())); } catch (e) { return; } }
    applyPeerProfile(pr); return;
  }
  if (topic.includes('/img/')) {
    const pr = peers.get(id); if (!pr || !buf.length) return;
    let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
    if (!m.img || !/^data:image\/(webp|png|jpeg);base64,/.test(m.img) || m.img.length > 40000) return;
    pr.remoteImg = m.img; showPeerImg(pr);
    return;
  }
  let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
  if (typeof m.lat !== 'number' || typeof m.lon !== 'number' || Math.abs(m.lat) > 90 || Math.abs(m.lon) > 180) return;
  let pr = peers.get(id);
  if (!pr) {
    if (peers.size >= MAX_PEERS) { // keep nearest
      const me = myPos(); if (!me) return;
      let far = null, fd = -1; for (const [k, v] of peers) { const d = dist(me, v.to); if (d > fd) { fd = d; far = k; } }
      if (dist(me, [m.lon, m.lat]) >= fd) return; removePeer(far);
    }
    pr = addPeer(id, m);
  }
  pr.name = String(m.n || 'Driver').slice(0, 20); pr.label.textContent = pr.name;
  pr.from = pr.cur.slice(); pr.fromH = pr.curH; pr.to = [m.lon, m.lat]; pr.toH = +m.h || 0; pr.speed = +m.s || 0;
  pr.t0 = performance.now(); pr.seen = Date.now(); pr.el.classList.remove('stale');
  if (!pr.raf) pr.raf = requestAnimationFrame(t => animate(pr, t));
  renderList();
}
const reported = new Set(JSON.parse(localStorage.getItem('reportedCars') || '[]'));
async function showPeerImg(pr) {
  const src = pr.remoteImg; if (!src) return;
  if (reported.has(pr.id)) { pr.img.src = DEFAULTS[1]; pr.flag = 'reported'; return; }
  if (st.mode === 'public' && window.carCheck) {
    const r = await window.carCheck(src);
    if (pr.remoteImg !== src) return;
    if (r.ok !== true) { pr.img.src = DEFAULTS[1]; pr.flag = r.ok === false ? 'not a vehicle' : 'unchecked'; renderList(); return; }
  }
  pr.flag = ''; pr.img.src = src; pr.hasImg = true; renderList();
}
function reportPeer(id) {
  reported.add(id); localStorage.setItem('reportedCars', JSON.stringify([...reported]));
  const pr = peers.get(id); if (pr) showPeerImg(pr); toast('Image hidden on your map'); renderList();
}
function addPeer(id, m) {
  const el = document.createElement('div'); el.className = 'peer-marker'; el.style.width = el.style.height = '60px';
  const lab = document.createElement('div'); lab.className = 'peer-label';
  const carW = document.createElement('div'); carW.className = 'peer-car';
  const img = document.createElement('img'); img.src = DEFAULTS[1]; carW.appendChild(img); el.append(carW, lab);
  el.dataset.peer = id;
  const biz = document.createElement('div'); biz.className = 'peer-biz hidden'; biz.textContent = '🔧'; el.appendChild(biz);
  el.addEventListener('click', e => { e.stopPropagation(); openPeerSheet(id); });
  const p = [m.lon, m.lat];
  const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport' }).setLngLat(p).addTo(map);
  const pr = { id, biz, prof: null, el, img, label: lab, carW, marker, cur: p, curH: +m.h || 0, from: p, to: p, fromH: 0, toH: 0, t0: 0, seen: Date.now(), raf: 0, name: '' };
  peers.set(id, pr);
  if (client) { client.subscribe(`${base}/img/${id}`); client.subscribe(`${base}/prof/${id}`); }
  return pr;
}
function animate(pr, now) {
  const k = Math.min(1, (now - pr.t0) / ANIM_MS);
  pr.cur = [pr.from[0] + (pr.to[0] - pr.from[0]) * k, pr.from[1] + (pr.to[1] - pr.from[1]) * k];
  const dh = ((pr.toH - pr.fromH) + 540) % 360 - 180; pr.curH = pr.fromH + dh * k;
  pr.marker.setLngLat(pr.cur);
  pr.carW.style.transform = `rotate(${pr.curH - map.getBearing()}deg)`;
  pr.raf = k < 1 ? requestAnimationFrame(t => animate(pr, t)) : 0;
}
map.on('rotate', () => peers.forEach(pr => pr.carW.style.transform = `rotate(${pr.curH - map.getBearing()}deg)`));
function removePeer(id) {
  const pr = peers.get(id); if (!pr) return;
  cancelAnimationFrame(pr.raf); pr.marker.remove(); peers.delete(id);
  if (client) { client.unsubscribe(`${base}/img/${id}`); client.unsubscribe(`${base}/prof/${id}`); }
  if (openPeer === id) $('closePeer').onclick();
  renderList();
}
function sweep() { const now = Date.now(); for (const [id, pr] of peers) { const a = now - pr.seen; if (a > DROP_MS) removePeer(id); else pr.el.classList.toggle('stale', a > STALE_MS); } renderList(); }


/* ---------- profiles / business cards ---------- */
const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, n);
const cleanPhone = v => clean(v, 24).replace(/[^0-9+()\-. ]/g, '');
const cleanWeb = v => { v = clean(v, 120); if (!v) return ''; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; try { const u = new URL(v); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (e) { return ''; } };
const cleanImg = v => (typeof v === 'string' && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < 110000) ? v : '';
function sanitizeProfile(m) {
  m = m || {};
  return { d: clean(m.d, 80), b: clean(m.b, 200), m: !!m.m, bn: clean(m.bn, 60), bt: clean(m.bt, 40), ph: cleanPhone(m.ph), w: cleanWeb(m.w), card: m.m ? cleanImg(m.card) : '' };
}
let myProf = sanitizeProfile(JSON.parse(localStorage.getItem('profile') || '{}'));
const hasProf = p => !!(p.d || p.b || p.m);
function publishProfile() { if (client) client.publish(`${base}/prof/${st.cid}`, hasProf(myProf) ? JSON.stringify(myProf) : '', { retain: true }); }
async function compressCard(file) {
  const img = await loadImg(URL.createObjectURL(file));
  for (const [max, q] of [[800, .8], [800, .6], [640, .6], [512, .5], [400, .45]]) {
    const c = toCanvas(img, max), x = document.createElement('canvas'); x.width = c.width; x.height = c.height;
    const g = x.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, x.width, x.height); g.drawImage(c, 0, 0);
    let d = x.toDataURL('image/webp', q); if (!d.startsWith('data:image/webp')) d = x.toDataURL('image/jpeg', q);
    if (d.length < 80000) return d;
  }
  return '';
}
let draftCard = '';
function fillProfileForm() {
  $('pDesc').value = myProf.d; $('pBio').value = myProf.b; $('pMobile').checked = myProf.m;
  $('pBizName').value = myProf.bn; $('pBizType').value = myProf.bt; $('pPhone').value = myProf.ph; $('pWeb').value = myProf.w;
  draftCard = myProf.card; showDraftCard(); $('pBizFields').classList.toggle('hidden', !myProf.m); $('pStatus').textContent = '';
}
function showDraftCard() { $('pCardImg').classList.toggle('hidden', !draftCard); $('pCardDel').classList.toggle('hidden', !draftCard); if (draftCard) $('pCardImg').src = draftCard; }
function openProfileEditor() { fillProfileForm(); $('profilePanel').classList.remove('hidden'); }
$('fDetails').onclick = openProfileEditor;
$('carDetails').onclick = () => { $('carPanel').classList.add('hidden'); openProfileEditor(); };
$('closeProfile').onclick = () => $('profilePanel').classList.add('hidden');
$('pMobile').onchange = e => $('pBizFields').classList.toggle('hidden', !e.target.checked);
PhotoPick.wirePhotoSources({
  galleryBtn: $('cardGalleryBtn'), cameraBtn: $('cardCameraBtn'),
  galleryInput: $('pCardFile'), cameraInput: $('pCardCamera'),
  setStatus: msg => { if (msg) $('pStatus').textContent = msg; },
  nativePick: window.__nativePickPhoto || null,
  onFile: async file => {
    $('pStatus').textContent = 'Compressing card…';
    try { draftCard = await compressCard(file); $('pStatus').textContent = draftCard ? `Card ready (${Math.round(draftCard.length * 3 / 4 / 1024)} KB)` : 'Card image too large'; }
    catch (err) { $('pStatus').textContent = 'Could not read that image'; }
    showDraftCard();
  }
});
$('pCardDel').onclick = () => { draftCard = ''; showDraftCard(); };
$('pCardImg').onclick = () => viewCard(draftCard);
$('pSave').onclick = () => {
  myProf = sanitizeProfile({ d: $('pDesc').value, b: $('pBio').value, m: $('pMobile').checked, bn: $('pBizName').value, bt: $('pBizType').value, ph: $('pPhone').value, w: $('pWeb').value, card: draftCard });
  try { localStorage.setItem('profile', JSON.stringify(myProf)); } catch (e) { toast('Could not save (storage full)'); return; }
  publishProfile(); $('profilePanel').classList.add('hidden'); toast(client ? 'Details saved and shared' : 'Details saved (shared when sharing is on)');
};
function viewCard(src) { if (!src) return; $('cardViewImg').src = src; $('cardView').classList.remove('hidden'); }
$('cardView').onclick = () => $('cardView').classList.add('hidden');

const hiddenProfiles = new Set(JSON.parse(localStorage.getItem('hiddenProfiles') || '[]'));
function applyPeerProfile(pr) {
  const p = hiddenProfiles.has(pr.id) ? null : pr.prof;
  pr.biz.classList.toggle('hidden', !(p && p.m));
  if (openPeer === pr.id) openPeerSheet(pr.id);
}
let openPeer = null;
function openPeerSheet(id) {
  const pr = peers.get(id); if (!pr) return; openPeer = id;
  const p = hiddenProfiles.has(id) ? null : pr.prof, me = myPos();
  $('psName').textContent = pr.name; $('psCar').src = pr.img.src;
  $('psDist').textContent = me ? fmtDist(dist(me, pr.to)) + ' away' : '';
  $('psBadge').classList.toggle('hidden', !(p && p.m)); $('psBadge').textContent = '🔧 ' + ((p && p.bt) || 'Mobile service');
  $('psDesc').textContent = p ? p.d : ''; $('psBio').textContent = p ? p.b : '';
  $('psBiz').classList.toggle('hidden', !(p && p.m));
  if (p && p.m) {
    $('psBizName').textContent = p.bn;
    $('psCard').classList.toggle('hidden', !p.card); if (p.card) $('psCard').src = p.card;
    $('psCall').classList.toggle('hidden', !p.ph); $('psCall').href = p.ph ? 'tel:' + p.ph.replace(/[^0-9+]/g, '') : '#';
    $('psWeb').classList.toggle('hidden', !p.w); $('psWeb').href = p.w || '#';
  }
  $('psNone').classList.toggle('hidden', !!(p && hasProf(p))); $('psNone').textContent = hiddenProfiles.has(id) ? 'You hid this profile.' : 'No details shared.';
  $('psReport').classList.toggle('hidden', hiddenProfiles.has(id) || !(p && hasProf(p)));
  $('peerSheet').classList.remove('hidden');
}
$('psCard').onclick = () => viewCard($('psCard').src);
$('closePeer').onclick = () => { openPeer = null; $('peerSheet').classList.add('hidden'); };
$('peerSheet').onclick = e => { if (e.target.id === 'peerSheet') $('closePeer').onclick(); };
$('psReport').onclick = () => { if (!openPeer) return; hiddenProfiles.add(openPeer); localStorage.setItem('hiddenProfiles', JSON.stringify([...hiddenProfiles]));
  const pr = peers.get(openPeer); if (pr) applyPeerProfile(pr); reportPeer(openPeer); openPeerSheet(openPeer); };

/* ---------- UI ---------- */
function status(t) { $('fStatus').textContent = t; }
function fmtDist(m) { return m < 1000 ? Math.round(m * 3.28084) + ' ft' : (m / 1609.34).toFixed(m < 16000 ? 1 : 0) + ' mi'; }
function renderList() {
  const L = $('fList'); L.innerHTML = '';
  $('friendsDot').classList.toggle('hidden', !client);
  if (!peers.size) { L.innerHTML = `<div class="status">${client ? 'Nobody else online nearby yet' : 'Sharing is off'}</div>`; return; }
  const me = myPos();
  [...peers.values()].sort((a, b) => me ? dist(me, a.to) - dist(me, b.to) : 0).forEach(pr => {
    const b = document.createElement('button'); b.className = 'friend';
    const im = document.createElement('img'); im.src = pr.img.src;
    const n = document.createElement('span'); n.className = 'fn'; n.textContent = pr.name;
    const d = document.createElement('span'); d.className = 'fd'; d.textContent = me ? fmtDist(dist(me, pr.to)) : '';
    b.append(im, n, d);
    if (pr.flag) { const f = document.createElement('span'); f.className = 'fd'; f.textContent = '🚫 ' + pr.flag; b.append(f); }
    else if (pr.hasImg) { const r = document.createElement('span'); r.className = 'rep'; r.textContent = '🚩 Report'; r.title = 'Hide this image'; r.onclick = e => { e.stopPropagation(); reportPeer(pr.id); }; b.append(r); }
    b.onclick = () => { setFollow(false); map.easeTo({ center: pr.cur, zoom: Math.max(map.getZoom(), 15) }); $('friendsPanel').classList.add('hidden'); };
    L.appendChild(b);
  });
}
const PUBLIC_URL = 'https://paynelessservices83-bit.github.io/street-knowledge/';
function inviteLink() { const native = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform(); return (native || !/^https?:$/.test(location.protocol) ? PUBLIC_URL : location.origin + location.pathname) + '?group=' + st.code; }
function updateUI() {
  document.querySelectorAll('#fModes button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
  $('fPrivate').classList.toggle('hidden', st.mode !== 'private');
  $('fCode').value = st.code; $('fLink').value = st.code ? inviteLink() : '';
  $('fNotice').textContent = st.mode === 'public' ? '🌍 Public: your live location, name and car photo are visible to everyone using Street Knowledge nearby.'
    : st.mode === 'private' ? '🔒 Private: your live location and car photo are shared with anyone who has this group code or link.'
    : '⛔ Off: you are not sharing your location and you can\'t see other cars.';
  if (st.mode === 'off') status('Sharing is off');
  renderList();
}
async function setMode(m) {
  if (m === 'private' && !st.code) st.code = newCode();
  const changed = m !== st.mode || m === 'private';
  st.mode = m; persist();
  if (changed) { disconnect(true); }
  updateUI();
  if (m !== 'off') connect();
}
window.__presence = { hooks, neighborCells, cellOf, get base() { return base; }, get openPeer() { return openPeer; }, get myCell() { return cells; }, openPeerSheet, get myProf() { return myProf; }, st, peers, setMode, reportPeer, get pubFallback() { return pubFallback; }, get client() { return client; } };

$('friendsBtn').onclick = () => { updateUI(); $('friendsPanel').classList.remove('hidden'); };
$('closeFriends').onclick = () => $('friendsPanel').classList.add('hidden');
$('friendsPanel').onclick = e => { if (e.target.id === 'friendsPanel') $('friendsPanel').classList.add('hidden'); };
$('fName').value = st.name;
$('fName').onchange = e => { st.name = e.target.value.trim().slice(0, 20) || st.name; persist(); if (client) { client.publish(`${base}/img/${st.cid}`, JSON.stringify({ img: imgData, name: st.name }), { retain: true }); publish(true); } };
document.querySelectorAll('#fModes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('fNew').onclick = () => { st.code = newCode(); setMode('private'); };
$('fJoin').onclick = () => { const c = $('fCode').value.trim().toUpperCase(); if (!/^[A-Z0-9]{4,8}$/.test(c)) { toast('Enter a 4–8 character code'); return; } st.code = c; setMode('private'); };
$('fShare').onclick = async () => {
  const url = inviteLink();
  if (navigator.share) { try { await navigator.share({ title: 'Street Knowledge', text: 'See my car live on Street Knowledge', url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); } catch (e) { $('fLink').select(); toast('Copy the link above'); }
};
document.querySelectorAll('#firstNotice button').forEach(b => b.onclick = () => {
  st.noticed = true; persist(); $('firstNotice').classList.add('hidden');
  if (b.dataset.m !== 'public') { setMode(b.dataset.m); if (b.dataset.m === 'private') { updateUI(); $('friendsPanel').classList.remove('hidden'); } }
});
// refresh my published image when my car changes
const _save = window.save; if (typeof _save === 'function') window.save = function () { _save.apply(this, arguments); clearTimeout(window.__imgT); window.__imgT = setTimeout(async () => { if (!client) return; imgData = await makeImage(); client.publish(`${base}/img/${st.cid}`, JSON.stringify({ img: imgData, name: st.name }), { retain: true }); }, 800); };
window.addEventListener('pagehide', () => { if (client) client.publish(`${base}/bye/${st.cid}`, '1'); });

if (!st.noticed && st.mode === 'public') $('firstNotice').classList.remove('hidden');
updateUI();
if (st.mode !== 'off') connect();
})();
