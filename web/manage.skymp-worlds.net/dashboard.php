<?php
require_once __DIR__ . '/includes/bootstrap.php';
require_login();
require_once __DIR__ . '/includes/game-auth.php';
require_once __DIR__ . '/includes/crash-reports.php';
require_once __DIR__ . '/includes/crash-translations.php';
require_once __DIR__ . '/includes/discord-oauth.php';

$state = load_state();
$user = current_user();
$servers = ga_owner_heartbeat_statuses(servers_for_owner($state, $user['id']));
$editingServerId = trim((string) ($_GET['edit'] ?? ''));
$editingServer = $editingServerId !== '' ? find_server_by_id($state, $editingServerId) : null;
$editingServer = ($editingServer !== null && ($editingServer['owner_id'] ?? '') === $user['id']) ? $editingServer : null;
if ($editingServer !== null) { $editingServer = ga_owner_heartbeat_statuses([$editingServer])[0]; }
$flash = consume_flash();

$serverCount = count($servers);
$serverLimit = max_servers_per_user();
$canCreateServer = $editingServer !== null || $serverCount < $serverLimit;
$activeCount = count(array_filter($servers, static fn(array $server): bool => ($server['status'] ?? 'draft') === 'active'));
$keyedCount = count(array_filter($servers, static fn(array $server): bool => !empty($server['api_key'])));
$lastUpdated = null;

foreach ($servers as $server) {
    $updatedAt = $server['updated_at'] ?? null;
    if ($updatedAt !== null && ($lastUpdated === null || strcmp($updatedAt, $lastUpdated) > 0)) {
        $lastUpdated = $updatedAt;
    }
}

$statusMap = [
    'active' => 'status-active',
    'maintenance' => 'status-maintenance',
    'draft' => 'status-draft',
];

$countryOptions = [
    'DE' => 'Germany',
    'AT' => 'Austria',
    'CH' => 'Switzerland',
    'FR' => 'France',
    'ES' => 'Spain',
    'IT' => 'Italy',
    'NL' => 'Netherlands',
    'BE' => 'Belgium',
    'PL' => 'Poland',
    'CZ' => 'Czechia',
    'SE' => 'Sweden',
    'NO' => 'Norway',
    'FI' => 'Finland',
    'DK' => 'Denmark',
    'GB' => 'United Kingdom',
    'IE' => 'Ireland',
    'US' => 'United States',
    'CA' => 'Canada',
    'BR' => 'Brazil',
    'AR' => 'Argentina',
    'AU' => 'Australia',
    'NZ' => 'New Zealand',
    'JP' => 'Japan',
    'KR' => 'South Korea',
    'CN' => 'China',
    'IN' => 'India',
    'TR' => 'Turkey',
    'RU' => 'Russia',
    'UA' => 'Ukraine',
    'KZ' => 'Kazakhstan',
];

$selectedCountryCode = strtoupper(trim((string) ($editingServer['country_code'] ?? '')));
if ($selectedCountryCode !== '' && !isset($countryOptions[$selectedCountryCode])) {
    $countryOptions[$selectedCountryCode] = $selectedCountryCode;
}

ksort($countryOptions);
?>
<!DOCTYPE html>
<html lang="<?= e(current_language()) ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= e(MANAGE_APP_NAME) ?> | <?= e(t('title_dashboard')) ?></title>
    
    
    
    
    <link rel="stylesheet" href="<?= e(app_url('assets/worlds.css?v=8de9376aef2a')) ?>">
</head>
<body class="dashboard-shell">
    <div class="ambient ambient-one"></div>
    <div class="ambient ambient-two"></div>

    <header class="topbar panel">
        <div>
            <p class="eyebrow"><?= e(t('hall_name')) ?></p>
            <h1><?= e(t('dashboard_heading')) ?></h1>
        </div>

        <div class="topbar-actions">
            <a class="button button-secondary" href="<?= e(app_url('account.php')) ?>"><?=e(do_t('title'))?></a>
            <?php if (cr_is_admin(current_user())): ?><a class="button button-secondary" href="<?= e(app_url('crash-reports.php')) ?>"><?= e(cr_t('title')) ?></a><?php endif; ?>
                <a class="button button-ghost docs-link" data-platform-downloads="navigation" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a>
                <a class="button button-ghost docs-link" data-platform-docs="navigation" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a>
                <a class="button button-ghost community-link" data-platform-community="navigation" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a>
            <div class="language-bar compact">
                <label class="language-label" for="lang-switch-dashboard"><?= e(t('lang_label')) ?></label>
                <select id="lang-switch-dashboard" class="language-select">
                    <?php foreach (available_languages() as $languageCode => $languageName): ?>
                        <option value="<?= e($languageCode) ?>" <?= current_language() === $languageCode ? 'selected' : '' ?>><?= e($languageName) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="identity-chip">
                <span class="identity-name"><?= e($user['display_name'] ?? $user['login_name']) ?></span>
                <span class="identity-meta"><?= e($user['email'] ?? '-') ?></span>
            </div>

            <a class="button button-secondary" href="<?= e(MANAGE_PUBLIC_SERVER_BROWSER_URL) ?>" target="_blank" rel="noreferrer"><?= e(t('view_public_chronicle')) ?></a>

            <form method="post" action="<?= e(app_url('logout.php')) ?>">
                <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                <button class="button button-tertiary" type="submit"><?= e(t('leave_hall')) ?></button>
            </form>
        </div>
    </header>

    <?php if ($flash): ?>
        <div class="flash-stack">
            <div class="flash flash-<?= e($flash['type']) ?>">
                <?= e($flash['message']) ?>
            </div>
        </div>
    <?php endif; ?>

    <section class="hero-grid">
        <article class="panel stat-card">
            <p class="eyebrow"><?= e(t('stat_realms')) ?></p>
            <strong><?= e((string) $serverCount) ?> / <?= e((string) $serverLimit) ?></strong>
            <span><?= e(t('stat_realms_desc')) ?></span>
        </article>

        <article class="panel stat-card">
            <p class="eyebrow"><?= e(t('stat_awake')) ?></p>
            <strong><?= e((string) $activeCount) ?></strong>
            <span><?= e(t('stat_awake_desc')) ?></span>
        </article>

        <article class="panel stat-card">
            <p class="eyebrow"><?= e(t('stat_sigil_keys')) ?></p>
            <strong><?= e((string) $keyedCount) ?></strong>
            <span><?= e(t('stat_sigil_keys_desc')) ?></span>
        </article>

        <article class="panel stat-card">
            <p class="eyebrow"><?= e(t('stat_last_chronicle')) ?></p>
            <strong><?= e(format_timestamp($lastUpdated)) ?></strong>
            <span><?= e(t('stat_last_chronicle_desc')) ?></span>
        </article>
    </section>

    <main class="dashboard-grid">
        <section class="panel">
            <div class="panel-header row-between">
                <div>
                    <p class="eyebrow"><?= e(t('realm_ledger')) ?></p>
                    <h2><?= e(t('registered_realms')) ?></h2>
                </div>
                <?php if ($serverCount < $serverLimit): ?>
                    <a class="button button-secondary" href="<?= e(app_url('dashboard.php')) ?>"><?= e(t('claim_new_realm')) ?></a>
                <?php else: ?>
                    <span class="button button-secondary is-disabled"><?= e(t('hall_full')) ?></span>
                <?php endif; ?>
            </div>

            <?php if ($servers === []): ?>
                <div class="empty-state">
                    <h3><?= e(t('no_realms_title')) ?></h3>
                    <p><?= e(t('no_realms_desc')) ?></p>
                </div>
            <?php else: ?>
                <div class="server-stack">
                    <?php foreach ($servers as $server): ?>
                        <?php
                        $status = $server['status'] ?? 'draft';
                        $statusClass = $statusMap[$status] ?? 'status-draft';
                        $isEditing = $editingServer && $editingServer['id'] === $server['id'];
                        $copyLabel = t('button_copy');
                        ?>
                        <article class="server-card <?= $isEditing ? 'server-card-active' : '' ?>">
                            <div class="row-between">
                                <div>
                                    <div class="server-title-row">
                                        <h3><?= e($server['name']) ?></h3>
                                        <span class="status-pill <?= e($statusClass) ?>"><?= e(t('status_' . $status)) ?></span>
                                    </div>
                                    <p class="mono-text"><?= e($server['ip']) ?>:<?= e((string) $server['port']) ?></p>
                                </div>
                                <a class="button button-ghost" href="<?= e(app_url('dashboard.php') . '?edit=' . rawurlencode($server['id'])) ?>"><?= e(t('shape_realm')) ?></a>
                            </div>

                            <dl class="meta-grid">
                                <div>
                                    <dt><?= e(t('field_country_code')) ?></dt>
                                    <dd><?php
                                    $country = strtoupper(trim((string) ($server['country_code'] ?? '')));
                                    $countryLabel = $countryOptions[$country] ?? t('unspecified');
                                    if (preg_match('/^[A-Z]{2}$/D', $country) && is_file(__DIR__ . '/assets/flags/' . strtolower($country) . '.svg')): ?>
                                        <span class="country-label" title="<?= e($countryLabel) ?>"><img class="country-flag" src="<?= e(app_url('assets/flags/' . strtolower($country) . '.svg')) ?>" alt="<?= e($countryLabel) ?>"></span>
                                    <?php else: ?>—<?php endif; ?></dd>
                                </div>
                                <div>
                                    <dt><?= e(t('field_gamemode')) ?></dt>
                                    <dd><?= e($server['gamemode'] ?: t('unspecified')) ?></dd>
                                </div>
                                <div>
                                    <dt><?= e(t('field_players')) ?></dt>
                                    <dd><?= e((string) ($server['current_players'] ?? 0)) ?> / <?= e((string) ($server['heartbeat_capacity'] ?? $server['max_players'])) ?></dd>
                                </div>
                                <div>
                                    <dt><?= e(t('field_last_heartbeat')) ?></dt>
                                    <dd><?= e(format_timestamp($server['last_heartbeat'] ?? null)) ?></dd>
                                </div>
                                <div>
                                    <dt><?= e(t('field_launcher_visibility')) ?></dt>
                                    <dd data-heartbeat-server="<?= e($server['id']) ?>" data-heartbeat-status="<?= e($server['heartbeat_status']) ?>"><?= e(t('heartbeat_' . $server['heartbeat_status'])) ?></dd>
                                </div>
                                <div>
                                    <dt><?= e(t('field_updated')) ?></dt>
                                    <dd><?= e(format_timestamp($server['updated_at'] ?? null)) ?></dd>
                                </div>
                            </dl>

                            <div class="key-box">
                                <div>
                                    <span class="key-label"><?= e(t('sigil_key')) ?></span>
                                    <code><?= e(mask_secret($server['api_key'] ?? null)) ?></code>
                                </div>
                                <?php if (!empty($server['api_key'])): ?>
                                    <button
                                        class="button button-ghost"
                                        type="button"
                                        data-copy="<?= e($server['api_key']) ?>"
                                        data-copy-label="<?= e($copyLabel) ?>"
                                        data-copy-success="<?= e(t('button_copied')) ?>"
                                        data-copy-failure="<?= e(t('button_copy_failed')) ?>"
                                    ><?= e($copyLabel) ?></button>
                                <?php else: ?>
                                    <span class="muted"><?= e(t('revoked')) ?></span>
                                <?php endif; ?>
                            </div>

                            <?php if (!empty($server['notes'])): ?>
                                <p class="notes-copy"><?= e($server['notes']) ?></p>
                            <?php endif; ?>

                            <div class="action-row">
                                <?php if (!empty($server['api_key'])): ?><a class="button button-primary" href="<?= e(app_url('server-connection.php') . '?server=' . rawurlencode($server['id'])) ?>">Launcher &amp; Online-Anmeldung</a><?php endif; ?>
                                <form method="post" action="<?= e(app_url('api-key-rotate.php')) ?>">
                                    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                                    <input type="hidden" name="server_id" value="<?= e($server['id']) ?>">
                                    <button class="button button-secondary" type="submit"><?= e(t('button_reforge_key')) ?></button>
                                </form>

                                <form method="post" action="<?= e(app_url('api-key-revoke.php')) ?>" data-confirm="<?= e(t('confirm_break_sigil', ['name' => $server['name']])) ?>">
                                    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                                    <input type="hidden" name="server_id" value="<?= e($server['id']) ?>">
                                    <button class="button button-tertiary" type="submit"><?= e(t('button_break_sigil')) ?></button>
                                </form>

                                <form method="post" action="<?= e(app_url('server-delete.php')) ?>" data-confirm="<?= e(t('confirm_strike_ledger', ['name' => $server['name']])) ?>">
                                    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                                    <input type="hidden" name="server_id" value="<?= e($server['id']) ?>">
                                    <button class="button button-danger" type="submit"><?= e(t('button_strike_ledger')) ?></button>
                                </form>
                            </div>
                        </article>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </section>

        <aside class="form-column">
            <section class="panel">
                <div class="panel-header">
                    <p class="eyebrow"><?= e($editingServer ? t('panel_shape_realm') : t('panel_claim_realm')) ?></p>
                    <h2><?= $editingServer ? e($editingServer['name']) : e(t('panel_new_realm')) ?></h2>
                    <p><?= e(t('panel_marks_lineup')) ?></p>
                </div>

                <?php if (!$canCreateServer): ?>
                    <div class="limit-note">
                        <?= e(t('limit_note', ['count' => $serverLimit])) ?>
                    </div>
                <?php endif; ?>

                <form method="post" action="<?= e(app_url('server-save.php')) ?>" class="form-grid">
                    <input type="hidden" name="csrf_token" value="<?= e(csrf_token()) ?>">
                    <input type="hidden" name="server_id" value="<?= e($editingServer['id'] ?? '') ?>">

                    <label class="field">
                        <span><?= e(t('server_name')) ?></span>
                        <output data-server-metadata="name"><?= e($editingServer['name'] ?? t('server_metadata_pending')) ?></output>
                        <small><?= e(t('server_managed_fields_hint')) ?></small>
                    </label>

                    <div class="split-fields">
                        <label class="field">
                            <span><?= e(t('ip_or_hostname')) ?></span>
                            <input type="text" name="ip" maxlength="255" value="<?= e($editingServer['ip'] ?? '') ?>" placeholder="<?= e(t('placeholder_ip')) ?>" required <?= !$canCreateServer ? 'disabled' : '' ?>>
                        </label>

                        <label class="field">
                            <span><?= e(t('port')) ?></span>
                            <input type="number" name="port" min="1" max="65535" value="<?= e((string) ($editingServer['port'] ?? 7777)) ?>" required <?= !$canCreateServer ? 'disabled' : '' ?>>
                        </label>
                    </div>

                    <div class="split-fields">
                        <label class="field">
                            <span><?= e(t('max_players')) ?></span>
                            <output data-server-metadata="capacity"><?= (int) ($editingServer['max_players'] ?? 0) > 0 ? e((string) $editingServer['max_players']) : '—' ?></output>
                        </label>

                        <label class="field">
                            <span><?= e(t('status')) ?></span>
                            <select name="status" <?= !$canCreateServer ? 'disabled' : '' ?>>
                                <?php foreach (['active', 'maintenance', 'draft'] as $statusOption): ?>
                                    <option value="<?= e($statusOption) ?>" <?= (($editingServer['status'] ?? 'active') === $statusOption) ? 'selected' : '' ?>>
                                        <?= e(t('status_' . $statusOption)) ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </label>
                    </div>

                    <label class="field">
                        <span><?= e(t('field_gamemode')) ?></span>
                        <input type="text" name="gamemode" maxlength="100" value="<?= e($editingServer['gamemode'] ?? '') ?>" placeholder="<?= e(t('placeholder_gamemode')) ?>" <?= !$canCreateServer ? 'disabled' : '' ?>>
                    </label>

                    <label class="field">
                        <span><?= e(t('field_country_code')) ?></span>
                        <input
                            type="text"
                            class="country-search-input"
                            data-country-search="country-code-select"
                            placeholder="<?= e(t('country_code_search_placeholder')) ?>"
                            autocomplete="off"
                            <?= !$canCreateServer ? 'disabled' : '' ?>
                        >
                        <select id="country-code-select" name="country_code" required <?= !$canCreateServer ? 'disabled' : '' ?>>
                            <option value="" <?= $selectedCountryCode === '' ? 'selected' : '' ?>><?= e(t('country_code_select_default')) ?></option>
                            <?php foreach ($countryOptions as $countryCode => $countryName): ?>
                                <option value="<?= e($countryCode) ?>" <?= $selectedCountryCode === $countryCode ? 'selected' : '' ?>>
                                    <?= e($countryCode . ' - ' . $countryName) ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </label>

                    <label class="field">
                        <span><?= e(t('operations_notes')) ?></span>
                        <textarea name="notes" rows="4" maxlength="1000" placeholder="<?= e(t('placeholder_notes')) ?>" <?= !$canCreateServer ? 'disabled' : '' ?>><?= e($editingServer['notes'] ?? '') ?></textarea>
                    </label>

                    <button class="button button-primary" type="submit" <?= !$canCreateServer ? 'disabled' : '' ?>>
                        <?= e($editingServer ? t('button_seal_changes') : t('button_claim_and_forge')) ?>
                    </button>
                </form>
            </section>

            <section class="panel">
                <div class="panel-header">
                    <p class="eyebrow"><?= e(t('keepers_notes')) ?></p>
                    <h2><?= e(t('hall_governs')) ?></h2>
                </div>

                <ul class="checklist">
                    <li><?= e(t('hall_governs_1')) ?></li>
                    <li><?= e(t('hall_governs_2')) ?></li>
                    <li><?= e(t('hall_governs_3')) ?></li>
                    <li><?= e(t('hall_governs_4')) ?></li>
                    <li><?= e(t('hall_governs_5')) ?></li>
                </ul>

                <div class="integration-box">
                    <p><strong><?= e(t('heartbeat_gate')) ?></strong></p>
                    <code><?= e(ga_master_url() . '/api/servers/<masterKey>') ?></code>
                </div>
                <div class="integration-box">
                    <p><strong><?= e(t('public_chronicle')) ?></strong></p>
                    <code><?= e(MANAGE_API_SERVER_LIST_URL) ?></code>
                </div>
            </section>
        </aside>
    </main>

    <script src="<?= e(app_url('assets/app.js')) ?>" defer></script>
<footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body>
</html>
