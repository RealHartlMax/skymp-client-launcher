import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

export function isPublicIp(value) {
  const ip = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip.startsWith('::ffff:')) return isPublicIp(ip.slice(7));
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only global-unicast IPv6. Reject mapped, transition and documentation networks.
  return isIP(ip) === 6 && /^[23]/.test(ip) && !/^2001:(?:0:|db8:|10:|20:)/.test(ip) && !ip.startsWith('2002:');
}

export function resourceUrl(value, allowEmpty = false) {
  if (allowEmpty && !value) return '';
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw Error('HTTP(S)-URL ohne Zugangsdaten, Suchparameter oder Fragment erforderlich.');
  return url.href.replace(/\/$/, '');
}

export async function legacyManifest(base, allowPrivate) {
  const url = new URL(`${resourceUrl(base)}/manifest.json`);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!addresses.length || (!allowPrivate && addresses.some((a) => !isPublicIp(a.address)))) throw Error('Privater Dateiserver ist am öffentlichen Master nicht zulässig.');
  // Pin the validated address for this request, including DNS names with multiple answers.
  const address = addresses[0];
  const payload = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      lookup: (_name, options, done) => options.all ? done(null, [address]) : done(null, address.address, address.family),
      timeout: 10_000, headers: { Accept: 'application/json' },
    }, (response) => {
      if (response.statusCode !== 200) { response.resume(); reject(Error('Manifest ist nicht erreichbar.')); return; }
      let length = 0;
      const chunks = [];
      response.on('data', (chunk) => { length += chunk.length; if (length > 8 * 1024 * 1024) { request.destroy(Error('Manifest ist zu groß.')); return; } chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('timeout', () => request.destroy(Error('Manifest-Zeitlimit überschritten.')));
    request.on('error', reject);
  });
  const manifest = JSON.parse(payload);
  if (manifest.versionMajor !== 1 || !Array.isArray(manifest.mods) || !Array.isArray(manifest.loadOrder)) throw Error('Ungültiges SkyMP-Manifest.');
  return manifest;
}
