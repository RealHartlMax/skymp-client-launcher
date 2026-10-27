<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/launcher-auth.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$lang = current_language();
$labels = [
    'de' => ['title'=>'Launcher mit deinem Konto verbinden','confirm'=>'Launcher-Anmeldung bestätigen','approved'=>'Launcher-Anmeldung bestätigt.','back'=>'Du kannst dieses Fenster schließen und zum Launcher zurückkehren.','hint'=>'Melde dich mit deinem bestehenden SkyMP-Worlds-Konto an. Der Launcher erhält Name, Konto-ID, E-Mail und Discord-Verknüpfungsstatus. Steam und Spielfiguren werden dadurch nicht neu zugeordnet.','identity'=>'Benutzername oder E-Mail','password'=>'Passwort','login'=>'Anmelden','signed'=>'Angemeldet als','account'=>'Mein Konto'],
    'en' => ['title'=>'Connect your account to the launcher','confirm'=>'Confirm launcher sign-in','approved'=>'Launcher sign-in confirmed.','back'=>'You can close this window and return to the launcher.','hint'=>'Use your existing SkyMP Worlds account. The launcher receives your name, account ID, email and Discord link status. This does not remap Steam or game characters.','identity'=>'Username or email','password'=>'Password','login'=>'Sign in','signed'=>'Signed in as','account'=>'My account'],
    'ru' => ['title'=>'Подключить аккаунт к лаунчеру','confirm'=>'Подтвердить вход в лаунчер','approved'=>'Вход в лаунчер подтверждён.','back'=>'Закройте окно и вернитесь в лаунчер.','hint'=>'Используйте существующий аккаунт SkyMP Worlds. Лаунчер получит имя, ID, email и статус привязки Discord. Steam и игровые персонажи не перепривязываются.','identity'=>'Имя пользователя или email','password'=>'Пароль','login'=>'Войти','signed'=>'Вход выполнен как','account'=>'Мой аккаунт'],
][$lang];
$rawState = (string) ($_GET['state'] ?? $_POST['state'] ?? '');
$message = ''; $approved = false; $valid = false;
try {
    ga_state($rawState); $valid = true;
    if (!is_post_request()) { la_begin($rawState); }
    else {
        verify_csrf_or_abort();
        if (($_POST['action'] ?? '') === 'login') {
            ga_limit('password-login', 20);
            $result = attempt_password_login((string) ($_POST['login_name'] ?? ''), (string) ($_POST['password'] ?? ''));
            if (!($result['ok'] ?? false)) { throw new GameAuthError(401, 'Anmeldung fehlgeschlagen / Sign-in failed / Ошибка входа.'); }
        } elseif (($_POST['action'] ?? '') === 'approve') {
            $user = current_user();
            if ($user === null) { throw new GameAuthError(401, 'Anmeldung erforderlich / Sign in first / Сначала войдите.'); }
            la_approve($rawState, $user); $approved = true;
        } else { throw new GameAuthError(400, 'Ungültige Anfrage / Invalid request / Неверный запрос.'); }
    }
} catch (GameAuthError $error) { http_response_code($error->status); $message = $error->getMessage(); }
catch (Throwable $error) { http_response_code(503); $message = 'Anmeldedienst nicht verfügbar / Sign-in unavailable / Вход недоступен.'; }
$user = current_user();
?>
<!doctype html><html lang="<?= e($lang) ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SkyMP Worlds | Launcher</title><link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>"></head>
<body class="site-shell"><main class="site-layout"><header class="site-header panel"><a class="brand-link" href="https://skymp-worlds.net/">SkyMP <span>Worlds</span></a><a class="button button-secondary" href="<?= e(app_url('account.php')) ?>"><?= e($labels['account']) ?></a></header>
<section class="hero-panel panel"><p class="eyebrow">SKYMP WORLDS LAUNCHER</p><h1><?= e($labels[$approved ? 'approved' : 'title']) ?></h1>
<?php if ($message !== ''): ?><p role="alert"><?= e($message) ?></p><?php endif; ?>
<?php if ($approved): ?><p><?= e($labels['back']) ?></p>
<?php elseif ($valid): ?><p><?= e($labels['hint']) ?></p>
<form method="post" class="form-grid"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="state" value="<?= e($rawState) ?>"><input type="hidden" name="lang" value="<?= e($lang) ?>">
<?php if ($user !== null): ?><p><?= e($labels['signed']) ?> <strong><?= e($user['display_name'] ?? $user['login_name']) ?></strong></p><input type="hidden" name="action" value="approve"><button class="button button-primary" type="submit"><?= e($labels['confirm']) ?></button>
<?php else: ?><input type="hidden" name="action" value="login"><label class="field"><span><?= e($labels['identity']) ?></span><input name="login_name" autocomplete="username" required maxlength="254"></label><label class="field"><span><?= e($labels['password']) ?></span><input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><a href="<?= e(app_url('forgot-password.php')) ?>"><?= e(t('forgot_title')) ?></a><button class="button button-primary" type="submit"><?= e($labels['login']) ?></button><?php endif; ?></form>
<?php endif; ?></section></main><script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
<footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
</body></html>
