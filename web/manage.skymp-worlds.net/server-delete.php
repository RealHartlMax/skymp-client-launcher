<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_login();
verify_csrf_or_abort();

$state = load_state();
$user = current_user();
$serverId = trim((string) ($_POST['server_id'] ?? ''));

if ($serverId === '') {
    set_flash('error', t('flash_server_delete_missing'));
    redirect_to('dashboard.php');
}

if (delete_server_record($state, $user['id'], $serverId)) {
    save_state($state);
    set_flash('success', t('flash_server_deleted'));
} else {
    set_flash('error', t('flash_server_delete_failed'));
}

redirect_to('dashboard.php');
