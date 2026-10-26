// Build a client-only compatibility bundle without editing or deploying the source fork.
import path from 'node:path';
import { createRequire } from 'node:module';
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--source') || !args.includes('--output')) throw new Error('Expected --source SKYMP_CLIENT_FOLDER --output NEW_FOLDER');
const source = await realpath(option('--source'));
const output = path.resolve(option('--output'));
try { await stat(output); throw new Error('Choose a new build output directory'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
if (output === source || output.startsWith(source + path.sep)) throw new Error('Output must be outside the source checkout');
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
delete process.env.DEPLOY_PLUGIN;
delete process.env.ZIP_PLUGIN;
const require = createRequire(path.join(source, 'package.json'));
const webpack = require('webpack');
const original = require(path.join(source, 'webpack.config.js'));
const config = {
  ...original, context: source, plugins: [], cache: false,
  entry: { main: [path.join(scriptRoot,'client-bootstrap.cjs'),path.join(source,'src/index.ts')] },
  output: { ...original.output, path: output, filename: 'skymp5-client.js' },
  resolveLoader: { modules: [path.join(source,'node_modules'),'node_modules'] },
  module: { ...original.module, rules: [
    { test: /[\\/]view[\\/]worldView\.ts$/, enforce: 'pre', use: [path.join(scriptRoot,'client-compat-loader.cjs')] },
    ...original.module.rules.map(rule => ({ ...rule, options: rule.loader === 'ts-loader' ? { ...rule.options, configFile: path.join(source,'tsconfig.json') } : rule.options })),
  ] },
};
await mkdir(output, { recursive: true });
const compiler = webpack(config);
const stats = await new Promise((resolve,reject) => compiler.run((error,stats) => error ? reject(error) : resolve(stats)));
await new Promise((resolve,reject) => compiler.close(error => error ? reject(error) : resolve()));
const result = stats.toJson({ all:false, errors:true, warnings:true });
await writeFile(path.join(output,'build-report.json'),JSON.stringify(result,null,2));
if (stats.hasErrors()) throw new Error(JSON.stringify(result.errors));
console.log(JSON.stringify({ok:true,output,sourceUnchanged:true,serverCodeChanged:false,warnings:result.warnings.length}));
