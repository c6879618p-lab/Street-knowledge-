'use strict';
/* Street Knowledge native shim: only active inside the Capacitor app; the web/PWA build never loads this file. */
(() => {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  const plug = n => (C.Plugins && C.Plugins[n]) || (C.registerPlugin && C.registerPlugin(n));
  document.documentElement.classList.add('native', 'native-' + C.getPlatform());

  /* --- Geolocation via @capacitor/geolocation (more reliable than WebView geolocation); falls back to web API --- */
  const Geo = plug('Geolocation'), webGeo = navigator.geolocation;
  if (Geo) {
    const watches = new Map(); let n = 0, permP = null;
    const perm = () => permP = permP || Geo.checkPermissions().then(p => p.location === 'granted' ? p : Geo.requestPermissions({ permissions: ['location'] })).catch(e => ({ location: 'error', e }));
    const conv = p => ({ timestamp: p.timestamp, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, altitude: p.coords.altitude ?? null, altitudeAccuracy: p.coords.altitudeAccuracy ?? null, heading: p.coords.heading ?? null, speed: p.coords.speed ?? null } });
    const err = (e, cb) => cb && cb({ code: /denied|permission/i.test(String(e && (e.message || e))) ? 1 : 2, message: String(e && (e.message || e)) });
    const opts = o => ({ enableHighAccuracy: o ? o.enableHighAccuracy !== false : true, timeout: (o && o.timeout) || 20000, maximumAge: (o && o.maximumAge) || 0 });
    const shim = {
      getCurrentPosition(ok, bad, o) { perm().then(p => { if (p.location === 'denied') return err('permission denied', bad); return Geo.getCurrentPosition(opts(o)).then(r => ok(conv(r))); }).catch(e => webGeo ? webGeo.getCurrentPosition(ok, bad, o) : err(e, bad)); },
      watchPosition(ok, bad, o) {
        const id = ++n; watches.set(id, null);
        perm().then(p => {
          if (p.location === 'denied') return err('permission denied', bad);
          return Geo.watchPosition(opts(o), (r, e) => { if (e) err(e, bad); else if (r) ok(conv(r)); }).then(cid => { if (watches.has(id)) watches.set(id, { cid }); else Geo.clearWatch({ id: cid }); });
        }).catch(e => { if (webGeo) watches.set(id, { web: webGeo.watchPosition(ok, bad, o) }); else err(e, bad); });
        return id;
      },
      clearWatch(id) { const w = watches.get(id); watches.delete(id); if (!w) return; if (w.cid) Geo.clearWatch({ id: w.cid }); if (w.web != null && webGeo) webGeo.clearWatch(w.web); }
    };
    try { Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => shim }); } catch (e) { console.warn('geo shim failed', e); }
  }

  /* --- Voice guidance via native TTS (Android WebView has no usable speechSynthesis) --- */
  const TTS = plug('TextToSpeech');
  if (TTS) {
    class Utter { constructor(t) { this.text = String(t || ''); this.rate = 1; this.lang = navigator.language || 'en-US'; } }
    window.SpeechSynthesisUtterance = Utter;
    const synth = { speaking: false, cancel() { TTS.stop().catch(() => {}); }, speak(u) { this.speaking = true; TTS.speak({ text: u.text, lang: u.lang, rate: u.rate || 1, category: 'playback' }).catch(e => console.warn('tts', e)).finally(() => { this.speaking = false; }); }, getVoices: () => [], pause() {}, resume() {} };
    try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => synth }); } catch (e) {}
  }

  /* --- Gallery / camera via the system picker. Called only after a button tap.
        Photos uses the OS photo picker (no broad library permission). A grant
        with no selected image returns null and nothing is uploaded. --- */
  const Cam = plug('Camera');
  window.__nativePickPhoto = async source => {
    if (!Cam || !Cam.getPhoto) { const e = new Error('camera plugin unavailable'); e.code = 'unsupported'; throw e; }
    const photo = await Cam.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'dataUrl',
      source: source === 'camera' ? 'CAMERA' : 'PHOTOS',
      saveToGallery: false,
      correctOrientation: true
    });
    const dataUrl = photo && (photo.dataUrl || (photo.base64String ? 'data:image/' + (photo.format || 'jpeg') + ';base64,' + photo.base64String : ''));
    if (!dataUrl) return null;
    const blob = await (await fetch(dataUrl)).blob();
    const ext = String((photo && photo.format) || 'jpeg').replace('jpeg', 'jpg');
    return new File([blob], 'photo.' + ext, { type: blob.type || 'image/jpeg' });
  };

  /* --- Open website / tel: links outside the app --- */
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const h = a.getAttribute('href'); if (/^(tel:|mailto:|sms:|https?:\/\/)/i.test(h)) { e.preventDefault(); window.open(h, '_system'); }
  }, true);
})();
