'use strict';
/*
 * EcoScan premium layer: smooth scrolling (Lenis), scroll-driven storytelling (GSAP + ScrollTrigger),
 * living hero canvas, magnetic buttons, view transitions. Everything degrades gracefully:
 * without JavaScript, with reduced motion, or when the libraries fail to load, all content stays readable.
 */
(() => {
  const root = document.documentElement;
  const hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  root.classList.add('js');
  if (!hasGSAP) { initStoryStatic(); initCanvas(); return; }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (!reduced()) root.classList.add('fx');

  /* ───────────── Smooth scrolling ───────────── */
  let lenis = null;
  if (!reduced() && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 0.95, smoothWheel: true, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    root.classList.add('has-lenis');
  }
  const scrollToY = y => (lenis ? lenis.scrollTo(y, { duration: 1.1, easing: t => 1 - Math.pow(1 - t, 4) }) : scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' }));

  /* ───────────── Header: condensed + hide on scroll down ───────────── */
  const header = $('header');
  let lastY = scrollY;
  function onScrollHeader() {
    const y = scrollY;
    if (header) {
      header.classList.toggle('is-scrolled', y > 24);
    }
    lastY = y;
  }
  addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  /* ───────────── Word splitting + reveals ───────────── */
  function splitWords(el) {
    if (el.dataset.split) return $$('.wi', el);
    el.dataset.split = '1';
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.replace(/ ([?!:;»])/g, ' $1').split(/([ \t\r\n]+)/).forEach(part => {
            if (!part) return;
            if (/^[ \t\r\n]+$/.test(part)) { frag.append(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const i = document.createElement('span'); i.className = 'wi'; i.textContent = part;
            w.append(i); frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    return $$('.wi', el);
  }

  if (!reduced() && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      gsap.fromTo($$('.wi', e.target), { yPercent: 112 }, { yPercent: 0, duration: 1.05, ease: 'expo.out', stagger: 0.055, clearProps: 'transform' });
      e.target.classList.add('split-done');
    }), { threshold: 0.2 });
    $$('main h2').forEach(h => {
      if (h.classList.contains('sr-only')) return;
      splitWords(h); h.classList.add('split-ready'); io.observe(h);
    });
  }

  /* Count-up for objective figures (labels stay "objectif", never a result) */
  if (!reduced() && 'IntersectionObserver' in window) {
    const co = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      co.unobserve(e.target);
      const el = e.target, final = el.textContent, m = final.match(/\d+/);
      if (!m) return;
      const target = +m[0], o = { v: target > 1000 ? target - 35 : 0 };
      gsap.to(o, { v: target, duration: 1.6, ease: 'power3.out', onUpdate: () => { el.textContent = final.replace(m[0], Math.round(o.v)); }, onComplete: () => { el.textContent = final; } });
    }), { threshold: 0.6 });
    $$('.metrics strong').forEach(el => co.observe(el));
  }

  /* ───────────── Hero intro ───────────── */
  const hero = $('#accueil');
  if (hero && !reduced()) {
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from('.h1-line > span', { yPercent: 115, rotate: 3, duration: 1.4, stagger: 0.09 }, 0.15)
      .from('.hero-copy .eyebrow, .hero-description, .hero-tags span, .hero-caption', { y: 24, opacity: 0, duration: 1, stagger: 0.07 }, 0.55)
      .from('.hero-actions > *', { opacity: 0, duration: 1, stagger: 0.07 }, 0.75)
      .from('.hero-product-frame', { y: 60, opacity: 0, scale: 0.94, duration: 1.5 }, 0.35)
      .from('.hero-product .hot', { scale: 0.6, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'back.out(2)' }, 1.3)
      .from('.hero-product figcaption, .hero-bottom', { opacity: 0, y: 14, duration: 1 }, 1.4);
  }

  /* Hero pointer interactions: tilt + parallax */
  const fig = $('.hero-product');
  if (fig && finePointer && !reduced()) {
    const frame = $('.hero-product-frame', fig);
    const rx = gsap.quickTo(frame, 'rotationX', { duration: 0.8, ease: 'power3' });
    const ry = gsap.quickTo(frame, 'rotationY', { duration: 0.8, ease: 'power3' });
    gsap.set(frame, { transformPerspective: 1100, transformOrigin: '50% 50%' });
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      ry(nx * 12); rx(-ny * 9);
      hero.style.setProperty('--mx', (nx * 100).toFixed(1)); hero.style.setProperty('--my', (ny * 100).toFixed(1));
    });
    hero.addEventListener('pointerleave', () => { rx(0); ry(0); });
  }

  /* ───────────── Magnetic buttons ───────────── */
  if (finePointer && !reduced()) {
    $$('.magnetic, .hero-actions .button, .footer-actions .button').forEach(btn => {
      const mx = gsap.quickTo(btn, 'x', { duration: 0.6, ease: 'elastic.out(1,.6)' });
      const my = gsap.quickTo(btn, 'y', { duration: 0.6, ease: 'elastic.out(1,.6)' });
      btn.addEventListener('pointermove', e => {
        const r = btn.getBoundingClientRect();
        mx((e.clientX - (r.left + r.width / 2)) * 0.28); my((e.clientY - (r.top + r.height / 2)) * 0.4);
      });
      btn.addEventListener('pointerleave', () => { mx(0); my(0); });
    });
  }

  /* ───────────── Scroll-scrubbed manifesto + parallax ───────────── */
  const triggers = [];
  const manifesto = $('[data-scrub-words]');
  if (manifesto && !reduced()) {
    const words = splitWords(manifesto);
    manifesto.classList.add('scrub-ready');
    gsap.set(words, { yPercent: 0, opacity: 0.14 });
    triggers.push(gsap.to(words, {
      opacity: 1, ease: 'none', stagger: 0.5,
      scrollTrigger: { trigger: manifesto, start: 'top 82%', end: 'bottom 48%', scrub: 0.6 }
    }).scrollTrigger);
  }
  if (!reduced()) {
    $$('.hero-product-frame img, .model-view').forEach(el => {
      const host = el.closest('figure, .blueprint-card, .machine-shell, section') || el.parentElement;
      gsap.fromTo(el, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: host, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    gsap.to('.hero-copy', { yPercent: -10, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero-canvas', { yPercent: 16, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
  }

  /* ───────────── View transition curtain ───────────── */
  const curtain = document.createElement('div');
  curtain.className = 'curtain'; curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<span class="curtain-mark"></span><strong class="curtain-label"></strong>';
  document.body.append(curtain);
  const labels = { discover: 'Découvrir', try: 'Essayer', build: 'Construire', mission: 'Mission', resources: 'Ressources' };
  document.addEventListener('ecoscan:viewchange', e => {
    const { group, previous } = e.detail || {};
    setTimeout(() => ScrollTrigger.refresh(), 60);
    if (!group || group === previous || reduced()) return;
    $('.curtain-label', curtain).textContent = labels[group] || '';
    gsap.killTweensOf(curtain);
    gsap.set(curtain, { display: 'grid', clipPath: 'inset(0% 0% 0% 0%)' });
    gsap.fromTo('.curtain-label', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'expo.out' });
    gsap.to(curtain, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.75, delay: 0.38, ease: 'expo.inOut', onComplete: () => gsap.set(curtain, { display: 'none' }) });
  });
  addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());

  /* ───────────── Story: interactive scroll explainer ───────────── */
  initStory();
  initCanvas();

  function initStory() {
    const pin = $('#story-pin'); if (!pin) return;
    const svg = $('#story-svg');
    const stepsEl = $$('#story-steps li');
    const picker = $$('.story-picker button');
    const bar = $('#story-bar');
    const routeText = $('#story-route-text'), confirmText = $('#story-confirm-text');
    const q = id => svg.querySelector('#' + id);
    const obj = q('sg-obj');
    const kinds = {
      pet:   { name: 'Bouteille plastique', bin: 'pet', x: 238, angle: -30, pts: 10, route: 'Les plaques s’inclinent vers la voie PET, à l’intérieur.', confirm: 'Les points n’arrivent qu’après confirmation du passage : +10 EcoPoints fictifs dans la démo.', toast: '+10 · passage confirmé' },
      can:   { name: 'Canette aluminium', bin: 'can', x: 320, angle: 90, pts: 10, route: 'La trappe centrale s’ouvre : l’aluminium tombe tout droit.', confirm: 'Les points n’arrivent qu’après confirmation du passage : +10 EcoPoints fictifs dans la démo.', toast: '+10 · passage confirmé' },
      paper: { name: 'Papier propre', bin: 'paper', x: 402, angle: 30, pts: 10, route: 'Les plaques basculent vers la voie papier.', confirm: 'Les points n’arrivent qu’après confirmation du passage : +10 EcoPoints fictifs dans la démo.', toast: '+10 · passage confirmé' },
      cup:   { name: 'Gobelet · doute', bin: null, x: 82, angle: 0, pts: 0, route: 'Un doute reste un doute : l’objet part vers la voie de contrôle isolée, jamais dans un bac de matière.', confirm: 'Aucun point : un objet incertain n’est pas crédité. Un humain tranchera à la collecte.', toast: '0 point · contrôle requis' }
    };
    let kind = 'pet', tl = null, progress = 0, st = null, activeStep = -1;
    const NS = 5;

    function build() {
      const k = kinds[kind];
      if (tl) tl.kill();
      $$('[data-kind]', obj).forEach(g => { g.style.display = g.dataset.kind === kind ? '' : 'none'; });
      const tagText = q('sg-tag-text'); tagText.textContent = k.name;
      tagText.setAttribute('fill', kind === 'cup' ? '#f2b574' : '#efeadc');
      routeText.textContent = k.route; confirmText.textContent = k.confirm;
      const points = { v: 0 }, ptsEl = q('sg-points');
      const bins = ['pet', 'can', 'paper'];
      tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
      /* initial state */
      tl.set(obj, { x: 320, y: 20, opacity: 0, scale: 1.05, rotation: 0 }, 0)
        .set('#sg-link', { strokeDashoffset: 1, strokeDasharray: '0.02 0.03' }, 0)
        .set('#sg-ping', { opacity: 0, scale: 1 }, 0)
        .set('#sg-beam, #sg-brackets, #sg-tag, #sg-toast', { opacity: 0 }, 0)
        .set('#sg-diverter', { rotation: 0 }, 0)
        .set('#sg-gate', { opacity: 1 }, 0)
        .set('#sg-session-dot', { attr: { fill: '#4a5c53' } }, 0)
        .set('#sg-phone', { scale: 1 }, 0)
        .set(bins.map(b => '#sg-fill-' + b), { attr: { y: 552, height: 8 }, opacity: 0.25 }, 0);
      ptsEl.textContent = '0';
      /* 1 — connect */
      tl.to('#sg-link', { strokeDashoffset: 0, strokeDasharray: '1 0.001', duration: 0.7 }, 0.05)
        .fromTo('#sg-ping', { opacity: 1, scale: 0.6 }, { opacity: 0, scale: 3, duration: 0.55, ease: 'power1.out' }, 0.6)
        .to('#sg-session-dot', { attr: { fill: '#6fe0a0' }, duration: 0.15 }, 0.7)
        .to('#sg-phone', { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1 }, 0.7);
      /* 2 — deposit */
      tl.to(obj, { opacity: 1, y: 64, scale: 1.05, duration: 0.35, ease: 'power1.out' }, 1.0)
        .to(obj, { y: 196, scale: 0.88, duration: 0.6, ease: 'power2.in' }, 1.3)
        .to(obj, { y: 190, duration: 0.1 }, 1.9);
      /* 3 — observe */
      tl.to('#sg-beam', { opacity: 1, duration: 0.1 }, 2.0)
        .fromTo('#sg-beam', { attr: { y: 138 } }, { attr: { y: 222 }, duration: 0.5, ease: 'sine.inOut' }, 2.05)
        .to('#sg-beam', { attr: { y: 138 }, duration: 0.4, ease: 'sine.inOut' }, 2.55)
        .to('#sg-brackets', { opacity: 1, duration: 0.2 }, 2.2)
        .to(obj, { rotation: 5, duration: 0.25, yoyo: true, repeat: 1 }, 2.2)
        .to('#sg-tag', { opacity: 1, duration: 0.25 }, 2.55)
        .to('#sg-beam', { opacity: 0, duration: 0.1 }, 2.95);
      /* 4 — route */
      if (kind === 'cup') {
        tl.to('#sg-brackets', { attr: { stroke: '#e8923a' }, duration: 0.2 }, 3.0)
          .to('#sg-gate', { opacity: 0, duration: 0.15 }, 3.2)
          .to(obj, { x: 82, y: 206, scale: 0.8, duration: 0.7, ease: 'power3.inOut' }, 3.25)
          .to('#sg-brackets, #sg-tag', { opacity: 0, duration: 0.2 }, 3.9);
      } else {
        tl.to('#sg-brackets, #sg-tag', { opacity: 0, duration: 0.2 }, 3.0)
          .to('#sg-diverter', { rotation: k.angle, duration: 0.35 }, 3.0)
          .to(obj, { y: 280, x: k.angle === 90 ? 320 : 320 + (k.angle < 0 ? -6 : 6), duration: 0.3, ease: 'power2.in' }, 3.3)
          .to(obj, { x: k.x, y: k.angle === 90 ? 400 : 420, rotation: k.angle === 90 ? 0 : (k.angle < 0 ? -28 : 28), duration: 0.38, ease: 'power1.in' }, 3.6)
          .to(obj, { y: 508, rotation: 0, scale: 0.72, duration: 0.3, ease: 'bounce.out' }, 3.95);
      }
      /* 5 — confirm */
      if (k.bin) {
        tl.to('#sg-fill-' + k.bin, { attr: { y: 522, height: 38 }, opacity: 0.85, duration: 0.4 }, 4.1);
      }
      tl.set('#sg-toast-text', { textContent: k.toast }, 4.05)
        .to('#sg-toast', { opacity: 1, duration: 0.25 }, 4.1)
        .to(points, { v: k.pts, duration: 0.5, ease: 'power1.out', onUpdate: () => { ptsEl.textContent = Math.round(points.v); } }, 4.2)
        .to('#sg-phone', { scale: 1.08, duration: 0.2, yoyo: true, repeat: 1 }, 4.25)
        .to({}, { duration: 0.01 }, NS);
      tl.duration(NS);
      tl.progress(progress);
    }

    function setStepUI(p) {
      const idx = clamp(Math.floor(p * NS), 0, NS - 1);
      if (idx === activeStep) return;
      activeStep = idx;
      stepsEl.forEach((li, i) => {
        li.classList.toggle('is-active', i === idx);
        li.classList.toggle('is-done', i < idx);
        const b = $('button', li); if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }
    function apply(p, instant) {
      progress = clamp(p, 0, 1);
      bar.style.transform = `scaleX(${progress})`;
      setStepUI(progress);
      if (!tl) return;
      if (instant || reduced()) tl.progress(progress);
      else gsap.to(tl, { progress, duration: 0.45, ease: 'power2.out', overwrite: true });
    }

    picker.forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.kind === kind) return;
      kind = btn.dataset.kind;
      picker.forEach(b => b.setAttribute('aria-checked', String(b === btn)));
      build();
      if (progress < 0.5 && st) { /* nudge toward the interesting part */ }
      if (!st) apply(Math.max(progress, 0.9), true);
    }));
    /* arrow keys inside the radiogroup */
    $('.story-picker').addEventListener('keydown', e => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const i = picker.findIndex(b => b.getAttribute('aria-checked') === 'true');
      const n = picker[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : picker.length - 1)) % picker.length];
      n.focus(); n.click();
    });

    stepsEl.forEach((li, i) => $('button', li).addEventListener('click', () => {
      const target = (i + 0.5) / NS;
      if (st) scrollToY(st.start + target * (st.end - st.start));
      else apply(target, true);
    }));

    build();
    const static_ = reduced() || !hasGSAP;
    if (static_) { apply(0.9, true); pin.classList.add('is-static'); return; }

    const mm = gsap.matchMedia();
    mm.add({ wide: '(min-width: 861px)', narrow: '(max-width: 860px)' }, ctx => {
      const wide = ctx.conditions.wide;
      st = ScrollTrigger.create({
        trigger: pin, start: wide ? 'top top' : 'top top', end: () => '+=' + Math.round(innerHeight * (wide ? 4.2 : 3.4)),
        pin: true, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: self => apply(self.progress)
      });
      apply(st.progress, true);
      return () => { st && st.kill(); st = null; };
    });
    apply(0, true);
  }

  function initStoryStatic() { /* no GSAP: leave the readable list and static SVG */ $('#story-pin')?.classList.add('is-static'); }

  /* ───────────── Hero canvas: matter drifting, scanned by a light line ───────────── */
  function initCanvas() {
    const cv = $('#hero-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const host = cv.parentElement;
    let w = 0, h = 0, dpr = 1, parts = [], raf = 0, visible = true, t0 = performance.now();
    const pointer = { x: -999, y: -999 };
    const mobile = innerWidth < 760;
    const COLORS = ['236,240,233', '236,240,233', '236,240,233', '111,224,160', '111,224,160'];

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = host.clientWidth; h = host.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(clamp(w * h / (mobile ? 19000 : 14000), 18, 80));
      parts = Array.from({ length: n }, () => make(true));
    }
    function make(anywhere) {
      const type = Math.floor(Math.random() * 4);
      const s = 5 + Math.random() * 13;
      return {
        type, s, x: Math.random() * w, y: anywhere ? Math.random() * h : -20,
        vy: 0.16 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.12, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.012,
        c: COLORS[Math.floor(Math.random() * COLORS.length)], a: 0.07 + Math.random() * 0.16, lit: 0, ox: 0, oy: 0
      };
    }
    function shape(p) {
      ctx.save(); ctx.translate(p.x + p.ox, p.y + p.oy); ctx.rotate(p.rot);
      const s = p.s;
      ctx.beginPath();
      if (p.type === 0) ctx.arc(0, 0, s * 0.5, 0, 6.283);
      else if (p.type === 1) ctx.roundRect(-s * 0.3, -s * 0.8, s * 0.6, s * 1.6, s * 0.2);
      else if (p.type === 2) ctx.roundRect(-s * 0.45, -s * 0.7, s * 0.9, s * 1.4, s * 0.14);
      else { ctx.moveTo(-s * 0.6, -s * 0.5); ctx.lineTo(s * 0.5, -s * 0.6); ctx.lineTo(s * 0.6, s * 0.5); ctx.lineTo(-s * 0.5, s * 0.6); ctx.closePath(); }
      const a = p.a + p.lit * 0.7;
      ctx.fillStyle = p.lit > 0.05 ? `rgba(111,224,160,${a})` : `rgba(${p.c},${p.a})`;
      ctx.fill();
      if (p.lit > 0.05) { ctx.lineWidth = 1; ctx.strokeStyle = `rgba(111,224,160,${p.lit * 0.9})`; ctx.stroke(); }
      ctx.restore();
    }
    function frame(now) {
      raf = 0;
      if (!visible) return;
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      const scanY = ((t * 0.12) % 1.3 - 0.15) * h; // light line sweeping top → bottom
      /* scan line */
      const g = ctx.createLinearGradient(0, scanY - 70, 0, scanY + 6);
      g.addColorStop(0, 'rgba(111,224,160,0)'); g.addColorStop(1, 'rgba(111,224,160,.10)');
      ctx.fillStyle = g; ctx.fillRect(0, scanY - 70, w, 76);
      ctx.fillStyle = 'rgba(111,224,160,.35)'; ctx.fillRect(0, scanY, w, 1);
      for (const p of parts) {
        p.y += p.vy; p.x += p.vx + Math.sin(t * 0.6 + p.s) * 0.1; p.rot += p.vr;
        const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < 22000) { const f = (1 - d2 / 22000) * 2.2; const d = Math.sqrt(d2) || 1; p.ox += dx / d * f; p.oy += dy / d * f; }
        p.ox *= 0.94; p.oy *= 0.94;
        if (Math.abs(p.y - scanY) < 14) p.lit = 1; else p.lit *= 0.965;
        if (p.y > h + 24) Object.assign(p, make(false), { x: Math.random() * w });
        shape(p);
      }
      raf = requestAnimationFrame(frame);
    }
    function drawStatic() { ctx.clearRect(0, 0, w, h); parts.forEach(shape); }
    function start() { if (!raf && visible && !reduced()) raf = requestAnimationFrame(frame); }

    resize();
    if (reduced()) drawStatic();
    new ResizeObserver(() => { resize(); if (reduced()) drawStatic(); }).observe(host);
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { threshold: 0 }).observe(host);
    document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) start(); });
    host.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; });
    host.addEventListener('pointerleave', () => { pointer.x = pointer.y = -999; });
    mqReduce.addEventListener?.('change', () => { if (reduced()) { cancelAnimationFrame(raf); raf = 0; drawStatic(); } else start(); });
    start();
  }
})();
