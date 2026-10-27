import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const require=createRequire(new URL('../launcher/package.json',import.meta.url));
const ts=require('typescript'),Module=require('node:module');
const module=new Module('launcher-updates-test');
module._compile(ts.transpileModule(await readFile(new URL('../launcher/src/launcherUpdates.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText,'launcher-updates-test.cjs');
const {compareVersions,fetchOfficialRelease,trustedReleaseUrl}=module.exports;
for(const [a,b,want] of [['0.2.10','0.2.9',1],['0.2.1','0.2.1',0],['0.2.0','0.2.1',-1],['1.0.0-beta.2','1.0.0-beta.11',-1],['1.0.0','1.0.0-rc.1',1],['v0.2.1+build.2','0.2.1',0],['01.2.1','0.2.1',null],['1.0.0-beta.01','1.0.0',null],['bad','0.2.1',null]])assert.equal(compareVersions(a,b),want);
assert.equal(trustedReleaseUrl('javascript:alert(1)'),'');assert.equal(trustedReleaseUrl('https://attacker.invalid/x.exe'),'');assert.equal(trustedReleaseUrl('https://user:password@github.com/RealHartlMax/skymp-client-launcher/releases/x'),'');
const origin='https://github.com/RealHartlMax/skymp-client-launcher/releases/';
const release=(version,extra={})=>({tag_name:'v'+version,draft:false,prerelease:false,html_url:origin+'tag/v'+version,assets:[{name:'SkyMP-Launcher-v'+version+'.exe',browser_download_url:origin+'download/v'+version+'/SkyMP-Launcher-v'+version+'.exe'}],...extra});
let github=release('0.2.2'),manifest={available:false,channel:'release'};
const originalFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('api.github.com')?github:manifest),{status:200,headers:{'Content-Type':'application/json'}});
try{
  assert.equal((await fetchOfficialRelease()).version,'0.2.2');
  github=release('0.2.3',{draft:true});assert.equal(await fetchOfficialRelease(),null);
  github=release('0.2.3-beta.1',{prerelease:true});assert.equal(await fetchOfficialRelease(),null);
  github=release('0.2.3',{assets:[{name:'bad.exe',browser_download_url:'https://attacker.invalid/bad.exe'}]});assert.equal(await fetchOfficialRelease(),null);
  github=release('0.2.1');manifest={available:true,channel:'release',version:'0.2.4',downloadUrl:origin+'download/v0.2.4/Launcher.exe'};assert.equal((await fetchOfficialRelease()).version,'0.2.4');
  manifest.available=false;assert.equal((await fetchOfficialRelease()).version,'0.2.1');
  globalThis.fetch=async()=>{throw Error('offline');};await assert.rejects(fetchOfficialRelease(),/releaseUnavailable/);
  console.log(JSON.stringify({ok:true,cases:19,checks:['semantic version ordering','trusted download origins','draft/prerelease/unavailable filtering','official-release fallback','offline does not imply up-to-date']}));
}finally{globalThis.fetch=originalFetch;}
