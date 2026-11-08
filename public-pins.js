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
  const BLOCKER = 'Public publishing is off. It needs a connected store and a signed-in owner. Save on this device keeps a pin on this phone only. Other people will not see it. Nothing was published.';

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

  function publishControl(connected, mode, groupShareChecked) {
    const group = mode === 'private' && !!groupShareChecked;
    return {
      publishEnabled: !!connected,
      publishHidden: !connected,
      saveLabel: group ? 'Share with group' : 'Save on this device',
      status: connected
        ? 'Signed in. Publish publicly keeps this exact address visible to other people after you close the app. Only that account can edit or delete it.'
        : 'Public publishing needs a connected store and a signed-in owner. It is turned off. Save on this device keeps the pin on this phone only. Other people will not see it.'
    };
  }

  function jwtRole(token) {
    const part = String(token || '').split('.')[1];
    if (!part) return '';
    try {
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
      const json = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(json).role || '';
    } catch (e) { return ''; }
  }

  function createSupabaseStore(config, fetchImpl) {
    config = config || {};
    const fetchFn = fetchImpl || null;
    const url = String(config.url || '').replace(/\/$/, '');
    const anonKey = config.anonKey || '';
    const accessToken = config.accessToken || '';
    if (!url || !anonKey || !accessToken || !fetchFn) {
      const err = new Error('Supabase public pin store is not configured');
      err.code = 'not-configured';
      throw err;
    }
    if (jwtRole(anonKey) === 'service_role' || jwtRole(accessToken) === 'service_role') {
      const err = new Error('Refusing a service role key in the client');
      err.code = 'forbidden-key';
      throw err;
    }
    const base = url + '/rest/v1/public_pins';
    function headers(extra) {
      return Object.assign({
        apikey: anonKey,
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }, extra || {});
    }
    async function parse(res) {
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-owner', status: res.status };
      if (!res.ok) return { ok: false, reason: 'http-' + res.status, status: res.status };
      const text = await res.text();
      return { ok: true, body: text ? JSON.parse(text) : null };
    }
    return {
      connected: true,
      provider: 'supabase',
      async publish(pin) {
        const res = await fetchFn(base, {
          method: 'POST',
          headers: headers({ Prefer: 'return=representation' }),
          body: JSON.stringify({ id: pin.id, lon: pin.lon, lat: pin.lat, address: pin.address, label: pin.label || '', visibility: 'public' })
        });
        return parse(res);
      },
      async list() {
        const res = await fetchFn(base + '?select=id,lon,lat,address,label,visibility,created_at&visibility=eq.public', { headers: headers() });
        const parsed = await parse(res);
        return parsed.ok && parsed.body ? parsed.body : [];
      },
      async update(id, patch) {
        const res = await fetchFn(base + '?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH',
          headers: headers({ Prefer: 'return=representation' }),
          body: JSON.stringify({ label: patch.label || '' })
        });
        return parse(res);
      },
      async remove(id) {
        const res = await fetchFn(base + '?id=eq.' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: headers({ Prefer: 'return=minimal' })
        });
        return parse(res);
      }
    };
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
        if (!connected) return { pin: null, published: false, blocker: BLOCKER, ownerToken: null };
        const ownerToken = store.issueToken ? store.issueToken(pin) : null;
        const sent = await store.publish(pin, ownerToken);
        if (!sent || sent.ok === false) return { pin: null, published: false, blocker: BLOCKER, ownerToken: null };
        pin.published = true;
        local = local.filter(item => item.id !== pin.id).concat([Object.assign({}, pin)]);
        saveLocal();
        return { pin: Object.assign({}, pin), published: true, blocker: '', ownerToken: ownerToken };
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
    publishControl: publishControl,
    memoryStore: memoryStore,
    createSupabaseStore: createSupabaseStore,
    createBook: createBook
  };
});
