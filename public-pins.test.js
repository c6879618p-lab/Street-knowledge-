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
  assert.match(result.blocker, /Not public yet/);
  assert.match(result.blocker, /Nothing was published/);
  assert.equal(mqtt.length, 0);
  assert.equal(book.listLocal().length, 1);
  assert.equal(book.listLocal()[0].label, 'Shop');
  assert.deepEqual(await book.listRemote(), []);
});

test('a reload keeps the local pin and a second client still receives nothing', async () => {
  const storage = memStorage();
  const first = Pins.createBook({ storage: storage, newId: () => 'pin1', now: () => 1000 });
  await first.publishPublic({ place: Pins.confirmPlace(Pins.parsePhoton(home)), label: 'Shop' });
  const reloaded = Pins.createBook({ storage: storage });
  assert.equal(reloaded.listLocal()[0].id, 'pin1');
  assert.equal(reloaded.connected, false);
  const other = Pins.createBook({ storage: memStorage() });
  assert.deepEqual(other.listLocal(), []);
  assert.deepEqual(await other.listRemote(), []);
  const removed = await reloaded.remove('pin1', null);
  assert.equal(removed.ok, true);
  assert.equal(removed.removedRemote, false);
  assert.deepEqual(reloaded.listLocal(), []);
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

test('editing a local unpublished pin does not create a remote copy', async () => {
  const storage = memStorage();
  const book = Pins.createBook({ storage: storage, newId: () => 'pin1' });
  await book.publishPublic({ place: Pins.confirmPlace(Pins.parsePhoton(home)), label: 'Old' });
  const edited = await book.updateLocal('pin1', { label: 'New label' }, null);
  assert.equal(edited.ok, true);
  assert.equal(edited.remote, false);
  assert.equal(book.listLocal()[0].label, 'New label');
  assert.deepEqual(await book.listRemote(), []);
});
