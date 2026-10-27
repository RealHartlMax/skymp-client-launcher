<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/game-auth.php';
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('Content-Security-Policy: default-src \'none\'; script-src \'self\'; style-src \'self\'; font-src \'self\'; img-src \'self\' data:; form-action \'self\'; base-uri \'none\'; frame-ancestors \'none\'');
$rawState = (string) ($_GET['state'] ?? $_POST['state'] ?? '');
$message = '';
$approved = false;
$validState = false;
try {
    ga_state($rawState);
    $validState = true;
    if (!is_post_request()) { ga_begin($rawState); }
    if (is_post_request()) {
        verify_csrf_or_abort();
        $user = current_user();
        if (($_POST['action'] ?? '') === 'login') {
            ga_limit('password-login', 20);
            $result = attempt_password_login((string) ($_POST['login_name'] ?? ''), (string) ($_POST['password'] ?? ''));
            if (!($result['ok'] ?? false)) { throw new GameAuthError(401, 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten und gegebenenfalls E-Mail-Bestätigung prüfen.'); }
            $user = current_user();
        } elseif (($_POST['action'] ?? '') === 'approve') {
            if ($user === null) { throw new GameAuthError(401, 'Bitte zuerst anmelden.'); }
            ga_approve($rawState, $user);
            $approved = true;
        } else { throw new GameAuthError(400, 'Ungültige Anfrage.'); }
    }
} catch (GameAuthError $error) {
    http_response_code($error->status);
    $message = $error->getMessage();
} catch (Throwable $error) {
    http_response_code(503);
    $message = 'Die Spielanmeldung ist nicht verfügbar. Bitte den privaten Auth-Speicher und PHP-OpenSSL prüfen.';
}
$user = current_user();
?>
<!doctype html>
<html lang="<?= e(current_language()) ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SkyMP Worlds | Spielanmeldung</title><link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>"></head>
<body class="site-shell"><main class="site-layout"><header class="site-header panel"><a class="brand-link" href="https://skymp-worlds.net/">SkyMP <span>Worlds</span></a><a class="button button-secondary" href="<?= e(app_url('dashboard.php')) ?>">Mein Konto</a></header>
<section class="hero-panel panel"><p class="eyebrow">Zurück nach Himmelsrand</p><h1><?= $approved ? 'Spielanmeldung bestätigt.' : 'Mit deinem Konto spielen.' ?></h1>
<?php if ($message !== ''): ?><p role="alert"><?= e($message) ?></p><?php endif; ?>
<?php if ($approved): ?><p>Du kannst dieses Fenster schließen und zum gestarteten Spiel zurückkehren.</p>
<?php elseif ($validState && $user !== null): ?>
<p>Angemeldet als <strong><?= e($user['display_name'] ?? $user['login_name']) ?></strong>. Bestätige die Anmeldung für das Spiel, das du gerade gestartet hast.</p>
<form method="post"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="state" value="<?= e($rawState) ?>"><input type="hidden" name="action" value="approve"><button class="button button-primary" type="submit">Spielanmeldung bestätigen</button></form>
<?php elseif ($validState): ?>
<p>Verwende dasselbe Konto wie im SkyMP-Worlds-Dashboard.</p><form method="post" class="form-grid">
<input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="state" value="<?= e($rawState) ?>"><input type="hidden" name="action" value="login">
<label class="field"><span>Benutzername oder E-Mail</span><input name="login_name" autocomplete="username" required maxlength="254"></label>
<label class="field"><span>Passwort</span><input name="password" type="password" autocomplete="current-password" required maxlength="256"></label>
<a href="<?= e(app_url('forgot-password.php')) ?>" target="_blank" rel="noreferrer"><?= e(t('forgot_title')) ?></a>
<button class="button button-primary" type="submit">Anmelden</button></form><p><a href="<?= e(app_url('register.php')) ?>" target="_blank" rel="noreferrer">Konto erstellen</a> · Nach der Registrierung hier anmelden.</p>
<?php endif; ?></section></main><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body></html>
