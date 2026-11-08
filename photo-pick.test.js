'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PhotoPick = require('./photo-pick.js');

function fakeInput(kind) {
  const listeners = {};
  return {
    kind: kind,
    accept: '',
    multiple: false,
    value: 'C:\\fakepath\\previous.jpg',
    files: null,
    clicked: 0,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    click() { this.clicked += 1; },
    async dispatchChange() {
      const ev = { target: this };
      for (const fn of listeners.change || []) await fn(ev);
    }
  };
}
function fakeBtn() {
  const listeners = {};
  return {
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    async click() { for (const fn of listeners.click || []) await fn(); }
  };
}
function pair() {
  return {
    galleryBtn: fakeBtn(),
    cameraBtn: fakeBtn(),
    galleryInput: fakeInput('gallery'),
    cameraInput: fakeInput('camera')
  };
}
const fileA = { name: 'car.jpg', type: 'image/jpeg', size: 10 };

test('gallery input has no capture; camera input requests the environment camera', () => {
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({ onFile() {} }, ui));
  assert.equal(ui.galleryInput.accept, 'image/*');
  assert.equal(ui.cameraInput.accept, 'image/*');
  assert.equal(ui.galleryInput.attributes.capture, undefined);
  assert.equal(ui.cameraInput.attributes.capture, 'environment');
});

test('each source sends the chosen file through the same handler', async () => {
  const seen = [];
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({ onFile(file, source) { seen.push([source, file]); } }, ui));
  ui.galleryInput.files = [fileA];
  await ui.galleryInput.dispatchChange();
  ui.cameraInput.files = [fileA];
  await ui.cameraInput.dispatchChange();
  assert.deepEqual(seen, [['gallery', fileA], ['camera', fileA]]);
});

test('choosing the same file again still reaches the handler', async () => {
  let calls = 0;
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({ onFile() { calls += 1; } }, ui));
  ui.galleryInput.files = [fileA];
  await ui.galleryInput.dispatchChange();
  assert.equal(ui.galleryInput.value, '');
  ui.galleryInput.files = [fileA];
  await ui.galleryInput.dispatchChange();
  assert.equal(calls, 2);
});

test('opening a source clears the previous selection before the picker opens', async () => {
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({
    onFile() {},
    cameraAvailable() { return true; }
  }, ui));
  ui.galleryInput.value = 'C:\\fakepath\\same.jpg';
  ui.cameraInput.value = 'C:\\fakepath\\same.jpg';
  await ui.galleryBtn.click();
  await ui.cameraBtn.click();
  assert.equal(ui.galleryInput.value, '');
  assert.equal(ui.cameraInput.value, '');
  assert.equal(ui.galleryInput.clicked, 1);
  assert.equal(ui.cameraInput.clicked, 1);
});

test('cancel and an empty selection do not call the handler', async () => {
  let calls = 0;
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({ onFile() { calls += 1; } }, ui));
  ui.galleryInput.files = [];
  await ui.galleryInput.dispatchChange();
  ui.cameraInput.files = null;
  await ui.cameraInput.dispatchChange();
  assert.equal(calls, 0);
  assert.deepEqual(PhotoPick.classifyPick([]), { kind: 'cancel' });
  assert.deepEqual(PhotoPick.classifyPick(null), { kind: 'cancel' });
});

test('desktop camera is unsupported and does not open a picker or upload', async () => {
  const notes = [];
  let calls = 0;
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({
    onFile() { calls += 1; },
    setStatus(msg) { notes.push(msg); },
    cameraAvailable() { return false; }
  }, ui));
  await ui.cameraBtn.click();
  assert.equal(ui.cameraInput.clicked, 0);
  assert.equal(calls, 0);
  assert.match(notes[0], /Choose from Gallery/);
  assert.match(notes[0], /Nothing was uploaded/);
});

test('native cancel, denial, and a picked file stay on the same handler', async () => {
  const seen = [];
  const notes = [];
  async function run(nativePick) {
    const ui = pair();
    PhotoPick.wirePhotoSources(Object.assign({
      onFile(file, source) { seen.push([source, file]); },
      setStatus(msg) { notes.push(msg); },
      nativePick: nativePick
    }, ui));
    await ui.galleryBtn.click();
    await ui.cameraBtn.click();
    assert.equal(ui.galleryInput.clicked, 0);
    assert.equal(ui.cameraInput.clicked, 0);
  }
  await run(async () => null);
  assert.deepEqual(seen, []);
  await run(async () => { const e = new Error('User denied access to photos'); throw e; });
  assert.deepEqual(seen, []);
  assert.match(notes.at(-1), /denied/);
  assert.match(notes.at(-1), /Nothing was uploaded/);
  await run(async (source) => ({ name: source + '.jpg' }));
  assert.deepEqual(seen, [['gallery', { name: 'gallery.jpg' }], ['camera', { name: 'camera.jpg' }]]);
});

test('a missing native picker falls back to the web input', async () => {
  const ui = pair();
  PhotoPick.wirePhotoSources(Object.assign({
    onFile() {},
    cameraAvailable() { return true; },
    nativePick() { const e = new Error('camera plugin unavailable'); e.code = 'unsupported'; throw e; }
  }, ui));
  await ui.galleryBtn.click();
  await ui.cameraBtn.click();
  assert.equal(ui.galleryInput.clicked, 1);
  assert.equal(ui.cameraInput.clicked, 1);
});

test('native error text maps cancel, denial, and unsupported without treating them as a photo', () => {
  assert.equal(PhotoPick.classifyNativeError(new Error('User cancelled photos app')).kind, 'cancel');
  assert.equal(PhotoPick.classifyNativeError(new Error('User denied access to camera')).kind, 'denied');
  assert.equal(PhotoPick.classifyNativeError(Object.assign(new Error('no camera'), { code: 'unsupported' })).kind, 'unsupported');
  assert.equal(PhotoPick.messageFor('cancel', 'gallery'), '');
});

test('phone user agents can use the camera input; a desktop browser cannot', () => {
  assert.equal(PhotoPick.defaultCameraAvailable({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), true);
  assert.equal(PhotoPick.defaultCameraAvailable({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), true);
  assert.equal(PhotoPick.defaultCameraAvailable({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }), true);
  assert.equal(PhotoPick.defaultCameraAvailable({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), false);
});

test('car and business-card markup exposes gallery and camera without forcing the camera on gallery', () => {
  for (const file of ['index.html', 'docs/index.html']) {
    const html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    assert.equal((html.match(/Choose from Gallery/g) || []).length, 2);
    assert.equal((html.match(/Take a Photo/g) || []).length, 2);
    assert.match(html, /id="fileInput"[^>]*accept="image\/\*"/);
    assert.doesNotMatch(html, /id="fileInput"[^>]*capture=/);
    assert.match(html, /id="fileInputCamera"[^>]*capture="environment"/);
    assert.match(html, /id="pCardFile"[^>]*accept="image\/\*"/);
    assert.doesNotMatch(html, /id="pCardFile"[^>]*capture=/);
    assert.match(html, /id="pCardCamera"[^>]*capture="environment"/);
    assert.match(html, /src="photo-pick\.js"/);
  }
  const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
  assert.match(sw, /street-knowledge-v12/);
  assert.match(sw, /photo-pick\.js/);
  assert.match(sw, /public-pins\.js/);
  assert.equal(fs.readFileSync(path.join(__dirname, 'docs/sw.js'), 'utf8'), sw);
});

test('app id and presence salt stay fixed', () => {
  const root = __dirname;
  const cap = fs.readFileSync(path.join(root, 'native/capacitor.config.json'), 'utf8');
  const gradle = fs.readFileSync(path.join(root, 'native/android/app/build.gradle'), 'utf8');
  const plist = fs.readFileSync(path.join(root, 'native/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const presence = fs.readFileSync(path.join(root, 'presence.js'), 'utf8');
  assert.match(cap, /"appId": "com\.paynelessservices\.mycargps"/);
  assert.match(gradle, /applicationId "com\.paynelessservices\.mycargps"/);
  assert.match(plist, /PRODUCT_BUNDLE_IDENTIFIER = com\.paynelessservices\.mycargps;/);
  assert.match(presence, /SALT = 'MyCarGPS::v1::7f3a91c2'/);
  const manifest = fs.readFileSync(path.join(root, 'native/android/app/src/main/AndroidManifest.xml'), 'utf8');
  const permissions = manifest.split('\n').filter(line => line.includes('uses-permission')).join('\n');
  assert.doesNotMatch(permissions, /READ_MEDIA_IMAGES|READ_MEDIA_VIDEO|READ_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/);
});
