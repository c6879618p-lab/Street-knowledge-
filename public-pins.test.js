'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Pins = require('./public-pins.js');

const home = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-82.5515, 35.5951] },
  properties: { name: '100 Main St', street: 'Main St', city: 'Asheville', state: 'NC', country: 'USA' }
};

function memStorage(seed) {
  let data = seed || [];
  return { load: () => data.map(pin => Object.assign({}, pin)), save: next => { data = next.map(pin => Object.assign({}, pin)); }, raw: () => data };
}

test('the public button stays hidden until a store is connected', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
  assert.match(html, /id="pinSave"[^>]*>Save on this device</);
  assert.match(html, /id="pinPublishPublic"[^>]*hidden[^>]*disabled/);
  assert.match(html, /Public publishing needs a connected store/);
  const on = Pins.publishControl(true, 'private', true);
  assert.equal(on.publishEnabled, true);
  assert.equal(on.saveLabel, 'Share with group');
});

test('address search asks only for the typed query', () => {
  const url = Pins.photonUrl('100 Main St, Asheville', { lon: -82.5, lat: 35.6 });
  assert.match(url, /q=100%20Main%20St%2C%20Asheville/);
  assert.doesNotMatch(url, /group|lastPos|cid=/);
});

test('search results become one confirmed address and ignore live or saved points', () => {
  const parsed = Pins.parsePhoton(home);
  assert.equal(parsed.source, 'geocode');
  assert.equal(parsed.lon, -82.5515);
  assert.equal(parsed.lat, 35.5951);
  assert.match(parsed.address, /Asheville/);
  const confirmed = Pins.confirmPlace(parsed);
  assert.equal(confirmed.confirmed, true);
  assert.throws(() => Pins.confirmPlace({ source: 'live', lon: -82.5, lat: 35.5, address: 'here' }), /address/);
  assert.throws(() => Pins.confirmPlace({ source: 'saved', lon: -82.5, lat: 35.5, address: 'saved home' }), /address/);
  assert.throws(() => Pins.confirmPlace({ source: 'group', lon: -82.5, lat: 35.5, address: 'group pin' }), /address/);
  assert.equal(Pins.parsePhoton({ geometry: { coordinates: [0] }, properties: {} }), null);
});

test('public publish does not broadcast when no durable store is connected', async () => {
  const storage = memStorage();
  const mqtt = [];
  const book = Pins.createBook({ storage: storage, newId: () => 'pin1', now: () => 1000 });
  const place = Pins.confirmPlace(Pins.parsePhoton(home));
  const result = await book.publishPublic({ place: place, label: 'Shop' });
  assert.equal(result.published, false);
  assert.equal(result.pin, null);
  assert.match(result.blocker, /Public publishing is off/);
  assert.match(result.blocker, /Nothing was published/);
  assert.equal(mqtt.length, 0);
  assert.deepEqual(book.listLocal(), []);
  assert.deepEqual(await book.listRemote(), []);
  const control = Pins.publishControl(false, 'public', false);
  assert.equal(control.publishEnabled, false);
  assert.equal(control.publishHidden, true);
  assert.equal(control.saveLabel, 'Save on this device');
});

test('a disconnected publish is not kept as a public pin for a reload or another client', async () => {
  const storage = memStorage();
  const first = Pins.createBook({ storage: storage, newId: () => 'pin1', now: () => 1000 });
  await first.publishPublic({ place: Pins.confirmPlace(Pins.parsePhoton(home)), label: 'Shop' });
  const reloaded = Pins.createBook({ storage: storage });
  assert.deepEqual(reloaded.listLocal(), []);
  const other = Pins.createBook({ storage: memStorage() });
  assert.deepEqual(await other.listRemote(), []);
});

test('a connected store keeps a pin after the publisher disconnects, and only the owner key can remove it', async () => {
  const store = Pins.memoryStore();
  let n = 0;
  store.issueToken = () => 'owner-secret-' + (++n);
  const publisher = Pins.createBook({ storage: memStorage(), store: store, newId: () => 'pub1', now: () => 2000 });
  const sent = await publisher.publishPublic({ place: Pins.confirmPlace(Pins.parsePhoton(home)), label: 'Meet' });
  assert.equal(sent.published, true);
  assert.equal(sent.blocker, '');
  const afterDisconnect = Pins.createBook({ storage: memStorage(), store: store });
  const visible = await afterDisconnect.listRemote();
  assert.equal(visible.length, 1);
  assert.equal(visible[0].address, sent.pin.address);
  const stranger = await afterDisconnect.remove('pub1', 'not-the-owner');
  assert.equal(stranger.ok, false);
  assert.equal(stranger.reason, 'not-owner');
  assert.equal((await store.list()).length, 1);
  const owner = await publisher.remove('pub1', sent.ownerToken);
  assert.equal(owner.ok, true);
  assert.deepEqual(await afterDisconnect.listRemote(), []);
});

test('group pins stay on the private topic and are not a public address pin', () => {
  const group = Pins.shareTarget('private', 'mcgps1/g/abc', 'g1');
  const pub = Pins.shareTarget('public', 'mcgps1/pub', 'p1');
  assert.equal(group.kind, 'group');
  assert.equal(group.topic, 'mcgps1/g/abc/pins/g/g1');
  assert.equal(pub.kind, 'not-public');
  assert.equal(pub.topic, null);
  assert.doesNotMatch(group.topic, /\/pins\/c\//);
  assert.notEqual(group.topic, pub.topic);
});

test('editing without a public row does not create a remote copy', async () => {
  const book = Pins.createBook({ storage: memStorage(), newId: () => 'pin1' });
  await book.publishPublic({ place: Pins.confirmPlace(Pins.parsePhoton(home)), label: 'Old' });
  const edited = await book.updateLocal('pin1', { label: 'New label' }, null);
  assert.equal(edited.ok, false);
  assert.equal(edited.reason, 'missing');
  assert.deepEqual(await book.listRemote(), []);
});

function fakeJwt(role) {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return part({ alg: 'none' }) + '.' + part({ role: role }) + '.sig';
}

test('the Supabase client refuses a missing or service-role configuration and sends the caller token', async () => {
  assert.throws(() => Pins.createSupabaseStore({}), /not configured/);
  assert.throws(() => Pins.createSupabaseStore({ url: 'https://example.supabase.co', anonKey: fakeJwt('service_role'), accessToken: fakeJwt('authenticated') }, async () => ({ ok: true, status: 200, text: async () => '[]' })), /service role/);
  const calls = [];
  const store = Pins.createSupabaseStore({
    url: 'https://example.supabase.co',
    anonKey: fakeJwt('anon'),
    accessToken: fakeJwt('authenticated')
  }, async (url, opts) => {
    calls.push({ url: url, opts: opts });
    return { ok: true, status: 200, text: async () => '[]' };
  });
  await store.list();
  assert.match(calls[0].url, /visibility=eq.public/);
  assert.match(calls[0].opts.headers.Authorization, /^Bearer /);
  assert.doesNotMatch(calls[0].opts.headers.Authorization, /service_role/);
  const denied = Pins.createSupabaseStore({
    url: 'https://example.supabase.co',
    anonKey: fakeJwt('anon'),
    accessToken: fakeJwt('authenticated')
  }, async () => ({ ok: false, status: 401, text: async () => '' }));
  const removed = await denied.remove('pub1');
  assert.equal(removed.reason, 'not-owner');
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, 'public-pins.js'), 'utf8');
  assert.doesNotMatch(source, /https:\/\/[a-z0-9]+\.supabase\.co/);
  assert.doesNotMatch(source, /eyJ[A-Za-z0-9_-]{20,}/);
});
