'use strict';
/*
 * Couche de mouvement d'EcoScan : défilement fluide (Lenis), récit au défilement (GSAP + ScrollTrigger),
 * boutons magnétiques, transitions entre parcours. Tout se dégrade proprement : sans JavaScript,
 * avec « réduire les animations » ou si les bibliothèques ne se chargent pas, le contenu reste lisible.
 * Le travail non essentiel est reporté à un moment de repos du navigateur pour protéger le premier affichage.
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
  const idle = fn => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1200 }) : setTimeout(fn, 250));

  root.classList.add('js');
  if (!hasGSAP) { $('#story-pin')?.classList.add('is-static'); return; }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (!reduced()) root.classList.add('fx');

  /* ───────────── Défilement fluide (pointeur fin uniquement : le tactile reste natif) ───────────── */
  let lenis = null;
  if (!reduced() && finePointer && typeof Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 0.95, smoothWheel: true, anchors: false });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    root.classList.add('ecoscan-smooth');
  }
  const scrollToY = y => (lenis ? lenis.scrollTo(y, { duration: 1.1, easing: t => 1 - Math.pow(1 - t, 4) }) : scrollTo({ top: y, behavior: reduced() ? 'auto' : 'smooth' }));

  /* ───────────── En-tête : fond renforcé après un peu de défilement ───────────── */
  const header = $('header');
  let headerTicking = false;
  const onScrollHeader = () => { headerTicking = false; header?.classList.toggle('is-scrolled', scrollY > 24); };
  addEventListener('scroll', () => { if (!headerTicking) { headerTicking = true; requestAnimationFrame(onScrollHeader); } }, { passive: true });
  onScrollHeader();

  /* ───────────── Arrivée du hero : texte seulement. L'image (LCP) n'est jamais masquée. ───────────── */
  const hero = $('#accueil');
  if (hero && !reduced()) {
    gsap.timeline({ defaults: { ease: 'expo.out' } })
      .from('.h1-line > span', { yPercent: 115, duration: 1.1, stagger: 0.08 }, 0)
      .from('.hero-copy .eyebrow, .hero-description, .hero-caption', { y: 18, opacity: 0, duration: 0.8, stagger: 0.06 }, 0.25)
      .from('.hero-actions > *', { opacity: 0, duration: 0.8, stagger: 0.06 }, 0.4);
  }

  /* ───────────── Rideau de transition entre parcours ───────────── */
  const curtain = document.createElement('div');
  curtain.className = 'curtain'; curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = '<span class="curtain-mark"></span><strong class="curtain-label"></strong>';
  document.body.append(curtain);
  const labels = { discover: 'Découvrir', try: 'Essayer', build: 'Construire', mission: 'Mission', resources: 'Ressources' };
  document.addEventListener('ecoscan:viewchange', e => {
    /* Le script de navigation envoie déjà un « resize » : ScrollTrigger se recalcule une seule fois. */
    const { group, previous } = e.detail || {};
    if (!group || group === previous || reduced()) return;
    $('.curtain-label', curtain).textContent = labels[group] || '';
    gsap.killTweensOf(curtain);
    gsap.set(curtain, { display: 'grid', clipPath: 'inset(0% 0% 0% 0%)' });
    gsap.fromTo('.curtain-label', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'expo.out' });
    gsap.to(curtain, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.75, delay: 0.38, ease: 'expo.inOut', onComplete: () => gsap.set(curtain, { display: 'none' }) });
  });
  addEventListener('load', () => ScrollTrigger.refresh());

  /* ───────────── Trajet d'un objet : récit épinglé ───────────── */
  initStory();

  /* ───────────── Le reste, au repos du navigateur ───────────── */
  idle(() => {
    /* Titres révélés mot à mot : seulement les grandes ouvertures de section. */
    const splitTargets = $$('#promesse h2, #station h2, #video-explicative h2, #trajet h2, #demo h2, #mission h2, #vision-monde h2, #impact h2, #participer h2');
    const splitWords = el => {
      if (el.dataset.split) return $$('.wi', el);
      el.dataset.split = '1';
      const walk = node => [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          /* espace insécable avant ? ! : ; » (typographie française) */
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
      walk(el);
      return $$('.wi', el);
    };

    if (!reduced() && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        gsap.fromTo($$('.wi', e.target), { yPercent: 112 }, { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.045, clearProps: 'transform' });
        e.target.classList.add('split-done');
      }), { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
      splitTargets.forEach(h => { splitWords(h); h.classList.add('split-ready'); io.observe(h); });

      /* Chiffres d'objectifs : compteur (les libellés restent « objectif », jamais un résultat) */
      const co = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        const el = e.target, final = el.textContent, m = final.match(/\d+/);
        if (!m) return;
        const target = +m[0], o = { v: target > 1000 ? target - 35 : 0 };
        gsap.to(o, { v: target, duration: 1.4, ease: 'power3.out', onUpdate: () => { el.textContent = final.replace(m[0], Math.round(o.v)); }, onComplete: () => { el.textContent = final; } });
      }), { threshold: 0.6 });
      $$('.metrics strong').forEach(el => co.observe(el));
    }

    /* Manifeste : les mots s'éclairent au défilement (départ à 55 % pour rester lisible) */
    const manifesto = $('[data-scrub-words]');
    if (manifesto && !reduced()) {
      const words = splitWords(manifesto);
      manifesto.classList.add('scrub-ready');
      gsap.set(words, { opacity: 0.55 });
      gsap.to(words, { opacity: 1, ease: 'none', stagger: 0.5, scrollTrigger: { trigger: manifesto, start: 'top 82%', end: 'bottom 48%', scrub: 0.6 } });
    }

    if (!reduced()) {
      $$('.model-view').forEach(el => {
        const host = el.closest('.machine-shell') || el.parentElement;
        gsap.fromTo(el, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: host, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
      if (hero) gsap.to('.hero-copy', { yPercent: -8, opacity: 0.3, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    }

    /* Pointeur fin : produit incliné en 3D, boutons magnétiques */
    if (finePointer && !reduced()) {
      const frame = $('.hero-product-frame');
      if (frame && hero) {
        const rx = gsap.quickTo(frame, 'rotationX', { duration: 0.8, ease: 'power3' });
        const ry = gsap.quickTo(frame, 'rotationY', { duration: 0.8, ease: 'power3' });
        gsap.set(frame, { transformPerspective: 1100, transformOrigin: '50% 50%' });
        hero.addEventListener('pointermove', e => {
          const r = hero.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * 10); rx(-((e.clientY - r.top) / r.height - 0.5) * 7);
        }, { passive: true });
        hero.addEventListener('pointerleave', () => { rx(0); ry(0); });
      }
      $$('.magnetic, .hero-actions .button, .footer-actions .button').forEach(btn => {
        const mx = gsap.quickTo(btn, 'x', { duration: 0.6, ease: 'elastic.out(1,.6)' });
        const my = gsap.quickTo(btn, 'y', { duration: 0.6, ease: 'elastic.out(1,.6)' });
        btn.addEventListener('pointermove', e => {
          const r = btn.getBoundingClientRect();
          mx((e.clientX - (r.left + r.width / 2)) * 0.28); my((e.clientY - (r.top + r.height / 2)) * 0.4);
        }, { passive: true });
        btn.addEventListener('pointerleave', () => { mx(0); my(0); });
      });
    }
    ScrollTrigger.refresh();
  });

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
      /* état initial */
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
      /* 1 — connexion */
      tl.to('#sg-link', { strokeDashoffset: 0, strokeDasharray: '1 0.001', duration: 0.7 }, 0.05)
        .fromTo('#sg-ping', { opacity: 1, scale: 0.6 }, { opacity: 0, scale: 3, duration: 0.55, ease: 'power1.out' }, 0.6)
        .to('#sg-session-dot', { attr: { fill: '#6fe0a0' }, duration: 0.15 }, 0.7)
        .to('#sg-phone', { scale: 1.06, duration: 0.2, yoyo: true, repeat: 1 }, 0.7);
      /* 2 — dépôt */
      tl.to(obj, { opacity: 1, y: 64, scale: 1.05, duration: 0.35, ease: 'power1.out' }, 1.0)
        .to(obj, { y: 196, scale: 0.88, duration: 0.6, ease: 'power2.in' }, 1.3)
        .to(obj, { y: 190, duration: 0.1 }, 1.9);
      /* 3 — observation */
      tl.to('#sg-beam', { opacity: 1, duration: 0.1 }, 2.0)
        .fromTo('#sg-beam', { attr: { y: 138 } }, { attr: { y: 222 }, duration: 0.5, ease: 'sine.inOut' }, 2.05)
        .to('#sg-beam', { attr: { y: 138 }, duration: 0.4, ease: 'sine.inOut' }, 2.55)
        .to('#sg-brackets', { opacity: 1, duration: 0.2 }, 2.2)
        .to(obj, { rotation: 5, duration: 0.25, yoyo: true, repeat: 1 }, 2.2)
        .to('#sg-tag', { opacity: 1, duration: 0.25 }, 2.55)
        .to('#sg-beam', { opacity: 0, duration: 0.1 }, 2.95);
      /* 4 — aiguillage */
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
      /* 5 — confirmation */
      if (k.bin) tl.to('#sg-fill-' + k.bin, { attr: { y: 522, height: 38 }, opacity: 0.85, duration: 0.4 }, 4.1);
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
      if (!st) apply(Math.max(progress, 0.9), true);
    }));
    /* flèches du clavier dans le groupe de choix */
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
    if (reduced()) { apply(0.9, true); pin.classList.add('is-static'); return; }

    const mm = gsap.matchMedia();
    mm.add({ wide: '(min-width: 861px)', narrow: '(max-width: 860px)' }, ctx => {
      const wide = ctx.conditions.wide;
      st = ScrollTrigger.create({
        trigger: pin, start: 'top top', end: () => '+=' + Math.round(innerHeight * (wide ? 4.2 : 3.4)),
        pin: true, anticipatePin: 1, invalidateOnRefresh: true,
        onUpdate: self => apply(self.progress)
      });
      apply(st.progress, true);
      return () => { st && st.kill(); st = null; };
    });
    apply(0, true);
  }
})();
