'use strict';
/* Gallery vs camera photo picking. Both sources hand a File to the existing
   car / business-card processors. Permission alone never produces a file. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PhotoPick = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function classifyPick(files) {
    const file = files && files.length ? files[0] : null;
    if (!file) return { kind: 'cancel' };
    return { kind: 'file', file: file };
  }

  function classifyNativeError(err) {
    const msg = String((err && (err.message || err.errorMessage)) || err || '');
    const code = err && err.code;
    if (code === 'cancel' || /cancel/i.test(msg)) return { kind: 'cancel' };
    if (code === 'denied' || /denied|not authorized|permission|restricted/i.test(msg)) return { kind: 'denied' };
    if (code === 'unsupported' || /unavailable|no camera|unsupported|not supported/i.test(msg)) return { kind: 'unsupported' };
    return { kind: 'error', message: msg };
  }

  function messageFor(kind, source) {
    if (kind === 'cancel') return '';
    if (kind === 'denied') return 'Photo access was denied. Nothing was uploaded. You can allow the camera or photos in Settings, or use the other button.';
    if (kind === 'unsupported' && source === 'camera') return 'Taking a photo is not available here. Choose from Gallery instead. Nothing was uploaded.';
    if (kind === 'unsupported') return 'Choosing a photo is not available here. Nothing was uploaded.';
    return 'Could not open the photo picker. Nothing was uploaded.';
  }

  function configureInput(input, source) {
    input.accept = 'image/*';
    if (input.multiple) input.multiple = false;
    input.removeAttribute('multiple');
    if (source === 'camera') input.setAttribute('capture', 'environment');
    else input.removeAttribute('capture');
    return input;
  }

  function prepareReselect(input) {
    input.value = '';
    return input;
  }

  function defaultCameraAvailable(nav) {
    nav = nav || (typeof navigator !== 'undefined' ? navigator : {});
    const ua = nav.userAgent || '';
    if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
    if (nav.userAgentData && nav.userAgentData.mobile) return true;
    if (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1) return true;
    return false;
  }

  function wirePhotoSources(opts) {
    const galleryInput = opts.galleryInput;
    const cameraInput = opts.cameraInput;
    const onFile = opts.onFile;
    const setStatus = opts.setStatus || function () {};
    const nativePick = opts.nativePick || null;
    const cameraAvailable = opts.cameraAvailable || defaultCameraAvailable;
    configureInput(galleryInput, 'gallery');
    configureInput(cameraInput, 'camera');

    async function deliver(file, source) {
      await onFile(file, source);
    }

    function onChange(source) {
      return async function (e) {
        const input = e.target;
        const picked = classifyPick(input.files);
        prepareReselect(input);
        if (picked.kind !== 'file') return;
        await deliver(picked.file, source);
      };
    }
    galleryInput.addEventListener('change', onChange('gallery'));
    cameraInput.addEventListener('change', onChange('camera'));

    async function begin(source) {
      if (nativePick) {
        try {
          const file = await nativePick(source);
          const picked = classifyPick(file ? [file] : []);
          if (picked.kind !== 'file') return;
          await deliver(picked.file, source);
          return;
        } catch (err) {
          const kind = classifyNativeError(err).kind;
          if (kind === 'cancel') return;
          if (kind === 'denied') { setStatus(messageFor('denied', source)); return; }
          if (kind !== 'unsupported') { setStatus(messageFor(kind, source)); return; }
        }
      }
      if (source === 'camera' && !cameraAvailable()) {
        setStatus(messageFor('unsupported', 'camera'));
        return;
      }
      const input = source === 'camera' ? cameraInput : galleryInput;
      prepareReselect(input);
      try { input.click(); }
      catch (e) { setStatus(messageFor('unsupported', source)); }
    }

    opts.galleryBtn.addEventListener('click', function () { begin('gallery'); });
    opts.cameraBtn.addEventListener('click', function () { begin('camera'); });
    return { begin: begin };
  }

  return {
    classifyPick: classifyPick,
    classifyNativeError: classifyNativeError,
    messageFor: messageFor,
    configureInput: configureInput,
    prepareReselect: prepareReselect,
    defaultCameraAvailable: defaultCameraAvailable,
    wirePhotoSources: wirePhotoSources
  };
});
