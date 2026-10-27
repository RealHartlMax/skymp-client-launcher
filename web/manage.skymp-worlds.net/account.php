<?php
require_once __DIR__.'/includes/bootstrap.php';
require_once __DIR__.'/includes/discord-oauth.php';
if (!is_logged_in()) { $_SESSION['manage_account_return']=time(); require_login(); }
$user=current_user(); $flash=consume_flash(); $link=null; $storageError=false;
try { $link=discord_link_for_user((string)$user['id']); } catch (Throwable $error) { $storageError=true; }
header('Cache-Control: no-store');
?>
<!doctype html><html lang="<?=e(current_language())?>"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SkyMP Worlds · <?=e(do_t('title'))?></title><link rel="stylesheet" href="<?=e(app_url('assets/worlds.css?v=8de9376aef2a'))?>"></head>
<body class="dashboard-shell"><main class="login-layout" style="max-width:1000px;margin-inline:auto;display:block">
<section class="panel"><div class="language-bar"><?php foreach (available_languages() as $code=>$label): ?><a class="button button-ghost" href="?lang=<?=e($code)?>" lang="<?=e($code)?>"><?=e($label)?></a><?php endforeach; ?></div>
<p class="eyebrow">SKYMP WORLDS</p><h1><?=e(do_t('title'))?></h1><p><?=e(do_t('intro'))?></p>
<?php if ($flash): ?><div class="flash <?=e((string)$flash['type'])?>" role="status"><?=e((string)$flash['message'])?></div><?php endif; ?>
<dl><dt><?=e(do_t('login'))?></dt><dd><?=e((string)($user['display_name']??$user['login_name']))?></dd></dl>
<h2>Discord</h2>
<?php if ($storageError): ?><p role="alert"><?=e(do_t('unavailable'))?></p>
<?php elseif ($link): ?><p><?=e($link['display_name'])?></p><p><?=e(do_t('identity'))?>: <code><?=e($link['subject'])?></code></p>
<?php else: ?><p><?=e(do_t('not_linked'))?></p><form method="post" action="<?=e(app_url('oauth/discord-start.php'))?>"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><input type="hidden" name="mode" value="link"><button class="button button-primary" type="submit" <?=discord_oauth_is_configured()?'':'disabled'?>><?=e(do_t('link'))?></button></form><?php endif; ?>
<p><?=e(do_t(discord_oauth_is_configured()?'configured':'missing'))?></p><p><?=e(do_t('notice'))?></p>
<a class="button button-secondary" href="<?=e(app_url('dashboard.php'))?>">← <?=e(do_t('back'))?></a></section></main><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body></html>
