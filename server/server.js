'use strict';
/*
 * EcoScan · serveur de référence (sans dépendance, Node 18+).
 * Il relie trois acteurs : l'app du téléphone, ce serveur, et le contrôleur de la poubelle (la « station »).
 *   app      -> serveur : HTTPS + jeton d'appareil anonyme ; flux d'événements en direct (SSE)
 *   station  -> serveur : requêtes signées (HMAC-SHA256) ; la station interroge, le serveur ne la contacte jamais
 * Les points ne sont crédités que sur un événement « deposit.confirmed » signé par la station, une seule fois (idempotence).
 * Aucune poubelle n'existe encore : ce serveur est la partie logicielle prête à l'accueillir, testable avec tools/station_simulator.js.
 * Stockage : mémoire, avec un instantané JSON facultatif (ECO_DB). En production, remplacer par une base (D1, Postgres).
 */
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { pointsFor, DAILY_CAP } = require('./policy');

const VERSION = '1.0.0';
const OFFERS = Object.freeze({
  'repair-pouch': { label: 'Pochette seconde vie', cost: 20 },
  'loop-notebook': { label: 'Carnet Loop', cost: 30 },
  'carry-bag': { label: 'Sac ReCycle', cost: 40 }
});
const STATION_EVENTS = new Set(['deposit.detected', 'deposit.analyzed', 'deposit.routed', 'deposit.confirmed', 'deposit.rejected']);
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const rand = n => crypto.randomBytes(n).toString('hex');

function createServer(opts = {}) {
  const now = opts.now || (() => Date.now());
  const SESSION_TTL = opts.sessionTtlMs || 5 * 60 * 1000;
  const ONLINE_MS = opts.stationOnlineMs || 30 * 1000;
  const SKEW_MS = opts.maxSkewMs || 60 * 1000;
  const origins = opts.origins || '*';
  const stations = new Map(Object.entries(opts.stations || {}).map(([id, s]) => [id, { id, label: s.label || id, secret: s.secret, lastSeen: 0, fill: { pet: 0, can: 0, paper: 0 }, sessionId: null, fw: '' }]));
  const devices = new Map();       // deviceId -> { tokenHash, created }
  const byToken = new Map();       // tokenHash -> deviceId
  const sessions = new Map();
  const ledger = [];               // { id, deviceId, delta, reason, stationId, t }
  const seenEvents = new Map();    // eventId -> t
  const exchanges = new Map();     // deviceId:key -> record
  const hits = new Map();          // ip -> { n, reset }

  /* ───────── Persistance (instantané JSON) ───────── */
  const dbFile = opts.dbFile;
  if (dbFile && fs.existsSync(dbFile)) {
    try {
      const d = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      (d.devices || []).forEach(x => { devices.set(x.deviceId, x); byToken.set(x.tokenHash, x.deviceId); });
      ledger.push(...(d.ledger || [])); (d.exchanges || []).forEach(x => exchanges.set(x.key, x));
    } catch { /* base illisible : on repart de zéro plutôt que de planter */ }
  }
  let saveTimer = null;
  const save = () => {
    if (!dbFile || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { fs.writeFileSync(dbFile, JSON.stringify({ devices: [...devices.entries()].map(([deviceId, v]) => ({ deviceId, ...v })), ledger, exchanges: [...exchanges.values()] })); } catch { /* disque plein : ignoré */ }
    }, 200); saveTimer.unref();
  };

  /* ───────── Utilitaires ───────── */
  const cors = (req, res) => {
    const o = req.headers.origin;
    if (origins === '*') res.setHeader('Access-Control-Allow-Origin', '*');
    else if (o && origins.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Eco-Signature, Last-Event-ID');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  };
  const send = (res, code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) }); res.end(b); };
  const fail = (res, code, error, extra = {}) => send(res, code, { error, ...extra });
  const readBody = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 64 * 1024) { reject(Object.assign(new Error('too_large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  const parse = raw => { try { const v = JSON.parse(raw || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  const balance = deviceId => ledger.reduce((s, e) => e.deviceId === deviceId ? s + e.delta : s, 0);
  const earnedToday = deviceId => { const d0 = new Date(now()); d0.setUTCHours(0, 0, 0, 0); return ledger.reduce((s, e) => e.deviceId === deviceId && e.delta > 0 && e.t >= d0.getTime() ? s + e.delta : s, 0); };
  const online = st => now() - st.lastSeen < ONLINE_MS;
  const publicStation = st => ({ id: st.id, label: st.label, online: online(st), fill: st.fill });

  function authDevice(req) {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
    return m ? byToken.get(sha256(m[1])) || null : null;
  }
  function verifyStation(req, raw, body) {
    const st = body && typeof body.stationId === 'string' ? stations.get(body.stationId) : null;
    const m = /^t=(\d{10,13}),v1=([0-9a-f]{64})$/.exec(req.headers['x-eco-signature'] || '');
    if (!st || !m) return null;
    const t = Number(m[1]) * (m[1].length <= 10 ? 1000 : 1);
    if (Math.abs(now() - t) > SKEW_MS) return null;
    const want = crypto.createHmac('sha256', st.secret).update(`${m[1]}.${raw}`).digest();
    const got = Buffer.from(m[2], 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want) ? st : null;
  }

  /* ───────── Sessions et flux d'événements ───────── */
  function emit(s, type, data = {}) {
    const ev = { id: ++s.lastEventId, type, data: { ...data, t: now() } };
    s.events.push(ev); if (s.events.length > 200) s.events.shift();
    for (const c of s.clients) c.write(`id: ${ev.id}\nevent: ${type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
  }
  function endSession(s, status, reason) {
    if (s.status !== 'active') return;
    s.status = status; const st = stations.get(s.stationId); if (st && st.sessionId === s.id) st.sessionId = null;
    emit(s, 'session.closed', { reason });
    for (const c of s.clients) c.end(); s.clients.clear();
  }
  const touch = s => { s.expiresAt = now() + SESSION_TTL; };
  function sweep() { for (const s of sessions.values()) if (s.status === 'active' && s.expiresAt <= now()) endSession(s, 'expired', 'expired'); }
  const sweeper = setInterval(sweep, 5000); sweeper.unref();

  /* ───────── Routes ───────── */
  async function handle(req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const ip = req.socket.remoteAddress || '?'; const h = hits.get(ip);
    if (!h || h.reset < now()) hits.set(ip, { n: 1, reset: now() + 60000 }); else if (++h.n > (opts.rateLimit || 240)) return fail(res, 429, 'rate_limited');
    sweep();
    const url = new URL(req.url, 'http://x'); const path = url.pathname; const method = req.method;

    if (method === 'GET' && path === '/v1/health') return send(res, 200, { ok: true, version: VERSION, stations: [...stations.values()].map(publicStation) });

    if (method === 'POST' && path === '/v1/devices') {
      const deviceId = rand(8), token = rand(32);
      devices.set(deviceId, { tokenHash: sha256(token), created: now() }); byToken.set(sha256(token), deviceId); save();
      return send(res, 201, { deviceId, deviceToken: token });
    }

    /* ----- Station (requêtes signées) ----- */
    if (method === 'POST' && (path === '/v1/station/heartbeat' || path === '/v1/station/events')) {
      let raw; try { raw = await readBody(req); } catch (e) { return fail(res, e.code || 400, 'bad_request'); }
      const body = parse(raw); if (!body) return fail(res, 400, 'bad_json');
      const st = verifyStation(req, raw, body); if (!st) return fail(res, 401, 'bad_signature');
      if (path === '/v1/station/heartbeat') {
        const f = body.fill || {}; const fill = {};
        for (const k of ['pet', 'can', 'paper']) { const v = Number(f[k]); if (!Number.isFinite(v) || v < 0 || v > 100) return fail(res, 400, 'bad_fill'); fill[k] = Math.round(v); }
        const wasFull = Object.values(st.fill).some(v => v >= 100);
        st.fill = fill; st.lastSeen = now(); st.fw = String(body.fw || '').slice(0, 32);
        const s = st.sessionId && sessions.get(st.sessionId);
        if (s && s.status === 'active' && !wasFull && Object.values(fill).some(v => v >= 100)) emit(s, 'bin.full', { fill });
        return send(res, 200, { serverTime: now(), session: s && s.status === 'active' ? { id: s.id, expiresAt: s.expiresAt } : null });
      }
      const { eventId, sessionId, type, payload } = body;
      if (typeof eventId !== 'string' || !/^[\w-]{8,64}$/.test(eventId) || !STATION_EVENTS.has(type)) return fail(res, 400, 'bad_event');
      if (seenEvents.has(eventId)) return send(res, 200, { duplicate: true });
      const s = sessions.get(sessionId);
      if (!s || s.stationId !== st.id || s.status !== 'active') return fail(res, 409, 'no_active_session');
      seenEvents.set(eventId, now()); if (seenEvents.size > 5000) seenEvents.delete(seenEvents.keys().next().value);
      touch(s); st.lastSeen = now();
      const p = payload && typeof payload === 'object' ? payload : {};
      if (type === 'deposit.confirmed') {
        const r = pointsFor(p.items); if (!r.ok) { seenEvents.delete(eventId); return fail(res, 422, r.error); }
        const room = Math.max(0, DAILY_CAP - earnedToday(s.deviceId)); const granted = Math.min(r.points, room);
        if (granted > 0) { ledger.push({ id: eventId, deviceId: s.deviceId, delta: granted, reason: 'deposit', stationId: st.id, t: now() }); save(); }
        emit(s, 'deposit.confirmed', { points: granted, requested: r.points, capped: granted < r.points, uncertain: r.uncertain, items: p.items.map(i => i.material), balance: balance(s.deviceId) });
      } else if (type === 'deposit.rejected') emit(s, type, { reason: String(p.reason || 'rejected').slice(0, 40) });
      else emit(s, type, { items: Array.isArray(p.items) ? p.items.slice(0, 5).map(i => String(i.material || '').slice(0, 12)) : undefined, routes: Array.isArray(p.routes) ? p.routes.slice(0, 5).map(r => String(r).slice(0, 12)) : undefined, confidence: Number.isFinite(p.confidence) ? p.confidence : undefined });
      return send(res, 200, { ok: true });
    }

    /* ----- Appareil ----- */
    if (method === 'GET' && /^\/v1\/sessions\/[\w-]+\/events$/.test(path)) {
      const s = sessions.get(path.split('/')[3]);
      if (!s || url.searchParams.get('stream') !== s.streamToken) return fail(res, 404, 'not_found');
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      const last = Number(req.headers['last-event-id'] || url.searchParams.get('lastEventId') || 0);
      for (const ev of s.events) if (ev.id > last) res.write(`id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
      if (s.status !== 'active') return res.end();
      s.clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000); ping.unref();
      req.on('close', () => { clearInterval(ping); s.clients.delete(res); });
      return;
    }
    const dev = authDevice(req);
    if (!dev) return fail(res, 401, 'unauthorized');

    if (method === 'POST' && path === '/v1/sessions') {
      let b; try { b = parse(await readBody(req)); } catch (e) { return fail(res, e.code || 400, 'bad_request'); }
      const st = b && typeof b.stationId === 'string' ? stations.get(b.stationId) : null;
      if (!st) return fail(res, 404, 'unknown_station');
      if (!online(st)) return fail(res, 503, 'station_offline');
      const cur = st.sessionId && sessions.get(st.sessionId);
      if (cur && cur.status === 'active') {
        if (cur.deviceId !== dev) return fail(res, 409, 'station_busy');
        touch(cur); return send(res, 200, { sessionId: cur.id, streamToken: cur.streamToken, expiresAt: cur.expiresAt, station: publicStation(st), resumed: true });
      }
      if (Object.values(st.fill).some(v => v >= 100)) { /* on ouvre quand même : l'app affichera le compartiment plein */ }
      const s = { id: rand(8), deviceId: dev, stationId: st.id, status: 'active', createdAt: now(), expiresAt: now() + SESSION_TTL, streamToken: rand(16), events: [], clients: new Set(), lastEventId: 0 };
      sessions.set(s.id, s); st.sessionId = s.id; emit(s, 'session.opened', { station: st.id });
      return send(res, 201, { sessionId: s.id, streamToken: s.streamToken, expiresAt: s.expiresAt, station: publicStation(st) });
    }
    if (method === 'POST' && /^\/v1\/sessions\/[\w-]+\/close$/.test(path)) {
      const s = sessions.get(path.split('/')[3]);
      if (!s || s.deviceId !== dev) return fail(res, 404, 'not_found');
      endSession(s, 'closed', 'closed_by_user'); return send(res, 200, { ok: true });
    }
    if (method === 'GET' && path === '/v1/wallet') {
      const mine = ledger.filter(e => e.deviceId === dev).slice(-50).reverse().map(({ id, delta, reason, stationId, t }) => ({ id, delta, reason, stationId, t }));
      return send(res, 200, { balance: balance(dev), earnedToday: earnedToday(dev), dailyCap: DAILY_CAP, ledger: mine });
    }
    if (method === 'GET' && path === '/v1/offers') return send(res, 200, { offers: Object.entries(OFFERS).map(([id, o]) => ({ id, ...o })) });
    if (method === 'POST' && path === '/v1/exchanges') {
      let b; try { b = parse(await readBody(req)); } catch (e) { return fail(res, e.code || 400, 'bad_request'); }
      const offer = b && OFFERS[b.offerId]; const key = b && typeof b.idempotencyKey === 'string' && /^[\w-]{8,64}$/.test(b.idempotencyKey) ? b.idempotencyKey : null;
      if (!offer || !key) return fail(res, 400, 'bad_exchange');
      const k = `${dev}:${key}`; if (exchanges.has(k)) return send(res, 200, { ...exchanges.get(k), duplicate: true });
      const bal = balance(dev); if (bal < offer.cost) return fail(res, 402, 'insufficient_points', { missing: offer.cost - bal, balance: bal });
      const rec = { key: k, id: rand(6), deviceId: dev, offerId: b.offerId, cost: offer.cost, status: 'pending_fulfilment', t: now() };
      exchanges.set(k, rec); ledger.push({ id: 'x-' + rec.id, deviceId: dev, delta: -offer.cost, reason: 'exchange:' + b.offerId, stationId: null, t: now() }); save();
      return send(res, 201, { id: rec.id, offerId: rec.offerId, cost: rec.cost, status: rec.status, balance: balance(dev) });
    }
    return fail(res, 404, 'not_found');
  }

  const server = http.createServer((req, res) => { handle(req, res).catch(() => { if (!res.headersSent) fail(res, 500, 'server_error'); else res.end(); }); });
  server.on('close', () => clearInterval(sweeper));
  server.state = { stations, sessions, ledger, devices };
  return server;
}

module.exports = { createServer, OFFERS, VERSION };

if (require.main === module) {
  const stations = process.env.ECO_STATIONS ? JSON.parse(process.env.ECO_STATIONS) : {};
  if (process.env.ECO_DEV === '1') stations['ECO-001'] = stations['ECO-001'] || { label: 'Station de démonstration', secret: 'dev-secret-eco-001' };
  if (!Object.keys(stations).length) { console.error('Aucune station : définir ECO_STATIONS (JSON) ou ECO_DEV=1 pour la station de test.'); process.exit(1); }
  const origins = process.env.ECO_ORIGINS ? process.env.ECO_ORIGINS.split(',') : '*';
  const port = Number(process.env.PORT || 8787);
  createServer({ stations, origins, dbFile: process.env.ECO_DB }).listen(port, () => console.log(`EcoScan serveur ${VERSION} sur le port ${port} · stations : ${Object.keys(stations).join(', ')}`));
}
