import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire('D:/GitHub/skymp/skymp5-server/package.json'),Module=require('node:module'),esbuild=require('esbuild');
const compiled=esbuild.buildSync({entryPoints:[process.env.SKYMP_PLAYER_ACCESS_SOURCE||'D:/GitHub/skymp/skymp5-server/ts/playerAccess.ts'],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'}).outputFiles[0].text;
const module=new Module('steam-error-test');module.require=require;module._compile(compiled,'steam-error-test.cjs');const api=module.exports;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'skymp-steam-errors-'));const settings={dataDir:path.join(dir,'data'),publicHost:'test.example',port:7777,playerAccess:{mode:'guest',steamApiKey:'a'.repeat(32)}};
const ticket='ab'.repeat(128),secret='never-echo-keys-tickets-sessions-or-upstream-urls';const checks=[];
let server;const originalWarn=console.warn,warnings=[];
try{
 const cases=[[403,'STEAM_KEY_REJECTED'],[429,'STEAM_RATE_LIMITED'],[500,'STEAM_UNAVAILABLE']];
 for(const [status,code]of cases)await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>new Response(secret,{status})),e=>e.message===code&&e.upstreamStatus===status);
 await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>{throw Error(secret)}),/STEAM_UNAVAILABLE/);
 await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>new Response('{')) ,/STEAM_RESPONSE_INVALID/);
 await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>Response.json({response:{error:{errorcode:101,errordesc:secret}}})),e=>e.message==='STEAM_TICKET_REJECTED'&&e.steamErrorCode===101&&!JSON.stringify(e).includes(secret));
 const fixture='Valve diagnostic fixture';
 await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async url=>{
  const sent=new URL(url);assert.equal(sent.searchParams.get('identity'),api.playerAccessPolicy(settings).ticketIdentity);assert.equal(sent.searchParams.get('ticket'),ticket);assert.equal(sent.searchParams.get('appid'),'489830');
  return Response.json({response:{error:{errorcode:105,errordesc:fixture}}});
 }),e=>e.message==='STEAM_TICKET_REJECTED'&&e.steamErrorCode===105&&e.steamErrorDescription===fixture);
 for(const description of ['Invalid ticket '+settings.playerAccess.steamApiKey.toUpperCase()+' '+ticket.slice(0,100)+' 76561198000000000 https://private.example/key?value='+secret, 'x'.repeat(513), '\r\n'+fixture+'\u001b']){
  await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>Response.json({response:{error:{errorcode:105,errordesc:description}}})),e=>{
   const shown=e.steamErrorDescription||'';assert(!shown.includes(settings.playerAccess.steamApiKey));assert(!shown.includes(ticket.slice(0,100)));assert(!shown.includes('76561198000000000'));assert(!shown.includes('private.example'));assert(!/[\r\n\u001b]/.test(shown));assert(shown.length<=160);return e.steamErrorCode===105;
  });
 }
 checks.push('Valve HTTP refusal, rate limiting, network failures, malformed replies and numeric ticket errors remain distinct without exposing raw upstream data.');
 const identity=api.playerAccessPolicy(settings).ticketIdentity;
 assert.match(identity,/^skymp[a-f0-9]{24}$/);assert.equal(identity.length,29);
 assert.equal(api.playerAccessPolicy({...settings,playerAccess:{...settings.playerAccess,steamApiKey:'b'.repeat(32)}}).ticketIdentity,identity);
 assert.equal(api.playerAccessPolicy({...settings,playerAccess:{...settings.playerAccess,mode:'account'}}).ticketIdentity,identity);
 const prefix='long'.repeat(64);
 assert.notEqual(api.playerAccessPolicy({...settings,serverUid:prefix+'one'}).ticketIdentity,api.playerAccessPolicy({...settings,serverUid:prefix+'two'}).ticketIdentity);
 assert.notEqual(api.playerAccessPolicy({...settings,serverUid:'ä'}).ticketIdentity,api.playerAccessPolicy({...settings,serverUid:'ö'}).ticketIdentity);
 let contacted=false;
 await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>{contacted=true;throw Error('Must not contact Valve')},identity+'wrong'),/STEAM_POLICY_CHANGED/);assert.equal(contacted,false);
 await assert.rejects(api.authenticateSteamTicket(settings,ticket,undefined,async()=>Response.json({response:{error:{errorcode:105,errordesc:'Identity parameter did not match'}}}),identity),e=>e.message==='STEAM_TICKET_AUDIENCE_MISMATCH'&&e.steamErrorCode===105);
 checks.push('Audience stays compact and stable across key/access changes, keeps full server identities distinct, rejects changed policy before contacting Steam, and identifies Valve audience mismatches.');
 const Koa=require('koa'),Router=require('koa-router'),body=require('koa-body');const app=new Koa(),router=new Router();let mode='ticket';
 app.use(body({jsonLimit:'32kb'}));api.registerPlayerAccess(router,{settings:()=>settings,authorize:()=>false,fetch:async()=>mode==='key'?new Response(secret,{status:403}):mode==='limit'?new Response(secret,{status:429}):mode==='accept'?Response.json({response:{params:{result:'OK',steamid:'76561198000000000'}}}):mode==='audience'?Response.json({response:{error:{errorcode:105,errordesc:'Identity parameter did not match'}}}):mode==='105'?Response.json({response:{error:{errorcode:105,errordesc:fixture}}}):Response.json({response:{error:{errorcode:101,errordesc:secret}}})});app.use(router.routes());
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));console.warn=(...args)=>warnings.push(args.join(' '));
 const post=(extra={})=>fetch('http://127.0.0.1:'+server.address().port+'/api/launcher/auth/steam',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticket,...extra})});
 for(const [kind,status,code]of [['key',503,'STEAM_KEY_REJECTED'],['limit',429,'STEAM_RATE_LIMITED'],['ticket',401,'STEAM_TICKET_REJECTED']]){mode=kind;const res=await post(),result=await res.json();assert.equal(res.status,status);assert.equal(result.code,code);assert(!JSON.stringify(result).includes(secret));if(kind==='ticket')assert.equal(result.steamErrorCode,101);if(kind==='limit')assert.equal(res.headers.get('retry-after'),'60');}
 mode='105';const detailed=await post(),detail=await detailed.json();assert.equal(detailed.status,401);assert.equal(detail.steamErrorCode,105);assert(!JSON.stringify(detail).includes(fixture));assert(warnings.some(row=>row.includes('steamErrorCode=105')&&row.includes('steamDescription="'+fixture+'"')));
 const policyReply=await fetch('http://127.0.0.1:'+server.address().port+'/api/launcher/auth-policy'),policy=await policyReply.json();assert.equal(policy.version,2);assert.equal(policy.ticketIdentity,identity);assert.equal(policyReply.headers.get('cache-control'),'no-store');
 mode='audience';const refused=await post({ticketIdentity:identity}),refusal=await refused.json();assert.equal(refused.status,401);assert.equal(refusal.code,'STEAM_TICKET_AUDIENCE_MISMATCH');assert.equal(refusal.steamErrorCode,105);
 mode='accept';const changed=await post({ticketIdentity:'client-cannot-change-the-service'});assert.equal(changed.status,409);assert.equal((await changed.json()).code,'STEAM_POLICY_CHANGED');
 const blocked=path.join(dir,'blocked');fs.writeFileSync(blocked,'fixture');settings.dataDir=blocked;mode='accept';const res=await post(),result=await res.json();assert.equal(res.status,503);assert.equal(result.code,'STEAM_STORAGE_UNAVAILABLE');
 assert(warnings.some(row=>row.includes('steamErrorCode=101')));assert(!warnings.join(' ').includes(secret));assert(!warnings.join(' ').includes(settings.playerAccess.steamApiKey));assert(!warnings.join(' ').includes(ticket));
 checks.push('Loopback HTTP exposes only fixed diagnostic codes and numeric Valve errors; storage failures do not blame a user ticket; logs contain no keys, tickets or session data.');
 const ts=require('typescript'),front=new Module('steam-ui-errors');front._compile(ts.transpileModule(fs.readFileSync('launcher/src/steamErrors.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,'steam-ui-errors.cjs');
 const codes=['STEAM_KEY_MISSING','STEAM_KEY_REJECTED','STEAM_RATE_LIMITED','STEAM_UNAVAILABLE','STEAM_RESPONSE_INVALID','STEAM_TICKET_INVALID','STEAM_TICKET_REPLAY','STEAM_TICKET_REJECTED','STEAM_IDENTITY_MISMATCH','STEAM_SESSIONS_FULL','STEAM_STORAGE_UNAVAILABLE','STEAM_APP_MISMATCH','STEAM_TICKET_AUDIENCE_MISMATCH','STEAM_POLICY_CHANGED'];
 for(const language of ['de','en','ru'])for(const code of codes){const raw='['+code+'] HTTP 401; Steam 101',shown=front.exports.connectionErrorMessage(raw,language);assert(shown.endsWith(raw));assert(shown.length>raw.length+20);assert(!shown.includes('undefined'));}
 const normal='Probe.esp: SHA-256 mismatch';assert.equal(front.exports.connectionErrorMessage(new Error(normal),'de'),normal);
 assert(!front.exports.connectionErrorMessage('[STEAM_TICKET_REJECTED] HTTP 401','en').includes('API key'));
 checks.push('All 14 Steam error classes are translated in DE/EN/RU and keep bounded diagnostic codes; unrelated preparation errors remain intact.');
 console.warn=originalWarn;console.log(JSON.stringify({ok:true,checks,cases:checks.length,localizedCases:42,realSteamContacted:false,serverBuilt:false,skyrimStarted:false}));
}finally{console.warn=originalWarn;if(server)await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('skymp-steam-errors-'));fs.rmSync(dir,{recursive:true,force:true});}
