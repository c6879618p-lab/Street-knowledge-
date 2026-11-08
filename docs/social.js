'use strict';
/* ===== Shared pins + chat (rides on the presence MQTT connection) ===== */
(() => {
const P = window.__presence;
const EMOJIS = ['📍', '⭐', '🍔', '⛽', '🅿️', '🚗', '🔧', '⚠️', '🎉', '🏠'];
const DAY = 86400000, HIST = 50, SLOTS = 50;
const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, n);
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
const okCoord = (lon, lat) => typeof lon === 'number' && typeof lat === 'number' && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const fmtTime = ts => { const d = new Date(ts), now = new Date(); const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + t; };
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const chanLabel = () => P.st.mode === 'private' ? `🔒 group ${P.st.code}` : '🌍 everyone using the app nearby (public)';

/* ================= PINS ================= */
const myPins = lsGet('myPins', []);           // personal, local only
const shared = new Map();                      // id -> {p, topic, marker}
const localMarkers = new Map();
let pinSubs = new Set(), editAt = null, emoji = EMOJIS[0], viewing = null;

function pinEl(p, isShared) {
  const el = document.createElement('div'); el.className = 'pin-marker' + (isShared ? ' shared' : '');
  const e = document.createElement('span'); e.textContent = p.e || '📍';
  const t = document.createElement('small'); t.textContent = p.t;
  el.append(e, t); el.dataset.pin = p.id;
  el.addEventListener('click', ev => { ev.stopPropagation(); viewPin(p.id); });
  return el;
}
function drawLocal() {
  for (const m of localMarkers.values()) m.remove(); localMarkers.clear();
  for (const p of myPins) localMarkers.set(p.id, new maplibregl.Marker({ element: pinEl(p, false), anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map));
}
function resubPins() {
  const c = P.client; if (!c) return;
  const me = typeof pos !== 'undefined' && pos ? pos : map.getCenter().toArray();
  const want = new Set(P.st.mode === 'private' ? [`${P.base}/pins/g/+`] : P.neighborCells(me).map(k => `${P.base}/pins/c/${k}/+`));
  for (const t of pinSubs) if (!want.has(t)) c.unsubscribe(t);
  for (const t of want) if (!pinSubs.has(t)) c.subscribe(t);
  pinSubs = want;
}
function onPinMsg(topic, buf) {
  const id = topic.split('/').pop();
  const old = shared.get(id);
  if (!buf.length) { if (old) { old.marker.remove(); shared.delete(id); if (viewing === id) closePin(); } return; }
  let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
  if (!okCoord(m.lon, m.lat) || m.id !== id) return;
  const p = { id, t: clean(m.t, 40) || 'Pin', n: clean(m.n, 200), e: EMOJIS.includes(m.e) ? m.e : '📍', lon: m.lon, lat: m.lat, by: clean(m.by, 20), bid: clean(m.bid, 32), ts: +m.ts || 0 };
  if (old) old.marker.remove();
  shared.set(id, { p, topic, marker: new maplibregl.Marker({ element: pinEl(p, true), anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map) });
}
function clearShared() { for (const s of shared.values()) s.marker.remove(); shared.clear(); pinSubs.clear(); }

// emoji picker
EMOJIS.forEach(e => { const b = document.createElement('button'); b.textContent = e; b.onclick = () => { emoji = e; [...$('pinEmojis').children].forEach(x => x.classList.toggle('on', x.textContent === e)); }; $('pinEmojis').appendChild(b); });
const publicMarkers = new Map();
let pendingPlace = null, confirmedPlace = null, editingPublicId = null, pinSearchTimer = null, pinSearchCtl = null;
const PublicPins = window.PublicPins;
const publicBook = PublicPins.createBook({
  storage: { load: () => lsGet('publicAddressPins', []), save: rows => lsSet('publicAddressPins', rows) },
  store: window.__publicPinStore || null
});
function drawPublic() {
  for (const m of publicMarkers.values()) m.remove(); publicMarkers.clear();
  for (const p of publicBook.listLocal()) {
    const el = pinEl({ id: p.id, e: '📌', t: p.label || p.address }, false);
    el.classList.add('public-held');
    publicMarkers.set(p.id, new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(map));
  }
}
function findPublic(id) { return publicBook.listLocal().find(p => p.id === id); }
function resetAddressUi() {
  pendingPlace = null; confirmedPlace = null; editingPublicId = null;
  $('pinAddr').value = ''; $('pinAddrList').classList.add('hidden'); $('pinAddrList').innerHTML = '';
  $('pinChosen').classList.add('hidden'); $('pinChosen').textContent = '';
  $('pinConfirmBtn').classList.add('hidden');
  $('pinPublicStatus').textContent = publicBook.blocker;
}
function configureShare() {
  const priv = P.st.mode === 'private' && !!P.client;
  $('pinShare').disabled = !priv; $('pinShare').checked = priv;
  $('pinShareLbl').textContent = P.st.mode === 'private' ? `Share to group ${P.st.code}` : 'Group share is only for a private group';
  updWho();
}
function openNewPin(lngLat) {
  editAt = lngLat; emoji = EMOJIS[0]; [...$('pinEmojis').children].forEach(x => x.classList.toggle('on', x.textContent === emoji));
  $('pinHead').textContent = 'Drop a pin'; $('pinTitle').value = ''; $('pinNote').value = '';
  $('pinEdit').classList.remove('hidden'); $('pinView').classList.add('hidden');
  resetAddressUi(); configureShare(); $('pinPanel').classList.remove('hidden'); viewing = null;
}
function updWho() {
  if (P.st.mode === 'private' && $('pinShare').checked) $('pinWho').textContent = `🔒 Visible to group ${P.st.code}. People who join that group later can see it while the group broker keeps the message.`;
  else if (P.st.mode === 'private') $('pinWho').textContent = '🔒 Only you will see this pin (saved on this device).';
  else $('pinWho').textContent = 'This map pin stays on this device. It is not sent to other people.';
}
$('pinShare').onchange = updWho;
$('pinAddr').addEventListener('input', () => {
  const q = $('pinAddr').value.trim();
  clearTimeout(pinSearchTimer);
  confirmedPlace = null; pendingPlace = null; $('pinConfirmBtn').classList.add('hidden');
  if (q.length < 3) { $('pinAddrList').classList.add('hidden'); return; }
  pinSearchTimer = setTimeout(() => searchPinAddr(q), 400);
});
async function searchPinAddr(q) {
  if (pinSearchCtl) pinSearchCtl.abort(); pinSearchCtl = new AbortController();
  const bias = (typeof pos !== 'undefined' && pos) ? { lon: pos[0], lat: pos[1] } : null;
  try {
    const r = await fetch(PublicPins.photonUrl(q, bias), { signal: pinSearchCtl.signal });
    const j = await r.json();
    const box = $('pinAddrList'); box.innerHTML = '';
    const places = (j.features || []).map(PublicPins.parsePhoton).filter(Boolean);
    if (!places.length) box.innerHTML = '<div class="sug"><span class="s">No results</span></div>';
    places.forEach(place => {
      const d = document.createElement('div'); d.className = 'sug';
      d.innerHTML = '<span class="pin">📍</span><div><div class="t"></div><div class="s"></div></div>';
      d.querySelector('.t').textContent = place.name; d.querySelector('.s').textContent = place.address;
      d.onclick = () => {
        pendingPlace = place; confirmedPlace = null; box.classList.add('hidden');
        $('pinChosen').classList.remove('hidden');
        $('pinChosen').textContent = `Selected ${place.address} (${place.lat}, ${place.lon}). Confirm this exact point. It is not public yet.`;
        $('pinConfirmBtn').classList.remove('hidden');
      };
      box.appendChild(d);
    });
    box.classList.remove('hidden');
  } catch (e) { if (e.name !== 'AbortError') toast('Address search unavailable, try again'); }
}
$('pinConfirmBtn').onclick = () => {
  try {
    confirmedPlace = PublicPins.confirmPlace(pendingPlace);
    editAt = [confirmedPlace.lon, confirmedPlace.lat];
    $('pinChosen').textContent = `Confirmed ${confirmedPlace.address} at ${confirmedPlace.lat}, ${confirmedPlace.lon}. Still only on this device until you publish, and publishing needs a durable store.`;
    $('pinConfirmBtn').classList.add('hidden');
  } catch (e) { $('pinPublicStatus').textContent = e.message; }
};
$('pinPublishPublic').onclick = async () => {
  try {
    if (editingPublicId) {
      const edited = await publicBook.updateLocal(editingPublicId, { label: $('pinTitle').value }, null);
      $('pinPublicStatus').textContent = edited.ok ? 'Label updated on this device. ' + publicBook.blocker : 'Could not update that pin.';
      drawPublic(); return;
    }
    const result = await publicBook.publishPublic({ place: confirmedPlace, label: $('pinTitle').value });
    $('pinPublicStatus').textContent = result.blocker || 'Published.';
    drawPublic();
    if (!result.published) toast('Saved on this device only');
  } catch (e) { $('pinPublicStatus').textContent = e.message || 'Confirm an address from search first. Nothing was published.'; }
};
function closePin() { $('pinPanel').classList.add('hidden'); viewing = null; }
$('closePin').onclick = closePin;
$('pinPanel').onclick = e => { if (e.target.id === 'pinPanel') closePin(); };
$('pinBtn').onclick = () => openNewPin(map.getCenter().toArray());
$('pinSave').onclick = () => {
  if (!editAt) { toast('Drop a pin on the map or confirm an address'); return; }
  const p = { id: rid(), t: clean($('pinTitle').value, 40) || (confirmedPlace ? confirmedPlace.name : 'Pin'), n: clean($('pinNote').value, 200), e: emoji, lon: +(+editAt[0]).toFixed(6), lat: +(+editAt[1]).toFixed(6), by: P.st.name, bid: P.st.cid, ts: Date.now() };
  const target = PublicPins.shareTarget(P.st.mode, P.base, p.id);
  if ($('pinShare').checked && target.kind === 'group' && P.client && target.topic) { P.client.publish(target.topic, JSON.stringify(p), { retain: true, qos: 1 }); toast('Pin shared with your group'); }
  else { myPins.push(p); lsSet('myPins', myPins); drawLocal(); toast('Pin saved on this device'); }
  closePin();
};
function viewPin(id) {
  const pub = findPublic(id);
  const s = shared.get(id), p = pub || (s ? s.p : myPins.find(x => x.id === id)); if (!p) return;
  viewing = id;
  $('pinHead').textContent = pub ? 'Address pin' : (s ? 'Shared pin' : 'My pin');
  $('pinEdit').classList.add('hidden'); $('pinView').classList.remove('hidden');
  $('pvEmoji').textContent = pub ? '📌' : p.e; $('pvTitle').textContent = pub ? (p.label || p.address) : p.t; $('pvNote').textContent = pub ? p.address : p.n;
  $('pvMeta').textContent = pub ? 'On this device only. Not a live car, and not visible to other people. ' + publicBook.blocker : ((s ? `Added by ${p.by === P.st.name && p.bid === P.st.cid ? 'you' : p.by} · ` : 'Only visible to you · ') + fmtTime(p.ts));
  $('pvEdit').classList.toggle('hidden', !pub);
  $('pvDel').classList.toggle('hidden', !pub && !!s && (p.bid !== P.st.cid || s.topic.indexOf('/pins/g/') === -1));
  $('pinPanel').classList.remove('hidden');
}
$('pvDir').onclick = () => { const s = shared.get(viewing), p = s ? s.p : myPins.find(x => x.id === viewing); if (!p) return; closePin(); chooseDest([p.lon, p.lat], p.e + ' ' + p.t, p.n); };
$('pvEdit').onclick = () => {
  const p = findPublic(viewing); if (!p) return;
  editingPublicId = p.id; confirmedPlace = { source: 'geocode', lon: p.lon, lat: p.lat, address: p.address, name: p.address, confirmed: true };
  editAt = [p.lon, p.lat]; $('pinTitle').value = p.label || '';
  $('pinHead').textContent = 'Edit label on this device';
  $('pinEdit').classList.remove('hidden'); $('pinView').classList.add('hidden');
  $('pinPublicStatus').textContent = 'A new label stays on this device. ' + publicBook.blocker;
};
$('pvDel').onclick = async () => {
  const pub = findPublic(viewing);
  if (pub) {
    const removed = await publicBook.remove(pub.id, pub.ownerToken || null);
    if (!removed.ok) { toast('Could not remove that pin'); return; }
    drawPublic(); toast(removed.removedRemote ? 'Public pin removed' : 'Removed on this device. It was not published.'); closePin(); return;
  }
  const s = shared.get(viewing);
  if (s) { if (P.client && s.topic.indexOf('/pins/g/') !== -1) { P.client.publish(s.topic, '', { retain: true, qos: 1 }); } else { toast('A shared group pin can only be cleared while group sharing is connected'); return; } }
  else { const i = myPins.findIndex(x => x.id === viewing); if (i >= 0) myPins.splice(i, 1); lsSet('myPins', myPins); drawLocal(); }
  toast('Pin deleted'); closePin();
};
// long-press / right-click to drop a pin
map.on('contextmenu', e => openNewPin(e.lngLat.toArray()));
let lp = null;
map.on('touchstart', e => { if (e.originalEvent.touches.length !== 1) return; const pt = e.point, ll = e.lngLat.toArray(); clearTimeout(lp); lp = setTimeout(() => { lp = null; openNewPin(ll); }, 600); lp.pt = pt; });
['touchend', 'touchcancel', 'dragstart', 'zoomstart', 'pitchstart'].forEach(ev => map.on(ev, () => clearTimeout(lp)));
map.on('touchmove', () => clearTimeout(lp));
drawLocal();
drawPublic();

/* ================= CHAT ================= */
const BAD = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|asshole\w*|bastard\w*|dick\w*|piss\w*|slut\w*|whore\w*|fag\w*|nigg\w*|retard\w*)\b/gi;
const filt = t => t.replace(BAD, w => w[0] + '*'.repeat(w.length - 1));
const hist = lsGet('chatHist', {});            // threadKey -> [msg]
const hiddenUsers = new Set(lsGet('hiddenUsers', []));
const dmNames = lsGet('dmNames', {});           // cid -> name
const seen = new Set();
let thread = 'chan', unread = lsGet('chatUnread', {}), chatSubs = new Set(), lastSend = 0;
const chanKey = () => 'chan:' + P.base;          // separate history per group / public
const tkey = t => t === 'chan' ? chanKey() : t;
function chanTopics() { const me = typeof pos !== 'undefined' && pos ? pos : map.getCenter().toArray(); return P.st.mode === 'private' ? ['g'] : P.neighborCells(me); }
function resubChat() {
  const c = P.client; if (!c) return;
  const want = new Set([...chanTopics().map(k => `${P.base}/chat/${k}/h/+`), `${P.base}/inbox/${P.st.cid}`]);
  for (const t of chatSubs) if (!want.has(t)) c.unsubscribe(t);
  for (const t of want) if (!chatSubs.has(t)) c.subscribe(t);
  chatSubs = want;
}
function addMsg(key, m) {
  if (seen.has(key + m.id)) return false; seen.add(key + m.id);
  const L = hist[key] = hist[key] || [];
  if (L.some(x => x.id === m.id)) return false;
  L.push(m); L.sort((a, b) => a.ts - b.ts); while (L.length > HIST) L.shift();
  lsSet('chatHist', hist); return true;
}
function onChatMsg(topic, buf, isDM) {
  if (!buf.length) return;
  let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; }
  const msg = { id: clean(m.id, 20), f: clean(m.f, 32), n: clean(m.n, 20) || 'Driver', x: filt(clean(m.x, 300)), ts: +m.ts || 0 };
  if (!msg.id || !msg.x || Date.now() - msg.ts > DAY || msg.ts > Date.now() + 120000) return;
  const key = isDM ? 'dm:' + (msg.f === P.st.cid ? clean(m.to, 32) : msg.f) : chanKey();
  if (isDM && msg.f !== P.st.cid) { dmNames[msg.f] = msg.n; lsSet('dmNames', dmNames); }
  if (!addMsg(key, msg)) return;
  const visible = !$('chatPanel').classList.contains('hidden') && tkey(thread) === key;
  if (msg.f !== P.st.cid && !hiddenUsers.has(msg.f) && !visible) { unread[key] = (unread[key] || 0) + 1; lsSet('chatUnread', unread); }
  renderBadge(); if (!$('chatPanel').classList.contains('hidden')) { renderThreads(); renderChat(); }
}
function renderBadge() {
  const live = P.client ? Object.entries(unread).filter(([k]) => k === chanKey() || k.startsWith('dm:')).reduce((s, [, v]) => s + v, 0) : 0;
  $('chatBadge').textContent = live > 99 ? '99+' : live; $('chatBadge').classList.toggle('hidden', !live);
}
function renderThreads() {
  const sel = $('chatThread'); sel.innerHTML = '';
  const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t + (unread[tkey(v)] ? ` (${unread[tkey(v)]})` : ''); sel.appendChild(o); };
  add('chan', P.st.mode === 'private' ? `🔒 Group ${P.st.code}` : '🌍 Nearby (public)');
  const dms = new Set(Object.keys(hist).filter(k => k.startsWith('dm:')).map(k => k.slice(3))); if (thread.startsWith('dm:')) dms.add(thread.slice(3));
  for (const id of dms) add('dm:' + id, '✉️ ' + (dmNames[id] || 'Driver ' + id.slice(0, 3).toUpperCase()));
  sel.value = thread;
}
function renderChat() {
  const key = tkey(thread), L = $('chatList'); L.innerHTML = '';
  $('chatWho').textContent = thread === 'chan' ? `Messages visible to ${chanLabel()} · kept up to 24 h` : `Direct message with ${dmNames[thread.slice(3)] || 'driver'} (not end-to-end encrypted)`;
  const msgs = (hist[key] || []).filter(m => !hiddenUsers.has(m.f));
  if (!msgs.length) { const d = document.createElement('div'); d.className = 'status'; d.textContent = 'No messages yet. Say hi 👋'; L.appendChild(d); }
  for (const m of msgs) {
    const me = m.f === P.st.cid, d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : '');
    const h = document.createElement('div'); h.className = 'mh';
    const nm = document.createElement('b'); nm.textContent = me ? 'You' : m.n; const tm = document.createElement('span'); tm.textContent = fmtTime(m.ts); h.append(nm, tm);
    if (!me) {
      if (thread === 'chan') { const dm = document.createElement('button'); dm.textContent = '✉️'; dm.title = 'Message privately'; dm.onclick = () => startDM(m.f, m.n); h.appendChild(dm); }
      const hd = document.createElement('button'); hd.textContent = '🚩 hide'; hd.title = 'Report / hide this user'; hd.onclick = () => hideUser(m.f, m.n); h.appendChild(hd);
    }
    const tx = document.createElement('div'); tx.textContent = m.x;
    d.append(h, tx); L.appendChild(d);
  }
  L.scrollTop = L.scrollHeight;
  if (unread[key]) { delete unread[key]; lsSet('chatUnread', unread); renderBadge(); }
}
function hideUser(id, name) { hiddenUsers.add(id); lsSet('hiddenUsers', [...hiddenUsers]); toast(`Hidden messages from ${name}`); renderChat(); }
function openChat() {
  if (!P.client) { toast(P.st.mode === 'off' ? 'Chat needs sharing on — open 👥 to pick Public or Private' : 'Connecting… try again in a moment'); return; }
  renderThreads(); renderChat(); $('chatPanel').classList.remove('hidden');
}
function startDM(id, name) { if (!id || id === P.st.cid) return; if (name) { dmNames[id] = name; lsSet('dmNames', dmNames); } thread = 'dm:' + id; $('peerSheet').classList.add('hidden'); $('friendsPanel').classList.add('hidden'); openChat(); }
$('chatBtn').onclick = openChat;
$('closeChat').onclick = () => $('chatPanel').classList.add('hidden');
$('chatPanel').onclick = e => { if (e.target.id === 'chatPanel') $('chatPanel').classList.add('hidden'); };
$('chatThread').onchange = e => { thread = e.target.value; renderThreads(); renderChat(); };
function send() {
  const c = P.client; if (!c) { toast('Not connected'); return; }
  const x = filt(clean($('chatText').value, 300)); if (!x) return;
  const now = Date.now(); if (now - lastSend < 1000) { toast('Slow down a little'); return; } lastSend = now;
  const m = { id: rid(), f: P.st.cid, n: P.st.name, x, ts: now };
  if (thread === 'chan') {
    const k = P.st.mode === 'private' ? 'g' : (P.myCell || chanTopics()[4]);
    c.publish(`${P.base}/chat/${k}/h/${Math.floor(now / 1000) % SLOTS}`, JSON.stringify(m), { retain: true, qos: 1 });
  } else {
    const to = thread.slice(3); m.to = to;
    c.publish(`${P.base}/inbox/${to}`, JSON.stringify(m), { qos: 1 });
    addMsg('dm:' + to, m);
  }
  $('chatText').value = ''; renderChat();
}
$('chatSend').onclick = send;
$('chatText').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); send(); } };
$('psDM').onclick = () => { const pr = P.peers.get(P.openPeer); if (pr) startDM(pr.id, pr.name); };
$('psHideUser').onclick = () => { const pr = P.peers.get(P.openPeer); if (pr) hideUser(pr.id, pr.name); };

/* ---------- wire into presence ---------- */
P.hooks.msg.push((topic, buf) => {
  const b = P.base; if (!b || !topic.startsWith(b + '/')) return false;
  const rest = topic.slice(b.length + 1);
  if (rest.startsWith('pins/')) { onPinMsg(topic, buf); return true; }
  if (rest.startsWith('chat/')) { onChatMsg(topic, buf, false); return true; }
  if (rest.startsWith('inbox/')) { onChatMsg(topic, buf, true); return true; }
  return false;
});
P.hooks.sub.push(() => { resubPins(); resubChat(); renderBadge(); });
P.hooks.off.push(() => { clearShared(); chatSubs.clear(); $('chatPanel').classList.add('hidden'); thread = 'chan'; renderBadge(); });
window.__social = { shared, myPins, hist, get unread() { return unread; }, openNewPin, viewPin, startDM };
})();
