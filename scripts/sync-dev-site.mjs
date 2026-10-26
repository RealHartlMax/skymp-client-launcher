// Reuse the tested crash engine and view; each published webroot contains its own files.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manage = join(project, 'web/manage.skymp-worlds.net');
const dev = join(project, 'web/dev.skymp-worlds.net');
const shared = join(project, 'web/shared');
for (const directory of ['includes','assets','tools']) await mkdir(join(dev, directory), {recursive:true});
const sso = await readFile(join(shared, 'developer-sso.php'), 'utf8');
for (const root of [manage, dev]) await writeFile(join(root, 'includes/developer-sso.php'), sso);
const translations = await readFile(join(dev, 'includes/i18n.php'), 'utf8');
await writeFile(join(manage, 'includes/developer-translations.php'), '<?php\n' + translations.slice(translations.indexOf('function dev_t(')));
for (const file of ['includes/crash-reports.php','includes/crash-translations.php','crash-ingest.php','tools/cleanup-crash-reports.php','assets/crash-reports.css','assets/crash-reports.js']) {
  let contents = (await readFile(join(manage, file), 'utf8')).replaceAll('MANAGE_CRASH_', 'DEV_CRASH_');
  if (file === 'includes/crash-reports.php') {
    // Only DEV supports its fixed, PHP-guarded reports/ folder; legacy MANAGE storage stays private.
    contents = contents.replace('<?php', "<?php\nif (!defined('DEV_CRASH_ALLOW_WEBROOT_REPORTS')) { define('DEV_CRASH_ALLOW_WEBROOT_REPORTS', true); }\nif (!defined('DEV_CRASH_DEFAULT_DIRECTORY')) { define('DEV_CRASH_DEFAULT_DIRECTORY', dirname(__DIR__).'/reports'); }");
    const old = "return $user !== null && in_array((string) ($user['id'] ?? ''),(array) cr_option('DEV_CRASH_REPORT_ADMINS',[]),true) && ($user['provider'] ?? '') !== 'demo';";
    if (!contents.includes(old)) throw Error('Crash permission adapter changed; inspect before syncing dev.');
    contents = contents.replace(old, "return $user !== null && function_exists('current_user') && current_user() === $user && ($user['provider'] ?? '') === 'developer-sso';");
  }
  await writeFile(join(dev, file), contents);
}
let view = await readFile(join(manage, 'crash-reports.php'), 'utf8');
view = view.replace(/\/\/ DEV_PORTAL_REDIRECT_START[\s\S]*?\/\/ DEV_PORTAL_REDIRECT_END\n?/, '');
// Management's password UI has no inputs on this SSO-only site.
view = view.replace(/<script\s+src="[^"\n]*assets\/password-fields\.js[^"\n]*"\s+defer><\/script>\n?/g, '');
view = view.replaceAll("app_url('dashboard.php')", "dev_manage_url('dashboard.php')");
view = view.replace('<body class="dashboard-shell">', '<body class="dashboard-shell dev-shell">');
view = view.replace('</head>', '<link rel="stylesheet" href="<?=e(app_url(\'assets/dev.css?v=2\'))?>"></head>');
const header = `<header class="panel dev-header"><div class="dev-header-main"><div><p class="eyebrow">SKYMP WORLDS · DEVELOPERS</p><h1><?=e(cr_t('title'))?></h1></div><div class="dev-session-actions"><span class="dev-user"><?=e((string)($user['display_name']??$user['id']))?></span><form method="post" action="logout.php"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><button class="button button-ghost" type="submit"><?=e(dev_t('logout'))?></button></form><nav class="dev-languages" aria-label="Language"><?php foreach(['de'=>'DE','en'=>'EN','ru'=>'RU']as $code=>$label):?><a class="button button-ghost" href="<?=e(app_url('crash-reports.php').'?'.http_build_query(array_merge($_GET,['lang'=>$code])))?>" lang="<?=$code?>" <?=current_language()===$code?'aria-current="true"':''?>><?=$label?></a><?php endforeach;?></nav></div></div><nav class="dev-links" aria-label="SkyMP Worlds"><a href="<?=e(dev_manage_url('dashboard.php'))?>"><?=e(dev_t('back'))?></a><a data-platform-docs="navigation" href="https://docs.skymp-worlds.net/?lang=<?=e(current_language())?>"><?=e(['de'=>'Dokumentation','en'=>'Documentation','ru'=>'Документация'][current_language()])?> ↗</a><a data-platform-downloads="navigation" href="https://update.skymp-worlds.net/index.html?lang=<?=e(current_language())?>"><?=e(['de'=>'Downloads','en'=>'Downloads','ru'=>'Загрузки'][current_language()])?> ↗</a><a data-platform-community="navigation" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord ↗</a></nav></header>`;
view = view.replace(/<header class="panel topbar">[\s\S]*?<\/header>/, header);
const metrics = `
<?php if($selected===null):?>
<section class="dev-metrics" aria-label="<?=e(dev_t('reports'))?>">
<?php foreach(['reports'=>count($entries),'new'=>count(array_filter($entries,static fn($entry):bool=>$entry['status']==='new')),'investigating'=>count(array_filter($entries,static fn($entry):bool=>$entry['status']==='investigating')),'dumps'=>count(array_filter($entries,static fn($entry):bool=>$entry['dumpBytes']>0))] as $label=>$number):?>
<article class="panel"><strong><?=e((string)$number)?></strong><span><?=e(dev_t($label))?></span></article>
<?php endforeach;?></section>
<div class="dev-toolbar"><p class="muted"><?=e(dev_t('storage'))?></p><a class="button button-secondary" href="import.php"><?=e(dev_t('import'))?></a></div>
<?php endif;?>`;
view = view.replace('<p class="muted"><?=e(cr_t(\'notice\'))?></p>', '<p class="muted"><?=e(cr_t(\'notice\'))?></p>' + metrics);
view = view.replace('<p class="muted"><?=e(cr_t(\'fingerprint\'))?>', '<p class="muted"><?=e(dev_t(\'folder\'))?>: <code><?=e($selected[\'path\'])?></code></p>\n<p class="muted"><?=e(cr_t(\'fingerprint\'))?>');
await writeFile(join(dev, 'crash-reports.php'), view);
// The docs directory is canonical; future packages must not retain older setup copies.
await mkdir(join(dev, 'setup'), {recursive:true});
for (const language of ['de','en','ru']) {
  await copyFile(join(project, `docs/DEV_PORTAL_SETUP.${language}.md`), join(dev, `setup/SETUP.${language}.md`));
}
console.log('Developer webroot synchronized: standalone crash engine, UI, translations and SSO helpers.');
