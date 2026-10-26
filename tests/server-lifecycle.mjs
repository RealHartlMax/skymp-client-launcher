// Exercise the fork's actual reload helper without building or starting a server.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root = 'D:/GitHub/skymp';
const require = createRequire(path.join(root, 'skymp5-server/package.json'));
const ts = require('typescript');
const source = await fs.readFile(path.join(root, 'skymp5-server/ts/gamemodeReload.ts'), 'utf8');
const Module = require('node:module');
const compiled = new Module('gamemode-reload-test');
compiled.require = require;
compiled._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, path.join(os.tmpdir(), 'gamemode-reload-test.cjs'));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skymp-gamemode-reload-'));
try {
  const filename = path.join(temporary, 'gamemode.js');
  let loaded = 0, liveMode = '';
  const errors = [];
  const reload = compiled.exports.createGamemodeReloader(filename, () => { loaded++; liveMode = require('node:fs').readFileSync(filename, 'utf8'); }, error => errors.push(error));
  assert.equal(reload(), false); assert.equal(reload(), false);
  assert.equal(loaded, 0); assert.equal(errors.length, 1);
  await fs.writeFile(filename, 'original custom mode');
  assert.equal(reload(), true); assert.equal(liveMode, 'original custom mode');
  await fs.unlink(filename);
  assert.equal(reload(), false); assert.equal(reload(), false);
  assert.equal(liveMode, 'original custom mode'); assert.equal(loaded, 1); assert.equal(errors.length, 2);
  await fs.writeFile(filename, 'restored custom mode');
  assert.equal(reload(), true); assert.equal(liveMode, 'restored custom mode');
  const deliberate = new Error('A script error must remain visible');
  const fail = compiled.exports.createGamemodeReloader(filename, () => { throw deliberate; }, error => errors.push(error));
  assert.equal(fail(), false); assert.equal(errors.at(-1), deliberate);
  console.log(JSON.stringify({ok:true,cases:4,checks:['Missing initial file is reported once and never loaded.','Missing file during deployment preserves the last loaded mode without duplicate errors.','Restoring the file resumes loading.','Script errors remain visible.'],serverBuilt:false,nativeClientBuilt:false,gameStarted:false}));
} finally {
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
  assert(path.basename(temporary).startsWith('skymp-gamemode-reload-'));
  await fs.rm(temporary, {recursive:true,force:true});
}
