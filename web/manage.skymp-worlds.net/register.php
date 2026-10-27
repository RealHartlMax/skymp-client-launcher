<?php
require_once __DIR__ . '/includes/bootstrap.php';

if (!email_registration_is_enabled()) {
    set_flash('warning', t('flash_email_registration_disabled'));
    redirect_to('login.php');
}

if (is_logged_in()) {
    redirect_to('dashboard.php');
}

if (is_post_request()) {
    verify_csrf_or_abort();

    $loginName = trim((string) ($_POST['login_name'] ?? ''));
    $email = trim((string) ($_POST['email'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $passwordRepeat = (string) ($_POST['password_repeat'] ?? '');

    if ($loginName === '' || $email === '' || $password === '' || $passwordRepeat === '') {
        set_flash('error', t('flash_missing_registration_fields'));
    } elseif ($password !== $passwordRepeat) {
        set_flash('error', t('flash_password_mismatch'));
    } else {
        $result = register_email_user($loginName, $email, $password);

        if (!($result['ok'] ?? false)) {
            $reason = (string) ($result['reason'] ?? 'unknown');
            if ($reason === 'invalid_login_name') {
                set_flash('error', t('flash_invalid_login_name'));
            } elseif ($reason === 'login_exists') {
                set_flash('error', t('flash_login_name_exists'));
            } elseif ($reason === 'invalid_email') {
                set_flash('error', t('flash_invalid_email'));
            } elseif ($reason === 'weak_password') {
                set_flash('error', t('flash_weak_password'));
            } elseif ($reason === 'email_exists') {
                set_flash('error', t('flash_email_exists'));
            } else {
                set_flash('error', t('flash_registration_failed'));
            }
        } else {
            $token = (string) ($result['token'] ?? '');
            $verificationUrl = app_absolute_url('verify-email.php?token=' . urlencode($token));
            $subject = t('mail_verify_subject');
            $safeAppName = e((string) MANAGE_APP_NAME);
            $safeUrl = e($verificationUrl);
            $safeCta = e(t('mail_verify_cta'));
            $safeIntro = e(t('mail_verify_intro'));

            $html = sprintf(
                '<!doctype html><html><body style="margin:0;padding:0;background:#0b1014;font-family:Noto Sans,Segoe UI,Arial,sans-serif;color:#e8edef;">'
                . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">'
                . '<tr><td align="center">'
                . '<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#141e26;border:1px solid #34434e;border-radius:12px;overflow:hidden;">'
                . '<tr><td style="padding:20px 24px;background:#1a2832;color:#e1c99f;font-size:22px;font-family:Noto Serif,Georgia,serif;">%s</td></tr>'
                . '<tr><td style="padding:24px;line-height:1.75;font-size:14px;">'
                . '<p style="margin:0 0 16px 0;">%s</p>'
                . '<p style="margin:0 0 20px 0;"><a href="%s" style="display:inline-block;background:#c7a875;color:#172028;text-decoration:none;padding:12px 16px;border-radius:6px;font-size:13px;font-weight:600;">%s</a></p>'
                . '<p style="margin:0;color:#a7b4bc;font-size:13px;word-break:break-all;">%s</p>'
                . '</td></tr></table>'
                . '</td></tr></table>'
                . '</body></html>',
                $safeAppName,
                $safeIntro,
                $safeUrl,
                $safeCta,
                $safeUrl
            );
            $text = t('mail_verify_intro') . "\n\n" . $verificationUrl;

            if (send_transactional_email($email, $subject, $html, $text)) {
                set_flash('success', t('flash_registration_success'));
                redirect_to('login.php');
            }

            set_flash('error', consume_mail_error() ?? t('flash_mail_send_failed', ['error' => 'unknown']));
        }
    }
}

$flash = consume_flash();
?>
<!DOCTYPE html>
<html lang="<?= e(current_language()) ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e(MANAGE_APP_NAME) ?> | <?= e(t('register_title')) ?></title>
    
    
    
    
    <link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>">
</head>
<body class="login-shell">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <main class="login-layout">
        <section class="hero-panel panel">
            <p class="eyebrow"><?= e(t('register_gatehouse')) ?></p>
            <h1><?= e(t('register_heading')) ?></h1>
            <p class="lede"><?= e(t('register_desc')) ?></p>
        </section>

        <section class="auth-panel panel">
            <?php if ($flash): ?>
                <div class="flash flash-<?= e($flash['type']) ?>">
                    <?= e($flash['message']) ?>
                </div>
            <?php endif; ?>

            <form method="post" class="form-grid">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">

                <label class="field">
                    <span><?= e(t('login_name')) ?></span>
                    <input type="text" name="login_name" value="<?= e((string) ($_POST['login_name'] ?? '')) ?>" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9._-]+">
                </label>

                <label class="field">
                    <span><?= e(t('field_email')) ?></span>
                    <input type="email" name="email" value="<?= e((string) ($_POST['email'] ?? '')) ?>" autocomplete="email" required>
                </label>

                <label class="field">
                    <span><?= e(t('password')) ?></span>
                    <input type="password" name="password" autocomplete="new-password" required minlength="8">
                </label>

                <label class="field">
                    <span><?= e(t('register_password_repeat')) ?></span>
                    <input type="password" name="password_repeat" autocomplete="new-password" required minlength="8">
                </label>

                <button class="button button-primary" type="submit"><?= e(t('register_submit')) ?></button>
            </form>

            <div class="divider"><span><?= e(t('or')) ?></span></div>
            <a class="button button-secondary" href="<?= e(app_url('login.php')) ?>"><?= e(t('register_back_to_login')) ?></a>
        </section>
    </main>
<footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body>
</html>
