// Publish a trusted client runtime as individually verified, cacheable files.
// node scripts/create-runtime-manifest.mjs --source D:/GitHub/skymp/build/dist/client --output ./runtime-package
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyAddressOffsets } from './address-offsets.mjs';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--source') || !args.includes('--output')) throw new Error('Expected --source CLIENT_FOLDER --output NEW_FOLDER');
const source = await realpath(option('--source'));
const output = path.resolve(option('--output'));
const gameVersion = args.includes('--game-version') ? option('--game-version') : undefined;
const skseVersion = args.includes('--skse-version') ? option('--skse-version') : undefined;
const skseSource = args.includes('--skse-source') ? await realpath(option('--skse-source')) : undefined;
const addressSource = args.includes('--address-library') ? await realpath(option('--address-library')) : undefined;
const offsetsSource = args.includes('--offsets-file') ? await realpath(option('--offsets-file')) : undefined;
const uiSource = args.includes('--ui-source') ? await realpath(option('--ui-source')) : undefined;
const clientScript = args.includes('--client-script') ? await realpath(option('--client-script')) : undefined;
if (gameVersion && (!/^\d+\.\d+\.\d+\.\d+$/.test(gameVersion) || gameVersion.split('.').some((n) => Number(n) > 65535))) throw new Error('Use a complete --game-version, e.g. 1.7.104.0');
if (gameVersion && (!skseSource || !addressSource || !/^\d+\.\d+\.\d+$/.test(skseVersion || ''))) throw new Error('Versioned packages require --skse-source, --skse-version and --address-library');
if (!gameVersion && (skseSource || skseVersion || addressSource)) throw new Error('SKSE/Address Library selection requires --game-version');
if (offsetsSource && !gameVersion) throw new Error('--offsets-file requires a versioned package with --game-version and --address-library');
try { await stat(output); throw new Error(`Output already exists: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (output.startsWith(source + path.sep)) throw new Error('Output must be outside the source tree');

const isOfficial = (file) => /^(?:skyrim|update|dawnguard|hearthfires|dragonborn)(?:\.esm|\.bsa| - .*)$/i.test(file)
  || /^cc.*\.(?:esm|esl|bsa)$/i.test(file);
const allowed = (file) => {
  const lower = file.toLowerCase();
  if (/skymp5-client-settings\.txt|auth-data|\.skymp/.test(lower) || /\/(?:plugin-example|modules|source)\//.test(lower) || /\.(?:log|zip)$/.test(lower)) return false;
  return (lower.startsWith('data/') && !isOfficial(path.basename(file)))
    || /^skse64_loader\.exe$/i.test(file) || /^skse64_[^/]+\.dll$/i.test(file);
};
const sources = new Map();
let offsetReference;
const isText = file => /\.(?:svg|txt|js|json|ini|cfg|xml|html|css|md|toml|yaml|yml|csv|map)$/i.test(file);
async function walk(root, dir) {
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported: ${relative}`);
    if (entry.isDirectory()) {
      if (/^Data(?:\/|$)/i.test(relative) && !/\/(?:plugin-example|Modules|Source)(?:\/|$)/i.test(relative)) await walk(root, relative);
    } else if (entry.isFile() && allowed(relative)) {
      sources.set(relative, path.join(root, relative));
    }
  }
}
await walk(source, '');
if (clientScript) {
  if (!(await stat(clientScript)).isFile()) throw new Error('--client-script must be a built JavaScript file');
  sources.set('Data/Platform/Plugins/skymp5-client.js', clientScript);
}
if (uiSource) {
  async function walkUi(dir) {
    for (const entry of await readdir(path.join(uiSource, dir), { withFileTypes: true })) {
      const relative = path.posix.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`UI contains a link: ${relative}`);
      if (entry.isDirectory()) await walkUi(relative);
      else if (entry.isFile() && /\.(?:html|js|css|png|jpe?g|svg|webp|gif|woff2?|ttf|mp3|wav|ogg|txt)$/i.test(relative)) {
        sources.set(`Data/Platform/UI/${relative}`, path.join(uiSource, relative));
      }
    }
  }
  await walkUi('');
}
if (gameVersion) {
  // The supplied SKSE archive contributes its own loader, DLL and Papyrus scripts.
  await walk(skseSource, '');
  for (const document of ['skse64_readme.txt', 'skse64_whatsnew.txt']) {
    const file = path.join(skseSource, document);
    try {
      if ((await stat(file)).isFile()) sources.set(`Data/SKSE/Docs/${document}`, file);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const version = gameVersion.split('.').map(Number);
  const runtimeDll = `skse64_${version[0]}_${version[1]}_${version[2]}.dll`;
  for (const file of sources.keys()) {
    if (/^Data\/SKSE\/Plugins\/version(?:lib)?-.*\.bin$/i.test(file) || (/^skse64_[^/]+\.dll$/i.test(file) && file.toLowerCase() !== runtimeDll.toLowerCase())) sources.delete(file);
  }
  for (const file of ['skse64_loader.exe', runtimeDll]) {
    const absolute = path.join(skseSource, file);
    if (!(await stat(absolute)).isFile()) throw new Error(`Missing matching SKSE file: ${file}`);
    sources.set(file, absolute);
  }
  const addressName = `${version[1] >= 6 ? 'versionlib' : 'version'}-${version.join('-')}.bin`;
  if (path.basename(addressSource).toLowerCase() !== addressName.toLowerCase()) throw new Error(`Expected Address Library file ${addressName}`);
  const addressBytes = await readFile(addressSource);
  const format = version[1] >= 7 ? 5 : version[1] >= 6 ? 2 : 1;
  if (addressBytes.length < 4 || addressBytes.readUInt32LE(0) !== format) throw new Error(`Expected Address Library format ${format}`);
  if (offsetsSource) {
    offsetReference = verifyAddressOffsets({ addressBytes, offsetsBytes: await readFile(offsetsSource), gameVersion });
  }
  sources.set(`Data/SKSE/Plugins/${addressName}`, addressSource);
}
const files = [];
const unique = new Set();
for (const [relative, absolute] of sources) {
  if (unique.has(relative.toLowerCase())) throw new Error(`Duplicate runtime destination: ${relative}`);
  unique.add(relative.toLowerCase());
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolute)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  if (offsetReference && absolute === addressSource && sha256 !== offsetReference.addressLibrarySha256) throw new Error('Address Library changed after offset reference verification');
  files.push({ path: relative, size: (await stat(absolute)).size, sha256,
    ...(isText(relative) ? { downloadPath: `payloads/${sha256}.bin` } : {}) });
}
for (const required of ['Data/SKSE/Plugins/SkyrimPlatform.dll', 'Data/SKSE/Plugins/MpClientPlugin.dll', 'Data/Platform/Plugins/skymp5-client.js', 'Data/Platform/Distribution/RuntimeDependencies/SkyrimPlatformImpl.dll', 'Data/Platform/UI/index.html', 'Data/Platform/UI/build.js']) {
  if (!unique.has(required.toLowerCase())) throw new Error(`Client package is incomplete: ${required}`);
}
await mkdir(output, { recursive: true });
for (const file of files) {
  const destination = path.join(output, file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(sources.get(file.path), destination);
  // Refuse a package from a build that changed during copying.
  const actual = createHash('sha256').update(await readFile(destination)).digest('hex');
  if (actual !== file.sha256) throw new Error(`Build changed during packaging: ${file.path}`);
  if (file.downloadPath) {
    const transport = path.join(output, file.downloadPath);
    await mkdir(path.dirname(transport), { recursive: true });
    await cp(destination, transport);
    const hash = createHash('sha256').update(await readFile(transport)).digest('hex');
    if (hash !== file.sha256) throw new Error(`Binary download copy changed: ${file.path}`);
  }
}
files.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(path.join(output, 'runtime-manifest.json'), JSON.stringify({ version: 1, ...(gameVersion ? {gameVersion, skseVersion} : {}), files }, null, 2) + '\n');
console.log(JSON.stringify({ output, files: files.length, bytes: files.reduce((total, file) => total + file.size, 0), ...(offsetReference ? { offsetReference } : {}) }));
