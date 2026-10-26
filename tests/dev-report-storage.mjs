// PHP webhosting storage and setup behavior through independent temporary webroots.
import assert from 'node:assert/strict';
import {readFile, writeFile, rename, unlink, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {startPhpFixture} from './php-master-smoke.mjs';
import {developerClient} from './dev-portal.mjs';
import {sampleReport} from './crash-reports.mjs';

export async function main(options={}) {
  const fixture=await startPhpFixture({devSite:true,crashReports:true,devWebrootReports:true,crashDumpLimit:1024,...options});
  const {dev,api,crashDirectory}=fixture,checks=[],config=join(fixture.root,'dev.skymp-worlds.net/config.php');
  const source=await readFile(config,'utf8'),prefix=Buffer.from('<?php http_response_code(404); exit; __halt_compiler();\n');
  const stored=async path=>{const bytes=await readFile(join(crashDirectory,path+'.php'));assert.deepEqual(bytes.subarray(0,prefix.length),prefix);return bytes.subarray(prefix.length);};
  const submit=report=>fetch(api+'/crash-reports.php',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(report)});
  const configLine=(name,value)=>source.replace(new RegExp(`^define\\('${name}',[^\\n]+`,'m'),`define('${name}',${value});`);
  const loginCheck=async(status,field,state,language='de')=>{
    const response=await fetch(dev+'/login.php?setup=1&lang='+language);const html=await response.text();assert.equal(response.status,status);
    assert(html.includes(`data-setup="${field}" data-status="${state}"`),html.slice(0,200));
    for(const secret of [fixture.devSsoSecret,fixture.crashToken,fixture.password,fixture.root])assert(!html.includes(secret));
    return html;
  };
  try {
    for(const replacement of ['',"define('DEV_CRASH_DIRECTORY','');"]){
      await writeFile(config,source.replace(/^define\('DEV_CRASH_DIRECTORY',[^\n]+/m,replacement));
      await loginCheck(200,'storage','ready');assert.equal((await stored('.storage')).toString(),'php-envelope-v1');
    }
    await writeFile(config,source);
    checks.push('Missing or blank directory setting defaults to DEV/reports; storage initializes without a hosting-specific absolute path');

    for(const [language,label]of [['de','Einrichtung prüfen'],['en','Check setup'],['ru','Проверка настройки']]){
      await writeFile(config,configLine('DEV_SSO_SECRET',"'too-short'"));
      const html=await loginCheck(503,'sso','missing',language);assert(html.includes(label));assert(!html.includes('type="submit"'));
    }
    await writeFile(config,configLine('DEV_MANAGE_PUBLIC_URL',"'invalid-origin'"));await loginCheck(503,'urls','missing');
    // A domain URL is not a filesystem path; never try to create an absolute FTP-style path.
    await writeFile(config,configLine('DEV_CRASH_DIRECTORY',"'https://dev.skymp-worlds.net/reports'"));await loginCheck(503,'storage','missing');
    await writeFile(config,configLine('DEV_CRASH_DIRECTORY',"__DIR__.'/other-public-folder'"));await loginCheck(503,'storage','missing');
    await writeFile(config,configLine('DEV_CRASH_PROXY_TOKEN',"''"));
    const html=await loginCheck(200,'upload','missing');assert(html.includes('type="submit"'));
    await writeFile(config,source);await rename(config,join(fixture.root,'saved-dev-config.php'));
    await loginCheck(503,'config','missing');await rename(join(fixture.root,'saved-dev-config.php'),config);
    checks.push('DE/EN/RU setup checks identify missing config, short SSO secret, invalid URLs and unsafe storage without leaking secrets or paths; upload secret does not block local import');

    await writeFile(join(crashDirectory,'index.json'),'{}');await loginCheck(503,'storage','missing');await unlink(join(crashDirectory,'index.json'));
    // First initialization also refuses raw files nested inside an existing public reports folder.
    const marker=join(crashDirectory,'.storage.php');await rename(marker,join(fixture.root,'saved-storage.php'));
    await writeFile(join(crashDirectory,'report.json'),'{}');await loginCheck(503,'storage','missing');await unlink(join(crashDirectory,'report.json'));
    await rename(join(fixture.root,'saved-storage.php'),marker);
    checks.push('Old unprotected index and raw files are rejected instead of being mixed into public protected storage');

    await fixture.login('test-owner');const client=developerClient(fixture);await client.signIn();
    const report=sampleReport();let response=await submit(report);assert.equal(response.status,200);const receipt=await response.json();
    const index=JSON.parse(await stored('index.json')),entry=index.reports[receipt.reportId];
    // These bytes must remain data, even when the host executes the storage file as PHP.
    const dump=Buffer.from('MDMP'+"<?php echo 'UNTRUSTED_CODE_RAN'; ?>"+'x'.repeat(64)),digest=createHash('sha256').update(dump).digest('hex');
    const uploadDump=()=>fetch(api+`/crash-reports.php?action=dump&id=${receipt.reportId}`,{method:'POST',headers:{authorization:'Bearer '+receipt.uploadToken,'content-type':'application/octet-stream','x-content-sha256':digest},body:dump});
    response=await uploadDump();assert.equal(response.status,200);assert.equal((await response.json()).duplicate,false);
    response=await uploadDump();assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);
    response=await fetch(dev+'/reports/'+entry.path+'/attachments/crash.dmp.php');assert.equal(response.status,404);assert.equal(await response.text(),'');
    for(const [name,key]of [['attachments/crash.dmp','dump'],['report.json','report'],['contact.json','contact'],['logs/launcher.log','launcher']]){
      const expected=await stored(entry.path+'/'+name);response=await client.request(`/crash-reports.php?id=${receipt.reportId}&download=${key}`);
      assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),String(expected.length));assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);
    }
    response=await client.request(`/crash-reports.php?id=${receipt.reportId}&download=../../config`);assert.equal(response.status,400);
    checks.push('Dump retries validate the raw checksum; embedded PHP bytes never execute; authenticated JSON/contact/log/dump downloads preserve length and content');

    const core=join(fixture.root,'dev.skymp-worlds.net/includes/crash-reports.php');
    const phpLiteral=value=>"'"+value.replaceAll('\\','\\\\').replaceAll("'","\\'")+"'";
    const runPhp=body=>promisify(execFile)(fixture.php,['-r',`require ${phpLiteral(config)}; require ${phpLiteral(core)}; ${body}`],{windowsHide:true});
    await runPhp("cr_transaction(static function(array &$index): void { foreach($index['reports'] as &$entry) { $entry['receivedAtUnix']=time()-31*86400; } });");
    let page=await client.request('/crash-reports.php');let pageHtml=await page.text();
    const cleanup=()=>client.request('/crash-reports.php',{method:'POST',body:new URLSearchParams({csrf_token:fixture.csrf(pageHtml),action:'cleanup'})});
    assert.equal((await cleanup()).status,303);await assert.rejects(stat(join(crashDirectory,entry.path,'attachments/crash.dmp.php')));
    assert.equal((await stored(entry.path+'/report.json')).length>0,true);
    await runPhp("cr_transaction(static function(array &$index): void { foreach($index['reports'] as &$entry) { $entry['receivedAtUnix']=time()-91*86400; } });");
    page=await client.request('/crash-reports.php');pageHtml=await page.text();assert.equal((await cleanup()).status,303);
    assert.deepEqual(JSON.parse(await stored('index.json')).reports,[]);await assert.rejects(stat(join(crashDirectory,entry.path,'report.json.php')));
    checks.push('Retention removes protected dumps after 30 days and protected reports after 90 days; generated download permissions and cleanup remain intact');
    const result={ok:true,checks,fixture:fixture.root};console.log(JSON.stringify(result));return result;
  } finally {await fixture.stop();}
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/tests/dev-report-storage.mjs'))await main();
