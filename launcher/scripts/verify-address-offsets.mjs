import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { verifyAddressOffsets } from './address-offsets.mjs';

const { values } = parseArgs({ options: {
  'address-library': { type: 'string' }, 'offsets-file': { type: 'string' },
  'game-version': { type: 'string' }, 'image-base': { type: 'string' },
  report: { type: 'string' }, help: { type: 'boolean' },
} });
if (values.help) {
  console.log('node launcher/scripts/verify-address-offsets.mjs --address-library versionlib-1-7-104-0.bin --offsets-file offsets-1-7-104-0.txt --game-version 1.7.104.0 [--image-base 0x140000000] [--report result.json]');
} else {
  if (!values['address-library'] || !values['offsets-file'] || !values['game-version']) throw new Error('Expected --address-library, --offsets-file and --game-version; see --help');
  const [addressBytes, offsetsBytes] = await Promise.all([
    readFile(values['address-library']), readFile(values['offsets-file']),
  ]);
  const report = verifyAddressOffsets({ addressBytes, offsetsBytes, gameVersion: values['game-version'], imageBase: values['image-base'] });
  const json = JSON.stringify(report, null, 2) + '\n';
  // A report must never replace a source file or silently overwrite older evidence.
  if (values.report) await writeFile(values.report, json, { flag: 'wx' });
  console.log(json.trim());
}
