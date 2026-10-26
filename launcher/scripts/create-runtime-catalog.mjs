// Publish a compatible package per Skyrim version; upload immutable packages before this catalog.
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
if (!args.includes('--root') || !args.includes('--manifest')) throw new Error('Expected --root PACKAGE_ROOT --manifest RELATIVE_PATH [--manifest ...] [--replace]');
const root = await realpath(option('--root'));
const output = path.join(root, 'catalog.json');
if (!args.includes('--replace')) {
  try { await readFile(output); throw new Error('Catalog exists; use --replace for an intentional update'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const packages = [];
const versions = new Set();
for (let index = 0; index < args.length; index++) {
  if (args[index] !== '--manifest') continue;
  const relative = args[++index];
  if (!relative || relative.includes('\\') || relative.split('/').some((part) => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part))) throw new Error(`Unsafe manifest path: ${relative}`);
  const absolute = await realpath(path.join(root, relative));
  if (!absolute.startsWith(root + path.sep)) throw new Error('Manifest must stay inside the catalog root');
  const bytes = await readFile(absolute);
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Manifest exceeds 8 MiB');
  const manifest = JSON.parse(bytes);
  if (manifest.version !== 1 || !/^\d+\.\d+\.\d+\.\d+$/.test(manifest.gameVersion || '') || !manifest.skseVersion || !manifest.files?.length) throw new Error(`Expected a complete versioned runtime manifest: ${relative}`);
  const gameVersion = manifest.gameVersion.split('.').map(Number).join('.');
  if (versions.has(gameVersion)) throw new Error(`Choose one released package for Skyrim ${gameVersion}`);
  versions.add(gameVersion);
  packages.push({ gameVersion, manifest: relative, sha256: createHash('sha256').update(bytes).digest('hex') });
}
packages.sort((a, b) => a.gameVersion.localeCompare(b.gameVersion, undefined, { numeric: true }));
const temporary = `${output}.${process.pid}.tmp`;
try {
  await writeFile(temporary, JSON.stringify({ version: 2, packages }, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, output);
} catch (error) {
  await unlink(temporary).catch(() => {});
  throw error;
}
console.log(JSON.stringify({ output, gameVersions: packages.map((p) => p.gameVersion) }));
