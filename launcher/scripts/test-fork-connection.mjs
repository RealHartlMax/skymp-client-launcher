// Real fork integration in a NEW disposable workspace; never launches Skyrim.
// cargo build --example prepare-server
// node scripts/test-fork-connection.mjs --build D:/GitHub/skymp/build --workspace ../local-builds/fork-smoke-NEW
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createMaster } from '../../master-api/src/server.mjs';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--build') || !args.includes('--workspace')) throw new Error('Expected --build BUILD_FOLDER --workspace NEW_FOLDER');
const build = path.resolve(option('--build')), root = path.resolve(option('--workspace'));
const launcher = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseHarness = path.join(launcher, 'src-tauri/target/release/examples/prepare-server.exe');
const harness = existsSync(releaseHarness) ? releaseHarness : path.join(launcher, 'src-tauri/target/debug/examples/prepare-server.exe');
const server = path.join(root, 'server'), game = path.join(root, 'game'), profile = path.join(root, 'profile'), cache = path.join(root, 'cache');
const reuse = args.includes('--reuse-fixture');
if (reuse) {
  const previous = JSON.parse(await readFile(path.join(root, 'report.json'), 'utf8'));
  assert.equal(previous.build, build); assert.equal(previous.workspace, root);
  assert(previous.ok === true || (previous.ok === false && previous.checks.length <= 3), 'Only an unactivated or fully restored fixture may be reused');
  if (previous.ok) assert.equal(JSON.parse(await readFile(path.join(game, '.skymp-launcher/active.json'), 'utf8')).entries.length, 0, 'Completed fixture must be fully restored');
  assert.equal(await readFile(path.join(game, 'Data/Platform/Plugins/skymp5-client-settings.txt'), 'utf8'), '{"language":"de","preserveThis":true}');
  assert.equal(await readFile(path.join(profile, 'plugins.txt'), 'utf8'), '*SinglePlayer.esp');
} else await mkdir(root); // Refuse arbitrary existing workspaces.
for (const folder of [path.join(server, 'data/scripts'), path.join(server, 'ui'), path.join(game, 'Data/Platform/Plugins'), profile]) await mkdir(folder, { recursive: true });
if (!reuse) {
await copyFile(path.join(build, 'dist/server/scam_native.node'), path.join(server, 'scam_native.node'));
await copyFile(path.join(build, 'dist/server/gamemode.js'), path.join(server, 'gamemode.js'));
await cp(path.join(build, 'dist/server/dist_back'), path.join(server, 'dist_back'), { recursive: true });
}
const original = JSON.parse(await readFile(path.join(build, 'dist/server/server-settings.json'), 'utf8'));
const loadOrder = original.loadOrder;
for (const name of loadOrder) {
  assert(!name.includes('/') && !name.includes('\\'), 'Smoke test requires flat loadOrder filenames');
  if (!reuse) {
    await copyFile(path.join(build, 'dist/server', original.dataDir, name), path.join(server, 'data', name));
    await copyFile(path.join(server, 'data', name), path.join(game, 'Data', name));
  }
}
await writeFile(path.join(game, 'skse64_loader.exe'), 'test placeholder: never executed');
const originalSettings = '{"language":"de","preserveThis":true}';
await writeFile(path.join(game, 'Data/Platform/Plugins/skymp5-client-settings.txt'), originalSettings);
await writeFile(path.join(profile, 'plugins.txt'), '*SinglePlayer.esp');
await writeFile(path.join(server, 'data/launcher-smoke.pex'), 'test resource bytes');
await writeFile(path.join(server, 'data/DownloadProbe.esm'), 'download route probe');
async function freePort(kind) {
  const socket = kind === 'tcp' ? net.createServer() : dgram.createSocket('udp4');
  await new Promise((resolve, reject) => { socket.once('error', reject); kind === 'tcp' ? socket.listen(0, '127.0.0.1', resolve) : socket.bind(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
const port = await freePort('udp'), uiPort = await freePort('tcp');
const online = args.includes('--online');
let master, phpMaster, masterUrl = '', masterKey = '', serverUid = '';
if (online) {
  serverUid = 'srv_' + randomBytes(12).toString('hex');
  masterKey = 'skymp_' + randomBytes(32).toString('hex');
  if (args.includes('--php-master')) {
    const { startPhpFixture } = await import('../../tests/php-master-smoke.mjs');
    phpMaster = await startPhpFixture({ serverUid, masterKey, gamePort: port, resourceUrl: `http://127.0.0.1:${uiPort}` });
    masterUrl = phpMaster.api;
  } else {
  const configuration = { database: ':memory:', key: randomBytes(32), publicUrl: 'http://127.0.0.1', allowPrivateResources: true };
  master = createMaster(configuration);
  await new Promise((resolve) => master.server.listen(0, '127.0.0.1', resolve));
  masterUrl = configuration.publicUrl = `http://127.0.0.1:${master.server.address().port}`;
  master.store.run('INSERT INTO users(username,login,password) VALUES(?,?,?)', 'Native fork integration', 'native-test', await master.store.dummyPassword);
  master.store.run('INSERT INTO servers(id,owner,secret,name,host,port,resource,runtime) VALUES(?,?,?,?,?,?,?,?)', serverUid, 1, createHash('sha256').update(masterKey).digest('hex'), 'Native fork integration', '127.0.0.1', port, `http://127.0.0.1:${uiPort}`, '');
  }
}
await writeFile(path.join(server, 'server-settings.json'), JSON.stringify({
  name: 'Launcher fork integration test', port, uiPort, listenHost: '127.0.0.1', uiListenHost: '127.0.0.1', dataDir: 'data', loadOrder,
  offlineMode: !online, master: masterUrl, masterKey, ...(online ? { serverUid } : {}), npcEnabled: false, itemsEnabled: false, adminApi: { enabled: false }, discordAuth: {}, discordBot: { enabled: false }, maxPlayers: 4,
}, null, 2));
const requestFile = path.join(root, 'request.json');
await writeFile(requestFile, JSON.stringify({ ip: '127.0.0.1', port, resourceUrl: `http://127.0.0.1:${uiPort}`, offline: !online, ...(online ? { masterUrl, serverMasterKey: serverUid } : { profileId: 123 }),
  runtimeSource: path.join(build, 'dist/client'), operationId: 'native-fork-smoke' }));
const report = { build, workspace: root, startedAt: new Date().toISOString(), checks: [] };
const child = spawn(process.execPath, ['dist_back/skymp5-server.js'], { cwd: server, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', exit;
child.stdout.on('data', (data) => { logs += data; }); child.stderr.on('data', (data) => { logs += data; });
child.once('exit', (code) => { exit = code; });
const base = `http://127.0.0.1:${uiPort}`;
async function runHelper(args) {
  const process = spawn(harness, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  process.stdout.on('data', (data) => { stdout += data; });
  process.stderr.on('data', (data) => { stderr += data; });
  const timeout = setTimeout(() => process.kill(), 10 * 60_000);
  return await new Promise((resolve, reject) => {
    process.once('error', (e) => { clearTimeout(timeout); reject(e); });
    process.once('exit', (status) => { clearTimeout(timeout); resolve({ status, stdout, stderr }); });
  });
}
try {
  let manifest;
  const deadline = Date.now() + 12 * 60_000;
  let lastResponse = '';
  while (Date.now() < deadline) {
    if (exit !== undefined) throw new Error(`Native test server exited (${exit}); see native-server.log`);
    try { const response = await fetch(`${base}/api/resources/manifest`, { signal: AbortSignal.timeout(60000) }); lastResponse = `HTTP ${response.status}`; if (response.ok) { manifest = await response.json(); break; } } catch (e) { lastResponse = e.message; }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  assert(manifest?.resources?.some((r) => r.name === 'launcher-smoke.pex'), `Actual fork must publish the script (${lastResponse})`);
  report.checks.push('Actual native fork starts and publishes the resource manifest');
  const encoded = [...Buffer.from('DownloadProbe.esm')].map((b) => '%' + b.toString(16).toUpperCase()).join('');
  const response = await fetch(`${base}/api/resources/download/${encoded}`);
  assert.equal(response.status, 200, 'Encoded resource route must pass the legacy *.esm guard');
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.toString(), 'download route probe');
  assert.equal(response.headers.get('x-resource-hash'), 'sha256:' + createHash('sha256').update(bytes).digest('hex'));
  report.checks.push('Encoded download route and X-Resource-Hash work against the actual fork');
  if (online) {
    const deadline = Date.now() + 60_000;
    let active = false;
    while (Date.now() < deadline) {
      const list = await (await fetch(masterUrl + '/list.php')).json();
      if (list.some((s) => s.id === serverUid)) { active = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(active, 'Actual online fork must authenticate its heartbeat to the new master');
    const loginToken = phpMaster ? await phpMaster.login() : master.store.issue(1, 'login', 600_000, Date.now());
    const sessionResponse = await fetch(`${masterUrl}/api/users/me/play/${serverUid}`, { method: 'POST', headers: { authorization: loginToken, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(sessionResponse.status, 200);
    const { session } = await sessionResponse.json();
    assert.equal((await fetch(`${masterUrl}/api/servers/${masterKey}/sessions/${session}`)).status, 200);
    const legacy = await fetch(`${masterUrl}/api/servers/${serverUid}/manifest.json`);
    assert.equal(legacy.status, 200); assert.deepEqual((await legacy.json()).loadOrder, loadOrder);
    report.checks.push('Actual online fork heartbeats accepted; scoped session and real master manifest proxy validated');
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await runHelper([requestFile, game, profile, cache]);
    await writeFile(path.join(root, `prepare-${attempt + 1}.log`), result.stderr || '');
    assert.equal(result.status, 0, `Preparation ${attempt + 1} failed; see prepare-${attempt + 1}.log`);
    const prepared = JSON.parse(result.stdout);
    if (attempt === 0) { assert.equal(prepared.downloadedFiles, 1); report.first = prepared; }
    else { assert.equal(prepared.downloadedFiles, 0); assert.equal(prepared.cachedFiles, 1); report.second = prepared; }
  }
  const settings = JSON.parse(await readFile(path.join(game, 'Data/Platform/Plugins/skymp5-client-settings.txt'), 'utf8'));
  if (online) { assert.equal(settings.gameData, undefined); assert.equal(settings.master, masterUrl); assert.equal(settings['server-master-key'], serverUid); }
  else assert.equal(settings.gameData.profileId, 123);
  assert.equal(settings['server-port'], port); assert.equal(settings.preserveThis, true);
  assert.equal(await readFile(path.join(game, 'Data/Scripts/launcher-smoke.pex'), 'utf8'), 'test resource bytes');
  assert.equal(await readFile(path.join(game, 'Data/Platform/Plugins/skymp5-client.js'), 'utf8'), await readFile(path.join(build, 'dist/client/Data/Platform/Plugins/skymp5-client.js'), 'utf8'));
  const plugins = await readFile(path.join(profile, 'plugins.txt'), 'utf8'); for (const name of loadOrder) assert(plugins.includes(`*${name}`));
  report.checks.push('Five real masters verified locally; current fork client installed; resource downloaded and activated');
  report.checks.push('Second preparation uses the verified cache without another download');
  const restored = await runHelper(['--restore', game, profile, cache]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.equal(await readFile(path.join(game, 'Data/Platform/Plugins/skymp5-client-settings.txt'), 'utf8'), originalSettings);
  assert.equal(await readFile(path.join(profile, 'plugins.txt'), 'utf8'), '*SinglePlayer.esp');
  report.checks.push('Original settings and single-player plugin list restored');
  report.ok = true;
} catch (error) { report.ok = false; report.error = error.stack; }
finally {
  child.kill();
  await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once('exit', resolve));
  await writeFile(path.join(root, 'native-server.log'), logs);
  await writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  if (master) { await new Promise((resolve) => master.server.close(resolve)); master.store.close(); }
  if (phpMaster) await phpMaster.stop();
}
console.log(JSON.stringify({ ok: report.ok, report: path.join(root, 'report.json'), checks: report.checks }));
if (!report.ok) process.exitCode = 1;
