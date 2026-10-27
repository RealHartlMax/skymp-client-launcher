<?php
require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_once dirname(__DIR__) . '/includes/discord-oauth.php';

$mode = ($_POST['mode'] ?? $_GET['mode'] ?? '') === 'link' ? 'link' : 'login';
if ($mode === 'login' && is_logged_in()) { redirect_to('account.php'); }
if ($mode === 'link') {
    if (!is_post_request()) { redirect_to('account.php'); }
    require_login();
    verify_csrf_or_abort();
}

if (!discord_oauth_is_configured()) {
    set_flash('warning', t('flash_oauth_not_configured'));
    redirect_to('login.php');
}

$params = http_build_query([
    'client_id' => MANAGE_DISCORD_CLIENT_ID,
    'redirect_uri' => MANAGE_DISCORD_REDIRECT_URI,
    'response_type' => 'code',
    'scope' => 'identify email',
    'state' => begin_discord_oauth_state($mode),
    'prompt' => 'consent',
]);

header('Location: https://discord.com/oauth2/authorize?' . $params);
exit;
