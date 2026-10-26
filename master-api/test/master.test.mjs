import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { once } from 'node:events';
import { createMaster } from '../src/server.mjs';
import { isPublicIp, legacyManifest } from '../src/resources.mjs';

async function fixture(t) {
  const config = { database: ':memory:', key: randomBytes(32), publicUrl: 'http://127.0.0.1', allowPrivateResources: true };
  const app = createMaster(config);
  app.server.listen(0, '127.0.0.1'); await once(app.server, 'listening');
  config.publicUrl = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise((resolve) => app.server.close(resolve)); app.store.close(); });
  const browser = () => {
    const cookies = new Map();
    const request = async (path, data, headers = {}) => {
      const response = await fetch(config.publicUrl + path, { method: data ? 'POST' : 'GET', redirect: 'manual', headers: {
        Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded', Origin: config.publicUrl } : {}), ...headers,
      }, ...(data ? { body: new URLSearchParams({ csrf: cookies.get('skymp_csrf') || '', ...data }) } : {}) });
      for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); cookies.set(key, token); }
      return response;
    };
    return { request, cookies };
  };
  const api = (path, data, token) => fetch(config.publicUrl + path, { method: data ? 'POST' : 'GET', headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { authorization: token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const register = async (client, username = 'Hüter_ÄÖÜ') => {
    assert.equal((await client.request('/account')).status, 200);
    assert.equal((await client.request('/account/register', { username, password: 'Only-for-automated-tests-123!' })).status, 303);
  };
  const addServer = async (client, name = 'Himmelsrand ÄÖÜ', resourceUrl = 'http://127.0.0.1:8080') => {
    const response = await client.request('/account/servers', { name, host: '127.0.0.1', port: '7777', resourceUrl });
    const html = await response.text(); assert.equal(response.status, 200, html);
    const id = html.match(/srv_[a-f0-9]{24}/)?.[0], secret = html.match(/skymp_[a-f0-9]{64}/)?.[0];
    assert(id && secret); return { id, secret };
  };
  const signInGame = async (client) => {
    const state = randomBytes(32).toString('hex');
    assert.equal((await api(`/api/users/login-discord/status?state=${state}`)).status, 401);
    assert.equal((await client.request(`/api/users/login-discord?state=${state}`)).status, 200);
    assert.equal((await client.request('/account/approve', { state })).status, 200);
    const result = await (await api(`/api/users/login-discord/status?state=${state}`)).json();
    assert.equal(result.discordUsername, 'Hüter_ÄÖÜ'); assert.equal(typeof result.masterApiId, 'number'); assert.match(result.token, /^[a-f0-9]{64}$/);
    assert.equal((await client.request('/account/approve', { state })).status, 409);
    return { ...result, state };
  };
  return { ...app, config, browser, api, register, addServer, signInGame };
}

test('real online handshake: registration, native heartbeat, browser consent, play session, server validation', async (t) => {
  const f = await fixture(t), client = f.browser(); await f.register(client);
  const first = await f.addServer(client), second = await f.addServer(client, 'Andere Welt');
  const heartbeat = { name: 'Native fork heartbeat', ip: '', port: 7777, maxPlayers: 100, online: 3, server_uid: first.id };
  assert.equal((await f.api(`/api/servers/${first.secret}`, heartbeat)).status, 200);
  const list = await (await f.api('/list.php')).json(); assert.equal(list.length, 1); assert.equal(list[0].masterKey, first.id); assert.equal(list[0].offlineMode, false); assert.equal(list[0].current_players, 3);
  assert(!JSON.stringify(list).includes(first.secret));
  const login = await f.signInGame(client);
  const response = await f.api(`/api/users/me/play/${first.id}`, {}, login.token); assert.equal(response.status, 200);
  const { session } = await response.json();
  const validation = await f.api(`/api/servers/${first.secret}/sessions/${session}`); assert.equal(validation.status, 200); assert.equal((await validation.json()).user.id, login.masterApiId);
  assert.equal((await f.api(`/api/servers/${second.secret}/sessions/${session}`)).status, 401);
  assert.equal((await f.api(`/api/servers/${first.id}/sessions/${session}`)).status, 404);
  assert.equal((await f.api(`/api/users/me/play/${first.id}`, {}, session)).status, 401);
  assert.equal((await f.api(`/api/servers/${first.secret}`, { ...heartbeat, server_uid: second.id })).status, 400);
  const stored = f.store.all('SELECT * FROM tokens'); assert(stored.every((v) => v.hash !== session && v.hash !== login.token));
  assert(!f.store.get('SELECT token FROM handoffs').token.includes(login.token));
  assert(!f.store.get('SELECT secret FROM servers WHERE id=?', first.id).secret.includes(first.secret));
  assert(!f.store.get('SELECT password FROM users').password.includes('Only-for-automated'));
});

test('CSRF, account isolation, rejected passwords and escaped server names', async (t) => {
  const f = await fixture(t), client = f.browser();
  assert.equal((await client.request('/account/register', { username: 'wrong', password: 'long-password-for-test' })).status, 403);
  await f.register(client);
  assert.equal((await client.request('/account/register', { username: 'Hüter_ÄÖÜ', password: 'long-password-for-test' })).status, 409);
  assert.equal((await client.request('/account/login', { username: 'Hüter_ÄÖÜ', password: 'incorrect-password' })).status, 401);
  assert.equal((await client.request('/account/servers', {}, { Origin: 'https://attacker.example' })).status, 403);
  const entry = await f.addServer(client, '<script>alert(1)</script>');
  const page = await (await client.request('/account')).text(); assert(page.includes('&lt;script&gt;')); assert(!page.includes('<script>')); assert(!page.includes(entry.secret));
  const other = f.browser(); await f.register(other, 'anderer_Ü');
  assert.equal((await other.request('/account/rotate', { id: entry.id })).status, 404);
  assert.equal((await other.request('/account/delete', { id: entry.id, confirm: 'yes' })).status, 404);
  assert.equal((await other.request('/account/update', { id: entry.id })).status, 404);
  assert.equal((await client.request('/account/update', { id: entry.id, name: 'Neue Welt ÄÖÜ', host: 'play.example.org', port: 8777, resourceUrl: 'https://files.example.org/new', runtimeSource: 'https://files.example.org/new/runtime-manifest.json' })).status, 303);
  assert.equal((await f.api(`/api/servers/${entry.secret}`, { online: 2, maxPlayers: 20 })).status, 200);
  const changed = await (await f.api('/list.php')).json();
  assert.equal(changed[0].id, entry.id); assert.equal(changed[0].resourceUrl, 'https://files.example.org/new'); assert.equal(changed[0].ip, 'play.example.org');
  assert.equal((await f.api(`/api/servers/${entry.id}`, { online: 10 })).status, 404);
  assert.equal((await f.api('/health')).status, 200); assert.equal((await (await f.api('/health')).json()).demo, false);
});

test('sessions expire and logout/rotation revoke access; public list expires with heartbeat', async (t) => {
  const f = await fixture(t), client = f.browser(); await f.register(client); const entry = await f.addServer(client);
  await f.api(`/api/servers/${entry.secret}`, { online: 1, maxPlayers: 20 });
  const login = await f.signInGame(client);
  const { session } = await (await f.api(`/api/users/me/play/${entry.id}`, {}, login.token)).json();
  f.store.run('UPDATE servers SET heartbeat=0'); assert.equal((await (await f.api('/list.php')).json()).length, 0);
  assert.equal((await f.api(`/api/users/me/play/${entry.id}`, {}, login.token)).status, 404);
  const rotated = await client.request('/account/rotate', { id: entry.id }); assert.equal(rotated.status, 200); assert(!(await rotated.text()).includes(entry.secret));
  assert.equal((await f.api(`/api/servers/${entry.secret}`, { online: 1 })).status, 401);
  assert.equal((await f.api(`/api/servers/${entry.secret}/sessions/${session}`)).status, 401);
  assert.equal((await client.request('/account/delete', { id: entry.id })).status, 400);
  assert.equal((await client.request('/account/logout', {})).status, 303);
  assert.equal((await f.api(`/api/users/me/play/${entry.id}`, {}, login.token)).status, 401);
  assert.equal(f.store.all('SELECT * FROM tokens').length, 0);
});

test('manifest proxy uses the registered resource URL, rejects private targets in production and never follows redirects', async (t) => {
  const manifest = { versionMajor: 1, mods: [], loadOrder: [] };
  const files = http.createServer((req, res) => { if (req.url === '/redirect/manifest.json') { res.writeHead(302, { Location: '/manifest.json' }); res.end(); } else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(manifest)); } });
  files.listen(0, '127.0.0.1'); await once(files, 'listening'); t.after(() => new Promise((resolve) => files.close(resolve)));
  const base = `http://127.0.0.1:${files.address().port}`;
  await assert.rejects(legacyManifest(base, false)); await assert.rejects(legacyManifest(base + '/redirect', true));
  const f = await fixture(t), client = f.browser(); await f.register(client); const entry = await f.addServer(client, 'Manifest', base);
  assert.deepEqual(await (await f.api(`/api/servers/${entry.id}/manifest.json`)).json(), manifest);
  f.config.allowPrivateResources = false; assert.equal((await f.api(`/api/servers/${entry.id}/manifest.json`)).status, 502);
  for (const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1']) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
});

test('invalid bodies, pending/expired states and credential scopes fail closed', async (t) => {
  const f = await fixture(t), client = f.browser(); await f.register(client);
  assert.equal((await f.api('/api/users/login-discord?state=invalid')).status, 400);
  const state = randomBytes(32).toString('hex'); await client.request(`/api/users/login-discord?state=${state}`);
  f.store.run('UPDATE handoffs SET expires=0'); assert.equal((await client.request('/account/approve', { state })).status, 409);
  const entry = await f.addServer(client); await f.api(`/api/servers/${entry.secret}`, { online: 0, maxPlayers: 10 });
  assert.equal((await f.api(`/api/servers/${entry.secret}`, { online: 11, maxPlayers: 10 })).status, 400);
  assert.equal((await f.api(`/api/users/me/play/${entry.id}`, {}, client.cookies.get('skymp_session'))).status, 401);
  assert.equal((await client.request('/account/servers', { name: 'bad', host: 'bad/path', port: 7777, resourceUrl: 'file:///etc/passwd' })).status, 400);
  f.store.run('UPDATE tokens SET expires=0'); assert.equal((await client.request('/account/servers', {})).status, 401);
});
