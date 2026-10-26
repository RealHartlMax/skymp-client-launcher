// Real PHP + bundled PHPMailer + a loopback SMTP capture. No production mail/accounts.
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startPhpFixture } from './php-master-smoke.mjs';

export async function createMailCapture() {
  const messages = [], sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    socket.setEncoding('utf8'); socket.write('220 localhost test capture\r\n');
    let buffer = '', data = false, message = [], auth = 0;
    socket.on('data', chunk => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (data) {
          if (line === '.') { messages.push(message.join('\n')); message = []; data = false; socket.write('250 stored\r\n'); }
          else message.push(line.replace(/^\.\./, '.'));
        } else if (/^EHLO /i.test(line)) socket.write('250-localhost\r\n250 AUTH LOGIN PLAIN\r\n');
        else if (/^AUTH LOGIN/i.test(line)) { auth = 1; socket.write('334 VXNlcm5hbWU6\r\n'); }
        else if (auth === 1) { auth = 2; socket.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (auth === 2 || /^AUTH PLAIN/i.test(line)) { auth = 0; socket.write('235 authenticated\r\n'); }
        else if (/^DATA$/i.test(line)) { data = true; socket.write('354 end with dot\r\n'); }
        else if (/^QUIT$/i.test(line)) socket.end('221 bye\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { port:server.address().port, messages, stop:async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}

export async function runPasswordResetTests() {
  const mail = await createMailCapture(), fixture = await startPhpFixture({smtpPort:mail.port});
  const { manageRequest:request, csrf, password, identityFile, authDirectory, api, serverUid, masterKey } = fixture;
  const checks = [];
  const newPassword = 'New-Local-Password-ÄÖÜ-Only-123!';
  const authFile = join(authDirectory, 'state.json');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const messageText = message => /Content-Transfer-Encoding: quoted-printable/i.test(message)
    ? message.replace(/=\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, code) => String.fromCharCode(parseInt(code,16))) : message;
  const tokenFrom = message => { const match = messageText(message).match(/reset-password\.php\?token=([a-f0-9]{64})/); assert(match, 'Expected reset link in captured SMTP message'); return match[1]; };
  async function requestLink(email, language='de') {
    const page = await request('/forgot-password.php?lang=' + language);
    assert.equal(page.status,200); const html=await page.text();
    const response=await request('/forgot-password.php?lang=' + language, {method:'POST',body:new URLSearchParams({email,csrf_token:csrf(html)})});
    assert.equal(response.status,200); return response.text();
  }
  async function openLink(token, language='de') {
    let response=await request('/reset-password.php?token=' + token + '&lang=' + language);
    assert.equal(response.status,302); assert(!response.headers.get('location').includes('token='));
    response=await request(response.headers.get('location'));
    const html=await response.text(); assert(!html.includes(token)); return html;
  }
  async function postReset(html, first=newPassword, second=first) {
    return request('/reset-password.php?lang=de',{method:'POST',body:new URLSearchParams({csrf_token:csrf(html),password:first,password_repeat:second})});
  }
  try {
    // Keep both an authenticated web session and a native game session to verify revocation.
    const loginToken=await fixture.login();
    let secondaryCookie = '';
    async function secondaryRequest(path, options={}) {
      const response = await fetch(fixture.manage+path,{redirect:'manual',...options,headers:{...(secondaryCookie?{cookie:secondaryCookie}:{}),...options.headers}});
      const incoming = response.headers.getSetCookie().find(value=>value.startsWith('skymp_php_test_'));
      if(incoming) secondaryCookie=incoming.split(';')[0];
      return response;
    }
    let secondaryPage=await secondaryRequest('/login.php');
    const secondaryHtml=await secondaryPage.text();
    secondaryPage=await secondaryRequest('/login.php',{method:'POST',body:new URLSearchParams({login_name:'test-owner',password,csrf_token:csrf(secondaryHtml)})});
    assert.equal(secondaryPage.status,302);
    assert.equal((await secondaryRequest('/dashboard.php')).status,200);
    const heartbeat=await fetch(api+'/api/servers/'+masterKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Local password-reset fixture',online:0,maxPlayers:32,serverUid})});
    assert.equal(heartbeat.status,200,'The fixture must publish server-authoritative name and capacity');
    const play=await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:{Authorization:'Bearer '+loginToken}});
    assert.equal(play.status,200); const playSession=(await play.json()).session;
    const otherLoginToken=await fixture.login('test-other');
    const controlPage=await request('/dashboard.php'); assert.equal(controlPage.status,200);
    const before=JSON.parse(await readFile(identityFile,'utf8'));
    let page=await requestLink('test@example.invalid');
    assert(page.includes('Wenn zu dieser E-Mail-Adresse'));
    assert.equal(mail.messages.length,1);
    assert.match(mail.messages[0], /charset=UTF-8/i);
    const token=tokenFrom(mail.messages[0]);
    let state=JSON.parse(await readFile(authFile,'utf8'));
    const oldLoginRecord=state.tokens[hash(loginToken)], oldPlayRecord=state.tokens[hash(playSession)];
    assert(state.password_resets[hash(token)]); assert(!(await readFile(authFile,'utf8')).includes(token));
    checks.push('Real PHPMailer SMTP delivery, UTF-8 and hashed 30-minute reset tokens');

    const unknown=await requestLink('unknown@example.invalid');
    assert(unknown.includes('Wenn zu dieser E-Mail-Adresse')); assert.equal(mail.messages.length,1);
    assert.equal((await request('/forgot-password.php',{method:'POST',body:new URLSearchParams({email:'test@example.invalid'})})).status,403);
    checks.push('Uniform response for unknown accounts, no mail disclosure, CSRF required');

    // Invalid links and GET requests do not change a password.
    let resetHtml=await openLink('0'.repeat(64)); assert(resetHtml.includes('Dieser Link ist ungültig'));
    assert.deepEqual(JSON.parse(await readFile(identityFile,'utf8')),before);
    resetHtml=await openLink(token); assert(resetHtml.includes('name="password_repeat"'));
    assert.equal((await request('/reset-password.php',{method:'POST',body:new URLSearchParams({password:newPassword,password_repeat:newPassword})})).status,403);
    let response=await postReset(resetHtml,'short'); assert.equal(response.status,200); assert((await response.text()).includes('8 bis 256'));
    response=await postReset(resetHtml,newPassword,'different'); assert.equal(response.status,200); assert((await response.text()).includes('stimmen nicht überein'));
    response=await postReset(resetHtml,'a'.repeat(257)); assert.equal(response.status,200); assert((await response.text()).includes('8 bis 256'));
    assert.deepEqual(JSON.parse(await readFile(identityFile,'utf8')),before);
    checks.push('Invalid links, GET, missing CSRF, weak and mismatched passwords cannot change an account');

    response=await postReset(resetHtml); assert.equal(response.status,302); assert(response.headers.get('location').startsWith('/login.php'));
    const after=JSON.parse(await readFile(identityFile,'utf8'));
    assert.notEqual(after.users[0].password_hash,before.users[0].password_hash);
    assert.equal(after.users[0].password_sha256,'');
    assert.deepEqual(after.servers,before.servers); assert.deepEqual(after.users.slice(1),before.users.slice(1));
    assert.equal((await request('/dashboard.php')).status,302);
    assert.equal((await secondaryRequest('/dashboard.php')).status,302,'A separate authenticated browser must also be signed out');
    assert.equal((await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:{Authorization:'Bearer '+otherLoginToken}})).status,200,'Reset must preserve unrelated accounts and their game tokens');
    assert.equal((await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:{Authorization:'Bearer '+loginToken}})).status,401);
    assert.equal((await fetch(api+'/api/servers/'+masterKey+'/sessions/'+playSession)).status,401);
    const oldCredential=hash(before.users[0].password_hash+'|'+(before.users[0].password_sha256 || ''));
    const race=await promisify(execFile)(fixture.php,['-r',"require $argv[1]; echo json_encode(complete_login_for_user_id('test-owner', 'password', $argv[2]));",join(fixture.root,'manage.skymp-worlds.net/includes/bootstrap.php'),oldCredential],{windowsHide:true});
    assert.equal(race.stdout,'false','Credentials verified before a concurrent reset cannot complete login afterwards');
    state=JSON.parse(await readFile(authFile,'utf8'));
    assert(!Object.values(state.password_resets).some(record=>record.user==='test-owner'));
    state.tokens[hash(loginToken)]=oldLoginRecord; state.tokens[hash(playSession)]=oldPlayRecord;
    await writeFile(authFile,JSON.stringify(state));
    assert.equal((await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:{Authorization:'Bearer '+loginToken}})).status,401);
    assert.equal((await fetch(api+'/api/servers/'+masterKey+'/sessions/'+playSession)).status,401);
    checks.push('Single-use reset preserves server ownership and other accounts; website/game sessions revoked');
    resetHtml=await openLink(token); assert(resetHtml.includes('Dieser Link ist ungültig'));
    const loginPage=await request('/login.php'), loginHtml=await loginPage.text();
    const signIn=async pass => request('/login.php',{method:'POST',body:new URLSearchParams({login_name:'test-owner',password:pass,csrf_token:csrf(loginHtml)})});
    assert.equal((await signIn(password)).status,200); assert.equal((await signIn(newPassword)).status,302);
    checks.push('Consumed reset link cannot be replayed; old password fails and new password signs in');

    // Expiry, repeat-request budget and the three server-rendered languages.
    await requestLink('other@example.invalid','en');
    const expiredToken=tokenFrom(mail.messages.at(-1));
    state=JSON.parse(await readFile(authFile,'utf8')); state.password_resets[hash(expiredToken)].expires=0; await writeFile(authFile,JSON.stringify(state));
    resetHtml=await openLink(expiredToken,'en'); assert(resetHtml.includes('This link is invalid'));
    await requestLink('other@example.invalid','ru'); assert(messageText(mail.messages.at(-1)).includes('&lang=ru'));
    await requestLink('other@example.invalid','de'); const sent=mail.messages.length;
    await requestLink('other@example.invalid','de'); assert.equal(mail.messages.length,sent);
    checks.push('Expired links fail; per-address rate limit; German, English and Russian mail/page flow');

    const report={ok:true,date:new Date().toISOString(),checks,fixture:fixture.root,productionMailSent:false,accountDriver:'JSON',mysql:'PDO transaction implemented; no local MySQL instance available'};
    const target=resolve('local-builds/current/account'); await mkdir(target,{recursive:true});
    await writeFile(join(target,'VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
    return report;
  } finally {
    await writeFile(join(fixture.root,'smtp-capture.txt'),mail.messages.join('\n\n--- MESSAGE ---\n\n'));
    await fixture.stop(); await mail.stop();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await runPasswordResetTests(),null,2));
