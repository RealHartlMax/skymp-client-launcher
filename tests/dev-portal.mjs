// Real HTTP through three separate temporary PHP webroots. No production users or reports.
import assert from 'node:assert/strict';
import { randomBytes, createHmac, createHash } from 'node:crypto';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startPhpFixture } from './php-master-smoke.mjs';
import { sampleReport } from './crash-reports.mjs';

export function developerClient(fixture) {
  let cookie = '';
  const request = async (path, options = {}) => {
    const response = await fetch(fixture.dev+path, {...options, redirect:'manual', headers:{...options.headers, ...(cookie ? {cookie} : {})}});
    const incoming = response.headers.getSetCookie().find(value => value.startsWith('skymp_dev_test_'));
    if (incoming) cookie = incoming.split(';')[0];
    return response;
  };
  async function start(language='de') {
    let response=await request('/login.php?lang='+language), html=await response.text();
    assert.equal(response.status,200,html.slice(0,160));
    response=await request('/login.php',{method:'POST',body:new URLSearchParams({csrf_token:fixture.csrf(html)})});
    assert.equal(response.status,303); return response.headers.get('location');
  }
  async function signIn() {
    const destination=await start(), response=await fixture.manageRequest(new URL(destination).pathname+new URL(destination).search);
    assert.equal(response.status,200,await response.clone().text());
    const ticket=(await response.text()).match(/name="ticket" value="([^"]+)"/)?.[1]; assert(ticket);
    const result=await request('/auth-callback.php',{method:'POST',body:new URLSearchParams({ticket})});
    assert.equal(result.status,303,await result.clone().text()); return ticket;
  }
  return {request,start,signIn};
}

export async function main(options={}) {
  const fixture=await startPhpFixture({devSite:true,crashReports:true,crashDumpLimit:1024,...options});
  const {api,manage,dev,manageRequest,csrf}=fixture, client=developerClient(fixture), checks=[];
  const storedFile=async path=>{
    const bytes=await readFile(path+(options.devWebrootReports?'.php':''));
    if(!options.devWebrootReports)return bytes;
    const prefix=Buffer.from('<?php http_response_code(404); exit; __halt_compiler();\n');
    assert.deepEqual(bytes.subarray(0,prefix.length),prefix);
    return bytes.subarray(prefix.length);
  };
  try {
    assert.equal((await client.request('/crash-reports.php')).status,303);
    assert.equal((await client.request('/import.php')).status,303);
    assert.equal((await client.request('/logout.php')).status,405);
    assert.equal((await client.request('/login.php',{method:'POST',body:new URLSearchParams({csrf_token:'bad'})})).status,403);
    const destination=await client.start('de');
    assert(destination.startsWith(manage+'/developer-access.php?state='));
    let response=await manageRequest(new URL(destination).pathname+new URL(destination).search);
    assert.equal(response.status,302); assert(response.headers.get('location').endsWith('/login.php'));
    response=await manageRequest('/login.php');let html=await response.text();
    response=await manageRequest('/login.php',{method:'POST',body:new URLSearchParams({login_name:'test-owner',password:fixture.password,csrf_token:csrf(html)})});
    assert.equal(response.status,302);assert(new URL(response.headers.get('location'),manage).href.startsWith(manage+'/developer-access.php?state='));
    response=await manageRequest(new URL(destination).pathname+new URL(destination).search);html=await response.text();
    assert.equal(response.status,200); assert(html.includes(`action="${dev}/auth-callback.php"`));
    const ticket=html.match(/name="ticket" value="([^"]+)"/)?.[1]; assert(ticket);
    response=await client.request('/auth-callback.php',{method:'POST',body:new URLSearchParams({ticket})});assert.equal(response.status,303);
    response=await client.request('/crash-reports.php');html=await response.text();assert.equal(response.status,200);assert(html.includes('Hüter_ÄÖÜ'));
    assert.equal((await client.request('/auth-callback.php',{method:'POST',body:new URLSearchParams({ticket})})).status,403);
    assert.equal((await fetch(dev+'/crash-ingest.php',{method:'POST'})).status,403);
    checks.push('Three independent webroots, password sign-in return, signed single-use developer sign-in, CSRF and no public reports');

    const sign=(claims)=>{const encoded=Buffer.from(JSON.stringify(claims)).toString('base64url');return encoded+'.'+createHmac('sha256',fixture.devSsoSecret).update('skymp-dev-sign-in-v1|'+encoded).digest('hex');};
    for (const variant of ['tamper','expired','audience','issuer','state']) {
      const unauth=developerClient(fixture), url=await unauth.start();
      const claims={v:1,iss:manage,aud:dev,sub:'test-owner',name:'Fixture',state:new URL(url).searchParams.get('state'),nonce:randomBytes(32).toString('hex'),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60};
      if(variant==='expired'){claims.iat-=120;claims.exp-=120;}
      if(variant==='audience')claims.aud='https://example.invalid';
      if(variant==='issuer')claims.iss='https://example.invalid';
      if(variant==='state')claims.state='f'.repeat(64);
      let invalid=sign(claims);if(variant==='tamper')invalid=invalid.slice(0,-1)+(invalid.endsWith('0')?'1':'0');
      assert.equal((await unauth.request('/auth-callback.php',{method:'POST',body:new URLSearchParams({ticket:invalid})})).status,403,variant);
      assert.equal((await unauth.request('/crash-reports.php')).status,303);
    }
    await fixture.login('test-other');
    const deniedUrl=await developerClient(fixture).start();response=await manageRequest(new URL(deniedUrl).pathname+new URL(deniedUrl).search);html=await response.text();
    assert.equal(response.status,403);assert(html.includes('test-other'));assert(!html.includes('name="ticket"'));
    await fixture.login('test-owner');
    response=await manageRequest('/crash-reports.php');assert.equal(response.status,303);assert(response.headers.get('location').startsWith(dev+'/crash-reports.php'));
    checks.push('Ordinary owner denied; wrong signature, expiry, audience, issuer and browser state denied; legacy entry forwards to dev');

    const report=sampleReport();response=await fetch(api+'/crash-reports.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(report)});
    assert.equal(response.status,200,await response.clone().text());const receipt=await response.json();
    const index=JSON.parse(await storedFile(join(fixture.crashDirectory,'index.json'))),entry=index.reports[receipt.reportId];
    assert(entry); assert.match(entry.path,new RegExp('^'+new Date().toISOString().slice(0,10).replaceAll('-','/')+'/'));
    const stored=(await storedFile(join(fixture.crashDirectory,entry.path,'report.json'))).toString('utf8');assert(!stored.includes('SECRET_FIXTURE'));
    await assert.rejects(stat(join(fixture.root,'dev.skymp-worlds.net',entry.path,'report.json')));
    const dump=Buffer.concat([Buffer.from('MDMP'),Buffer.alloc(124)]),digest=createHash('sha256').update(dump).digest('hex');
    response=await fetch(api+`/crash-reports.php?action=dump&id=${receipt.reportId}`,{method:'POST',headers:{authorization:'Bearer '+receipt.uploadToken,'content-type':'application/octet-stream','x-content-sha256':digest},body:dump});
    assert.equal(response.status,200,await response.clone().text());
    assert.deepEqual(await storedFile(join(fixture.crashDirectory,entry.path,'attachments/crash.dmp')),dump);
    checks.push('Existing launcher API forwards report and separate verified dump to dev; private UTC day directory and sanitized storage');

    for (const [language,label] of [['de','Absturzberichte'],['en','Crash reports'],['ru','Отчёты о сбоях']]) {
      response=await client.request('/crash-reports.php?lang='+language);html=await response.text();assert.equal(response.status,200);assert(html.includes(label));assert(html.includes('dev-metrics'));
    }
    response=await client.request('/crash-reports.php?id='+receipt.reportId);html=await response.text();
    assert(html.includes(entry.path));assert(!html.includes('<script>alert(1)</script>'));assert(html.includes('&lt;script&gt;'));
    response=await client.request('/crash-reports.php',{method:'POST',body:new URLSearchParams({csrf_token:csrf(html),action:'status',id:receipt.reportId,status:'investigating'})});assert.equal(response.status,303);
    response=await client.request(`/crash-reports.php?id=${receipt.reportId}&download=dump`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),dump);
    response=await client.request(`/crash-reports.php?id=${receipt.reportId}&download=report`);assert.equal(response.headers.get('content-length'),String(Buffer.byteLength(stored)));assert.equal(await response.text(),stored);
    if(options.devWebrootReports){
      // The PHP test server ignores .htaccess: the data file itself must still deny access.
      for(const path of ['','index.php','.storage.php','index.lock.php','index.json.php','report.key.php',`${entry.path}/report.json.php`,`${entry.path}/contact.json.php`,`${entry.path}/logs/launcher.log.php`,`${entry.path}/attachments/crash.dmp.php`]){
        const direct=await fetch(dev+'/reports/'+path);assert.equal(direct.status,404,path);assert.equal(await direct.text(),'',path);
      }
      checks.push('Fixed public reports folder: JSON, index, keys, logs, contacts and dumps return empty HTTP 404 without Apache rules; authorized downloads retain raw bytes');
    }
    const anonymous=developerClient(fixture);assert.equal((await anonymous.request(`/crash-reports.php?id=${receipt.reportId}&download=dump`)).status,303);
    assert.equal((await client.request('/logout.php',{method:'POST',body:new URLSearchParams({csrf_token:'bad'})})).status,403);
    checks.push('DE/EN/RU list, day directory, safe details, status update and protected dump download');

    response=await client.request('/import.php');html=await response.text();
    const imported=sampleReport(), upload=new FormData();upload.append('csrf_token',csrf(html));upload.append('report',new Blob([JSON.stringify(imported)],{type:'application/json'}),'report.json');
    response=await client.request('/import.php',{method:'POST',body:upload});assert.equal(response.status,303,await response.clone().text());
    const importLocation=response.headers.get('location');assert(importLocation.startsWith('/crash-reports.php?id='));
    const missingConsent=new FormData();missingConsent.append('csrf_token',csrf(html));missingConsent.append('report',new Blob([JSON.stringify(sampleReport())]),'report.json');missingConsent.append('dump',new Blob([dump]),'crash.dmp');
    assert.equal((await client.request('/import.php',{method:'POST',body:missingConsent})).status,400);
    const withDump=new FormData();withDump.append('csrf_token',csrf(html));withDump.append('report',new Blob([JSON.stringify(imported)]),'report.json');withDump.append('dump',new Blob([dump]),'crash.dmp');withDump.append('dump_consent','1');
    response=await client.request('/import.php',{method:'POST',body:withDump});assert.equal(response.status,303);assert.equal(response.headers.get('location'),importLocation);
    checks.push('Local export import with real multipart PHP upload, immutable retry and separate dump consent');

    const config=join(fixture.root,'dev.skymp-worlds.net/config.php');
    const source=await readFile(config,'utf8');await writeFile(config,source.replace(/define\('DEV_CRASH_DIRECTORY',[^\n]+/,`define('DEV_CRASH_DIRECTORY',__DIR__.'/unsafe-reports');`));
    response=await fetch(api+'/crash-reports.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sampleReport())});assert.equal(response.status,503);
    await writeFile(config,source);
    const cleanup=join(fixture.root,'dev.skymp-worlds.net/tools/cleanup-crash-reports.php');await promisify(execFile)(fixture.php,[cleanup],{windowsHide:true});
    response=await client.request('/crash-reports.php');html=await response.text();
    response=await client.request('/logout.php',{method:'POST',body:new URLSearchParams({csrf_token:csrf(html)})});assert.equal(response.status,303);assert.equal((await client.request('/crash-reports.php')).status,303);
    checks.push('Public-directory storage rejected, standalone CLI retention, CSRF-protected logout and report access revoked');
    const result={ok:true,checks,fixture:fixture.root};console.log(JSON.stringify(result));return result;
  } finally {await fixture.stop();}
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/tests/dev-portal.mjs')) await main({devWebrootReports:process.argv.includes('--webroot-reports')});
