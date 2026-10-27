<?php
require_once __DIR__ . '/includes/bootstrap.php';

if (is_logged_in()) {
    redirect_to(login_destination());
}

if (is_post_request()) {
    verify_csrf_or_abort();

    $loginName = trim((string) ($_POST['login_name'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if (!MANAGE_EMAIL_REGISTRATION_ENABLED) {
        set_flash('warning', t('flash_demo_disabled'));
    } elseif ($loginName === '' || $password === '') {
        set_flash('error', t('flash_missing_credentials'));
    } else {
        $result = attempt_password_login($loginName, $password);

        if ($result['ok'] ?? false) {
            set_flash('success', t('flash_welcome'));
            redirect_to(login_destination());
        }

        if (($result['reason'] ?? '') === 'unverified') {
            set_flash('warning', t('flash_email_not_verified'));
        } else {
            set_flash('error', t('flash_invalid_credentials'));
        }
    }
}

$flash = consume_flash();
$oauthReady = discord_oauth_is_configured();
?>
<!DOCTYPE html>
<html lang="<?= e(current_language()) ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e(MANAGE_APP_NAME) ?> | <?= e(t('title_login')) ?></title>
    
    
    
    
    <link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>">
</head>
<body class="login-shell">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <main class="login-layout">
        <section class="hero-panel panel">
            <div class="language-bar">
                <label class="language-label" for="lang-switch-login"><?= e(t('lang_label')) ?></label>
                <select id="lang-switch-login" class="language-select">
                    <?php foreach (available_languages() as $languageCode => $languageName): ?>
                        <option value="<?= e($languageCode) ?>" <?= current_language() === $languageCode ? 'selected' : '' ?>><?= e($languageName) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <p class="eyebrow"><?= e(t('hall_name')) ?></p>
            <h1><?= e(t('hall_enter_title')) ?></h1>
            <p class="lede"><?= e(t('hall_enter_desc')) ?></p>

            <div class="feature-stack">
                <article class="feature-card">
                    <span class="feature-step">01</span>
                    <div>
                        <h2><?= e(t('login_step_1_title')) ?></h2>
                        <p><?= e(t('login_step_1_desc')) ?></p>
                    </div>
                </article>
                <article class="feature-card">
                    <span class="feature-step">02</span>
                    <div>
                        <h2><?= e(t('login_step_2_title')) ?></h2>
                        <p><?= e(t('login_step_2_desc')) ?></p>
                    </div>
                </article>
                <article class="feature-card">
                    <span class="feature-step">03</span>
                    <div>
                        <h2><?= e(t('login_step_3_title')) ?></h2>
                        <p><?= e(t('login_step_3_desc')) ?></p>
                    </div>
                </article>
            </div>
        </section>

        <section class="auth-panel panel">
            <div class="panel-header">
                <p class="eyebrow"><?= e(t('gatehouse')) ?></p>
                <h2><?= e(t('swear_access')) ?></h2>
                <p><?= e(t('swear_access_desc')) ?></p>
            </div>

            <?php if ($flash): ?>
                <div class="flash flash-<?= e($flash['type']) ?>">
                    <?= e($flash['message']) ?>
                </div>
            <?php endif; ?>

            <form method="post" class="form-grid">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">

                <label class="field">
                    <span><?= e(t('login_name')) ?></span>
                    <input type="text" name="login_name" value="<?= e((string) ($_POST['login_name'] ?? '')) ?>" autocomplete="username" required>
                </label>

                <label class="field">
                    <span><?= e(t('password')) ?></span>
                    <input type="password" name="password" autocomplete="current-password" required>
                </label>

                <button class="button button-primary" type="submit"><?= e(t('enter_hall')) ?></button>
            </form>

            <p><a href="<?= e(app_url('forgot-password.php')) ?>"><?= e(t('forgot_title')) ?></a></p>

            <div class="divider"><span><?= e(t('or')) ?></span></div>

            <a class="button button-secondary<?= $oauthReady ? '' : ' is-disabled' ?>" href="<?= e(app_url('oauth/discord-start.php')) ?>">
                <?= e($oauthReady ? t('discord_oath_ready') : t('discord_oath_prepare')) ?>
            </a>

            <p class="muted">
                <?= e(t('oauth_status')) ?>
                <strong><?= e($oauthReady ? t('oauth_status_ready') : t('oauth_status_missing')) ?></strong>
            </p>

            <?php if (MANAGE_EMAIL_REGISTRATION_ENABLED): ?>
                <div class="divider"><span><?= e(t('or')) ?></span></div>
                <a class="button button-secondary" href="<?= e(app_url('register.php')) ?>"><?= e(t('register_cta')) ?></a>
            <?php endif; ?>
        </section>
    </main>

    <script src="<?= e(app_url('assets/app.js')) ?>" defer></script>
<footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body>
</html>
