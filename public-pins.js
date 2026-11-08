'use strict';
/* Address pins the user explicitly marks public.
   The app has no durable public database. The free MQTT brokers used for live
   cars and group pins do not keep a message until its creator deletes it, and
   a client id is not an account. This module therefore refuses to publish a
   public address pin until a real store is connected. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PublicPins = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const BLOCKER = 'Not public yet. Street Knowledge has no durable public database, so this exact address was not sent to anyone. It is saved on this device only. The free sharing brokers can drop messages and cannot prove who created a pin, so they are not used for this. Nothing was published.';

  function okCoord(lon, lat) {
    return typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  function clean(v, n) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, n);
  }

  function photonUrl(query, bias) {
    const q = clean(query, 160);
    const lat = bias && okCoord(bias.lon, bias.lat) ? bias.lat : '';
    const lon = bias && okCoord(bias.lon, bias.lat) ? bias.lon : '';
    return 'https://photon.komoot.io/api/?q=' + encodeURIComponent(q) + '&limit=6&lang=en' + (lat === '' ? '' : '&lat=' + lat + '&lon=' + lon);
  }

  function parsePhoton(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
    const coords = feature.geometry.coordinates;
    const lon = round6(+coords[0]);
    const lat = round6(+coords[1]);
    if (!okCoord(lon, lat)) return null;
    const p = feature.properties || {};
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ') || p.city || p.county || 'Place';
    const sub = [p.street, p.city || p.county, p.state, p.country].filter(Boolean).filter(x => x !== name).join(', ');
    return { source: 'geocode', lon: lon, lat: lat, name: clean(name, 80), address: clean(sub ? name + ', ' + sub : name, 160) };
  }

  function confirmPlace(place) {
    if (!place || place.source !== 'geocode' || !okCoord(place.lon, place.lat) || !place.address) {
      const err = new Error('Choose an address from search and confirm it');
      err.code = 'unconfirmed';
      throw err;
    }
    if (place.source === 'live' || place.source === 'saved' || place.source === 'group') {
      const err = new Error('That location cannot be published');
      err.code = 'forbidden';
      throw err;
    }
    return { source: 'geocode', lon: place.lon, lat: place.lat, name: place.name || '', address: place.address, confirmed: true };
  }

  function shareTarget(mode, base, pinId) {
    if (mode === 'private') return { kind: 'group', topic: base + '/pins/g/' + pinId };
    if (mode === 'public') return { kind: 'not-public', topic: null };
    return { kind: 'device', topic: null };
  }

  function memoryStore() {
    const rows = new Map();
    return {
      connected: true,
      async publish(pin, ownerToken) {
        rows.set(pin.id, { pin: pin, ownerToken: ownerToken });
        return { ok: true };
      },
      async list() { return [...rows.values()].map(row => row.pin); },
      async update(id, patch, ownerToken) {
        const row = rows.get(id);
        if (!row || row.ownerToken !== ownerToken) return { ok: false, reason: 'not-owner' };
        row.pin = Object.assign({}, row.pin, patch);
        return { ok: true, pin: row.pin };
      },
      async remove(id, ownerToken) {
        const row = rows.get(id);
        if (!row) return { ok: false, reason: 'missing' };
        if (row.ownerToken !== ownerToken) return { ok: false, reason: 'not-owner' };
        rows.delete(id);
        return { ok: true };
      }
    };
  }

  function createBook(opts) {
    opts = opts || {};
    const storage = opts.storage || { load: () => [], save: () => {} };
    const store = opts.store || null;
    const now = opts.now || (() => Date.now());
    const newId = opts.newId || (() => Math.random().toString(16).slice(2, 14));
    let local = storage.load() || [];
    const connected = !!(store && store.connected);

    function saveLocal() { storage.save(local); }

    return {
      blocker: BLOCKER,
      connected: connected,
      photonUrl: photonUrl,
    parsePhoton: parsePhoton,
      confirmPlace: confirmPlace,
      shareTarget: shareTarget,
      listLocal: () => local.map(pin => Object.assign({}, pin)),
      async listRemote() {
        if (!connected) return [];
        return store.list();
      },
      async publishPublic(draft) {
        const place = confirmPlace(draft && draft.place);
        const pin = {
          id: newId(),
          source: 'geocode',
          lon: place.lon,
          lat: place.lat,
          address: place.address,
          label: clean(draft.label, 40),
          visibility: 'public',
          ts: now(),
          published: false
        };
        const ownerToken = connected && store.issueToken ? store.issueToken(pin) : null;
        if (connected) {
          const sent = await store.publish(pin, ownerToken);
          if (!sent || sent.ok === false) return { pin: pin, published: false, blocker: BLOCKER, ownerToken: null };
          pin.published = true;
        }
        local = local.filter(item => item.id !== pin.id).concat([Object.assign({}, pin, { ownerToken: ownerToken })]);
        saveLocal();
        return { pin: Object.assign({}, pin), published: pin.published, blocker: pin.published ? '' : BLOCKER, ownerToken: ownerToken };
      },
      async updateLocal(id, patch, ownerToken) {
        const i = local.findIndex(pin => pin.id === id);
        if (i < 0) return { ok: false, reason: 'missing' };
        const pin = local[i];
        if (pin.published) {
          if (!connected) return { ok: false, reason: 'not-connected' };
          const remote = await store.update(id, { label: clean(patch.label, 40) }, ownerToken);
          if (!remote || remote.ok === false) return { ok: false, reason: (remote && remote.reason) || 'not-owner' };
        }
        pin.label = clean(patch.label, 40);
        pin.address = patch.address ? clean(patch.address, 160) : pin.address;
        local[i] = pin;
        saveLocal();
        return { ok: true, pin: Object.assign({}, pin), remote: !!pin.published };
      },
      async remove(id, ownerToken) {
        const i = local.findIndex(pin => pin.id === id);
        const pin = i >= 0 ? local[i] : null;
        if (pin && pin.published) {
          if (!connected) return { ok: false, reason: 'not-connected', removedRemote: false };
          const remote = await store.remove(id, ownerToken);
          if (!remote || remote.ok === false) return { ok: false, reason: (remote && remote.reason) || 'not-owner', removedRemote: false };
        } else if (!pin && connected) {
          const remote = await store.remove(id, ownerToken);
          if (!remote || remote.ok === false) return { ok: false, reason: (remote && remote.reason) || 'not-owner', removedRemote: false };
        }
        if (i >= 0) { local.splice(i, 1); saveLocal(); }
        return { ok: true, removedRemote: !!(pin && pin.published), published: false };
      }
    };
  }

  return {
    BLOCKER: BLOCKER,
    photonUrl: photonUrl,
    parsePhoton: parsePhoton,
    confirmPlace: confirmPlace,
    shareTarget: shareTarget,
    memoryStore: memoryStore,
    createBook: createBook
  };
});
