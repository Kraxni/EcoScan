'use strict';
/*
 * EcoScan · application mobile.
 * Deux modes :
 *  - démonstration (par défaut) : tout est simulé dans le téléphone, aucun point réel, solde partagé avec le site (clé « ecoscan-demo-points ») ;
 *  - connecté : l'app parle à un serveur EcoScan (voir server/ et docs/operational-architecture.md). La station signale chaque dépôt
 *    au serveur, qui crédite les points une seule fois ; l'app affiche ce qui se passe en direct. Aucune station n'existe encore :
 *    ce mode se teste avec tools/station_simulator.js.
 */
(() => {
  const { products, questions } = window.ECODATA;
  const Live = window.EcoLive, Scanner = window.EcoScanner;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const live = () => Live.enabled();
  const KEY = 'ecoscan-demo-points', HKEY = 'ecoscan-app-history';
  const STATION = 'ECO-001';
  const ROUTES = { pet: 'PET', can: 'aluminium', paper: 'papier', check: 'contrôle isolé' };
  const NAMES = { pet: 'PET', can: 'aluminium', paper: 'papier', uncertain: 'incertain' };
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
  const SESSION_ERRORS = {
    station_offline: 'Cette station ne répond pas. Vérifiez qu’elle est allumée et connectée.',
    station_busy: 'Quelqu’un utilise déjà cette station. Réessayez dans un instant.',
    unknown_station: 'Station inconnue. Vérifiez l’identifiant écrit sous le QR code.',
    network: 'Pas de connexion au serveur. Vérifiez votre réseau.',
    timeout: 'Le serveur met trop de temps à répondre. Réessayez.',
    rate_limited: 'Trop de tentatives. Patientez une minute.'
  };
  const CAM_ERRORS = {
    denied: 'L’accès à la caméra est refusé. Autorisez-le dans les réglages du navigateur, ou saisissez l’identifiant écrit sous le QR code.',
    nocamera: 'Aucune caméra n’a été trouvée sur cet appareil. Saisissez l’identifiant écrit sous le QR code.',
    unsupported: 'Ce navigateur ne permet pas d’utiliser la caméra ici. Saisissez l’identifiant écrit sous le QR code.',
    error: 'La caméra n’a pas pu démarrer. Saisissez l’identifiant écrit sous le QR code.'
  };

  /* ───────────── État ───────────── */
  const state = { points: 0, history: [], session: false, busy: false, levels: { pet: 45, can: 45, paper: 45 }, view: 'scan', screen: 'home', live: null };
  function loadDemo() {
    state.points = 0; state.history = [];
    try {
      const n = Number(localStorage.getItem(KEY));
      if (Number.isSafeInteger(n) && n >= 0 && n <= 1000000) state.points = n;
      const h = JSON.parse(localStorage.getItem(HKEY) || '[]');
      if (Array.isArray(h)) state.history = h.filter(e => e && typeof e.label === 'string' && Number.isSafeInteger(e.delta) && Number.isFinite(e.t)).slice(0, 50);
    } catch { /* stockage indisponible : l'app fonctionne, sans mémoire */ }
  }
  loadDemo();
  if (live()) { state.points = 0; state.history = []; }   // le solde affiché vient alors du serveur
  const persist = () => {
    if (live()) return;                                      // en mode connecté, le serveur seul fait foi
    try { localStorage.setItem(KEY, String(state.points)); localStorage.setItem(HKEY, JSON.stringify(state.history.slice(0, 50))); } catch { /* ignoré */ }
  };
  const fmt = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const addHistory = (label, delta) => { state.history.unshift({ t: Date.now(), label, delta }); state.history = state.history.slice(0, 50); };
  const setScan = msg => { $('#scan-status').textContent = msg || ''; };
  const hostOf = () => { try { return new URL(Live.api()).host; } catch { return ''; } };

  /* ───────────── Rendu ───────────── */
  function renderMode() {
    const on = live();
    $('#mode-badge span').textContent = on ? 'Connecté à un serveur' : 'Concept simulé';
    $('#home-label').textContent = on ? 'Votre solde (serveur)' : 'Votre solde local';
    $('#home-note').textContent = on
      ? `Solde tenu par le serveur ${hostOf()}. Aucun compte : seul un identifiant d’appareil anonyme est utilisé.`
      : 'Aucun point réel. Enregistré uniquement sur cet appareil, et partagé avec le site EcoScan ouvert ici.';
    $('#scan-sim').hidden = on; $('#scan-cam').hidden = !on || !!cam; $('#cam-stop').hidden = !cam;
    $('#mode-line').textContent = on ? `Connecté à ${hostOf()}` : 'Mode démonstration : aucune vraie station.';
    $('#mode-change').textContent = on ? 'Changer de serveur…' : 'Connexion à une station…';
    $('#viewfinder-note').textContent = on ? 'Visez le QR code collé sur la station.' : 'Aperçu simulé : aucune caméra n’est utilisée.';
    $('#objects').hidden = on; $('#deposit').hidden = on; $('#collect').hidden = on; $('#live-panel').hidden = !on;
    $('#reset').hidden = on; $('#live-status').hidden = !on || !state.live;
    if (typeof renderProducts === 'function' && $('#products')) renderProducts();
  }
  function renderPoints(bump) {
    for (const id of ['home-points', 'wallet-points']) {
      const el = $('#' + id); el.textContent = state.points;
      if (bump && !reduced()) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
    const n = state.history.filter(e => e.delta > 0).length;
    $('#wallet-count').textContent = live() ? plural(n, 'dépôt', 'dépôts') : plural(n, 'dépôt simulé', 'dépôts simulés');
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
      const b = document.createElement('p'); b.className = 'small'; b.textContent = live() ? 'Déposez un objet dans la station pour voir votre historique apparaître ici.' : 'Simulez un dépôt pour voir votre historique apparaître ici.';
      home.append(a, b); home.style.padding = '';
    } else { const ul = document.createElement('ul'); ul.className = 'history'; state.history.slice(0, 3).forEach(e => ul.append(historyItem(e))); home.append(ul); home.style.padding = '0'; }
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
    if (screen !== 'station') stopCamera();
    $$('.screen').forEach(s => { s.hidden = s.dataset.screen !== screen; });
    $$('.tabbar button').forEach(b => { if (b.dataset.go === screen) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    document.title = `${TITLES[screen]} · EcoScan`;
    if (screen === 'station') setView(state.session ? 'session' : 'scan', false);
    if (screen === 'wallet') refreshWallet();
    $('#home-scan').textContent = state.session ? 'Reprendre la session' : 'Scanner une station';
    if (location.hash !== '#' + screen) { if (replace) history.replaceState(null, '', location.pathname + location.search + '#' + screen); else location.hash = screen; }
    scrollTo(0, 0);
    if (focus) { const sec = $(`.screen[data-screen="${screen}"]`); const vis = $$('h1', sec).find(x => x.offsetParent); (vis || $('h1', sec))?.focus({ preventScroll: true }); }
  }
  function setView(view, focus = true) {
    state.view = view;
    if (view !== 'scan') stopCamera();
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

  /* ───────────── Caméra ───────────── */
  let cam = null;
  function stopCamera() {
    if (cam) { cam.stop(); cam = null; }
    const v = $('#cam'); if (!v) return;
    v.hidden = true; $('#viewfinder').classList.remove('cam'); $('#cam-stop').hidden = true; $('#scan-cam').hidden = !live();
  }
  async function startCamera() {
    if (cam) return;
    $('#cam').hidden = false; $('#viewfinder').classList.add('cam'); $('#scan-cam').hidden = true; $('#cam-stop').hidden = false;
    setScan('Ouverture de la caméra…');
    const c = await Scanner.start($('#cam'), {
      onCode: code => { stopCamera(); openSession(code); },
      onError: e => { if (e === 'unknown_qr') { setScan('Ce QR code n’est pas celui d’une station EcoScan.'); return; } stopCamera(); setScan(CAM_ERRORS[e] || CAM_ERRORS.error); }
    });
    if (c) { cam = c; setScan('Placez le QR code dans le cadre.'); }
    else { stopCamera(); }
  }
  $('#scan-cam').addEventListener('click', startCamera);
  $('#cam-stop').addEventListener('click', () => { stopCamera(); setScan(''); });

  /* ───────────── Scanner et session ───────────── */
  async function openSession(code = STATION) {
    if (!live()) {
      if (code !== STATION) { setScan(`Station « ${code} » inconnue. Dans cette démonstration, seule la station ${STATION} existe.`); return; }
      state.session = true; state.levels = { pet: 45, can: 45, paper: 45 }; setView('session'); return;
    }
    setScan('Ouverture de la session…'); for (const id of ['scan-cam', 'scan-manual']) $('#' + id).disabled = true;
    try {
      const r = await Live.openSession(code);
      endLive('replaced');
      state.session = true; state.live = { id: r.sessionId, station: r.station, steps: [], es: null };
      state.levels = { pet: r.station.fill.pet, can: r.station.fill.can, paper: r.station.fill.paper };
      $('#t-session').textContent = `Station ${r.station.id}`; $('#station-label').textContent = r.station.label; $('#station-label').hidden = false;
      $('#live-status').hidden = false; $('#live-status').textContent = 'Connexion au flux en direct…';
      state.live.es = Live.stream(r, { onEvent: onLive, onStatus: s => { if (!state.live) return; $('#live-status').textContent = s === 'open' ? 'Connecté à la station.' : s === 'retry' ? 'Connexion interrompue, reconnexion…' : 'Connexion fermée.'; } });
      setScan(''); setView('session'); refreshWallet();
    } catch (e) { setScan(SESSION_ERRORS[e.code] || 'La session n’a pas pu s’ouvrir. Réessayez.'); }
    finally { for (const id of ['scan-cam', 'scan-manual']) $('#' + id).disabled = false; }
  }
  function endLive(reason) {
    const L = state.live; if (!L) return;
    if (L.es) L.es.close();
    state.live = null; state.session = false; $('#station-label').hidden = true; $('#live-status').hidden = true; stepsEl.replaceChildren(); stepsEl.hidden = true;
    if (reason === 'expired') { setView('scan', false); setScan('Session expirée après 5 minutes sans dépôt. Scannez de nouveau la station.'); }
    else if (reason === 'closed_by_user' || reason === 'mode') { if (state.screen === 'station') setView('scan', false); }
  }
  const ledgerLabel = e => e.reason === 'deposit' ? `Dépôt · station ${e.stationId}` : String(e.reason).startsWith('exchange:') ? `Échange : ${(products[e.reason.slice(9)] || {}).label || 'objet'}` : e.reason;
  async function refreshWallet() {
    if (!live()) return;
    try {
      const w = await Live.wallet();
      state.points = w.balance; state.history = w.ledger.map(e => ({ t: e.t, delta: e.delta, label: ledgerLabel(e) }));
      renderPoints(); renderHistory(); $('#reset-status').textContent = '';
    } catch (e) { $('#reset-status').textContent = SESSION_ERRORS[e.code] || 'Le solde du serveur n’a pas pu être lu.'; }
  }
  async function refreshFill() {
    if (!live() || !state.live) return;
    try { const h = await Live.health(); const s = h.stations.find(x => x.id === state.live.station.id); if (s) { state.levels = { pet: s.fill.pet, can: s.fill.can, paper: s.fill.paper }; if (state.view === 'session') renderBins(); } } catch { /* le prochain évènement réessaiera */ }
  }
  const nameList = a => (a || []).map(m => NAMES[m] || m).join(' + ');
  function onLive(type, d) {
    const L = state.live; if (!L) return;
    if (type === 'deposit.detected') { L.steps = ['Objet détecté']; stepsEl.replaceChildren(); stepsEl.hidden = false; pushStep('Objet détecté'); if (state.view === 'result' && state.screen === 'station') setView('session', false); }
    else if (type === 'deposit.analyzed') { const t = `Analyse : ${nameList(d.items)}`; L.steps.push(t); pushStep(t); }
    else if (type === 'deposit.routed') { const t = `Plaques orientées vers ${(d.routes || []).map(r => ROUTES[r] || r).join(' + ')}`; L.steps.push(t); pushStep(t); }
    else if (type === 'deposit.confirmed') {
      stepsEl.hidden = true; state.points = d.balance; renderPoints(true); refreshWallet(); refreshFill();
      const label = nameList(d.items) || 'Dépôt', where = `station ${L.station.id}`;
      if (d.points > 0) showResult('confirmed', { label }, d.points, where, [...L.steps, 'Crédit ajouté après validation'], d.capped ? ' Plafond journalier : seule une partie du dépôt a été créditée.' : '');
      else if (d.requested > 0) showResult('capped', { label }, 0, where, [...L.steps, 'Plafond journalier atteint']);
      else showResult('uncertain', { label }, 0, 'contrôle isolé', [...L.steps, 'Contrôle isolé, sans crédit']);
    }
    else if (type === 'deposit.rejected') { stepsEl.hidden = true; refreshFill(); showResult('blocked', { label: 'Dépôt' }, 0, d.reason === 'bin_full' ? 'compartiment plein' : 'refusé par la station', [...L.steps, d.reason === 'bin_full' ? 'Compartiment plein' : 'Dépôt refusé']); }
    else if (type === 'bin.full') refreshFill();
    else if (type === 'session.closed') endLive(d.reason);
  }
  $('#scan-sim').addEventListener('click', () => openSession());
  const manual = $('#manual');
  $('#scan-manual').addEventListener('click', e => {
    const open = manual.hidden; manual.hidden = !open; e.currentTarget.setAttribute('aria-expanded', String(open));
    if (open) $('#station-id').focus();
  });
  manual.addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#station-id').value.trim().toUpperCase();
    const status = $('#manual-status');
    if (!live() && v && v !== STATION) { status.textContent = `Identifiant « ${v} » inconnu. Dans cette démonstration, seule la station ${STATION} existe.`; return; }
    if (!/^ECO-\d{3,4}$/.test(v)) { status.textContent = 'Saisissez l’identifiant écrit sous le QR code : ECO-001.'; return; }
    status.textContent = ''; openSession(v);
  });
  $('#close-session').addEventListener('click', async () => {
    if (state.busy) return;
    if (live() && state.live) { const id = state.live.id; endLive('closed_by_user'); Live.closeSession(id).catch(() => {}); setView('scan'); return; }
    state.session = false; setView('scan');
  });
  $('#collect').addEventListener('click', () => { if (state.busy) return; state.levels = { pet: 0, can: 0, paper: 0 }; renderBins(); });
  $('#again').addEventListener('click', () => setView('session'));

  /* ───────────── Résultat et dépôt simulé (démonstration) ───────────── */
  const pause = () => new Promise(r => setTimeout(r, reduced() ? 25 : 420));
  const stepsEl = $('#deposit-steps');
  function pushStep(text) { const li = document.createElement('li'); li.textContent = text; stepsEl.append(li); requestAnimationFrame(() => li.classList.add('on')); }
  function setBusy(b) { state.busy = b; for (const id of ['deposit', 'close-session', 'collect']) $('#' + id).disabled = b; $$('#objects input').forEach(i => { i.disabled = b; }); }

  function showResult(kind, it, gain, routeNames, steps, extra = '') {
    const view = $('[data-view="result"]'); const look = kind === 'capped' ? 'blocked' : kind;
    view.dataset.state = look;
    $('#seal').innerHTML = SEALS[look];
    $('#t-result').textContent = kind === 'confirmed' ? 'Dépôt confirmé' : kind === 'uncertain' ? 'Objet incertain' : kind === 'capped' ? 'Plafond du jour atteint' : live() ? 'Dépôt non crédité' : 'Compartiment plein';
    $('#result-gain').textContent = kind === 'confirmed' ? `+${gain} EcoPoints${live() ? '' : ' fictifs'}` : '0 EcoPoint';
    $('#result-route').textContent = `${it.label} → ${routeNames}`;
    const ol = $('#result-steps'); ol.replaceChildren(); steps.forEach(s => { const li = document.createElement('li'); li.textContent = s; ol.append(li); });
    $('#result-note').textContent = (kind === 'confirmed'
      ? (live() ? 'La station a confirmé le dépôt et le serveur a crédité vos points une seule fois.' : 'Les points arrivent seulement après la validation du dépôt. Aucun point réel.')
      : kind === 'uncertain'
        ? 'Analyse incertaine : l’objet part vers un contrôle isolé des filières. Aucun point n’est ajouté, mieux vaut un doute qu’une contamination.'
        : kind === 'capped'
          ? 'La station a bien confirmé le dépôt, mais le plafond journalier de points est atteint : aucun point supplémentaire aujourd’hui.'
          : live()
            ? 'La station a refusé ce dépôt (par exemple parce qu’un compartiment est plein). Aucun point n’est ajouté.'
            : 'Simulation : un compartiment est plein, le dépôt est bloqué et aucun point n’est ajouté. Simulez une collecte pour le vider.') + extra;
    setView('result');
  }

  async function deposit() {
    if (live() || state.busy || !state.session) return;
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
      const c = document.createElement('p'); c.className = 'cost'; c.textContent = `${p.cost} EcoPoints${live() ? '' : ' fictifs'}`;
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
  const openDialog = d => { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); };
  function updateDialog() {
    const p = products[current]; if (!p) return;
    const enough = state.points >= p.cost;
    $('#dialog-cost').textContent = `${p.cost} EcoPoints${live() ? '' : ' fictifs'} · votre solde : ${state.points}`;
    confirmBtn.disabled = !enough;
    if (!enough) $('#dialog-status').textContent = `Solde insuffisant : il manque ${p.cost - state.points} point${p.cost - state.points > 1 ? 's' : ''}${live() ? '' : ' fictifs'}. ${live() ? 'Déposez des objets dans la station pour en gagner.' : 'Déposez un objet dans la station simulée pour en gagner.'}`;
  }
  function openProduct(id) {
    current = id; const p = products[id];
    $('#dialog-title').textContent = p.label; $('#dialog-use').textContent = p.use;
    $('#dialog-material').textContent = p.material; $('#dialog-validation').textContent = p.validation;
    $('#dialog-status').textContent = ''; updateDialog(); openDialog(dialog);
    if (live()) refreshWallet().then(updateDialog);
  }
  confirmBtn.addEventListener('click', async () => {
    const p = products[current]; if (!p || state.points < p.cost) return;
    if (live()) {
      confirmBtn.disabled = true;
      try { const r = await Live.exchange(current); state.points = r.balance; await refreshWallet(); updateDialog(); $('#dialog-status').textContent = `Échange enregistré : ${p.cost} points retirés. L’objet reste à remettre : aucune remise n’est organisée tant que le projet n’a pas de partenaire.`; }
      catch (e) { $('#dialog-status').textContent = e.status === 402 ? `Solde insuffisant : il manque ${e.data.missing} points.` : (SESSION_ERRORS[e.code] || 'L’échange n’a pas pu être enregistré. Aucun point retiré.'); updateDialog(); }
      return;
    }
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

  /* ───────────── Connexion à un serveur ───────────── */
  const apiDialog = $('#api-dialog');
  $('#mode-change').addEventListener('click', () => { $('#api-url').value = Live.api(); $('#api-status').textContent = ''; openDialog(apiDialog); });
  $('#api-save').addEventListener('click', async () => {
    const v = $('#api-url').value.trim(), st = $('#api-status');
    if (!v) { endLive('mode'); stopCamera(); Live.setApi(''); loadDemo(); renderMode(); renderPoints(); renderHistory(); st.textContent = 'Retour à la démonstration : aucun serveur, tout est simulé.'; return; }
    const n = Live.normalize(v);
    if (!n) { st.textContent = 'Adresse refusée : elle doit commencer par https:// (ou http://localhost pour les essais).'; return; }
    st.textContent = 'Test de la connexion…';
    const prev = Live.api(); Live.setApi(n);
    try {
      const h = await Live.health();
      if (!Array.isArray(h.stations)) throw Object.assign(new Error('bad'), { code: 'bad' });
      if (prev !== n) { endLive('mode'); state.points = 0; state.history = []; }
      renderMode(); renderPoints(); renderHistory(); refreshWallet();
      st.textContent = `Connecté : ${h.stations.filter(s => s.online).length} station(s) en ligne sur ${h.stations.length}.`;
    } catch (e) {
      Live.setApi(prev);
      st.textContent = e.code === 'network' || e.code === 'timeout' ? 'Connexion impossible : le serveur ne répond pas.' : 'Ce serveur ne répond pas comme un serveur EcoScan.';
    }
  });

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

  /* Le site, ouvert dans un autre onglet, peut changer le solde de démonstration : on le suit. */
  addEventListener('storage', e => {
    if (live()) return;
    if (e.key === KEY) { const n = Number(e.newValue); if (Number.isSafeInteger(n) && n >= 0) { state.points = n; renderPoints(); if (dialog.open) updateDialog(); } }
    if (e.key === HKEY) { try { const h = JSON.parse(e.newValue || '[]'); if (Array.isArray(h)) { state.history = h; renderPoints(); renderHistory(); } } catch { /* ignoré */ } }
  });

  /* ───────────── Démarrage ───────────── */
  renderObjects(); renderProducts(); renderQuestion(); renderBins(); renderMode(); renderPoints(); renderHistory();
  show(TITLES[location.hash.slice(1)] ? location.hash.slice(1) : 'home', { focus: false, replace: true });
  if (live()) refreshWallet();
  /* Le QR collé sur la station ouvre l'app avec ?s=ECO-001 : la session s'ouvre toute seule (scan avec l'appareil photo du téléphone). */
  const deep = new URLSearchParams(location.search).get('s');
  if (deep) {
    history.replaceState(null, '', location.pathname + location.hash);
    const code = Scanner.parseStationCode(deep);
    if (code) { show('station', { focus: false }); openSession(code); }
  }
})();
