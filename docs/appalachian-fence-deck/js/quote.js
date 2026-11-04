/* =====================================================================
   RATES — STARTING ESTIMATES ONLY. Appalachian Fence and Deck must review
   and set these to their own installed pricing before going live.
   All values are installed cost (materials + labor), [low, high] in USD.
   Sources (national 2026 ranges, checked Nov 2026):
   - Fence: Green Industry Report "Fence Installation Cost 2026"
     https://greenindustryreport.com/fence-installation-cost/
     (6ft PT pine privacy $27–39/ft, 4ft PT picket $21–29, 4ft chain link
     $25–40, 4ft aluminum $41–66, 6ft vinyl privacy $44–63)
     cross-checked with HomeGuide https://homeguide.com/costs/fence-installation-cost
   - Deck: InspectandTest "Deck Construction Cost 2026"
     https://inspectandtest.net/guides/deck-building-cost/
     (PT ground-level $20–35/sqft, PT raised $30–50, composite $30–60,
     raised/premium composite $45–75; wood railing $30–70/LF,
     metal/composite railing $60–150/LF)
   Values marked ASSUMPTION were not in a source and are rough guesses.
   ===================================================================== */
const RATES = {
  fence: { // per linear foot
    wood:      { 4: [21, 29], 6: [27, 39] },
    vinyl:     { 4: [35, 50] /* ASSUMPTION */, 6: [44, 63] },
    chainlink: { 4: [25, 40], 6: [32, 52] /* ASSUMPTION ~+30% */ },
    aluminum:  { 4: [41, 66], 6: [55, 85] /* ASSUMPTION */ },
  },
  gate: [350, 900],            // per walk gate — ASSUMPTION, business must set
  deck: {                      // per square foot
    pt:        { ground: [20, 35], elevated: [30, 50] },
    composite: { ground: [30, 60], elevated: [45, 75] },
  },
  railing: { pt: [30, 70], composite: [60, 150] }, // per linear foot of deck perimeter
};
const LABELS = { wood: 'Pressure-treated wood', vinyl: 'Vinyl', chainlink: 'Chain link', aluminum: 'Aluminum', pt: 'Pressure-treated', composite: 'Composite' };

const map = L.map('map', { tap: true }).setView([35.5951, -82.5515], 17);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics'
}).addTo(map);

let pts = [], layer = null, markers = [], mode = 'fence', last = null;
const $ = id => document.getElementById(id);
const money = n => '$' + (Math.round(n / 10) * 10).toLocaleString('en-US');

function redraw() {
  if (layer) map.removeLayer(layer);
  markers.forEach(m => map.removeLayer(m)); markers = [];
  pts.forEach(p => markers.push(L.circleMarker(p, { radius: 7, color: '#fff', weight: 2, fillColor: '#e8a33d', fillOpacity: 1 }).addTo(map)));
  if (pts.length > 1) layer = (mode === 'deck' && pts.length > 2 ? L.polygon(pts, { color: '#e8a33d', weight: 4 }) : L.polyline(pts, { color: '#e8a33d', weight: 4 })).addTo(map);
  calc();
}
map.on('click', e => { pts.push([e.latlng.lat, e.latlng.lng]); redraw(); });
$('undo').onclick = () => { pts.pop(); redraw(); };
$('clear').onclick = () => { pts = []; redraw(); };
document.querySelectorAll('input[name=ptype]').forEach(r => r.onchange = () => {
  mode = r.value; $('fenceOpts').hidden = mode !== 'fence'; $('deckOpts').hidden = mode !== 'deck';
  $('hint').textContent = mode === 'fence' ? 'Tap the map along your fence line, one tap per corner.' : 'Tap each corner of your deck outline (3 or more points).';
  redraw();
});
document.querySelectorAll('#opts select, #opts input').forEach(el => el.oninput = calc);

function calc() {
  const ll = pts.map(([a, b]) => [b, a]); let qty = 0, lo = 0, hi = 0, desc = '';
  if (mode === 'fence') {
    if (ll.length > 1) qty = turf.length(turf.lineString(ll), { units: 'feet' });
    const m = $('material').value, h = $('height').value, g = +$('gates').value || 0, r = RATES.fence[m][h];
    lo = qty * r[0] + g * RATES.gate[0]; hi = qty * r[1] + g * RATES.gate[1];
    desc = `Fence: ${Math.round(qty)} linear ft, ${LABELS[m]}, ${h} ft tall, ${g} gate(s)`;
    $('measure').textContent = `${Math.round(qty).toLocaleString()} linear ft`;
  } else {
    let perim = 0;
    if (ll.length > 2) { const poly = turf.polygon([[...ll, ll[0]]]); qty = turf.area(poly) * 10.7639; perim = turf.length(turf.polygonToLine(poly), { units: 'feet' }); }
    const dm = $('deckMat').value, lv = $('level').value, rail = $('railing').checked, r = RATES.deck[dm][lv];
    lo = qty * r[0]; hi = qty * r[1];
    if (rail) { lo += perim * RATES.railing[dm][0]; hi += perim * RATES.railing[dm][1]; }
    desc = `Deck: ${Math.round(qty)} sq ft, ${LABELS[dm]}, ${lv === 'ground' ? 'ground-level' : 'elevated'}, railing: ${rail ? 'yes (~' + Math.round(perim) + ' ft perimeter)' : 'no'}`;
    $('measure').textContent = `${Math.round(qty).toLocaleString()} sq ft`;
  }
  const ok = qty > 0;
  $('estimate').textContent = ok ? `${money(lo)} – ${money(hi)}` : '—';
  last = ok ? { desc, range: `${money(lo)} – ${money(hi)}`, points: pts.map(p => p.map(n => n.toFixed(6)).join(',')).join(' ; ') } : null;
  $('f_measure').value = last ? last.desc : ''; $('f_estimate').value = last ? last.range : ''; $('f_points').value = last ? last.points : '';
}

// Address search (Photon geocoder, no API key)
$('searchForm').onsubmit = async e => {
  e.preventDefault(); const q = $('addr').value.trim(); if (!q) return;
  $('searchMsg').textContent = 'Searching…';
  try {
    const r = await fetch('https://photon.komoot.io/api/?limit=1&lat=35.5&lon=-82.5&q=' + encodeURIComponent(q));
    const f = (await r.json()).features[0];
    if (!f) { $('searchMsg').textContent = 'Address not found. Try adding the town.'; return; }
    const [lon, lat] = f.geometry.coordinates; map.setView([lat, lon], 19);
    $('searchMsg').textContent = ''; if (!$('f_address').value) $('f_address').value = q;
  } catch { $('searchMsg').textContent = 'Search unavailable. Pan the map manually.'; }
};

// mailto fallback with details prefilled
$('mailtoBtn').onclick = () => {
  const f = $('reqForm'), v = n => f.elements[n].value;
  const body = `Name: ${v('name')}\nPhone: ${v('phone')}\nEmail: ${v('email')}\nAddress: ${v('address')}\n\n${v('measurement') || '(no measurement drawn)'}\nOnline estimate: ${v('estimate') || 'n/a'}\nMap points: ${v('points')}\n\nNotes: ${v('notes')}`;
  location.href = 'mailto:appalachianfenceanddeck@gmail.com?subject=' + encodeURIComponent('Quote request - ' + (v('name') || 'website')) + '&body=' + encodeURIComponent(body);
};
window.__demo = (coords) => { pts = coords; map.fitBounds(coords, { padding: [30, 30] }); redraw(); };
calc();
