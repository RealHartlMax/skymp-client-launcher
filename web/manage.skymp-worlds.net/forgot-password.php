<?php
require_once __DIR__ . '/includes/bootstrap.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$recoveryMode = 'forgot';
$validLink = false;
if (is_post_request()) {
    verify_csrf_or_abort();
    try {
        request_password_reset(is_string($_POST['email'] ?? null) ? $_POST['email'] : '');
        set_flash('success', t('reset_requested'));
    } catch (GameAuthError $error) {
        http_response_code($error->status);
        set_flash('warning', t('reset_rate_limit'));
    } catch (Throwable $error) {
        http_response_code(503);
        set_flash('error', t('reset_unavailable'));
    }
}
require __DIR__ . '/includes/recovery-view.php';
