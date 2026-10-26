import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Store, hash, random, passwordHash, passwordMatches } from './store.mjs';
import { legacyManifest, resourceUrl } from './resources.mjs';
import { page, css } from './view.mjs';

const HOUR = 3_600_000;
const problem = (status, message) => Object.assign(Error(message), { status });
const integer = (value, min, max) => { const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) throw problem(400, 'Ungültiger Zahlenwert.'); return n; };
const stateValue = (value) => { if (value && !/^[a-f0-9]{64}$/.test(value)) throw problem(400, 'Ungültiger Anmeldestatus.'); return value || ''; };
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function body(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 16_384) throw problem(413, 'Anfrage ist zu groß.'); chunks.push(chunk); }
  const value = Buffer.concat(chunks).toString('utf8');
  if ((request.headers['content-type'] || '').startsWith('application/json')) {
    try { const data = JSON.parse(value || '{}'); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; } catch { throw problem(400, 'Ungültige JSON-Anfrage.'); }
  }
  if (!(request.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) throw problem(415, 'Content-Type erforderlich.');
  return Object.fromEntries(new URLSearchParams(value));
}

export function createMaster(config) {
  if (!Buffer.isBuffer(config.key) || config.key.length !== 32) throw Error('A private 32-byte master key is required.');
  const store = new Store(config.database, config.key);
  const origin = () => new URL(config.publicUrl).origin;
  const sign = (token) => `${token}.${createHmac('sha256', config.key).update(token).digest('hex')}`;
  const server = http.createServer(async (request, response) => {
    const now = Date.now();
    store.cleanup(now);
    const send = (status, value, type = 'application/json') => { response.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` }); response.end(type === 'application/json' ? JSON.stringify(value) : value); };
    const redirect = (target) => { response.writeHead(303, { Location: target }); response.end(); };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Preserve the Origin on same-origin HTML form submissions; no-referrer can
    // make browsers send Origin: null and reject otherwise valid CSRF-protected forms.
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const cookies = Object.fromEntries((request.headers.cookie || '').split(';').map((s) => s.trim().split('=')));
    const secure = origin().startsWith('https:') ? '; Secure' : '';
    const setCookie = (name, value, seconds) => {
      const previous = response.getHeader('Set-Cookie') || [];
      response.setHeader('Set-Cookie', [...previous, `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`]);
    };
    const user = store.token(cookies.skymp_session, 'browser', now);
    const sessionUser = () => { if (!user) throw problem(401, 'Bitte zuerst anmelden.'); return user; };
    const allowedCsrf = async () => {
      const data = await body(request);
      if (request.headers.origin && request.headers.origin !== origin()) throw problem(403, 'Anfrage stammt von einer fremden Webseite.');
      const cookie = cookies.skymp_csrf || '';
      const [nonce] = cookie.split('.');
      if (!/^[a-f0-9]{64}$/.test(nonce) || !same(cookie, sign(nonce)) || !same(data.csrf, cookie)) throw problem(403, 'Formular ist abgelaufen. Bitte die Seite neu laden.');
      return data;
    };
    const csrf = () => {
      const token = cookies.skymp_csrf || '';
      const [nonce] = token.split('.');
      if (/^[a-f0-9]{64}$/.test(nonce) && same(token, sign(nonce))) return token;
      const next = sign(random()); setCookie('skymp_csrf', next, 3600); return next;
    };
    let address = request.socket.remoteAddress || '';
    if (config.trustLoopbackProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) address = String(request.headers['x-forwarded-for'] || address).split(',')[0].trim();
    const limit = (action, maximum, interval = 15 * 60_000) => { if (!store.limit(`${address}|${action}`, maximum, interval, now)) throw problem(429, 'Zu viele Versuche. Bitte später erneut versuchen.'); };
    const render = (options = {}, status = 200) => send(status, page({ user, csrf: csrf(), siteUrl: config.siteUrl, browserUrl: config.browserUrl, servers: user ? store.all('SELECT id,name,host,port,resource,runtime,heartbeat FROM servers WHERE owner=?', user.user) : [], ...options }), 'text/html');
    const publicServer = (entry) => ({ id: entry.id, name: entry.name, ip: entry.host, port: entry.port, current_players: entry.players, max_players: entry.capacity,
      gamemode: entry.mode, country_code: entry.country, resourceUrl: entry.resource, runtimeSource: entry.runtime, masterUrl: origin(), masterKey: entry.id, offlineMode: false });
    try {
      const url = new URL(request.url, origin());
      const path = url.pathname.replace(/\/$/, '') || '/';
      if (request.method === 'GET' && path === '/health') { send(200, { ok: true, auth: true, demo: false }); return; }
      if (request.method === 'GET' && path === '/account.css') { send(200, css, 'text/css'); return; }
      if (request.method === 'GET' && ['/', '/account'].includes(path)) { render(); return; }
      if (request.method === 'GET' && ['/list.php', '/api/servers'].includes(path)) {
        response.setHeader('Access-Control-Allow-Origin', '*');
        send(200, store.all('SELECT * FROM servers WHERE heartbeat>? ORDER BY players DESC,name', now - 300_000).map(publicServer)); return;
      }
      if (request.method === 'GET' && path === '/api/users/login-discord') {
        limit('handoff', 120);
        const state = stateValue(url.searchParams.get('state'));
        if (!state) throw problem(400, 'Anmeldestatus fehlt. Bitte die Anmeldung im Spiel erneut öffnen.');
        store.run('INSERT INTO handoffs(state,expires) VALUES(?,?) ON CONFLICT(state) DO NOTHING', hash(state), now + 10 * 60_000);
        render({ state }); return;
      }
      if (request.method === 'GET' && path === '/api/users/login-discord/status') {
        const state = stateValue(url.searchParams.get('state'));
        const handoff = store.get('SELECT * FROM handoffs WHERE state=? AND expires>?', hash(state), now);
        if (!handoff?.token) throw problem(401, 'Wartet auf Anmeldung.');
        const token = store.unseal(handoff.token);
        const login = store.token(token, 'login', now);
        if (!login) throw problem(401, 'Anmeldung ist abgelaufen.');
        send(200, { token, masterApiId: login.user, discordUsername: login.username, discordDiscriminator: null, discordAvatar: null }); return;
      }
      if (request.method === 'POST' && ['/account/register', '/account/login'].includes(path)) {
        limit('login', 30);
        const data = await allowedCsrf();
        const state = stateValue(data.state);
        const username = String(data.username || '').normalize('NFKC').trim();
        const login = username.toLocaleLowerCase('en-US');
        const password = String(data.password || '');
        if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(username) || password.length < 12 || password.length > 128) throw problem(400, 'Benutzername: 3–32 Buchstaben/Ziffern. Passwort: 12–128 Zeichen.');
        let account = store.get('SELECT * FROM users WHERE login=?', login);
        if (path.endsWith('/register')) {
          limit('register', 10, HOUR);
          const digest = await passwordHash(password);
          try { const result = store.run('INSERT INTO users(username,login,password) VALUES(?,?,?)', username, login, digest); account = { id: Number(result.lastInsertRowid) }; }
          catch (error) { if ([1555, 2067].includes(error.errcode)) throw problem(409, 'Dieser Benutzername ist nicht verfügbar.'); throw error; }
        } else if (!(await passwordMatches(password, account?.password || await store.dummyPassword)) || !account) throw problem(401, 'Anmeldung fehlgeschlagen.');
        setCookie('skymp_session', store.issue(account.id, 'browser', 7 * 24 * HOUR, now), 7 * 24 * 3600);
        setCookie('skymp_csrf', sign(random()), 3600);
        redirect(state ? `/api/users/login-discord?state=${state}` : '/account'); return;
      }
      if (request.method === 'POST' && path === '/account/approve') {
        const account = sessionUser();
        const data = await allowedCsrf();
        const state = stateValue(data.state);
        const handoff = store.get('SELECT * FROM handoffs WHERE state=? AND expires>?', hash(state), now);
        if (!handoff || handoff.token) throw problem(409, 'Diese Spielanmeldung wurde bereits verwendet oder ist abgelaufen. Öffne sie erneut im Spiel.');
        const token = store.issue(account.user, 'login', 8 * HOUR, now);
        store.run('UPDATE handoffs SET token=?,expires=? WHERE state=?', store.seal(token), now + 2 * 60_000, hash(state));
        render({ message: 'Anmeldung bestätigt. Du kannst dieses Fenster schließen und zu Skyrim zurückkehren.' }); return;
      }
      if (request.method === 'POST' && path === '/account/logout') {
        const account = sessionUser(); await allowedCsrf();
        store.run('DELETE FROM tokens WHERE user=?', account.user);
        setCookie('skymp_session', '', 0); setCookie('skymp_csrf', '', 0); redirect('/account'); return;
      }
      if (request.method === 'POST' && ['/account/servers', '/account/update'].includes(path)) {
        const account = sessionUser(); limit('register-server', 20, HOUR);
        const data = await allowedCsrf();
        const updating = path === '/account/update';
        if (updating && !store.get('SELECT id FROM servers WHERE id=? AND owner=?', String(data.id || ''), account.user)) throw problem(404, 'Server nicht gefunden.');
        if (!updating && store.get('SELECT COUNT(*) AS count FROM servers WHERE owner=?', account.user).count >= 10) throw problem(400, 'Maximal zehn Server pro Konto.');
        const name = String(data.name || '').trim(); const host = String(data.host || '').trim();
        if (!name || name.length > 120 || !/^[a-z0-9.:[\]-]{1,253}$/i.test(host) || host.includes('..')) throw problem(400, 'Servername oder Hostname ist ungültig.');
        const port = integer(data.port, 1, 65535);
        let resource, runtime;
        try { resource = resourceUrl(String(data.resourceUrl || '')); runtime = resourceUrl(String(data.runtimeSource || ''), true); } catch (e) { throw problem(400, e.message); }
        if (runtime && !new URL(runtime).pathname.endsWith('/runtime-manifest.json')) throw problem(400, 'Clientpaket muss auf runtime-manifest.json zeigen.');
        if (updating) {
          store.run('UPDATE servers SET name=?,host=?,port=?,resource=?,runtime=?,heartbeat=0 WHERE id=? AND owner=?', name, host, port, resource, runtime, String(data.id), account.user);
          redirect('/account'); return;
        }
        const id = `srv_${random().slice(0, 24)}`; const secret = `skymp_${random()}`;
        store.run('INSERT INTO servers(id,owner,secret,name,host,port,resource,runtime) VALUES(?,?,?,?,?,?,?,?)', id, account.user, hash(secret), name, host, port, resource, runtime);
        render({ created: { id, secret, master: origin() } }); return;
      }
      if (request.method === 'POST' && ['/account/rotate', '/account/delete'].includes(path)) {
        const account = sessionUser(); const data = await allowedCsrf();
        const entry = store.get('SELECT * FROM servers WHERE id=? AND owner=?', String(data.id || ''), account.user);
        if (!entry) throw problem(404, 'Server nicht gefunden.');
        if (path.endsWith('/delete') && data.confirm !== 'yes') throw problem(400, 'Löschen muss im Formular bestätigt werden.');
        store.run('DELETE FROM tokens WHERE server=?', entry.id);
        if (path.endsWith('/delete')) { store.run('DELETE FROM servers WHERE id=?', entry.id); redirect('/account'); return; }
        const secret = `skymp_${random()}`;
        store.run('UPDATE servers SET secret=?,heartbeat=0 WHERE id=?', hash(secret), entry.id);
        render({ created: { id: entry.id, secret, master: origin() } }); return;
      }
      let match = path.match(/^\/api\/users\/me\/play\/(srv_[a-f0-9]{24})$/);
      if (request.method === 'POST' && match) {
        limit('play', 120);
        const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const account = store.token(token, 'login', now);
        if (!account) throw problem(401, 'Spielanmeldung ist abgelaufen.');
        const entry = store.get('SELECT * FROM servers WHERE id=? AND heartbeat>?', match[1], now - 300_000);
        if (!entry) throw problem(404, 'Server ist nicht aktiv.');
        send(200, { session: store.issue(account.user, 'play', Math.min(8 * HOUR, account.expires - now), now, entry.id) }); return;
      }
      match = path.match(/^\/api\/servers\/(skymp_[a-f0-9]{64})\/sessions\/([a-f0-9]{64})$/);
      if (request.method === 'GET' && match) {
        const entry = store.get('SELECT id FROM servers WHERE secret=?', hash(match[1]));
        const session = store.token(match[2], 'play', now);
        if (!entry || !session || session.server !== entry.id) throw problem(401, 'Ungültige Spielsitzung.');
        send(200, { user: { id: session.user, name: session.username, username: session.username, discordId: null } }); return;
      }
      match = path.match(/^\/api\/servers\/(srv_[a-f0-9]{24})\/(manifest\.json|serverinfo)$/);
      if (request.method === 'GET' && match) {
        const entry = store.get('SELECT * FROM servers WHERE id=?', match[1]);
        if (!entry) throw problem(404, 'Server nicht gefunden.');
        if (match[2] === 'serverinfo') { send(200, publicServer(entry)); return; }
        limit('manifest', 60, 60_000);
        try { send(200, await legacyManifest(entry.resource, config.allowPrivateResources)); } catch { throw problem(502, 'Servermanifest kann nicht geladen werden.'); } return;
      }
      match = path.match(/^\/api\/servers\/(skymp_[a-f0-9]{64})$/);
      if (request.method === 'POST' && match) {
        limit('heartbeat', 240, 60_000);
        const entry = store.get('SELECT * FROM servers WHERE secret=?', hash(match[1]));
        if (!entry) throw problem(401, 'Server-Schlüssel ist ungültig.');
        const data = await body(request);
        if (data.server_uid && data.server_uid !== entry.id) throw problem(400, 'serverUid stimmt nicht mit der öffentlichen Server-ID überein.');
        const capacity = integer(data.maxPlayers ?? data.max_players ?? entry.capacity, 1, 4096);
        const players = integer(data.online ?? data.current_players ?? 0, 0, capacity);
        store.run('UPDATE servers SET players=?,capacity=?,mode=?,country=?,heartbeat=? WHERE id=?', players, capacity, String(data.gamemode || '').slice(0, 64), String(data.countryCode || '').slice(0, 2).toUpperCase(), now, entry.id);
        send(200, { ok: true }); return;
      }
      throw problem(404, 'Route nicht gefunden.');
    } catch (error) {
      const status = error.status || 500;
      // Never log credential-bearing paths, cookies, request bodies or SQLite errors.
      if (status === 500) config.onError?.('Master request failed');
      if (request.url.startsWith('/account/') && String(request.headers.accept || '').includes('text/html')) {
        render({ message: status === 500 ? 'Interner Fehler. Bitte erneut versuchen.' : error.message }, status); return;
      }
      send(status, { error: status === 500 ? 'Interner Fehler.' : error.message });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.maxHeadersCount = 40;
  return { server, store };
}
