<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_login();
verify_csrf_or_abort();

$state = load_state();
$user = current_user();

try {
    $server = upsert_server($state, $user['id'], [
        'server_id' => (string) ($_POST['server_id'] ?? ''),
        'ip' => (string) ($_POST['ip'] ?? ''),
        'port' => (string) ($_POST['port'] ?? ''),
        'country_code' => (string) ($_POST['country_code'] ?? ''),
        'gamemode' => (string) ($_POST['gamemode'] ?? ''),
        'status' => (string) ($_POST['status'] ?? ''),
        'notes' => (string) ($_POST['notes'] ?? ''),
    ]);

    save_state($state);

    // Registration does not impersonate a heartbeat from the game server.
    set_flash('success', t('flash_server_saved'));
} catch (InvalidArgumentException $exception) {
    set_flash('error', $exception->getMessage());
}

redirect_to('dashboard.php');
