'use strict';
/*
 * EcoScan · client du serveur (mode connecté). Sans adresse de serveur enregistrée, l'app reste en démonstration.
 * Identité : un jeton d'appareil anonyme, tiré au sort au premier usage et stocké sur le téléphone (aucun compte, aucune donnée personnelle).
 */
(() => {
  const K_API = 'ecoscan-api', K_DEV = 'ecoscan-device';
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* stockage indisponible */ } };
  const api = () => read(K_API) || '';
  const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

  /* HTTPS obligatoire, sauf en local pour les essais. */
  function normalize(input) {
    try {
      const u = new URL(String(input).trim());
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.includes(u.hostname))) return null;
      return u.origin + u.pathname.replace(/\/+$/, '');
    } catch { return null; }
  }
  const fail = (code, status, data) => Object.assign(new Error(code), { code, status, data });

  async function raw(method, path, { body, token, timeout = 8000 } = {}) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(api() + path, { method, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw fail(data.error || 'http_' + res.status, res.status, data);
      return data;
    } catch (e) { if (e.code) throw e; throw fail(e.name === 'AbortError' ? 'timeout' : 'network'); }
    finally { clearTimeout(timer); }
  }
  async function device(force) {
    if (!force) { try { const d = JSON.parse(read(K_DEV) || 'null'); if (d && d.api === api() && /^[0-9a-f]{64}$/.test(d.deviceToken || '')) return d; } catch { /* identité illisible : on en crée une */ } }
    const j = await raw('POST', '/v1/devices'); const d = { deviceId: j.deviceId, deviceToken: j.deviceToken, api: api() };
    write(K_DEV, JSON.stringify(d)); return d;
  }
  /* Appel authentifié : si le serveur ne reconnaît plus l'appareil (base remise à zéro), on en recrée un une fois. */
  async function authed(method, path, body) {
    let d = await device();
    try { return await raw(method, path, { body, token: d.deviceToken }); }
    catch (e) { if (e.status !== 401) throw e; d = await device(true); return raw(method, path, { body, token: d.deviceToken }); }
  }

  window.EcoLive = {
    enabled: () => !!api(),
    api, normalize,
    setApi(url) { if (!url) { write(K_API, null); return ''; } const n = normalize(url); if (!n) throw fail('bad_url'); write(K_API, n); return n; },
    health: () => raw('GET', '/v1/health', { timeout: 5000 }),
    openSession: stationId => authed('POST', '/v1/sessions', { stationId }),
    closeSession: id => authed('POST', `/v1/sessions/${id}/close`, {}),
    wallet: () => authed('GET', '/v1/wallet'),
    offers: () => authed('GET', '/v1/offers'),
    exchange: (offerId) => authed('POST', '/v1/exchanges', { offerId, idempotencyKey: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^\w-]/g, '') }),
    /* Flux en direct : le navigateur se reconnecte seul et rejoue ce qu'il a manqué (Last-Event-ID). */
    stream(session, { onEvent, onStatus }) {
      const es = new EventSource(`${api()}/v1/sessions/${session.sessionId}/events?stream=${session.streamToken}`);
      for (const t of ['session.opened', 'deposit.detected', 'deposit.analyzed', 'deposit.routed', 'deposit.confirmed', 'deposit.rejected', 'bin.full', 'session.closed'])
        es.addEventListener(t, e => { try { onEvent(t, JSON.parse(e.data)); } catch { /* évènement illisible : ignoré */ } });
      es.onopen = () => onStatus('open'); es.onerror = () => onStatus(es.readyState === 2 ? 'closed' : 'retry');
      return es;
    }
  };
})();
