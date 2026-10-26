import { createHash } from 'node:crypto';

const headerSize = 96;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => `0x${value.toString(16).toUpperCase()}`;

// Skyrim 1.7's format-5 Address Library stores uint32 RVAs indexed by ID.
// The optional text reference uses preferred-image VAs, not ASLR addresses
// or offsets of members inside a C++ object. Never convert it into a DLL patch.
export function verifyAddressOffsets({ addressBytes, offsetsBytes, gameVersion, imageBase = '0x140000000' }) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(gameVersion || '')) throw new Error('A complete game version is required for the offset reference');
  if (!/^0x[0-9a-f]+$/i.test(imageBase)) throw new Error('Image base must be hexadecimal, e.g. 0x140000000');
  const base = BigInt(imageBase);
  if (base > 0xFFFFFFFFFFFFFFFFn) throw new Error('Image base exceeds 64 bits');
  if (addressBytes.length < headerSize || addressBytes.readUInt32LE(0) !== 5) throw new Error('Offset reference verification requires a complete format-5 Address Library');
  const version = [4, 8, 12, 16].map(offset => addressBytes.readUInt32LE(offset)).join('.');
  if (version !== gameVersion) throw new Error(`Address Library version ${version} does not match ${gameVersion}`);
  const module = addressBytes.subarray(20, 84).toString('utf8').split('\0')[0];
  if (module.toLowerCase() !== 'skyrimse.exe') throw new Error(`Unexpected Address Library module: ${module}`);
  if (addressBytes.readUInt32LE(84) !== 8 || addressBytes.readUInt32LE(88) !== 0) throw new Error('Unsupported format-5 pointer size or data format');
  const count = addressBytes.readUInt32LE(92);
  if (!count || addressBytes.length !== headerSize + count * 4) throw new Error('Address Library offset count does not match the file size');

  const seen = new Set();
  const lines = offsetsBytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^\s*(\d+)\s+((?:0x)?[0-9a-f]+)\s*$/i);
    if (!match) throw new Error(`Invalid offset reference at line ${index + 1}; expected decimal ID and hexadecimal address`);
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id >= count) throw new Error(`Offset reference ID is outside the library at line ${index + 1}`);
    if (seen.has(id)) throw new Error(`Duplicate offset reference ID ${id}`);
    seen.add(id);
    const va = BigInt(match[2].toLowerCase().startsWith('0x') ? match[2] : `0x${match[2]}`);
    const expected = va - base;
    if (expected <= 0n || expected > 0xFFFFFFFFn) throw new Error(`Offset reference ID ${id} is outside the image's nonzero RVA range`);
    const actual = BigInt(addressBytes.readUInt32LE(headerSize + id * 4));
    if (actual !== expected) throw new Error(`Offset mismatch for ID ${id}: reference ${hex(expected)}, Address Library ${hex(actual)}`);
  }
  let mapped = 0;
  for (let id = 0; id < count; id++) {
    if (addressBytes.readUInt32LE(headerSize + id * 4) !== 0) mapped++;
  }
  if (!mapped || seen.size !== mapped) throw new Error(`Incomplete offset reference: ${seen.size} entries, Address Library has ${mapped} mapped IDs`);
  return {
    ok: true, gameVersion: version, format: 5, module, imageBase: hex(base),
    denseOffsetCount: count, mappedIds: mapped, matchedEntries: seen.size, mismatches: 0,
    addressLibrarySha256: hash(addressBytes), offsetsSha256: hash(offsetsBytes),
  };
}
