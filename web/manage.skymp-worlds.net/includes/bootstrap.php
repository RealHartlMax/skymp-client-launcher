<?php
header('Content-Type: text/html; charset=utf-8');
ini_set('default_charset', 'UTF-8');
$configFile = dirname(__DIR__) . '/config.php';

if (is_file($configFile)) {
    require_once $configFile;
}

require_once __DIR__ . '/i18n.php';

defined('MANAGE_APP_NAME') || define('MANAGE_APP_NAME', 'SkyMP Worlds Control');
defined('MANAGE_PUBLIC_URL') || define('MANAGE_PUBLIC_URL', '');
defined('MANAGE_BASE_PATH') || define('MANAGE_BASE_PATH', '');
defined('MANAGE_SESSION_NAME') || define('MANAGE_SESSION_NAME', 'skymp_manage_session');
defined('MANAGE_STORAGE_FILE') || define('MANAGE_STORAGE_FILE', dirname(__DIR__) . '/storage/state.json');
defined('MANAGE_DEMO_LOGIN_ENABLED') || define('MANAGE_DEMO_LOGIN_ENABLED', false);
defined('MANAGE_MAX_SERVERS_PER_USER') || define('MANAGE_MAX_SERVERS_PER_USER', 2);
defined('MANAGE_PUBLIC_SERVER_BROWSER_URL') || define('MANAGE_PUBLIC_SERVER_BROWSER_URL', 'https://servers.skymp-worlds.net/');
defined('MANAGE_API_HEARTBEAT_URL') || define('MANAGE_API_HEARTBEAT_URL', 'https://api.skymp-worlds.net/heartbeat.php');
defined('MANAGE_API_SERVER_LIST_URL') || define('MANAGE_API_SERVER_LIST_URL', 'https://api.skymp-worlds.net/list.php');
defined('MANAGE_SYNC_REGISTRY_ON_SAVE') || define('MANAGE_SYNC_REGISTRY_ON_SAVE', false);
defined('MANAGE_HEARTBEAT_REGISTRATION_TOKEN') || define('MANAGE_HEARTBEAT_REGISTRATION_TOKEN', '');
defined('MANAGE_DISCORD_CLIENT_ID') || define('MANAGE_DISCORD_CLIENT_ID', '1496895150322876555');
defined('MANAGE_DISCORD_CLIENT_SECRET') || define('MANAGE_DISCORD_CLIENT_SECRET', '');
defined('MANAGE_DISCORD_REDIRECT_URI') || define('MANAGE_DISCORD_REDIRECT_URI', 'https://manage.skymp-worlds.net/oauth/discord-callback.php');
defined('MANAGE_DB_ENABLED') || define('MANAGE_DB_ENABLED', false);
defined('MANAGE_DB_HOST') || define('MANAGE_DB_HOST', '');
defined('MANAGE_DB_PORT') || define('MANAGE_DB_PORT', 3306);
defined('MANAGE_DB_NAME') || define('MANAGE_DB_NAME', '');
defined('MANAGE_DB_USER') || define('MANAGE_DB_USER', '');
defined('MANAGE_DB_PASSWORD') || define('MANAGE_DB_PASSWORD', '');
defined('MANAGE_DB_CHARSET') || define('MANAGE_DB_CHARSET', 'utf8mb4');
defined('MANAGE_EMAIL_REGISTRATION_ENABLED') || define('MANAGE_EMAIL_REGISTRATION_ENABLED', true);
defined('MANAGE_EMAIL_VERIFICATION_REQUIRED') || define('MANAGE_EMAIL_VERIFICATION_REQUIRED', false);
defined('MANAGE_MAILER_DRIVER') || define('MANAGE_MAILER_DRIVER', 'smtp');
defined('MANAGE_SMTP_HOST') || define('MANAGE_SMTP_HOST', '');
defined('MANAGE_SMTP_PORT') || define('MANAGE_SMTP_PORT', 587);
defined('MANAGE_SMTP_ENCRYPTION') || define('MANAGE_SMTP_ENCRYPTION', 'tls');
defined('MANAGE_SMTP_USERNAME') || define('MANAGE_SMTP_USERNAME', '');
defined('MANAGE_SMTP_PASSWORD') || define('MANAGE_SMTP_PASSWORD', '');
defined('MANAGE_MAIL_FROM_ADDRESS') || define('MANAGE_MAIL_FROM_ADDRESS', '');
defined('MANAGE_MAIL_FROM_NAME') || define('MANAGE_MAIL_FROM_NAME', MANAGE_APP_NAME);
defined('MANAGE_MAIL_REPLY_TO') || define('MANAGE_MAIL_REPLY_TO', '');

if (session_status() === PHP_SESSION_NONE) {
    session_name(MANAGE_SESSION_NAME);
    session_start([
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
        'cookie_secure' => str_starts_with((string) MANAGE_PUBLIC_URL, 'https://') || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'use_strict_mode' => true,
    ]);
}

// Resolve language cookies before a template starts emitting HTML.
current_language();

require_once __DIR__ . '/storage.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

$vendorAutoload = dirname(__DIR__) . '/vendor/autoload.php';
if (is_file($vendorAutoload)) {
    require_once $vendorAutoload;
} else {
    // Fallback for manual PHPMailer deployments without Composer.
    $phpMailerSrc = dirname(__DIR__) . '/PHPMailer/src';
    $phpMailerFiles = [
        $phpMailerSrc . '/Exception.php',
        $phpMailerSrc . '/PHPMailer.php',
        $phpMailerSrc . '/SMTP.php',
    ];

    foreach ($phpMailerFiles as $phpMailerFile) {
        if (is_file($phpMailerFile)) {
            require_once $phpMailerFile;
        }
    }
}

require_once __DIR__ . '/mailer.php';
require_once __DIR__ . '/password-reset.php';

function app_url(string $path = ''): string
{
    $normalizedBase = trim((string) MANAGE_BASE_PATH);
    $normalizedBase = $normalizedBase === '/' ? '' : rtrim($normalizedBase, '/');
    $normalizedPath = ltrim($path, '/');

    if ($normalizedPath === '') {
        return $normalizedBase === '' ? '/' : $normalizedBase . '/';
    }

    return ($normalizedBase === '' ? '' : $normalizedBase) . '/' . $normalizedPath;
}

function app_absolute_url(string $path = ''): string
{
    $base = trim((string) MANAGE_PUBLIC_URL);
    $relative = app_url($path);

    if ($base === '') {
        return $relative;
    }

    return rtrim($base, '/') . '/' . ltrim($relative, '/');
}

function redirect_to(string $path): void
{
    header('Location: ' . app_url($path));
    exit;
}

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function is_post_request(): bool
{
    return strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'POST';
}

function set_flash(string $type, string $message): void
{
    $_SESSION['manage_flash'] = [
        'type' => $type,
        'message' => $message,
    ];
}

function consume_flash(): ?array
{
    if (!isset($_SESSION['manage_flash'])) {
        return null;
    }

    $flash = $_SESSION['manage_flash'];
    unset($_SESSION['manage_flash']);

    return is_array($flash) ? $flash : null;
}

function format_timestamp(?string $value): string
{
    if ($value === null || trim($value) === '') {
        return t('not_yet_available');
    }

    try {
        return (new DateTimeImmutable($value))->format('Y-m-d H:i');
    } catch (Throwable $throwable) {
        return $value;
    }
}

function mask_secret(?string $value, int $visible = 4): string
{
    $value = (string) $value;

    if ($value === '') {
        return 'revoked';
    }

    $length = strlen($value);

    if ($length <= $visible * 2) {
        return str_repeat('*', max($length, 8));
    }

    return substr($value, 0, $visible) . str_repeat('*', max($length - ($visible * 2), 8)) . substr($value, -$visible);
}

function max_servers_per_user(): int
{
    $limit = (int) MANAGE_MAX_SERVERS_PER_USER;

    return $limit > 0 ? $limit : 1;
}
