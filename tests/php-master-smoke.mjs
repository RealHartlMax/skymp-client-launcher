// Exercises two independent PHP document roots over HTTP; never reads real configs/accounts.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, cp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import http from 'node:http';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const execute = promisify(execFile);
const phpLiteral = value => "'" + String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'";
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

export async function startPhpFixture(options = {}) {
  const bundledPhp = join(project, 'local-builds/tools/php-8.4.26/php.exe');
  const php = process.env.PHP_BINARY || (process.platform === 'win32' && existsSync(bundledPhp) ? bundledPhp : 'php');
  if (/[\\/]/.test(php) && !existsSync(php)) throw Error('Set PHP_BINARY to PHP 8.1+ with cURL and OpenSSL.');
  const root = await mkdtemp(join(tmpdir(), 'skymp-php-master-'));
  const apiPort = await freePort(), managePort = await freePort(), devPort = options.devSite ? await freePort() : null;
  const api = `http://127.0.0.1:${apiPort}`, manage = `http://127.0.0.1:${managePort}`;
  const dev = devPort ? `http://127.0.0.1:${devPort}` : null;
  const serverUid = options.serverUid || 'srv_' + randomBytes(8).toString('hex');
  const masterKey = options.masterKey || 'skymp_live_' + randomBytes(24).toString('hex');
  const otherKey = 'skymp_live_' + randomBytes(24).toString('hex'), otherId = 'srv_' + randomBytes(8).toString('hex');
  const password = 'Local-php-test-Only-12345!';
  const crashToken = randomBytes(32).toString('hex'), crashDirectory = options.devWebrootReports ? join(root,'dev.skymp-worlds.net/reports') : join(root,'private-crash-reports');
  const devSsoSecret = randomBytes(32).toString('hex');
  const { stdout } = await execute(php, ['-r', 'echo password_hash($argv[1], PASSWORD_BCRYPT);', password], { windowsHide: true });
  const identityFile = join(root, 'identities.json'), authDirectory = join(root, 'private-auth');
  await mkdir(join(root, 'sessions'));
  const state = {
    users: [
      {id:'test-owner',login_name:'test-owner',display_name:'Hüter_ÄÖÜ',provider:'email',email:'test@example.invalid',email_verified_at:new Date().toISOString(),password_hash:stdout},
      {id:'test-other',login_name:'test-other',display_name:'Other owner',provider:'email',email:'other@example.invalid',password_hash:stdout},
      {id:'test-demo',login_name:'test-demo',display_name:'Demo',provider:'demo',password_hash:stdout},
    ],
    servers: [
      {id:serverUid,owner_id:'test-owner',name:'Hüter von Weißlauf ÄÖÜ',ip:'127.0.0.1',port:options.gamePort || 7777,max_players:32,api_key:masterKey,status:'active',country_code:'DE',gamemode:'Roleplay'},
      {id:otherId,owner_id:'test-other',name:'Another server',ip:'127.0.0.1',port:7778,max_players:32,api_key:otherKey,status:'active',country_code:'DE',gamemode:'Roleplay'},
    ],
  };
  await writeFile(identityFile, JSON.stringify(state));
  for (const site of ['api.skymp-worlds.net','manage.skymp-worlds.net', ...(dev ? ['dev.skymp-worlds.net'] : [])]) {
    await cp(join(options.webDirectory || process.env.SKYMP_TEST_WEB_DIRECTORY || join(project,'web'),site), join(root,site), { recursive:true, filter:async path => !['config.php','private.php','game-auth','vendor','node_modules'].includes(basename(path))
      && (!path.replaceAll('\\','/').includes('/reports/') || ['.htaccess','index.php'].includes(basename(path)))
      && ((await stat(path)).isDirectory() || /\.(?:php|css|js|jpg|png|svg|html|sql|md|example|woff2)$/.test(path) || ['.htaccess','OFL.txt'].includes(basename(path))) });
  }
  const manageRoot = join(root,'manage.skymp-worlds.net'), apiRoot = join(root,'api.skymp-worlds.net');
  // Diagnostics stay in this isolated copy and never change production responses or source.
  const testMaster = join(manageRoot,'native-master.php');
  await writeFile(testMaster,(await readFile(testMaster,'utf8')).replace('http_response_code(500);', "error_log('TEST_NATIVE_MASTER: ' . get_class($error) . ': ' . $error->getMessage()); http_response_code(500);"));
  await writeFile(join(manageRoot,'config.php'), `<?php
define('MANAGE_STORAGE_FILE',${phpLiteral(identityFile)});
define('MANAGE_DB_ENABLED',false);
define('MANAGE_PUBLIC_URL',${phpLiteral(manage)});
define('MANAGE_SESSION_NAME','skymp_php_test_${managePort}');
define('MANAGE_GAME_MASTER_URL',${phpLiteral(api)});
define('MANAGE_GAME_AUTH_DIRECTORY',${phpLiteral(authDirectory)});
define('MANAGE_GAME_ALLOW_PRIVATE_RESOURCES',${options.allowPrivateResources === false ? 'false' : 'true'});
define('MANAGE_SYNC_REGISTRY_ON_SAVE',false);
${dev ? `define('MANAGE_DEV_PUBLIC_URL',${phpLiteral(dev)});
define('MANAGE_DEV_SSO_SECRET',${phpLiteral(devSsoSecret)});
define('MANAGE_CRASH_REPORT_ADMINS',['test-owner']);` : ''}
${options.smtpPort ? `define('MANAGE_SMTP_HOST','127.0.0.1');
define('MANAGE_SMTP_PORT',${Number(options.smtpPort)});
define('MANAGE_SMTP_ENCRYPTION','none');
define('MANAGE_SMTP_USERNAME','local-capture');
define('MANAGE_SMTP_PASSWORD','fixture-only');
define('MANAGE_MAIL_FROM_ADDRESS','no-reply@example.org');` : ''}
${options.crashReports && !dev ? `define('MANAGE_CRASH_DIRECTORY',${phpLiteral(crashDirectory)});
define('MANAGE_CRASH_PROXY_TOKEN',${phpLiteral(crashToken)});
${dev ? '' : "define('MANAGE_CRASH_REPORT_ADMINS',['test-owner']);"}
define('MANAGE_CRASH_HOURLY_LIMIT',${Number(options.crashHourlyLimit || 20)});
define('MANAGE_CRASH_MAX_DUMP_BYTES',${Number(options.crashDumpLimit || 1048576)});` : ''}
${options.crashQuotaBytes !== undefined ? `define('MANAGE_CRASH_QUOTA_BYTES',${Number(options.crashQuotaBytes)});` : ''}
ini_set('session.save_path',${phpLiteral(join(root,'sessions'))});
`);
  await writeFile(join(apiRoot,'config.php'), `<?php\ndefine('API_MANAGE_PUBLIC_URL',${phpLiteral(manage)});\ndefine('API_CRASH_PUBLIC_URL',${phpLiteral(dev || manage)});\n${options.crashReports ? `define('API_CRASH_PROXY_TOKEN',${phpLiteral(crashToken)});\ndefine('API_CRASH_MAX_DUMP_BYTES',${Number(options.crashDumpLimit || 1048576)});\n` : ''}`);
  if (dev) await writeFile(join(root,'dev.skymp-worlds.net/config.php'), `<?php
define('DEV_PUBLIC_URL',${phpLiteral(dev)});
define('DEV_MANAGE_PUBLIC_URL',${phpLiteral(manage)});
define('DEV_SSO_SECRET',${phpLiteral(devSsoSecret)});
define('DEV_SESSION_NAME','skymp_dev_test_${devPort}');
define('DEV_CRASH_DIRECTORY',${phpLiteral(crashDirectory)});
define('DEV_CRASH_PROXY_TOKEN',${phpLiteral(crashToken)});
define('DEV_CRASH_MAX_DUMP_BYTES',${Number(options.crashDumpLimit || 1048576)});
ini_set('session.save_path',${phpLiteral(join(root,'sessions'))});
`);
  const router = join(root,'router.php');
  await writeFile(router, `<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (preg_match('~/(?:storage|includes)/|/(?:config|private)\\.php$~', $path)) { http_response_code(403); exit; }
if (is_file($_SERVER['DOCUMENT_ROOT'].'/native.php')) {
  // Exercise the old nested rewrite used on shared hosting.
  if (preg_match('~^/api/servers(?:/.*)?$~', $path)) { require $_SERVER['DOCUMENT_ROOT'].'/api/servers/index.php'; return true; }
  if (preg_match('~^/(?:account/?|health|api/users/.*|api/servers/[^/]+(?:/.*)?)$~', $path)) { require $_SERVER['DOCUMENT_ROOT'].'/native.php'; return true; }
  if (preg_match('~^/api/servers/?$~', $path)) { require $_SERVER['DOCUMENT_ROOT'].'/api/servers/index.php'; return true; }
}
return false;
`);
  const processes = [], logs = [];
  const extra = process.platform === 'win32' && existsSync(join(resolve(php,'..'),'ext/php_curl.dll')) ? ['-d', 'extension_dir=' + join(resolve(php,'..'),'ext'), '-d','extension=php_curl.dll','-d','extension=php_openssl.dll'] : [];
  for (const [port, documentRoot] of [[managePort,manageRoot],[apiPort,apiRoot], ...(dev ? [[devPort,join(root,'dev.skymp-worlds.net')]] : [])]) {
    const child = spawn(php, [...extra, '-d','display_errors=0','-d','log_errors=1','-S',`127.0.0.1:${port}`,'-t',documentRoot,router], {cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data', b => logs.push(b.toString())); child.stderr.on('data', b => logs.push(b.toString()));
    processes.push(child);
  }
  async function stop() {
    for (const child of processes) if (child.exitCode === null) child.kill();
    await Promise.all(processes.map(child=>child.exitCode !== null ? undefined : new Promise(resolve=>child.once('exit',resolve))));
    await writeFile(join(root,'php-server.log'),logs.join(''));
  }
  try {
    const deadline = Date.now()+30_000;
    let ready = false;
    while(Date.now()<deadline) {
      try { if ((await fetch(api+'/health',{signal:AbortSignal.timeout(2000)})).status === 200) { ready=true;break; } } catch {}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert(ready,'PHP sites did not become ready; see '+root+'/php-server.log');
    if (options.resourceUrl) {
      // The fixture's operator metadata lives outside both document roots.
      await mkdir(authDirectory,{recursive:true});
      await writeFile(join(authDirectory,'state.json'),JSON.stringify({connections:{[serverUid]:{resourceUrl:options.resourceUrl,runtimeSource:''}}}));
    }
  } catch(e) { await stop(); throw e; }
  let cookie='';
  async function manageRequest(path, options={}) {
    const response = await fetch(manage+path,{redirect:'manual',...options,headers:{...(cookie?{cookie}:{}),...options.headers}});
    const incoming = response.headers.getSetCookie().find(value=>value.startsWith('skymp_php_test_'));
    if(incoming) cookie=incoming.split(';')[0];
    return response;
  }
  const csrf = html => { const match=html.match(/name="csrf_token" value="([a-f0-9]{64})"/); assert(match,'Expected CSRF token');return match[1]; };
  async function login(identity='test-owner') {
    const state=randomBytes(32).toString('hex');
    let response=await manageRequest('/game-login.php?state='+state), html=await response.text();
    response=await manageRequest('/game-login.php',{method:'POST',body:new URLSearchParams({state,action:'login',login_name:identity,password,csrf_token:csrf(html)})});
    html=await response.text(); assert.equal(response.status,200,html.slice(0,300));
    assert(html.includes('Spielanmeldung bestätigen'),'Password login must precede explicit approval');
    response=await manageRequest('/game-login.php',{method:'POST',body:new URLSearchParams({state,action:'approve',csrf_token:csrf(html)})});
    assert.equal(response.status,200); assert((await response.text()).includes('Spielanmeldung bestätigt'));
    const status=await fetch(api+'/api/users/login-discord/status?state='+state);
    assert.equal(status.status,200);return (await status.json()).token;
  }
  return {root,api,manage,dev,devSsoSecret,serverUid,masterKey,otherId,otherKey,password,identityFile,authDirectory,manageRequest,csrf,login,stop,php,crashToken,crashDirectory};
}

async function main() {
  const files=http.createServer((request,response)=>{
    if(request.url==='/redirect/manifest.json') { response.writeHead(302,{Location:'/manifest.json'});response.end();return; }
    response.setHeader('Content-Type','application/json');response.end(JSON.stringify({versionMajor:1,mods:[],loadOrder:[]}));
  });
  await new Promise(resolve=>files.listen(0,'127.0.0.1',resolve));
  const resource=`http://127.0.0.1:${files.address().port}`;
  const fixture=await startPhpFixture({resourceUrl:resource});
  const {api,serverUid,masterKey,otherId,otherKey,manageRequest,csrf}=fixture;
  const checks=[];
  try {
    const account=await fetch(api+'/account',{redirect:'manual'});
    assert.equal(account.status,302);assert.equal(account.headers.get('location'),fixture.manage+'/index.php');
    checks.push('Account forwards to the existing dashboard across independent document roots');
    const state=randomBytes(32).toString('hex');
    const begin=await fetch(api+'/api/users/login-discord?state='+state,{redirect:'manual'});
    assert.equal(begin.status,302); assert(begin.headers.get('location').startsWith(fixture.manage+'/game-login.php?state='));
    assert.equal((await fetch(api+'/api/users/login-discord/status?state='+state)).status,401);
    const invalid=await manageRequest('/game-login.php',{method:'POST',body:new URLSearchParams({state,action:'approve',csrf_token:'bad'})});
    assert.equal(invalid.status,403);
    let page=await manageRequest('/game-login.php?state='+state);
    const html=await page.text();
    const demo=await manageRequest('/game-login.php',{method:'POST',body:new URLSearchParams({state,action:'login',login_name:'test-demo',password:fixture.password,csrf_token:csrf(html)})});
    assert.equal(demo.status,401);
    const token=await fixture.login();
    checks.push('Existing password account, explicit game consent, CSRF and demo exclusion');
    const authJson={authorization:token,'content-type':'application/json'};
    const ownerHeartbeatStatus=async()=>{
      const response=await manageRequest('/dashboard.php');assert.equal(response.status,200);
      const html=await response.text();
      const match=html.match(new RegExp('data-heartbeat-server="'+serverUid+'" data-heartbeat-status="([^"]+)"'));
      assert(match,'Owner heartbeat status must be rendered');return match[1];
    };
    assert.equal(await ownerHeartbeatStatus(),'missing');
    const heartbeat=key=>fetch(api+'/api/servers/'+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Hüter vom Server ÄÖÜ',online:4,maxPlayers:32})});
    assert.equal((await heartbeat(masterKey)).status,200);assert.equal((await heartbeat(otherKey)).status,200);
    assert.equal(await ownerHeartbeatStatus(),'ready');
    assert.equal((await fetch(api+'/api/servers/'+masterKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Servername geändert',online:4,maxPlayers:40})})).status,200);
    assert((await (await manageRequest('/dashboard.php')).text()).includes('4 / 40'));
    assert.equal((await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid).max_players,40);
    const liveMetadata = (await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid);
    assert.equal(liveMetadata.name,'Servername geändert');
    const metadataPage = await manageRequest('/dashboard.php?edit='+serverUid);
    const metadataHtml = await metadataPage.text();
    assert(metadataHtml.includes('Servername geändert'));
    assert(!/<input[^>]+name=["'](?:name|max_players)["']/.test(metadataHtml));
    const registeredBefore = JSON.parse(await readFile(fixture.identityFile,'utf8')).servers.find(server=>server.id===serverUid);
    const edited = await manageRequest('/server-save.php',{method:'POST',body:new URLSearchParams({csrf_token:csrf(metadataHtml),server_id:serverUid,ip:'127.0.0.1',port:'7777',country_code:'DE',status:'active',gamemode:'Roleplay',name:'Forged web name',max_players:'999'})});
    assert.equal(edited.status,302);
    const registeredAfter = JSON.parse(await readFile(fixture.identityFile,'utf8')).servers.find(server=>server.id===serverUid);
    assert.equal(registeredAfter.name,registeredBefore.name); assert.equal(registeredAfter.max_players,registeredBefore.max_players);
    const afterWebEdit = (await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid);
    assert.equal(afterWebEdit.name,'Servername geändert'); assert.equal(afterWebEdit.max_players,40);
    for (const invalid of [{online:0,maxPlayers:16},{name:'Server',online:0},{name:['bad'],maxPlayers:16},{name:'bad\u0000name',maxPlayers:16},{name:'X'.repeat(256),maxPlayers:16}]) assert.equal((await fetch(api+'/api/servers/'+masterKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(invalid)})).status,400);
    checks.push('Server-owned names and capacities are received by authenticated heartbeat; web inputs and forged POST fields cannot override them or synthesize a heartbeat.');
    await heartbeat(masterKey);
    const compatHeartbeat=await fetch(api+'/api/servers/index.php?masterKey='+masterKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Hüter vom Server ÄÖÜ',online:4,maxPlayers:32})});
    assert.equal(compatHeartbeat.status,200);
    for(const alias of ['api_key','masterKey','master_key']){
      const response=await fetch(api+'/heartbeat.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({[alias]:masterKey,name:'Hüter vom Server ÄÖÜ',online:4,maxPlayers:32})});
      assert.equal(response.status,200);assert(!JSON.stringify(await response.json()).includes(masterKey));
    }
    assert.equal((await fetch(api+'/heartbeat.php')).status,405);
    assert.equal((await fetch(api+'/heartbeat.php',{method:'POST',body:JSON.stringify({api_key:['bad']})})).status,400);
    assert.equal((await fetch(api+'/heartbeat.php',{method:'POST',body:JSON.stringify({api_key:'unknown_key_12345',online:0})})).status,401);
    checks.push('Shared-hosting compatibility routes and historical heartbeat key aliases use the dashboard master without echoing private keys');
    const wrongUid=await fetch(api+'/api/servers/'+masterKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({server_uid:otherId,online:4})});
    assert.equal(wrongUid.status,400);
    const listResponse=await fetch(api+'/list.php');assert.equal(listResponse.status,200);
    const list=await listResponse.json();assert(list.find(server=>server.id===serverUid)?.resourceUrl===resource);
    assert(!JSON.stringify(list).includes(masterKey));assert.equal((await (await fetch(api+'/api/servers')).json()).length,2);
    const sessionResponse=await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:authJson,body:'{}'});
    assert.equal(sessionResponse.status,200);const {session}=await sessionResponse.json();
    const sessionResult=await fetch(api+'/api/servers/'+masterKey+'/sessions/'+session);
    assert.equal(sessionResult.status,200);const user=(await sessionResult.json()).user;
    assert.equal(user.name,'Hüter_ÄÖÜ');assert.equal(user.id,1);
    assert.equal((await fetch(api+'/api/servers/'+otherKey+'/sessions/'+session)).status,401);
    assert.equal((await fetch(api+'/api/servers/'+serverUid+'/sessions/'+session)).status,401);
    assert.equal((await fetch(api+'/api/users/me/play/'+masterKey,{method:'POST',headers:authJson,body:'{}'})).status,404);
    checks.push('Native heartbeat, public metadata, shared list, scoped play session and numeric identity');
    const authFile=join(fixture.authDirectory,'state.json');
    let authState=JSON.parse(await readFile(authFile,'utf8'));
    authState.heartbeats[serverUid].time=Math.floor(Date.now()/1000)-301;
    await writeFile(authFile,JSON.stringify(authState));
    assert.equal(await ownerHeartbeatStatus(),'expired');
    const expiredServer=(await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid); assert.equal(expiredServer.server_status,'offline'); assert.equal(expiredServer.current_players,0);
    await heartbeat(masterKey);
    authState=JSON.parse(await readFile(authFile,'utf8'));
    checks.push('Owner dashboard reads native heartbeats and distinguishes missing, current and expired entries consistently with the public list');
    assert.equal((await fetch(api+'/api/servers/'+masterKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Hüter vom Server ÄÖÜ',maxPlayers:32,online:0,serverStatus:'offline'})})).status,200);
    assert.equal(await ownerHeartbeatStatus(),'offline');
    const stoppedServer=(await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid);
    assert.equal(stoppedServer.server_status,'offline'); assert.equal(stoppedServer.name,'Hüter vom Server ÄÖÜ');
    assert.equal((await fetch(api+'/api/servers/'+masterKey+'/sessions/'+session)).status,401);
    await heartbeat(masterKey);
    assert.equal((await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid).server_status,'online');
    authState=JSON.parse(await readFile(authFile,'utf8'));
    checks.push('Offline heartbeats take effect immediately; silent timeout keeps the known server visible offline; offline servers cannot issue or validate play sessions and recover on the next online heartbeat.');
    authState.tokens[createHash('sha256').update(session).digest('hex')].expires=0;
    await writeFile(authFile,JSON.stringify(authState));
    assert.equal((await fetch(api+'/api/servers/'+masterKey+'/sessions/'+session)).status,401,'Expired play session must fail');
    const expiredState=randomBytes(32).toString('hex');
    const expiredPage=await manageRequest('/game-login.php?state='+expiredState), expiredHtml=await expiredPage.text();
    authState=JSON.parse(await readFile(authFile,'utf8'));
    authState.handoffs[createHash('sha256').update(expiredState).digest('hex')].expires=0;
    await writeFile(authFile,JSON.stringify(authState));
    assert.equal((await manageRequest('/game-login.php',{method:'POST',body:new URLSearchParams({state:expiredState,action:'approve',csrf_token:csrf(expiredHtml)})})).status,410);
    checks.push('Expired sessions and expired game consent fail closed');
    assert.equal((await fetch(api+'/api/servers/'+serverUid+'/manifest.json')).status,200);
    page=await manageRequest('/server-connection.php?server='+serverUid);assert.equal(page.status,200);
    const connectionHtml=await page.text();assert(connectionHtml.includes(masterKey));assert(!connectionHtml.includes('\uFFFD'));
    assert.equal((await manageRequest('/server-connection.php?server='+otherId)).status,404);
    const profile={description:'Für Hüter, Händler & Abenteurer.\n<script>alert("test")</script>',tags:'Deutsch, Roleplay, Abenteuer, Deutsch',website:'https://community.example.org/?lang=de#start',discord_url:'https://discord.gg/example',banner_url:'https://images.example.org/banner.jpg',icon_url:'https://images.example.org/logo.png'};
    const profileForm={server_id:serverUid,resource_url:resource+'/redirect',runtime_url:resource+'/catalog.json',csrf_token:csrf(connectionHtml),...profile};
    assert(!connectionHtml.includes('name="banner_url"'));assert(!connectionHtml.includes('name="icon_url"'));assert(connectionHtml.includes('data-server-images="automatic"'));
    for(const invalidProfile of [{website:'javascript:alert(1)'},{website:'https://name:password@example.org'},{description:'Ä'.repeat(2001)},{tags:'a,b,c,d,e,f,g,h,i'},{tags:'Ü'.repeat(33)}]) {
      const invalidSave=await manageRequest('/server-connection.php',{method:'POST',body:new URLSearchParams({...profileForm,...invalidProfile})});
      assert.equal(invalidSave.status,400,'Invalid public profile must be rejected');
    }
    const save=await manageRequest('/server-connection.php',{method:'POST',body:new URLSearchParams(profileForm)});
    assert.equal(save.status,200);const savedHtml=await save.text();assert(savedHtml.includes('&lt;script&gt;'));assert(!savedHtml.includes('<script>alert('));
    assert.equal((await fetch(api+'/api/servers/'+serverUid+'/manifest.json')).status,502,'Redirects must not be followed');
    assert(!((await (await fetch(api+'/list.php')).json()).some(server=>server.id===serverUid)),'Metadata edit requires a new heartbeat');
    await heartbeat(masterKey);
    const published=(await (await fetch(api+'/list.php')).json()).find(server=>server.id===serverUid);
    assert.equal(published.description,profile.description);assert.deepEqual(published.tags,['Deutsch','Roleplay','Abenteuer']);assert.equal(published.website,profile.website);
    assert.equal(published.discordUrl,profile.discord_url);assert.equal(published.bannerUrl,'');assert.equal(published.iconUrl,'');
    assert.equal(published.runtimeSource,resource+'/catalog.json');
    checks.push('Owner-only connection settings, Unicode server profile, safe URLs, escaped form and manifest redirect denial');
    assert.equal((await fetch(api+'/api/users/login-discord?state=bad')).status,400);
    assert.equal((await fetch(api+'/api/servers/'+masterKey,{method:'POST',body:'x'.repeat(17000)})).status,413);
    for(const privatePath of ['/config.php','/storage/game-auth/state.json','/includes/game-auth.php']) assert.equal((await fetch(fixture.manage+privatePath)).status,403);
    const rawAuth=await readFile(join(fixture.authDirectory,'state.json'),'utf8');
    assert(!rawAuth.includes(token));assert(!rawAuth.includes(session));assert(!rawAuth.includes(fixture.password));assert(!rawAuth.includes(masterKey));
    checks.push('Bounded bodies, private file denial and hashed/encrypted credentials at rest');
    const nextKey='skymp_live_'+randomBytes(32).toString('hex');
    const identityState=JSON.parse(await readFile(fixture.identityFile,'utf8'));
    identityState.servers[0].api_key=nextKey;
    await writeFile(fixture.identityFile,JSON.stringify(identityState));
    assert.equal((await heartbeat(masterKey)).status,401,'Rotated key cannot heartbeat');
    assert.equal(await ownerHeartbeatStatus(),'key_changed');
    assert(!((await (await fetch(api+'/list.php')).json()).some(server=>server.id===serverUid)));
    assert.equal((await heartbeat(nextKey)).status,200);
    const freshSession=await (await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:authJson,body:'{}'})).json();
    assert.equal((await fetch(api+'/api/servers/'+nextKey+'/sessions/'+freshSession.session)).status,200);
    checks.push('Existing dashboard key rotation takes effect without a metadata migration');
    const dashboard=await manageRequest('/dashboard.php');
    const logout=await manageRequest('/logout.php',{method:'POST',body:new URLSearchParams({csrf_token:csrf(await dashboard.text())})});
    assert.equal(logout.status,302);
    assert.equal((await fetch(api+'/api/servers/'+nextKey+'/sessions/'+freshSession.session)).status,401);
    checks.push('Dashboard logout revokes game tokens and sessions');
    const restricted=await startPhpFixture({resourceUrl:resource,allowPrivateResources:false});
    try { assert.equal((await fetch(restricted.api+'/api/servers/'+restricted.serverUid+'/manifest.json')).status,502); }
    finally { await restricted.stop(); }
    checks.push('Production mode rejects loopback resource targets');
    const forbidden=['127.0.0.1','10.1.2.3','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1','192.0.2.1','198.18.0.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','ff02::1','2001:db8::1','2002:7f00:1::1','64:ff9b::7f00:1'];
    const publicAddresses=['8.8.8.8','1.1.1.1','2606:4700:4700::1111'];
    const ipResult=await execute(fixture.php,['-r','require $argv[1]; echo json_encode(array_map("ga_public_ip", json_decode($argv[2], true)));',join(project,'web/manage.skymp-worlds.net/includes/game-auth.php'),JSON.stringify([...forbidden,...publicAddresses])],{windowsHide:true});
    assert.deepEqual(JSON.parse(ipResult.stdout),[...forbidden.map(()=>false),...publicAddresses.map(()=>true)]);
    await Promise.all(Array.from({length:8},()=>execute(fixture.php,['-r',"define('MANAGE_GAME_AUTH_DIRECTORY', $argv[1]); require $argv[2]; ga_transaction(function (&$state) { usleep(20000); $state['concurrency_probe'] = ($state['concurrency_probe'] ?? 0) + 1; });",fixture.authDirectory,join(project,'web/manage.skymp-worlds.net/includes/game-auth.php')],{windowsHide:true})));
    assert.equal(JSON.parse(await readFile(authFile,'utf8')).concurrency_probe,8);
    checks.push('IPv4/IPv6 SSRF cases and atomic updates from eight concurrent PHP workers');
    await writeFile(join(fixture.root,'report.json'),JSON.stringify({ok:true,checks},null,2));
    console.log(JSON.stringify({ok:true,checks,fixture:fixture.root}));
  } finally { await fixture.stop(); await new Promise(resolve=>files.close(resolve)); }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
