// Integration tests against independent PHP roots and temporary accounts/storage only.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startPhpFixture } from './php-master-smoke.mjs';
export const sampleReport = (id = randomBytes(16).toString('hex')) => ({
  schemaVersion:1, clientReportId:id, occurredAtUnix:1, eventKind:'gameCrash',
  launcher:{version:'0.2.0',buildId:'0.2.0-fixture'},
  game:{version:'1.7.104.0',skseVersion:'2.3.1',runtimeManifestSha256:'a'.repeat(64),verifiedFiles:222,loadOrder:['Skyrim.esm']},
  serverId:'srv_fixture', crash:{exitCode:'0xC0000005',native:{exceptionCode:'0xC0000005',module:'SkyrimPlatformImpl.dll',rva:'0x180D37',access:'read',invalidAddress:'0x3',threadId:1,stackAvailable:false,loadedModules:[{name:'SkyrimPlatformImpl.dll',source:'loaded',pdb:{guid:'a'.repeat(32),age:5}}]}},
  timeline:{startedAtUnix:1,elapsedSeconds:34,lastConfirmedPhase:'gameProcessStarted'},
  environment:{os:'Windows fixture',architecture:'x64',hardwareAvailable:false},
  binaries:[{name:'SkyrimPlatformImpl.dll',sha256:'b'.repeat(64),version:null,source:'installed'}],
  logs:[{name:'launcher.log',available:true,truncated:false,contents:'0xC0000005\nAuthorization: Bearer SECRET_FIXTURE\nC:\\Users\\Max\\Documents\\crash\nhttps://host.invalid/token/PRIVATE?key=secret\nsteam:76561198029928678'}],
  comment:'ÄÖÜ тест <script>alert(1)</script>',contact:'fixture@example.invalid',
});

export async function main(options={}) {
  const fixture = await startPhpFixture({crashReports:true,crashHourlyLimit:4,crashDumpLimit:1024,...options});
  const {api,manage,manageRequest,csrf,crashDirectory}=fixture, checks=[];
  const submit = report => fetch(api+'/crash-reports.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(report)});
  try {
    assert.equal((await fetch(manage+'/crash-ingest.php',{method:'POST'})).status,403);
    assert.equal((await fetch(api+'/crash-reports.php')).status,405);
    let response=await manageRequest('/crash-reports.php');assert.equal(response.status,302);
    const report=sampleReport(); response=await submit(report);assert.equal(response.status,200,await response.clone().text());const receipt=await response.json();
    assert.match(receipt.reportId,/^[a-f0-9]{32}$/);assert.notEqual(receipt.reportId,report.clientReportId);
    const index=JSON.parse(await readFile(join(crashDirectory,'index.json'),'utf8')),entry=index.reports[receipt.reportId];
    assert.match(entry.path,new RegExp('^'+new Date().toISOString().slice(0,10).replaceAll('-','/')+'/'));
    assert(!entry.path.startsWith('1970/'),'Client clock must not control date directories');
    const stored=await readFile(join(crashDirectory,entry.path,'report.json'),'utf8');
    for(const secret of ['SECRET_FIXTURE','Users\\\\Max','PRIVATE','76561198029928678','fixture@example.invalid'])assert(!stored.includes(secret),secret);
    assert(stored.includes('0xC0000005'));assert(stored.includes('ÄÖÜ'));assert.equal(JSON.parse(await readFile(join(crashDirectory,entry.path,'contact.json'),'utf8')).contact,report.contact);
    checks.push('Unauthenticated basis upload, server UTC directories, server-issued ID, redaction and separate contact storage');
    response=await submit(report);assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);
    response=await submit({...report,comment:'different'});assert.equal(response.status,409);
    const invalid=sampleReport();invalid.logs[0].name='../../config.php';assert.equal((await submit(invalid)).status,400);
    assert.equal((await submit({...sampleReport(),masterKey:'PRIVATE'})).status,400);
    assert.equal((await submit({...sampleReport(),schemaVersion:77})).status,400);
    const invalidType=sampleReport();invalidType.launcher.version={poison:'must not enter index'};assert.equal((await submit(invalidType)).status,400);
    const invalidModule=sampleReport();invalidModule.crash.native.loadedModules[0].pdb.guid=[];assert.equal((await submit(invalidModule)).status,400);
    const oversized=sampleReport();oversized.comment='x'.repeat(1048577);assert.equal((await submit(oversized)).status,413);
    checks.push('Idempotent retry, immutable accepted content, schema and path traversal rejection, basis size limit');
    const dump=Buffer.concat([Buffer.from('MDMP'),Buffer.alloc(124)]),hash=createHash('sha256').update(dump).digest('hex');
    const uploadDump=(bytes,token=receipt.uploadToken,digest=hash)=>fetch(api+`/crash-reports.php?action=dump&id=${receipt.reportId}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/octet-stream','x-content-sha256':digest},body:bytes});
    assert.equal((await uploadDump(dump,'0'.repeat(64))).status,401);
    assert.equal((await uploadDump(dump,receipt.uploadToken,'f'.repeat(64))).status,400);
    assert.equal((await uploadDump(Buffer.from('not a minidump'.repeat(8)))).status,400);
    assert.equal((await uploadDump(Buffer.alloc(2048))).status,413);
    assert.equal((await uploadDump(dump)).status,200);assert.equal((await uploadDump(dump)).status,200);
    assert.equal((await stat(join(crashDirectory,entry.path,'attachments/crash.dmp'))).size,dump.length);
    checks.push('Separate bounded dump upload, capability authorization, signature and SHA-256 verification, duplicate retry');
    await fixture.login('test-other');assert.equal((await manageRequest('/crash-reports.php')).status,403);
    assert.equal((await manageRequest(`/crash-reports.php?id=${receipt.reportId}&download=dump`)).status,403);
    const publicBody=await (await fetch(api+`/${entry.path}/report.json`)).text();
    assert(!publicBody.includes(report.clientReportId) && !publicBody.includes('fixture@example.invalid'),'No private report is served by an API fallback route');
    await assert.rejects(stat(join(fixture.root,'api.skymp-worlds.net',entry.path,'report.json')));
    await fixture.login('test-owner');
    response=await manageRequest('/dashboard.php');assert((await response.text()).includes('crash-reports.php'));
    for(const [lang,label]of [['de','Absturzberichte'],['en','Crash reports'],['ru','Отчёты о сбоях']]){
      response=await manageRequest('/crash-reports.php?lang='+lang);const html=await response.text();assert.equal(response.status,200,html.slice(0,400));assert(html.includes(label));
    }
    response=await manageRequest('/crash-reports.php?id='+receipt.reportId);let html=await response.text();assert.equal(response.status,200);assert(!html.includes('<script>alert(1)</script>'));assert(html.includes('&lt;script&gt;'));
    assert.equal((await manageRequest('/crash-reports.php',{method:'POST',body:new URLSearchParams({action:'delete',id:receipt.reportId,csrf_token:'wrong'})})).status,403);
    response=await manageRequest('/crash-reports.php',{method:'POST',body:new URLSearchParams({action:'status',id:receipt.reportId,status:'investigating',csrf_token:csrf(html)})});assert.equal(response.status,302);
    response=await manageRequest(`/crash-reports.php?id=${receipt.reportId}&download=dump`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/octet-stream');assert.deepEqual(Buffer.from(await response.arrayBuffer()),dump);
    checks.push('Developer-only list/details/downloads, ordinary-owner denial, CSRF, escaped text, DE/EN/RU, status update');
    const other=sampleReport();response=await submit(other);assert.equal(response.status,200);const otherReceipt=await response.json();
    const after=JSON.parse(await readFile(join(crashDirectory,'index.json'),'utf8'));assert.equal(after.reports[otherReceipt.reportId].fingerprint,after.reports[receipt.reportId].fingerprint);
    response=await manageRequest('/crash-reports.php?q=does-not-exist');html=await response.text();assert(!html.includes('?id='+receipt.reportId));
    assert.equal((await submit(sampleReport())).status,200);assert.equal((await submit(sampleReport())).status,200);assert.equal((await submit(sampleReport())).status,429);
    assert.equal((await submit(report)).status,200,'Retry remains possible after rate limit');
    response=await manageRequest('/crash-reports.php?id='+receipt.reportId);html=await response.text();
    response=await manageRequest('/crash-reports.php',{method:'POST',body:new URLSearchParams({action:'delete',id:receipt.reportId,csrf_token:csrf(html)})});assert.equal(response.status,302);
    const final=JSON.parse(await readFile(join(crashDirectory,'index.json'),'utf8'));assert(!final.reports[receipt.reportId]);
    assert(!(await readdir(join(crashDirectory,entry.path.split('/').slice(0,3).join('/')))).includes(receipt.reportId));
    checks.push('Cross-user error grouping by PDB/module/RVA, search, hourly limit without breaking retries, fixed-path deletion');
    response=await fetch(api+`/crash-reports.php?action=dump&id=${otherReceipt.reportId}`,{method:'POST',headers:{authorization:'Bearer '+otherReceipt.uploadToken,'content-type':'application/octet-stream','x-content-sha256':hash},body:dump});assert.equal(response.status,200);
    const indexFile=join(crashDirectory,'index.json'),aging=JSON.parse(await readFile(indexFile,'utf8'));
    aging.reports[otherReceipt.reportId].receivedAtUnix=Math.floor(Date.now()/1000)-31*86400;await writeFile(indexFile,JSON.stringify(aging));
    const cleanup=join(fixture.root,'manage.skymp-worlds.net/tools/cleanup-crash-reports.php');
    await promisify(execFile)(fixture.php,[cleanup],{windowsHide:true});
    let cleaned=JSON.parse(await readFile(indexFile,'utf8'));assert.equal(cleaned.reports[otherReceipt.reportId].dumpBytes,0);assert(cleaned.reports[otherReceipt.reportId]);
    cleaned.reports[otherReceipt.reportId].receivedAtUnix=Math.floor(Date.now()/1000)-91*86400;await writeFile(indexFile,JSON.stringify(cleaned));
    await promisify(execFile)(fixture.php,[cleanup],{windowsHide:true});cleaned=JSON.parse(await readFile(indexFile,'utf8'));assert(!cleaned.reports[otherReceipt.reportId]);
    const limited=await startPhpFixture({crashReports:true,crashQuotaBytes:512});
    try {assert.equal((await fetch(limited.api+'/crash-reports.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sampleReport())})).status,507);} finally {await limited.stop();}
    const disabled=await startPhpFixture();
    try {assert.equal((await fetch(disabled.api+'/crash-reports.php',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,503);} finally {await disabled.stop();}
    checks.push('Separate dump/report expiry through the real CLI maintenance task, storage quota and disabled-by-default upload');
    console.log(JSON.stringify({ok:true,checks,fixture:fixture.root}));
    return {ok:true,checks,fixture:fixture.root};
  } finally {await fixture.stop();}
}
if(import.meta.url===new URL(process.argv[1], 'file:///').href || process.argv[1]?.replaceAll('\\','/').endsWith('/tests/crash-reports.mjs'))await main();
