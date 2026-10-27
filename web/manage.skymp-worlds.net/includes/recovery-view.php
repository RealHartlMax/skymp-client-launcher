<?php
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
$flash = consume_flash();
$isReset = $recoveryMode === 'reset';
$title = t($isReset ? 'reset_title' : 'forgot_title');
?>
<!doctype html>
<html lang="<?= e(current_language()) ?>">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SkyMP Worlds | <?= e($title) ?></title>
<link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>"></head>
<body class="site-shell"><main class="site-layout">
<header class="site-header panel"><a class="brand-link" href="https://skymp-worlds.net/">SkyMP <span>Worlds</span></a>
<div class="site-header-actions">
                <a class="button button-ghost community-link" data-platform-community="navigation" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a>
                <a class="button button-ghost docs-link" data-platform-docs="navigation" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a>
                <a class="button button-ghost docs-link" data-platform-downloads="navigation" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><label class="field"><span><?= e(t('lang_label')) ?></span><select id="lang-switch-recovery" aria-label="<?= e(t('lang_label')) ?>"><?php foreach (available_languages() as $code => $label): ?><option value="<?= e($code) ?>" <?= current_language() === $code ? 'selected' : '' ?>><?= e($label) ?></option><?php endforeach; ?></select></label></div></header>
<section class="auth-panel panel recovery-panel"><p class="eyebrow">SkyMP Worlds · <?= e(t('reset_account')) ?></p><h1><?= e($title) ?></h1>
<?php if ($flash): ?><div class="flash flash-<?= e($flash['type']) ?>" role="status"><?= e($flash['message']) ?></div><?php endif; ?>
<?php if ($isReset && !$validLink): ?>
<p><?= e(t('reset_invalid')) ?></p><a class="button button-primary" href="<?= e(app_url('forgot-password.php')) ?>"><?= e(t('forgot_title')) ?></a>
<?php else: ?>
<p><?= e(t($isReset ? 'reset_intro' : 'forgot_intro')) ?></p><form method="post" class="form-grid">
<input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
<?php if ($isReset): ?>
<label class="field"><span><?= e(t('reset_new_password')) ?></span><input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="256" required aria-describedby="reset-password-hint"></label>
<small id="reset-password-hint" class="muted"><?= e(t('reset_password_length')) ?></small>
<label class="field"><span><?= e(t('register_password_repeat')) ?></span><input type="password" name="password_repeat" autocomplete="new-password" minlength="8" maxlength="256" required></label>
<?php else: ?>
<label class="field"><span><?= e(t('field_email')) ?></span><input type="email" name="email" autocomplete="email" maxlength="254" required></label>
<?php endif; ?>
<button class="button button-primary" type="submit"><?= e(t($isReset ? 'reset_save' : 'reset_request')) ?></button></form>
<?php endif; ?>
<p><a href="<?= e(app_url('login.php')) ?>"><?= e(t('register_back_to_login')) ?></a></p></section>
</main><script src="<?= e(app_url('assets/app.js')) ?>" defer></script><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body></html>
