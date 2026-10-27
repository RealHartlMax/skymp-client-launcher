<?php
require_once __DIR__ . '/includes/bootstrap.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
$recoveryMode = 'reset';
$validLink = false;
try {
    if (isset($_GET['token'])) {
        unset($_SESSION['manage_password_reset_hash']);
        $raw = (string) $_GET['token'];
        if (preg_match('/^[a-f0-9]{64}$/D', $raw) && password_reset_is_valid(hash('sha256', $raw))) {
            $_SESSION['manage_password_reset_hash'] = hash('sha256', $raw);
        }
        // Keep the bearer token out of the rendered form, subsequent URLs and referrers.
        redirect_to('reset-password.php?lang=' . current_language());
    }
    $hash = (string) ($_SESSION['manage_password_reset_hash'] ?? '');
    $validLink = password_reset_is_valid($hash);
    if (is_post_request()) {
        verify_csrf_or_abort();
        ga_limit('password-reset-complete', 10);
        $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
        if (!$validLink) { set_flash('error', t('reset_invalid')); }
        elseif (!auth_password_is_valid($password)) { set_flash('error', t('reset_password_length')); }
        elseif ($password !== (string) ($_POST['password_repeat'] ?? '')) { set_flash('error', t('flash_password_mismatch')); }
        elseif (complete_password_reset($hash, $password)) {
            unset($_SESSION['manage_password_reset_hash']);
            // The reset already revoked its target account; do not revoke a different
            // account's game sessions if this browser happened to be signed in there.
            logout_current_user(false);
            set_flash('success', t('reset_complete'));
            redirect_to('login.php?lang=' . current_language());
        } else { $validLink = false; set_flash('error', t('reset_invalid')); }
    }
} catch (GameAuthError $error) {
    http_response_code($error->status);
    set_flash('warning', t('reset_rate_limit'));
} catch (Throwable $error) {
    http_response_code(503);
    set_flash('error', t('reset_unavailable'));
}
require __DIR__ . '/includes/recovery-view.php';
