<?php
require_once __DIR__ . '/includes/bootstrap.php';

$token = trim((string) ($_GET['token'] ?? ''));
$result = complete_email_verification($token);

if ($result['ok'] ?? false) {
    set_flash('success', t('flash_email_verified'));
} else {
    $reason = (string) ($result['reason'] ?? 'invalid_token');
    if ($reason === 'expired') {
        set_flash('error', t('flash_verify_token_expired'));
    } else {
        set_flash('error', t('flash_verify_token_invalid'));
    }
}

redirect_to('login.php');
