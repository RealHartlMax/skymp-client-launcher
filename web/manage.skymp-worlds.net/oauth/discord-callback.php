<?php
require_once dirname(__DIR__) . '/includes/bootstrap.php';
require_once dirname(__DIR__) . '/includes/discord-oauth.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

$incomingState = trim((string) ($_GET['state'] ?? ''));
$code = trim((string) ($_GET['code'] ?? ''));
$error = trim((string) ($_GET['error'] ?? ''));

$flow = consume_discord_oauth_state($incomingState);
if ($flow === null) {
    set_flash('error', t('flash_oauth_state'));
    redirect_to('login.php');
}

$destination = ($flow['mode'] ?? '') === 'link' ? 'account.php' : 'login.php';
if ($error !== '' || (isset($_GET['iss']) && $_GET['iss'] !== 'https://discord.com')) {
    set_flash('error', do_t('cancelled'));
    redirect_to($destination);
}

if ($code === '') {
    set_flash('error', t('flash_oauth_code'));
    redirect_to($destination);
}

try {
    if (!discord_oauth_is_configured()) { throw new RuntimeException('configuration'); }
    $profile = discord_exchange_code($code);
    $userId = discord_resolve_account($profile, ($flow['mode'] ?? '') === 'link' ? (string)$flow['user'] : null);
    if (($flow['mode'] ?? '') === 'link') { set_flash('success', do_t('linked')); redirect_to('account.php'); }
    if (!complete_login_for_user_id($userId, 'discord')) { throw new RuntimeException('storage'); }
    set_flash('success', t('flash_welcome'));
    redirect_to(login_destination());
} catch (Throwable $exception) {
    $reason = in_array($exception->getMessage(), ['collision', 'email', 'linked_elsewhere', 'already_linked'], true) ? $exception->getMessage() : 'unavailable';
    set_flash('error', do_t($reason));
    redirect_to($destination);
}
