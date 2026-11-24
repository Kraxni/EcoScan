'use strict';
/*
 * Simulateur de station EcoScan : joue le rôle du contrôleur de la poubelle face au serveur de référence.
 * Il envoie un battement de cœur régulier (la station interroge, le serveur ne la contacte jamais), apprend ainsi
 * qu'une session est ouverte, puis déroule un dépôt : détecté, analysé, orienté, confirmé, chaque événement signé.
 * Il remplace le matériel tant que la poubelle n'existe pas ; le vrai contrôleur devra parler exactement ce protocole
 * (voir docs/operational-architecture.md).
 *
 * Usage :
 *   ECO_DEV=1 node server/server.js
 *   node tools/station_simulator.js --api http://127.0.0.1:8787 --id ECO-001 --secret dev-secret-eco-001 --control 8788
 *   curl -X POST localhost:8788/deposit -d '{"materials":["pet","can"]}'      # un dépôt de deux objets
 *   curl -X POST localhost:8788/fill -d '{"pet":100}'                          # remplit le compartiment PET
 */
const crypto = require('node:crypto');
const http = require('node:http');

const ROUTE = { pet: 'pet', can: 'can', paper: 'paper', uncertain: 'check' };

function createStation({ api, id, secret, intervalMs = 5000, stepMs = 400, now = () => Date.now() }) {
  const st = { fill: { pet: 45, can: 45, paper: 45 }, session: null, timer: null, busy: false, log: [] };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function post(path, body) {
    const raw = JSON.stringify(body);
    const t = String(Math.floor(now() / 1000));
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
    const res = await fetch(api + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Eco-Signature': `t=${t},v1=${v1}` }, body: raw });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  async function heartbeat() {
    const r = await post('/v1/station/heartbeat', { stationId: id, fill: st.fill, fw: 'sim-1.0' });
    if (r.status === 200) st.session = r.body.session;
    return r;
  }
  const event = (type, sessionId, payload) => post('/v1/station/events', { eventId: crypto.randomBytes(12).toString('hex'), stationId: id, sessionId, type, ts: now(), payload });

  /* Un dépôt : la station n'accepte rien sans session ouverte, et refuse si un compartiment visé est plein. */
  async function deposit(materials) {
    if (st.busy) return { ok: false, error: 'busy' };
    await heartbeat();
    if (!st.session) return { ok: false, error: 'no_session' };
    const sessionId = st.session.id, items = materials.map(material => ({ material }));
    const routes = [...new Set(materials.map(m => ROUTE[m]))];
    st.busy = true;
    try {
      await event('deposit.detected', sessionId, {}); await sleep(stepMs);
      await event('deposit.analyzed', sessionId, { items, confidence: materials.includes('uncertain') ? 0.5 : 0.93 }); await sleep(stepMs);
      const full = routes.filter(r => r !== 'check' && st.fill[r] >= 100);
      if (full.length) { await event('deposit.rejected', sessionId, { reason: 'bin_full' }); return { ok: false, error: 'bin_full' }; }
      await event('deposit.routed', sessionId, { routes }); await sleep(stepMs);
      for (const m of materials) if (m !== 'uncertain') st.fill[m] = Math.min(100, st.fill[m] + 10);
      const r = await event('deposit.confirmed', sessionId, { items });
      await heartbeat();
      return { ok: r.status === 200, status: r.status };
    } finally { st.busy = false; }
  }

  return {
    state: st, heartbeat, deposit,
    start() { heartbeat().catch(() => {}); st.timer = setInterval(() => heartbeat().catch(() => {}), intervalMs); st.timer.unref(); return this; },
    stop() { clearInterval(st.timer); },
    setFill(f) { for (const k of ['pet', 'can', 'paper']) if (Number.isFinite(f[k])) st.fill[k] = Math.max(0, Math.min(100, Math.round(f[k]))); }
  };
}

/* Petit serveur de commande local, pour piloter la station à la main (curl) pendant les essais. */
function control(station, port) {
  const srv = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; });
    req.on('end', async () => {
      const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      let b = {}; try { b = JSON.parse(raw || '{}'); } catch { return send(400, { error: 'bad_json' }); }
      if (req.method === 'POST' && req.url === '/deposit') return send(200, await station.deposit(Array.isArray(b.materials) && b.materials.length ? b.materials : ['pet']));
      if (req.method === 'POST' && req.url === '/fill') { station.setFill(b); return send(200, station.state.fill); }
      if (req.method === 'GET' && req.url === '/state') return send(200, { fill: station.state.fill, session: station.state.session });
      send(404, { error: 'not_found' });
    });
  });
  return srv.listen(port, '127.0.0.1');
}

module.exports = { createStation, control };

if (require.main === module) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => { if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return acc; }, []));
  const station = createStation({ api: a.api || 'http://127.0.0.1:8787', id: a.id || 'ECO-001', secret: a.secret || 'dev-secret-eco-001', intervalMs: Number(a.interval || 3000) }).start();
  if (a.control) { control(station, Number(a.control)); console.log(`Commande locale : http://127.0.0.1:${a.control}  (POST /deposit, POST /fill, GET /state)`); }
  console.log(`Station ${a.id || 'ECO-001'} simulée, connectée à ${a.api || 'http://127.0.0.1:8787'}`);
}
