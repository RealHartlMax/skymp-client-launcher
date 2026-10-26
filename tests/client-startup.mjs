import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[process.argv.indexOf('--source') + 1];
if (!process.argv.includes('--source')) throw new Error('Expected --source SKYMP_CLIENT_FOLDER');
const require = createRequire(path.resolve(source, 'package.json'));
const ts = require('typescript');
const {patchWorldView} = createRequire(import.meta.url)('../launcher/scripts/client-compat-loader.cjs');
const original = await fs.readFile(path.join(source,'src/view/worldView.ts'),'utf8');
const code = ts.transpileModule(patchWorldView(original), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const checks = [];
let player = null, reads = 0, updates = 0;
class SinglePlayerService {}
class RemoteServer {}
class ClientListener {}
class FormViewArray { resize(){} updateAll(){} }
const module = {exports:{}};
vm.runInNewContext(code, {exports:module.exports,module,require(name){
  if(name.endsWith('/clientListener'))return {ClientListener};
  if(name.endsWith('/remoteServer'))return {RemoteServer};
  if(name.endsWith('/singlePlayerService'))return {SinglePlayerService};
  if(name.endsWith('/formViewArray'))return {FormViewArray};
  if(name.endsWith('/playerCharacterDataHolder'))return {PlayerCharacterDataHolder:{updateData(){updates++;}}};
  if(name.endsWith('/logging'))return {logTrace(){}};
  throw Error('Unexpected import: '+name);
}});
const sp={storage:{},settings:{'skymp5-client':{}},Game:{getPlayer:()=>player}};
const controller={on(){},once(){},lookupListener(type){
  if(type===SinglePlayerService)return {isSinglePlayer:false};
  if(type===RemoteServer)return {getWorldModel(){reads++;return {forms:[]};}};
  throw Error('Unexpected listener');
}};
const view = new module.exports.WorldView(sp,controller);
assert.doesNotThrow(()=>view.onUpdate());assert.equal(reads,0);checks.push('Missing player does not call world synchronization.');
player={getWorldSpace:()=>null,getParentCell:()=>null};
assert.doesNotThrow(()=>view.onUpdate());assert.equal(reads,0);checks.push('Player without world or cell does not dereference null.');
player={getWorldSpace:()=>({getFormID:()=>60}),getParentCell:()=>null};
view.onUpdate();assert.equal(reads,1);assert.equal(updates,1);assert.equal(view.state.pcWorldOrCell,60);checks.push('Synchronization resumes when the world becomes available.');
player=null;view.onUpdate();assert.equal(reads,1);assert.equal(view.state.pcWorldOrCell,60);checks.push('Temporary loading states preserve the previous world state.');
player={getWorldSpace:()=>null,getParentCell:()=>({getFormID:()=>42})};
view.onUpdate();assert.equal(reads,2);assert.equal(view.state.pcWorldOrCell,42);checks.push('Interior cell transitions resume normally.');
assert.throws(()=>patchWorldView('source changed'),/review/i);checks.push('Unknown future client sources fail instead of applying an unchecked patch.');
const bootstrap=await fs.readFile(path.join(repo,'launcher/scripts/client-bootstrap.cjs'),'utf8');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'skymp-ui-bootstrap-Ä space-'));
const cwd=process.cwd();
try {
  process.chdir(temp);
  const entry=path.join(temp,'Data/Platform/UI/index.html');await fs.mkdir(path.dirname(entry),{recursive:true});await fs.writeFile(entry,'fixture');
  for(const exists of [true,false]){
    if(!exists)await fs.unlink(entry);
    let ticks=[], urls=[], visible=[], messages=[];
    const mock={once(event,fn){assert.equal(event,'tick');ticks.push(fn);},browser:{loadUrl(url){urls.push(url);},setVisible(value){visible.push(value);}},printConsole(text){messages.push(text);}};
    vm.runInNewContext(bootstrap,{require(name){return name==='skyrimPlatform'?mock:require(name);}});
    const first=ticks;ticks=[];first.forEach(fn=>fn());assert.equal(urls.length,0);
    const second=ticks;ticks=[];second.forEach(fn=>fn());
    if(exists){assert.equal(urls[0],pathToFileURL(entry).href);assert(urls[0].includes('%20'));assert.equal(visible[0],true);checks.push('Bootstrap waits for client listeners and opens a complete absolute file URL with escaped spaces/Unicode.');}
    else {assert.equal(urls.length,0);assert(messages[0].includes('missing'));checks.push('Missing UI produces a clear diagnostic without loading an invalid URL.');}
  }
}finally{
  process.chdir(cwd);assert.equal(path.dirname(path.resolve(temp)),path.resolve(os.tmpdir()));assert(path.basename(temp).startsWith('skymp-ui-bootstrap-'));await fs.rm(temp,{recursive:true,force:true});
}
console.log(JSON.stringify({ok:true,cases:checks.length,checks,gameStarted:false,sourceForkChanged:false},null,2));
