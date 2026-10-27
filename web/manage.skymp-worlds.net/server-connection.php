<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_once __DIR__ . '/includes/game-auth.php';
require_login();
$user = current_user();
$serverId = (string) ($_GET['server'] ?? $_POST['server_id'] ?? '');
$server = ga_server($serverId);
if ($server === null || $server['owner_id'] !== $user['id']) { http_response_code(404); exit('Server nicht gefunden.'); }
$message = '';
if (is_post_request()) {
    verify_csrf_or_abort();
    try {
        $resource = ga_file_url((string) ($_POST['resource_url'] ?? ''));
        $runtime = trim((string) ($_POST['runtime_url'] ?? ''));
        if ($runtime !== '') { $runtime = ga_file_url($runtime, true); }
        $profile = ga_profile($_POST);
        ga_transaction(static function (array &$state) use ($serverId, $resource, $runtime, $profile): void {
            $state['connections'][$serverId] = ['resourceUrl' => $resource, 'runtimeSource' => $runtime, ...$profile];
            unset($state['heartbeats'][$serverId]);
        });
        $message = 'Verbindungsdaten gespeichert. Nach dem nächsten Server-Heartbeat erscheint der Eintrag in der Liste.';
    } catch (GameAuthError $error) { http_response_code($error->status); $message = $error->getMessage(); }
}
$connection = ga_transaction(static fn(array &$state): array => ga_connection($state, $server));
$heartbeat = ga_owner_heartbeat_statuses([$server])[0];
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
?>
<!doctype html><html lang="<?= e(current_language()) ?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SkyMP Worlds | Server verbinden</title><link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>"></head>
<body class="site-shell"><main class="site-layout"><header class="site-header panel"><a class="brand-link" href="<?= e(app_url('dashboard.php')) ?>">SkyMP <span>Worlds</span></a><a class="button button-secondary" href="<?= e(app_url('dashboard.php')) ?>">Zum Dashboard</a></header>
<section class="hero-panel panel"><p class="eyebrow">Launcher &amp; Serverprofil</p><h1><?= e($heartbeat['name']) ?></h1><p>Hinterlege die Downloads und stelle deine Community im Launcher vor.</p>
<?php if ($message !== ''): ?><p role="status"><?= e($message) ?></p><?php endif; ?>
<div class="inline-note"><strong><?= e(t('field_launcher_visibility')) ?></strong><span data-heartbeat-status="<?= e($heartbeat['heartbeat_status']) ?>"><?= e(t('heartbeat_' . $heartbeat['heartbeat_status'])) ?></span><span><?= e(t('field_last_heartbeat')) ?>: <?= e(format_timestamp($heartbeat['last_heartbeat'])) ?></span></div>
<form method="post" class="form-grid"><input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>"><input type="hidden" name="server_id" value="<?= e($serverId) ?>">
<label class="field"><span>Dateiserver (HTTP/HTTPS)</span><input name="resource_url" type="url" required value="<?= e($connection['resourceUrl']) ?>"></label>
<label class="field"><span>Clientpaket oder Versionskatalog</span><input name="runtime_url" type="url" aria-describedby="runtime-hint" placeholder="https://dein-dateihost/client-runtime/catalog.json" value="<?= e($connection['runtimeSource']) ?>"><small id="runtime-hint">Ein Versionskatalog stellt automatisch das passende Clientpaket mit SKSE und Address Library für die Skyrim-Version des Spielers bereit.</small></label>
<fieldset class="public-server-fields"><legend>Öffentliches Serverprofil</legend>
<p>Diese Angaben erscheinen in der Serversuche und auf der Detailseite. Alle Felder sind optional.</p>
<label class="field"><span>Beschreibung</span><textarea name="description" aria-label="Beschreibung" maxlength="2000" rows="5"><?= e($connection['description']) ?></textarea></label>
<label class="field"><span>Tags</span><input name="tags" aria-label="Tags" aria-describedby="tags-hint" maxlength="300" placeholder="Roleplay, Deutsch, Abenteuer" value="<?= e(implode(', ', $connection['tags'])) ?>"><small id="tags-hint">Bis zu acht Tags mit jeweils höchstens 32 Zeichen, durch Kommas getrennt.</small></label>
<label class="field"><span>Community-Webseite</span><input name="website" type="url" maxlength="2048" placeholder="https://deine-community.de" value="<?= e($connection['website']) ?>"></label>
<label class="field"><span>Discord-Einladung</span><input name="discord_url" type="url" maxlength="2048" placeholder="https://discord.gg/…" value="<?= e($connection['discordUrl']) ?>"></label>
<p class="inline-note" data-server-images="automatic"><?php
$imageHelp = [
    'de' => 'Logo und Banner kommen automatisch vom Spielserver. Lege logo.png (quadratisch) und banner.png (empfohlen 6:1) neben die server-settings.json. Änderungen werden mit dem nächsten Heartbeat erkannt. Maximal 8 MiB je PNG; ohne Bild wird die Standardansicht verwendet.',
    'en' => 'Logo and banner are read automatically from the game server. Place logo.png (square) and banner.png (recommended 6:1) next to server-settings.json. Changes are detected with the next heartbeat. Maximum 8 MiB per PNG; missing images use the default view.',
    'ru' => 'Логотип и баннер автоматически загружаются с игрового сервера. Поместите logo.png (квадрат) и banner.png (рекомендуется 6:1) рядом с server-settings.json. Изменения определяются при следующем heartbeat. Максимум 8 МиБ на PNG; при отсутствии изображения используется стандартный вид.',
];
echo e($imageHelp[current_language()]);
?></p>
</fieldset><button class="button button-primary" type="submit">Verbindungsdaten speichern</button></form>
<h2><?= e(t('connection_title')) ?></h2><p><?= e(t('connection_intro')) ?></p>
<div class="connection-values">
<label class="field"><span><?= e(t('connection_master')) ?></span><input readonly value="<?= e(ga_master_url()) ?>"></label>
<label class="field"><span><?= e(t('connection_uid')) ?></span><input readonly value="<?= e($server['id']) ?>"></label>
<label class="field"><span><?= e(t('connection_key')) ?></span><input type="password" readonly autocomplete="off" value="<?= e($server['api_key']) ?>"></label>
<label class="field"><span><?= e(t('connection_mode')) ?></span><input readonly value="<?= e(t('connection_online')) ?>"></label>
<label class="field"><span><?= e(t('connection_host')) ?></span><input readonly value="<?= e($server['ip']) ?>"></label>
<label class="field"><span><?= e(t('connection_port')) ?></span><input readonly value="<?= e((string) $server['port']) ?>"></label>
</div><p><?= e(t('connection_hint')) ?></p></section></main><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body></html>
