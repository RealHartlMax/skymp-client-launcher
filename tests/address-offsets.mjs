import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifyAddressOffsets } from '../launcher/scripts/address-offsets.mjs';

const version = '1.7.104.0';
const library = Buffer.alloc(96 + 4 * 4);
library.writeUInt32LE(5, 0);
[1, 7, 104, 0].forEach((n, i) => library.writeUInt32LE(n, 4 + i * 4));
library.write('SkyrimSE.exe', 20);
library.writeUInt32LE(8, 84);
library.writeUInt32LE(4, 92);
library.writeUInt32LE(0x1022, 100); // ID 1; IDs 0 and 2 are unmapped.
library.writeUInt32LE(0x1072, 108); // ID 3.
const text = Buffer.from('1 140001022\n3 140001072\n');
const verify = (addressBytes = library, offsetsBytes = text, gameVersion = version, imageBase) => verifyAddressOffsets({ addressBytes, offsetsBytes, gameVersion, imageBase });
const changed = (offset, value) => { const bytes = Buffer.from(library); bytes.writeUInt32LE(value, offset); return bytes; };
const checks = [];
const rejects = (name, operation, pattern) => { assert.throws(operation, pattern); checks.push(name); };
const good = verify();
assert.equal(good.mappedIds, 2);
assert.equal(good.matchedEntries, 2);
assert.equal(good.denseOffsetCount, 4);
assert.equal(good.mismatches, 0);
assert.match(good.addressLibrarySha256, /^[a-f0-9]{64}$/);
assert.equal(verify(library, Buffer.from('\uFEFF3 0x140001072\r\n1 140001022\r\n')).matchedEntries, 2);
checks.push('complete reference, sparse unmapped IDs, reordered lines, BOM and CRLF');
rejects('incorrect address', () => verify(library, Buffer.from('1 140001023\n3 140001072')), /Offset mismatch for ID 1/);
rejects('omitted mapped ID', () => verify(library, Buffer.from('1 140001022')), /Incomplete/);
rejects('duplicate ID', () => verify(library, Buffer.from('1 140001022\n1 140001022\n3 140001072')), /Duplicate/);
rejects('out of range ID', () => verify(library, Buffer.from('4 140001022')), /outside the library/);
rejects('unmapped ID', () => verify(library, Buffer.from('1 140001022\n2 140001023\n3 140001072')), /Offset mismatch for ID 2/);
rejects('malformed line', () => verify(library, Buffer.from('ID address')), /Invalid offset reference/);
rejects('unsafe integer ID', () => verify(library, Buffer.from('9007199254740993 140001022')), /outside the library/);
rejects('address below image base', () => verify(library, Buffer.from('1 130001022')), /nonzero RVA range/);
rejects('zero RVA', () => verify(library, Buffer.from('1 140000000')), /nonzero RVA range/);
rejects('RVA exceeds 32 bits', () => verify(library, Buffer.from('1 240000000')), /nonzero RVA range/);
rejects('wrong Skyrim version', () => verify(library, text, '1.7.99.0'), /does not match/);
rejects('missing version', () => verify(library, text, ''), /complete game version/);
rejects('unsupported library format', () => verify(changed(0, 2)), /format-5/);
rejects('truncated header', () => verify(library.subarray(0, 92)), /complete format-5/);
rejects('truncated body', () => verify(library.subarray(0, -1)), /file size/);
rejects('trailing bytes', () => verify(Buffer.concat([library, Buffer.from([0])])), /file size/);
rejects('wrong pointer size', () => verify(changed(84, 4)), /pointer size/);
rejects('unknown data format', () => verify(changed(88, 1)), /data format/);
const otherModule = Buffer.from(library); otherModule.fill(0, 20, 84); otherModule.write('Other.exe', 20);
rejects('wrong game module', () => verify(otherModule), /module/);
rejects('invalid image base', () => verify(library, text, version, '140000000'), /hexadecimal/);
rejects('overflowing image base', () => verify(library, text, version, '0x10000000000000000'), /64 bits/);
rejects('empty reference', () => verify(library, Buffer.alloc(0)), /Incomplete/);

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'skymp-address-reference-'));
try {
  const address = path.join(temporary, 'versionlib-1-7-104-0.bin');
  const offsets = path.join(temporary, 'offsets-1-7-104-0.txt');
  const report = path.join(temporary, 'report.json');
  await writeFile(address, library); await writeFile(offsets, text);
  const args = [path.join(repo, 'launcher/scripts/verify-address-offsets.mjs'), '--address-library', address, '--offsets-file', offsets, '--game-version', version, '--report', report];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(report)), good);
  assert.deepEqual(JSON.parse(result.stdout), good);
  const overwrite = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.notEqual(overwrite.status, 0);
  assert.deepEqual(JSON.parse(await readFile(report)), good);
  assert.deepEqual(await readFile(address), library);
  assert.deepEqual(await readFile(offsets), text);
  checks.push('CLI writes evidence, refuses overwriting it and preserves both inputs');
} finally {
  if (!path.resolve(temporary).startsWith(path.resolve(path.join(tmpdir(), 'skymp-address-reference-')))) throw new Error('Unsafe test cleanup');
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, cases: checks.length, checks, skyrimStarted: false }, null, 2));
