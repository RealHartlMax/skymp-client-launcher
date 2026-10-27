<?php
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow, noarchive');
header('X-Frame-Options: DENY');
ini_set('default_charset', 'UTF-8');
if (is_file(dirname(__DIR__).'/config.php')) { require_once dirname(__DIR__).'/config.php'; }
defined('DEV_PUBLIC_URL') || define('DEV_PUBLIC_URL', 'https://dev.skymp-worlds.net');
defined('DEV_MANAGE_PUBLIC_URL') || define('DEV_MANAGE_PUBLIC_URL', 'https://manage.skymp-worlds.net');
defined('DEV_SESSION_NAME') || define('DEV_SESSION_NAME', 'skymp_dev_session');
if (session_status() === PHP_SESSION_NONE) {
    session_name(DEV_SESSION_NAME);
    session_start(['cookie_httponly'=>true, 'cookie_samesite'=>'Lax', 'cookie_secure'=>str_starts_with(DEV_PUBLIC_URL, 'https://'), 'cookie_path'=>'/', 'use_strict_mode'=>true]);
}
require_once __DIR__.'/i18n.php';
require_once __DIR__.'/developer-sso.php';
current_language();
function e(?string $value): string { return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function app_url(string $path = ''): string { return '/'.ltrim($path, '/'); }
function dev_manage_url(string $path = ''): string { return ds_origin(DEV_MANAGE_PUBLIC_URL).'/'.ltrim($path, '/'); }
function redirect_to(string $path): void { header('Location: '.app_url($path), true, 303); exit; }
function is_post_request(): bool { return ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST'; }
function csrf_token(): string { return $_SESSION['dev_csrf'] ??= bin2hex(random_bytes(32)); }
function verify_csrf_or_abort(): void
{
    if (!is_string($_POST['csrf_token'] ?? null) || !hash_equals(csrf_token(), $_POST['csrf_token'])) { http_response_code(403); exit('CSRF validation failed.'); }
}
function current_user(): ?array
{
    $user = $_SESSION['dev_user'] ?? null;
    if (!is_array($user) || !is_int($_SESSION['dev_expires'] ?? null) || $_SESSION['dev_expires'] <= time()) {
        unset($_SESSION['dev_user'], $_SESSION['dev_expires']); return null;
    }
    return $user;
}
function require_login(): void { if (current_user() === null) { redirect_to('login.php'); } }
function set_flash(string $type, string $message): void { $_SESSION['dev_flash'] = ['type'=>$type, 'message'=>$message]; }
function consume_flash(): ?array { $flash = $_SESSION['dev_flash'] ?? null; unset($_SESSION['dev_flash']); return $flash; }
