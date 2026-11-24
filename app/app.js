'use strict';
/*
 * EcoScan · application mobile (démonstration).
 * Tout est simulé : pas de caméra, pas de compte, pas de serveur, aucun point réel.
 * Les points sont stockés dans localStorage sous la même clé que le site (« ecoscan-demo-points »),
 * donc le solde est partagé avec le site EcoScan ouvert sur le même appareil.
 */
(() => {
  const { products, questions } = window.ECODATA;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const KEY = 'ecoscan-demo-points', HKEY = 'ecoscan-app-history';
  const STATION = 'ECO-001';
  const ROUTES = { pet: 'PET', can: 'aluminium', paper: 'papier', check: 'contrôle isolé' };
  const BINS = [['pet', 'PET'], ['can', 'Aluminium'], ['paper', 'Papier']];
  /* Mêmes règles que la démonstration du site : 10 points par objet reconnu, 30 pour un mélange, rien si le doute persiste. */
  const ITEMS = {
    pet: { label: 'Bouteille PET', sub: 'PET · +10', route: ['pet'], gain: 10 },
    can: { label: 'Canette', sub: 'Aluminium · +10', route: ['can'], gain: 10 },
    paper: { label: 'Papier propre', sub: 'Papier · +10', route: ['paper'], gain: 10 },
    mix: { label: 'Dépôt mélangé', sub: '3 filières · +30', route: ['pet', 'can', 'paper'], gain: 30 },
    cup: { label: 'Gobelet', sub: 'Incertain · 0', route: ['check'], gain: 0 },
    food: { label: 'Emballage alimentaire', sub: 'Incertain · 0', route: ['check'], gain: 0 }
  };
  const SEALS = {
    confirmed: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    uncertain: '<svg viewBox="0 0 24 24"><path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8"/><path d="M12 17h.01"/></svg>',
    blocked: '<svg viewBox="0 0 24 24"><path d="M8 6v12M16 6v12"/></svg>'
  };

  /* ───────────── État ───────────── */
  const state = { points: 0, history: [], session: false, busy: false, levels: { pet: 45, can: 45, paper: 45 }, view: 'scan', screen: 'home' };
  try {
    const n = Number(localStorage.getItem(KEY));
    if (Number.isSafeInteger(n) && n >= 0 && n <= 1000000) state.points = n;
    const h = JSON.parse(localStorage.getItem(HKEY) || '[]');
    if (Array.isArray(h)) state.history = h.filter(e => e && typeof e.label === 'string' && Number.isSafeInteger(e.delta) && Number.isFinite(e.t)).slice(0, 50);
  } catch { /* stockage indisponible : l'app fonctionne, sans mémoire */ }
  let storageOk = true;
  const persist = () => {
    try { localStorage.setItem(KEY, String(state.points)); localStorage.setItem(HKEY, JSON.stringify(state.history.slice(0, 50))); }
    catch { storageOk = false; }
  };
  const fmt = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const addHistory = (label, delta) => { state.history.unshift({ t: Date.now(), label, delta }); state.history = state.history.slice(0, 50); };

  /* ───────────── Rendu ───────────── */
  function renderPoints(bump) {
    for (const id of ['home-points', 'wallet-points']) {
      const el = $('#' + id); el.textContent = state.points;
      if (bump && !reduced()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
    $('#wallet-count').textContent = plural(state.history.filter(e => e.delta > 0).length, 'dépôt simulé', 'dépôts simulés');
  }
  function historyItem(e) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const b = document.createElement('b'); b.textContent = e.label;
    const s = document.createElement('small'); s.textContent = fmt.format(e.t);
    left.append(b, s);
    const d = document.createElement('span'); d.className = 'delta' + (e.delta > 0 ? ' plus' : '');
    d.textContent = e.delta > 0 ? `+${e.delta}` : e.delta < 0 ? `−${Math.abs(e.delta)}` : '0';
    d.setAttribute('aria-label', e.delta > 0 ? `plus ${e.delta} point${e.delta > 1 ? 's' : ''}` : e.delta < 0 ? `moins ${Math.abs(e.delta)} points` : 'aucun point');
    li.append(left, d);
    return li;
  }
  function renderHistory() {
    const list = $('#history'); list.replaceChildren();
    if (!state.history.length) { const li = document.createElement('li'); const p = document.createElement('span'); p.className = 'empty'; p.textContent = 'Aucune activité pour l’instant.'; li.append(p); list.append(li); }
    else state.history.slice(0, 20).forEach(e => list.append(historyItem(e)));
    const home = $('#home-activity'); home.replaceChildren();
    if (!state.history.length) {
      const a = document.createElement('p'); a.className = 'strong'; a.textContent = 'Aucun dépôt pour l’instant.';
      const b = document.createElement('p'); b.className = 'small'; b.textContent = 'Simulez un dépôt pour voir votre historique apparaître ici.';
      home.append(a, b);
    } else { const ul = document.createElement('ul'); ul.className = 'history'; state.history.slice(0, 3).forEach(e => ul.append(historyItem(e))); home.append(ul); home.style.padding = '0'; }
    if (!state.history.length) home.style.padding = '';
  }
  function renderBins() {
    const wrap = $('#bins'); wrap.replaceChildren();
    for (const [key, name] of BINS) {
      const v = Math.min(100, state.levels[key]);
      const d = document.createElement('div'); d.className = 'bin' + (v >= 100 ? ' full' : '');
      const b = document.createElement('b'); b.textContent = name;
      const g = document.createElement('div'); g.className = 'gauge'; g.setAttribute('role', 'meter'); g.setAttribute('aria-label', `Remplissage ${name}`);
      g.setAttribute('aria-valuemin', '0'); g.setAttribute('aria-valuemax', '100'); g.setAttribute('aria-valuenow', v);
      const s = document.createElement('span'); s.style.width = v + '%'; g.append(s);
      const t = document.createElement('small'); t.textContent = v >= 100 ? 'Plein' : v + ' %';
      d.append(b, g, t); wrap.append(d);
    }
  }
  function renderObjects() {
    const fs = $('#objects');
    for (const [key, it] of Object.entries(ITEMS)) {
      const l = document.createElement('label'); l.className = 'tile';
      const i = document.createElement('input'); i.type = 'radio'; i.name = 'item'; i.value = key; if (key === 'pet') i.checked = true;
      const box = document.createElement('span'); box.className = 'tile-box';
      const b = document.createElement('b'); b.textContent = it.label;
      const s = document.createElement('small'); s.textContent = it.sub; if (it.gain === 0) s.className = 'warn';
      box.append(b, s); l.append(i, box); fs.append(l);
    }
  }

  /* ───────────── Navigation ───────────── */
  const TITLES = { home: 'Accueil', station: 'Station', wallet: 'Portefeuille', shop: 'Boutique', learn: 'Apprendre' };
  function show(screen, { focus = true, replace = false } = {}) {
    if (!TITLES[screen]) screen = 'home';
    state.screen = screen;
    $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== screen; });
    $$('.tabbar button').forEach(b => { if (b.dataset.go === screen) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.title = `${TITLES[screen]} · EcoScan`;
    if (screen === 'station') setView(state.session ? 'session' : 'scan', false);
    $('#home-scan').textContent = state.session ? 'Reprendre la session' : 'Scanner une station';
    if (location.hash !== '#' + screen) { if (replace) history.replaceState(null, '', '#' + screen); else location.hash = screen; }
    scrollTo(0, 0);
    if (focus) { const h = $(`.screen[data-screen="${screen}"] h1:not([hidden])`) || $(`.screen[data-screen="${screen}"] h1`); const vis = $$('h1', $(`.screen[data-screen="${screen}"]`)).find(x => x.offsetParent); (vis || h)?.focus({ preventScroll: true }); }
  }
  function setView(view, focus = true) {
    state.view = view;
    $$('.screen[data-screen="station"] [data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
    if (view === 'session') renderBins();
    if (focus) $(`[data-view="${view}"] h1`)?.focus({ preventScroll: true });
    scrollTo(0, 0);
  }
  addEventListener('hashchange', () => { const s = location.hash.slice(1); if (TITLES[s] && s !== state.screen) show(s, { focus: false }); });
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    show(go.dataset.go);
  });

  /* ───────────── Scanner et session ───────────── */
  function openSession() {
    state.session = true; state.levels = { pet: 45, can: 45, paper: 45 };
    setView('session');
  }
  $('#scan-sim').addEventListener('click', openSession);
  const manual = $('#manual');
  $('#scan-manual').addEventListener('click', e => {
    const open = manual.hidden; manual.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
    if (open) $('#station-id').focus();
  });
  manual.addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#station-id').value.trim().toUpperCase();
    const status = $('#manual-status');
    if (v === STATION) { status.textContent = ''; openSession(); }
    else status.textContent = v ? `Identifiant « ${v} » inconnu. Dans cette démonstration, seule la station ${STATION} existe.` : 'Saisissez l’identifiant écrit sous le QR code : ECO-001.';
  });
  $('#close-session').addEventListener('click', () => { if (state.busy) return; state.session = false; setView('scan'); });
  $('#collect').addEventListener('click', () => { if (state.busy) return; state.levels = { pet: 0, can: 0, paper: 0 }; renderBins(); });
  $('#again').addEventListener('click', () => setView('session'));

  /* ───────────── Dépôt simulé ───────────── */
  const pause = () => new Promise(r => setTimeout(r, reduced() ? 25 : 420));
  const stepsEl = $('#deposit-steps');
  function pushStep(text) { const li = document.createElement('li'); li.textContent = text; stepsEl.append(li); requestAnimationFrame(() => li.classList.add('on')); }
  function setBusy(b) { state.busy = b; for (const id of ['deposit', 'close-session', 'collect']) $('#' + id).disabled = b; $$('#objects input').forEach(i => { i.disabled = b; }); }

  function showResult(kind, it, gain, routeNames, steps) {
    const view = $('[data-view="result"]'); view.dataset.state = kind;
    $('#seal').innerHTML = SEALS[kind];
    $('#t-result').textContent = kind === 'confirmed' ? 'Dépôt confirmé' : kind === 'uncertain' ? 'Objet incertain' : 'Compartiment plein';
    $('#result-gain').textContent = kind === 'confirmed' ? `+${gain} EcoPoints fictifs` : '0 EcoPoint';
    $('#result-route').textContent = `${it.label} → ${routeNames}`;
    const ol = $('#result-steps'); ol.replaceChildren(); steps.forEach(s => { const li = document.createElement('li'); li.textContent = s; ol.append(li); });
    $('#result-note').textContent = kind === 'confirmed'
      ? 'Les points arrivent seulement après la validation du dépôt. Aucun point réel.'
      : kind === 'uncertain'
        ? 'Analyse simulée incertaine : l’objet part vers un contrôle isolé des filières. Aucun point n’est ajouté, mieux vaut un doute qu’une contamination.'
        : 'Simulation : un compartiment est plein, le dépôt est bloqué et aucun point n’est ajouté. Simulez une collecte pour le vider.';
    setView('result');
  }

  async function deposit() {
    if (state.busy || !state.session) return;
    const key = ($('#objects input:checked') || {}).value || 'pet';
    const it = ITEMS[key];
    const uncertain = it.route.includes('check');
    const full = it.route.filter(r => r !== 'check' && state.levels[r] >= 100);
    stepsEl.replaceChildren();
    if (full.length) {
      showResult('blocked', it, 0, full.map(r => `compartiment ${ROUTES[r]} plein`).join(', '), ['Objet détecté', `Compartiment ${ROUTES[full[0]]} plein`, 'Dépôt bloqué avant tout crédit']);
      return;
    }
    setBusy(true); stepsEl.hidden = false;
    pushStep('Objet détecté'); await pause();
    pushStep('Analyse simulée : ni caméra ni IA réelle'); await pause();
    const steps = ['Objet détecté', 'Analyse simulée'];
    for (const r of it.route) {
      const text = r === 'check' ? 'Routage simulé vers le contrôle isolé' : `Plaques orientées vers ${ROUTES[r]}`;
      pushStep(text); steps.push(text); await pause();
    }
    /* Un seul crédit, après toutes les étapes. */
    let kind = 'uncertain', gain = 0;
    if (!uncertain) {
      kind = 'confirmed'; gain = Math.min(it.gain, 1000000 - state.points);
      state.points += gain; it.route.forEach(r => { state.levels[r] = Math.min(100, state.levels[r] + 10); });
      steps.push('Crédit ajouté après validation'); addHistory(it.label, gain);
    } else addHistory(`${it.label} : objet incertain`, 0);
    persist(); renderPoints(true); renderHistory();
    setBusy(false); stepsEl.hidden = true;
    showResult(kind, it, gain, it.route.map(r => ROUTES[r]).join(' + '), steps);
  }
  $('#deposit').addEventListener('click', deposit);

  /* ───────────── Portefeuille ───────────── */
  let resetArmed = false, resetTimer = 0;
  $('#reset').addEventListener('click', e => {
    const btn = e.currentTarget, st = $('#reset-status');
    if (!resetArmed) {
      resetArmed = true; btn.textContent = 'Confirmer la remise à zéro'; st.textContent = 'Appuyez une seconde fois pour effacer le solde et l’historique de cet appareil.';
      resetTimer = setTimeout(() => { resetArmed = false; btn.textContent = 'Remettre le solde à zéro'; st.textContent = ''; }, 5000);
      return;
    }
    clearTimeout(resetTimer); resetArmed = false; btn.textContent = 'Remettre le solde à zéro';
    state.points = 0; state.history = []; persist(); renderPoints(); renderHistory();
    st.textContent = 'Solde et historique remis à zéro sur cet appareil.';
  });

  /* ───────────── Boutique ───────────── */
  let filter = 'all', current = null;
  function renderProducts() {
    const ul = $('#products'); ul.replaceChildren();
    const list = Object.entries(products).filter(([, p]) => filter === 'all' || p.category === filter);
    for (const [id, p] of list) {
      const li = document.createElement('li'); li.className = 'product';
      const img = document.createElement('img'); img.src = p.img; img.alt = `Visuel de concept : ${p.label}`; img.width = 92; img.height = 92; img.loading = 'lazy'; img.decoding = 'async';
      const box = document.createElement('div');
      const h = document.createElement('h3'); h.textContent = p.label;
      const d = document.createElement('p'); d.textContent = p.use;
      const c = document.createElement('p'); c.className = 'cost'; c.textContent = `${p.cost} EcoPoints fictifs`;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = 'Explorer'; b.setAttribute('aria-label', `Explorer : ${p.label}`);
      b.addEventListener('click', () => openProduct(id));
      box.append(h, d, c, b); li.append(img, box); ul.append(li);
    }
    $('#shop-count').textContent = plural(list.length, 'concept affiché.', 'concepts affichés.');
  }
  $$('.filters .chip').forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter; $$('.filters .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderProducts();
  }));
  const dialog = $('#shop-dialog'), confirmBtn = $('#dialog-confirm');
  function updateDialog() {
    const p = products[current]; if (!p) return;
    const enough = state.points >= p.cost;
    $('#dialog-cost').textContent = `${p.cost} EcoPoints fictifs · votre solde : ${state.points}`;
    confirmBtn.disabled = !enough;
    if (!enough) $('#dialog-status').textContent = `Solde insuffisant : il manque ${p.cost - state.points} point${p.cost - state.points > 1 ? 's' : ''} fictif${p.cost - state.points > 1 ? 's' : ''}. Déposez un objet dans la station simulée pour en gagner.`;
  }
  function openProduct(id) {
    current = id; const p = products[id];
    $('#dialog-title').textContent = p.label; $('#dialog-use').textContent = p.use;
    $('#dialog-material').textContent = p.material; $('#dialog-validation').textContent = p.validation;
    $('#dialog-status').textContent = ''; updateDialog();
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  }
  confirmBtn.addEventListener('click', () => {
    const p = products[current]; if (!p || state.points < p.cost) return;
    state.points -= p.cost; addHistory(`Échange simulé : ${p.label}`, -p.cost); persist(); renderPoints(); renderHistory(); updateDialog();
    $('#dialog-status').textContent = `Échange simulé : ${p.cost} points retirés du solde local. Aucun bon ni objet réel n’est créé.`;
  });

  /* ───────────── Quiz ───────────── */
  let qi = 0, score = 0, answered = false;
  function renderQuestion() {
    answered = false; const q = questions[qi];
    $('#quiz-progress').textContent = `Question ${qi + 1} / ${questions.length}`;
    $('#quiz-bar').style.width = ((qi + 1) / questions.length * 100) + '%';
    $('#quiz-question').textContent = q.q; $('#quiz-feedback').textContent = '';
    $('#quiz-next').hidden = true; $('#quiz-restart').hidden = true;
    const box = $('#quiz-answers'); box.replaceChildren();
    q.a.forEach((text, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'answer'; b.textContent = text;
      b.addEventListener('click', () => {
        if (answered) return; answered = true;
        const ok = i === q.correct; if (ok) score++;
        $$('.answer', box).forEach((x, j) => { x.disabled = true; if (j === q.correct) x.classList.add('correct'); else if (x === b) x.classList.add('wrong'); });
        $('#quiz-feedback').textContent = `${ok ? 'Bonne réponse. ' : 'Pas tout à fait. '}${q.explanation}`;
        if (qi < questions.length - 1) { $('#quiz-next').hidden = false; $('#quiz-next').focus(); }
        else { $('#quiz-feedback').textContent += ` Score : ${score} / ${questions.length}.`; $('#quiz-restart').hidden = false; $('#quiz-restart').focus(); }
      });
      box.append(b);
    });
  }
  $('#quiz-next').addEventListener('click', () => { qi++; renderQuestion(); $('#quiz-question').scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); });
  $('#quiz-restart').addEventListener('click', () => { qi = 0; score = 0; renderQuestion(); });

  /* ───────────── Installation et hors-ligne ───────────── */
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; $('#install-btn').hidden = false; });
  $('#install-btn').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $('#install').hidden = true; });
  if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
    $('#install').hidden = false; $('#install-text').textContent = 'Sur iPhone : touchez Partager, puis « Sur l’écran d’accueil ». L’application fonctionne ensuite sans connexion.';
  }
  addEventListener('appinstalled', () => { $('#install').hidden = true; });
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

  /* Le site, ouvert dans un autre onglet, peut changer le solde : on le suit. */
  addEventListener('storage', e => {
    if (e.key === KEY) { const n = Number(e.newValue); if (Number.isSafeInteger(n) && n >= 0) { state.points = n; renderPoints(); if (dialog.open) updateDialog(); } }
    if (e.key === HKEY) { try { const h = JSON.parse(e.newValue || '[]'); if (Array.isArray(h)) { state.history = h; renderPoints(); renderHistory(); } } catch { /* ignoré */ } }
  });

  /* ───────────── Démarrage ───────────── */
  renderObjects(); renderProducts(); renderQuestion(); renderBins(); renderPoints(); renderHistory();
  show(TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'home', { focus: false, replace: true });
})();
