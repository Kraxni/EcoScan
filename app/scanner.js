'use strict';
/*
 * EcoScan · lecture du QR code de la station avec la caméra.
 * Utilise le lecteur du navigateur (BarcodeDetector) quand il existe, sinon jsQR (chargé seulement à ce moment-là : Safari n'a pas BarcodeDetector).
 * L'image reste sur le téléphone : rien n'est enregistré ni envoyé.
 */
(() => {
  /* Le QR de la station contient une adresse (…/app/?s=ECO-001) ou simplement l'identifiant. */
  function parseStationCode(text) { const m = /ECO-\d{3,4}/i.exec(String(text || '')); return m ? m[0].toUpperCase() : null; }
  let jsqrPromise = null;
  const loadJsQR = () => window.jsQR ? Promise.resolve(window.jsQR) : (jsqrPromise = jsqrPromise || new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'vendor/jsqr.js'; s.onload = () => res(window.jsQR); s.onerror = () => { jsqrPromise = null; rej(new Error('jsqr')); }; document.head.append(s);
  }));

  async function start(video, { onCode, onError }) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { onError('unsupported'); return null; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }); }
    catch (e) { onError(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'nocamera' : 'error'); return null; }
    video.srcObject = stream; video.muted = true; video.setAttribute('playsinline', '');
    await video.play().catch(() => {});
    const detector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stopped = false, last = 0, lastUnknown = '';
    const stop = () => { stopped = true; stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
    const tick = async ts => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth && ts - last > 140) {
        last = ts;
        try {
          let text = null;
          if (detector) { const r = await detector.detect(video); text = r[0] && r[0].rawValue; }
          else {
            const scale = Math.min(1, 640 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height); const jq = await loadJsQR();
            const r = jq(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' }); text = r && r.data;
          }
          if (text) {
            const code = parseStationCode(text);
            if (code && !stopped) { stop(); onCode(code, text); return; }
            if (text !== lastUnknown) { lastUnknown = text; onError('unknown_qr'); }
          }
        } catch { /* image illisible : on réessaie à l'image suivante */ }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return { stop };
  }
  window.EcoScanner = { start, parseStationCode };
})();
