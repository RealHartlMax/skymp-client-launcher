<?php
require_once __DIR__.'/includes/bootstrap.php';
require_once __DIR__.'/includes/crash-reports.php';
require_once __DIR__.'/includes/crash-translations.php';
require_once __DIR__.'/includes/developer-sso.php';
require_once __DIR__.'/includes/developer-translations.php';
header('Cache-Control: no-store'); header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff'); header('X-Frame-Options: DENY'); header('X-Robots-Tag: noindex, nofollow');
$state = $_GET['state'] ?? '';
if (!is_string($state) || !preg_match('/^[a-f0-9]{64}$/D', $state)) { http_response_code(400); exit('Invalid developer sign-in state.'); }
if (current_user() === null) {
    $_SESSION['developer_access_request'] = ['state'=>$state, 'created'=>time()];
    require_login();
}
$user = current_user(); $error = ''; $ticket = ''; $target = '';
if (!cr_is_admin($user)) { http_response_code(403); $error = dev_t('denied'); }
else {
    try {
        $target = ds_origin((string)(defined('MANAGE_DEV_PUBLIC_URL') ? MANAGE_DEV_PUBLIC_URL : 'https://dev.skymp-worlds.net'));
        $secret = (string)(defined('MANAGE_DEV_SSO_SECRET') ? MANAGE_DEV_SSO_SECRET : '');
        $displayName=(string)($user['display_name'] ?? $user['login_name'] ?? $user['id']);
        preg_match('/^.{0,64}/us', $displayName, $nameMatch);
        $ticket = ds_sign(['v'=>1, 'iss'=>ds_origin((string)MANAGE_PUBLIC_URL), 'aud'=>$target,
            'sub'=>(string)$user['id'], 'name'=>$nameMatch[0] ?? (string)$user['id'],
            'state'=>$state, 'nonce'=>bin2hex(random_bytes(32)), 'iat'=>time(), 'exp'=>time()+60], $secret);
        header("Content-Security-Policy: default-src 'self'; form-action ".$target."; frame-ancestors 'none'; base-uri 'none'");
    } catch (Throwable $exception) { http_response_code(503); $error = dev_t('notConfigured'); }
}
?>
<!doctype html><html lang="<?=e(current_language())?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=e(dev_t('portal'))?> · SkyMP Worlds</title><link rel="stylesheet" href="<?=e(app_url('assets/worlds.css?v=8de9376aef2a'))?>"></head><body class="dashboard-shell"><div class="site-layout"><main class="panel"><p class="eyebrow">SKYMP WORLDS · DEVELOPERS</p><h1><?=e(dev_t('portal'))?></h1>
<?php if($error!==''):?><p class="flash flash-error" role="alert"><?=e($error)?></p><p><?=e(cr_t('account'))?>: <code><?=e((string)$user['id'])?></code></p><a class="button button-secondary" href="<?=e(app_url('dashboard.php'))?>"><?=e(dev_t('back'))?></a>
<?php else:?><p><?=e(dev_t('account'))?>: <?=e((string)($user['display_name']??$user['id']))?></p><form method="post" action="<?=e($target.'/auth-callback.php')?>" data-developer-sign-in><input type="hidden" name="ticket" value="<?=e($ticket)?>"><button type="submit" class="button button-primary"><?=e(dev_t('continue'))?></button></form><script src="<?=e(app_url('assets/developer-sso.js'))?>" defer></script><?php endif;?>
</main></div><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body></html>
