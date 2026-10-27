// Real browser-handoff/API contract against isolated PHP accounts, never production.
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {startPhpFixture} from './php-master-smoke.mjs';
const fixture=await startPhpFixture();
const {api,manageRequest,csrf,password,serverUid}=fixture;
const call=(path,token,method='GET')=>fetch(api+'/api/users/launcher/'+path,{method,headers:token?{Authorization:'Bearer '+token}:undefined});
async function signIn(){
  const state=randomBytes(32).toString('hex');let response=await manageRequest('/launcher-login.php?state='+state+'&lang=en'),html=await response.text();
  assert.equal(response.status,200);
  if(html.includes('name="login_name"')){
    response=await manageRequest('/launcher-login.php',{method:'POST',body:new URLSearchParams({state,action:'login',login_name:'test-owner',password,csrf_token:csrf(html),lang:'en'})});
    html=await response.text();assert.equal(response.status,200);
  }
  assert(html.includes('Confirm launcher sign-in'));
  assert.equal((await call('status?state='+state)).status,401,'Website login alone does not approve a launcher');
  assert.equal((await manageRequest('/launcher-login.php',{method:'POST',body:new URLSearchParams({state,action:'approve',csrf_token:'bad'})})).status,403);
  response=await manageRequest('/launcher-login.php',{method:'POST',body:new URLSearchParams({state,action:'approve',csrf_token:csrf(html),lang:'en'})});
  assert.equal(response.status,200);assert((await response.text()).includes('Launcher sign-in confirmed'));
  assert.equal((await fetch(api+'/api/users/login-discord/status?state='+state)).status,401,'Game handoff cannot redeem a launcher session');
  response=await call('status?state='+state);assert.equal(response.status,200);const result=await response.json();
  assert.match(result.token,/^[a-f0-9]{64}$/);assert.equal((await call('status?state='+state)).status,401,'Handoff is single-use');
  return result;
}
try{
  assert.equal((await call('me')).status,401);
  const {token,profile}=await signIn();
  assert.deepEqual(Object.keys(profile).sort(),['discordLinked','displayName','email','emailVerified','expiresAt','id','loginName']);
  assert.equal(typeof profile.id,'number');assert(profile.id>0);assert(profile.expiresAt>Date.now()/1000);
  assert.equal((await call('me',token)).status,200);
  assert.equal((await fetch(api+'/api/users/me/play/'+serverUid,{method:'POST',headers:{Authorization:'Bearer '+token}})).status,401,'Profile-only token never grants a game session');
  const gameToken=await fixture.login();
  assert.equal((await call('me',gameToken)).status,401,'Game tokens are not launcher tokens');
  assert.equal((await call('logout',token,'POST')).status,200);assert.equal((await call('me',token)).status,401);
  const authFile=join(fixture.authDirectory,'state.json');
  let state=JSON.parse(await readFile(authFile,'utf8'));
  assert.equal(state.tokens[createHash('sha256').update(gameToken).digest('hex')].kind,'login','Launcher logout preserves separate game sessions');
  const expiring=await signIn();state=JSON.parse(await readFile(authFile,'utf8'));
  state.tokens[createHash('sha256').update(expiring.token).digest('hex')].expires=1;await writeFile(authFile,JSON.stringify(state));
  assert.equal((await call('me',expiring.token)).status,401);
  const reset=await signIn();const identities=JSON.parse(await readFile(fixture.identityFile,'utf8'));
  identities.users.find(user=>user.id==='test-owner').password_hash='changed-by-isolated-reset-test';await writeFile(fixture.identityFile,JSON.stringify(identities));
  assert.equal((await call('me',reset.token)).status,401,'Password change invalidates launcher session');
  console.log(JSON.stringify({ok:true,cases:14,websiteAccounts:'isolated fixtures only',checks:['explicit approval and CSRF','single-use launcher handoff','profile allowlist','game/launcher token isolation','single-session logout','expiry and password revocation']}));
}finally{await fixture.stop();}
