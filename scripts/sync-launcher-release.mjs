// Synchronize local legacy/new catalogs from an already published official GitHub release.
// Does not create a GitHub release or deploy the web files.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tag=process.argv[2];
assert(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag||''),'Usage: node scripts/sync-launcher-release.mjs vX.Y.Z');
const repository='RealHartlMax/skymp-client-launcher';
const response=await fetch(`https://api.github.com/repos/${repository}/releases/tags/${tag}`,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
assert(response.ok,`Published release not available: HTTP ${response.status}`);
const release=await response.json();
assert(release.tag_name===tag&&release.draft===false&&release.prerelease===false&&release.published_at,'Only published stable releases can update the catalogs');
const asset=release.assets?.find(asset=>asset.state==='uploaded'&&/\.exe$/i.test(asset.name)&&asset.browser_download_url?.startsWith(`https://github.com/${repository}/releases/download/${tag}/`));
assert(asset&&/^sha256:[a-f0-9]{64}$/.test(asset.digest||''),'Published EXE and GitHub SHA-256 digest required');
const root=path.join(project,'web/update.skymp-worlds.net');
const previous=JSON.parse(await fs.readFile(path.join(root,'version.json'),'utf8'));
const metadata={...previous,available:true,version:tag.slice(1),releaseDate:release.published_at.slice(0,10),channel:'release',windowsAssetName:asset.name,
  windowsAssetSha256:asset.digest.slice(7),downloadUrl:asset.browser_download_url,changelogUrl:release.html_url,
  changelog:{de:[`Offizielles Launcher-Release ${tag}. Details und Download auf GitHub.`],en:[`Official launcher release ${tag}. Details and download on GitHub.`],ru:[`Официальный релиз лаунчера ${tag}. Подробности и загрузка на GitHub.`]}};
await fs.writeFile(path.join(root,'version.json'),JSON.stringify(metadata,null,2)+'\n');
await fs.writeFile(path.join(root,'channels/release.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({ok:true,version:metadata.version,sha256:metadata.windowsAssetSha256,files:['version.json','channels/release.json'],deployed:false}));
