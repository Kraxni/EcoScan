const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server/server');
const { createStation } = require('../tools/station_simulator');

const SECRET = 'test-secret-eco-001';
const stations = { 'ECO-001': { label: 'Station de test', secret: SECRET }, 'ECO-002': { label: 'Autre station', secret: 'autre-secret' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function start(opts = {}) {
  const server = createServer({ stations, ...opts });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, p, body, token) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const device = async () => (await api('POST', '/v1/devices')).body;
  const signed = async (p, body, { secret = SECRET, t = Math.floor(Date.now() / 1000), tamper } = {}) => {
    const raw = JSON.stringify(body);
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
    const res = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Eco-Signature': `t=${t},v1=${v1}` }, body: tamper ? tamper(raw) : raw });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  const heartbeat = (fill = { pet: 45, can: 45, paper: 45 }, id = 'ECO-001', secret = SECRET) => signed('/v1/station/heartbeat', { stationId: id, fill, fw: 't' }, { secret });
  const event = (sessionId, type, payload = {}, eventId = crypto.randomBytes(8).toString('hex')) => signed('/v1/station/events', { eventId, stationId: 'ECO-001', sessionId, type, ts: Date.now(), payload });
  const confirm = (sessionId, materials, eventId) => event(sessionId, 'deposit.confirmed', { items: materials.map(material => ({ material })) }, eventId);
  const open = async (dev, stationId = 'ECO-001') => api('POST', '/v1/sessions', { stationId }, dev.deviceToken);
  const close = () => new Promise(r => server.close(r));
  return { server, base, api, device, signed, heartbeat, event, confirm, open, close };
}

async function readSse(base, sessionId, stream, { until, timeout = 3000, lastEventId } = {}) {
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeout);
  const res = await fetch(`${base}/v1/sessions/${sessionId}/events?stream=${stream}`, { signal: ctrl.signal, headers: lastEventId ? { 'Last-Event-ID': String(lastEventId) } : {} });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; const events = [];
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const type = /^event: (.+)$/m.exec(block), data = /^data: (.+)$/m.exec(block), id = /^id: (\d+)$/m.exec(block);
        if (type && data) events.push({ id: Number(id[1]), type: type[1], data: JSON.parse(data[1]) });
      }
      if (until && until(events)) break;
    }
  } catch { /* délai dépassé : on rend ce qu'on a */ } finally { clearTimeout(timer); ctrl.abort(); }
  return { status: res.status, events };
}

(async () => {
  /* 1. Santé, appareils, authentification */
  let t = await start();
  assert.equal((await t.api('GET', '/v1/health')).body.ok, true);
  const dev = await t.device(); assert.match(dev.deviceToken, /^[0-9a-f]{64}$/);
  assert.equal((await t.api('POST', '/v1/sessions', { stationId: 'ECO-001' })).status, 401, 'no token, no session');
  assert.equal((await t.api('GET', '/v1/wallet', null, 'a'.repeat(64))).status, 401, 'unknown token refused');

  /* 2. La station doit être en ligne et connue */
  assert.equal((await t.open(dev)).body.error, 'station_offline', 'no heartbeat yet');
  assert.equal((await t.open(dev, 'ECO-404')).status, 404);

  /* 3. Signatures : mauvais secret, corps modifié, horodatage périmé, signature absente */
  assert.equal((await t.heartbeat(undefined, 'ECO-001', 'mauvais')).status, 401, 'wrong secret');
  assert.equal((await t.signed('/v1/station/heartbeat', { stationId: 'ECO-001', fill: { pet: 1, can: 1, paper: 1 } }, { tamper: r => r.replace('"pet":1', '"pet":2') })).status, 401, 'tampered body');
  assert.equal((await t.signed('/v1/station/heartbeat', { stationId: 'ECO-001', fill: { pet: 1, can: 1, paper: 1 } }, { t: Math.floor(Date.now() / 1000) - 600 })).status, 401, 'stale timestamp (replay)');
  assert.equal((await fetch(t.base + '/v1/station/heartbeat', { method: 'POST', body: JSON.stringify({ stationId: 'ECO-001', fill: { pet: 1, can: 1, paper: 1 } }) })).status, 401, 'unsigned');
  assert.equal((await t.heartbeat({ pet: 150, can: 0, paper: 0 })).status, 400, 'fill out of range');
  const hb = await t.heartbeat(); assert.equal(hb.status, 200); assert.equal(hb.body.session, null);

  /* 4. Session : ouverture, reprise, station occupée */
  const s1 = await t.open(dev); assert.equal(s1.status, 201); assert.equal(s1.body.station.online, true);
  const again = await t.open(dev); assert.equal(again.status, 200); assert.equal(again.body.resumed, true); assert.equal(again.body.sessionId, s1.body.sessionId);
  const other = await t.device();
  assert.equal((await t.open(other)).body.error, 'station_busy', 'one session per station');
  assert.equal((await t.heartbeat()).body.session.id, s1.body.sessionId, 'the station learns about the session via its heartbeat');
  const sid = s1.body.sessionId, stream = s1.body.streamToken;

  /* 5. Crédit des points : idempotence, règles, plafond */
  const c1 = await t.confirm(sid, ['pet'], 'evt-0001-aaaa'); assert.equal(c1.status, 200);
  assert.equal((await t.confirm(sid, ['pet'], 'evt-0001-aaaa')).body.duplicate, true, 'same event id is ignored');
  assert.equal((await t.api('GET', '/v1/wallet', null, dev.deviceToken)).body.balance, 10, 'credited once');
  await t.confirm(sid, ['pet', 'can', 'paper']); assert.equal((await t.api('GET', '/v1/wallet', null, dev.deviceToken)).body.balance, 40, 'a mix of three is worth 30');
  await t.confirm(sid, ['uncertain']); assert.equal((await t.api('GET', '/v1/wallet', null, dev.deviceToken)).body.balance, 40, 'doubt earns nothing');
  assert.equal((await t.confirm(sid, ['plastic-bag'], 'evt-bad-material')).status, 422, 'unknown material');
  assert.equal((await t.confirm(sid, ['pet'], 'evt-bad-material')).status, 200, 'a refused event id can be retried once corrected');
  assert.equal((await t.confirm(sid, [])).status, 422, 'empty deposit');
  assert.equal((await t.confirm(sid, ['pet', 'pet', 'pet', 'pet', 'pet', 'pet'])).status, 422, 'too many items');
  for (let i = 0; i < 3; i++) await t.confirm(sid, ['pet', 'pet', 'pet', 'pet', 'pet']);   // 3 x 50
  const w = (await t.api('GET', '/v1/wallet', null, dev.deviceToken)).body;
  assert.equal(w.balance, 200, 'daily cap of 200 points'); assert.equal(w.earnedToday, 200); assert.ok(w.ledger.length >= 6);
  assert.equal((await t.api('GET', '/v1/wallet', null, other.deviceToken)).body.balance, 0, 'wallets are separate');
  await t.confirm(sid, ['pet', 'pet', 'pet', 'pet', 'pet']);   // au-delà du plafond : rien n'est crédité
  assert.equal((await t.api('GET', '/v1/wallet', null, dev.deviceToken)).body.balance, 200, 'nothing credited beyond the cap');

  /* 6. Flux d'événements et rejeu après coupure */
  const live = await readSse(t.base, sid, stream, { until: e => e.some(x => x.type === 'deposit.confirmed' && x.data.capped) });
  assert.equal(live.status, 200); assert.equal(live.events[0].type, 'session.opened');
  const capped = live.events.find(x => x.type === 'deposit.confirmed' && x.data.capped);
  assert.ok(capped && capped.data.points < capped.data.requested, 'the app is told when the cap applies');
  const lastId = live.events.at(-1).id;
  await t.confirm(sid, ['pet']);
  const resumed = await readSse(t.base, sid, stream, { lastEventId: lastId, until: e => e.length >= 1 });
  assert.equal(resumed.events[0].type, 'deposit.confirmed', 'Last-Event-ID replays only what was missed');
  assert.equal((await fetch(`${t.base}/v1/sessions/${sid}/events?stream=wrong`)).status, 404, 'stream token required');

  /* 7. Événements invalides ou hors session */
  assert.equal((await t.event('inconnu', 'deposit.detected')).status, 409);
  assert.equal((await t.event(sid, 'robot.takeover')).status, 400, 'unknown event type');
  assert.equal((await t.api('POST', `/v1/sessions/${sid}/close`, {}, other.deviceToken)).status, 404, 'only the owner closes it');
  assert.equal((await t.api('POST', `/v1/sessions/${sid}/close`, {}, dev.deviceToken)).status, 200);
  assert.equal((await t.confirm(sid, ['pet'])).status, 409, 'no credit after the session is closed');
  assert.equal((await t.open(other)).status, 201, 'the station is free again');

  /* 8. Échanges : solde insuffisant, idempotence, débit unique */
  assert.equal((await t.api('POST', '/v1/exchanges', { offerId: 'carry-bag', idempotencyKey: 'ex-key-0001' }, other.deviceToken)).status, 402, 'empty wallet cannot buy');
  assert.equal((await t.api('POST', '/v1/exchanges', { offerId: 'nope', idempotencyKey: 'ex-key-0002' }, dev.deviceToken)).status, 400);
  const x1 = await t.api('POST', '/v1/exchanges', { offerId: 'carry-bag', idempotencyKey: 'ex-key-0003' }, dev.deviceToken);
  assert.equal(x1.status, 201); assert.equal(x1.body.balance, 160); assert.equal(x1.body.status, 'pending_fulfilment');
  const x2 = await t.api('POST', '/v1/exchanges', { offerId: 'carry-bag', idempotencyKey: 'ex-key-0003' }, dev.deviceToken);
  assert.equal(x2.body.duplicate, true); assert.equal((await t.api('GET', '/v1/wallet', null, dev.deviceToken)).body.balance, 160, 'a retried exchange is debited once');
  assert.equal((await t.api('GET', '/v1/offers', null, dev.deviceToken)).body.offers.length, 3);

  /* 9. Compartiment plein signalé en direct */
  const s2 = (await t.open(other)).body;
  const pending = readSse(t.base, s2.sessionId, s2.streamToken, { until: e => e.some(x => x.type === 'bin.full') });
  await sleep(100); await t.heartbeat({ pet: 100, can: 45, paper: 45 });
  assert.ok((await pending).events.some(x => x.type === 'bin.full'), 'bin.full reaches the phone');

  /* 10. CORS */
  const pre = await fetch(t.base + '/v1/sessions', { method: 'OPTIONS', headers: { Origin: 'https://exemple.test' } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), '*');
  await t.close();

  /* 11. Expiration : la session libère la station */
  t = await start({ sessionTtlMs: 250 });
  await t.heartbeat(); const d1 = await t.device(), d2 = await t.device();
  const e1 = (await t.open(d1)).body; await sleep(600);
  assert.equal((await t.confirm(e1.sessionId, ['pet'])).status, 409, 'expired session earns nothing');
  assert.equal((await t.open(d2)).status, 201, 'expired session frees the station');
  await t.close();

  /* 12. Persistance : le solde survit à un redémarrage */
  const dbFile = path.join(os.tmpdir(), `ecoscan-test-${process.pid}.json`);
  t = await start({ dbFile }); await t.heartbeat(); const pd = await t.device(); const ps = (await t.open(pd)).body;
  await t.confirm(ps.sessionId, ['pet', 'can']); await sleep(400); await t.close();
  t = await start({ dbFile });
  assert.equal((await t.api('GET', '/v1/wallet', null, pd.deviceToken)).body.balance, 20, 'balance restored from disk');
  await t.close(); fs.rmSync(dbFile, { force: true });

  /* 13. Parcours complet avec le simulateur de station */
  t = await start();
  const sim = createStation({ api: t.base, id: 'ECO-001', secret: SECRET, intervalMs: 60000, stepMs: 20 });
  await sim.heartbeat();
  const sd = await t.device();
  assert.equal((await sim.deposit(['pet'])).error, 'no_session', 'the station refuses a deposit without a session');
  const ss = (await t.open(sd)).body;
  const watch = readSse(t.base, ss.sessionId, ss.streamToken, { until: e => e.some(x => x.type === 'deposit.confirmed') });
  await sleep(100);
  const dep = await sim.deposit(['pet', 'can']); assert.equal(dep.ok, true);
  const seq = (await watch).events.map(x => x.type);
  assert.deepEqual(seq.filter(x => x.startsWith('deposit')), ['deposit.detected', 'deposit.analyzed', 'deposit.routed', 'deposit.confirmed']);
  assert.equal((await t.api('GET', '/v1/wallet', null, sd.deviceToken)).body.balance, 20);
  sim.setFill({ pet: 100 });
  const full = await sim.deposit(['pet']); assert.equal(full.error, 'bin_full', 'a full bin blocks the deposit at the station');
  assert.equal((await t.api('GET', '/v1/wallet', null, sd.deviceToken)).body.balance, 20, 'nothing credited for a refused deposit');
  const doubt = await sim.deposit(['uncertain']); assert.equal(doubt.ok, true);
  assert.equal((await t.api('GET', '/v1/wallet', null, sd.deviceToken)).body.balance, 20);
  await t.close();

  console.log('EcoScan server test passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
