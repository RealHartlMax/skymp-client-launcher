<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_login();
verify_csrf_or_abort();

$state = load_state();
$user = current_user();
$serverId = trim((string) ($_POST['server_id'] ?? ''));

if ($serverId === '') {
    set_flash('error', t('flash_revoke_missing'));
    redirect_to('dashboard.php');
}

$server = revoke_server_api_key($state, $user['id'], $serverId);

if ($server === null) {
    set_flash('error', t('flash_revoke_failed'));
} else {
    save_state($state);
    set_flash('success', t('flash_revoke_success', ['name' => $server['name']]));
}

redirect_to('dashboard.php');
