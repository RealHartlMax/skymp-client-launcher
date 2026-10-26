// One canonical theme per independent webroot, with content versions for browser caches.
import { readFile, writeFile, readdir, cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const version = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const shared = join(project, 'web/shared');
const platform = JSON.parse(await readFile(join(shared, 'platform.json'), 'utf8'));
if (!/^https:\/\/discord\.gg\/[a-zA-Z0-9]+$/.test(platform.communityUrl)) throw Error('Invalid platform community URL');
if (platform.docsUrl !== 'https://docs.skymp-worlds.net/') throw Error('Invalid platform documentation URL');
const sites = JSON.parse(await readFile(join(project, 'scripts/web-sites.json'), 'utf8'));
if (sites.some(site => !/^[a-z0-9.-]+$/.test(site.directory) || !/^[a-z0-9.-]+$/.test(site.domain))) throw Error('Invalid webroot catalog');
await import('./build-docs.mjs');
await import('./sync-dev-site.mjs');
const siteScript = await readFile(join(shared, 'site.js'));
const passwordScript = await readFile(join(shared, 'password-fields.js'));
const countryCodes = JSON.parse(await readFile(join(shared, 'flags/countries.json'), 'utf8'));
const countryScript = (await readFile(join(shared, 'country-flags.js'), 'utf8')).replace('/* COUNTRY_CODES */ []', JSON.stringify(countryCodes));
const fonts = await readFile(join(shared, 'fonts/fonts.css'));
const foundation = (await readFile(join(shared, 'design-system.css'), 'utf8'))
  .replace('./fonts/fonts.css', `./fonts/fonts.css?v=${version(fonts)}`);
const theme = (await readFile(join(shared, 'worlds.css'), 'utf8'))
  .replace('./design-system.css', `./design-system.css?v=${version(foundation)}`);
const communityLink = kind => `<a class="${kind === 'footer' ? 'community-link' : 'button button-ghost community-link'}" data-platform-community="${kind}" href="${platform.communityUrl}" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a>`;
const docsLink = (kind, php) => {
  const language = php ? "<?= e(current_language()) ?>" : 'en';
  const label = php ? "<?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?>" : 'Documentation';
  return `<a class="${kind === 'footer' ? 'docs-link' : 'button button-ghost docs-link'}" data-platform-docs="${kind}" href="${platform.docsUrl}?lang=${language}">${label} <span aria-hidden="true">↗</span></a>`;
};
const downloadsLink = (kind, php, code = 'en') => {
  const language = php ? "<?= e(current_language()) ?>" : code;
  const label = php ? "<?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?>" : (code === 'ru' ? 'Загрузки' : 'Downloads');
  return `<a class="${kind === 'footer' ? 'docs-link' : 'button button-ghost docs-link'}" data-platform-downloads="${kind}" href="https://update.skymp-worlds.net/index.html?lang=${language}">${label} <span aria-hidden="true">↗</span></a>`;
};
let updated = 0;
async function syncPages(directory, versions, isDocs) {
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    if (['storage','vendor','node_modules','config.php','private.php'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await syncPages(path, versions, isDocs); continue; }
    if (!entry.isFile() || !/\.(?:html|php)$/.test(entry.name)) continue;
    const before = await readFile(path, 'utf8');
    // Pure PHP helpers can contain email HTML strings; only transform actual pages.
    if (entry.name.endsWith('.php') && !/\?>\s*<!doctype\s+html/i.test(before)) continue;
    let after = before.replace(/<link\b(?:"[^"]*"|'[^']*'|[^'">])*>/g, tag => {
      if (/fonts\.(?:googleapis|gstatic)\.com|assets\/styles\.css/.test(tag)) return '';
      return tag.replace(/assets\/worlds\.css(?:\?v=[a-zA-Z0-9_-]+)?/g, `assets/worlds.css?v=${versions.worlds}`);
    });
    after = after.replace(/assets\/site\.js(?:\?v=[a-zA-Z0-9_-]+)?/g, `assets/site.js?v=${version(siteScript)}`);
    if (after.includes('</body>')) {
      after = after.replace(/<script\s+src="[^"\n]*assets\/country-flags\.js(?:\?v=[a-z0-9]+)?[^"\n]*"\s+defer><\/script>\n?/g, '');
      const countryTag = `<script src="${entry.name.endsWith('.php') ? "<?= e(app_url('assets/country-flags.js?v=" + version(countryScript) + "')) ?>" : 'assets/country-flags.js?v=' + version(countryScript)}" defer></script>\n`;
      const countryEnd = after.lastIndexOf('</body>');
      after = after.slice(0, countryEnd) + countryTag + after.slice(countryEnd);
      if (directory.includes('manage.skymp-worlds.net')) {
        after = after.replace(/<script\s+src="[^"\n]*assets\/password-fields\.js(?:\?v=[a-z0-9]+)?[^"\n]*"\s+defer><\/script>\n?/g, '');
        const end = after.lastIndexOf('</body>');
        after = after.slice(0, end) + `<script src="<?= e(app_url('assets/password-fields.js?v=${version(passwordScript)}')) ?>" defer></script>\n` + after.slice(end);
      }
      const phpPage = entry.name.endsWith('.php');
      const pageLanguage = isDocs ? (after.match(/<html lang="(de|en|ru)"/)?.[1] || 'en') : 'en';
      after = after.replace(/<a\b(?:"[^"]*"|'[^']*'|[^'">])*data-platform-downloads="navigation"(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/a>/g, downloadsLink('navigation', phpPage, pageLanguage));
      if (!after.includes('data-platform-downloads="navigation"')) {
        after = after.replace(/(<div class="(?:site-header-actions|topbar-actions)">)/, `$1\n                ${downloadsLink('navigation', phpPage, pageLanguage)}`);
      }
      if (!isDocs) {
        const php = entry.name.endsWith('.php');
        after = after.replace(/<a\b(?:"[^"]*"|'[^']*'|[^'">])*data-platform-docs="navigation"(?:"[^"]*"|'[^']*'|[^'">])*>[\s\S]*?<\/a>/g, docsLink('navigation', php));
        if (!after.includes('data-platform-docs="navigation"')) {
          after = after.replace(/(<div class="(?:site-header-actions|topbar-actions)">)/, `$1\n                ${docsLink('navigation', php)}`);
        }
      }
      after = after.replace(/<a\b[^>]*data-platform-community="navigation"[^>]*>[\s\S]*?<\/a>/g, communityLink('navigation'));
      if (!after.includes('data-platform-community="navigation"')) {
        after = after.replace(/(<div class="(?:site-header-actions|topbar-actions)">)/, `$1\n                ${communityLink('navigation')}`);
      }
      const footer = `<footer class="community-footer" aria-label="SkyMP Worlds">${isDocs ? '' : docsLink('footer', phpPage)}${downloadsLink('footer', phpPage, pageLanguage)}${communityLink('footer')}</footer>`;
      if (after.includes('class="community-footer"')) {
        after = after.replace(/<footer class="community-footer"[\s\S]*?<\/footer>/g, footer);
      } else {
        // register.php also contains an email template: append to the actual page only.
        const bodyEnd = after.lastIndexOf('</body>');
        after = after.slice(0, bodyEnd) + footer + '\n' + after.slice(bodyEnd);
      }
    }
    if (after !== before) { await writeFile(path, after); updated++; }
  }
}
for (const site of sites) {
  const root = join(project,'web',site.directory);
  await mkdir(join(root,'assets'), {recursive:true});
  await writeFile(join(root,'assets/worlds.css'), theme);
  await writeFile(join(root,'assets/design-system.css'), foundation);
  if (site.directory === 'manage.skymp-worlds.net') await writeFile(join(root,'assets/password-fields.js'), passwordScript);
  await cp(join(shared, 'fonts'), join(root, 'assets/fonts'), {recursive:true});
  await cp(join(shared, 'flags'), join(root, 'assets/flags'), {recursive:true});
  await writeFile(join(root, 'assets/country-flags.js'), countryScript);
  if (!['manage.skymp-worlds.net','docs.skymp-worlds.net'].includes(site.directory)) await writeFile(join(root,'assets/site.js'), siteScript);
  // Cached old HTML still gets the current theme; current pages load worlds.css once.
  await writeFile(join(root,'assets/styles.css'), `/* Compatibility entry point for older cached pages. */\n@import url('./worlds.css?v=${version(theme)}');\n`);
  await syncPages(root, {worlds:version(theme)}, site.directory === 'docs.skymp-worlds.net');
}
await mkdir(join(project, 'launcher/public/licenses'), {recursive:true});
await cp(join(shared, 'fonts/OFL.txt'), join(project, 'launcher/public/licenses/Noto-OFL.txt'));
await cp(join(shared, 'flags'), join(project, 'launcher/public/flags'), {recursive:true});
const metadataPath = join(project, 'web/update.skymp-worlds.net/version.json');
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
if (metadata.communityUrl !== platform.communityUrl || metadata.docsUrl !== platform.docsUrl) {
  metadata.communityUrl = platform.communityUrl;
  metadata.docsUrl = platform.docsUrl;
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n');
}
await mkdir(join(project, 'web/update.skymp-worlds.net/channels'), {recursive:true});
await writeFile(join(project, 'web/update.skymp-worlds.net/channels/latest.json'), JSON.stringify({...metadata, channel:'latest'}, null, 2) + '\n');
// Release remains unpublished until an operator supplies an actual release manifest.
const releasePath = join(project, 'web/update.skymp-worlds.net/channels/release.json');
try { await readFile(releasePath); } catch { await writeFile(releasePath, JSON.stringify({available:false, channel:'release'}, null, 2) + '\n'); }
await mkdir(join(project, 'web/manage.skymp-worlds.net/setup'), {recursive:true});
for (const language of ['de','en','ru']) await cp(join(project, `docs/DISCORD_SETUP.${language}.md`), join(project, `web/manage.skymp-worlds.net/setup/DISCORD.${language}.md`));
console.log(`Web assets synchronized: ${sites.length} themes, ${updated} pages updated, theme ${version(theme)}.`);
