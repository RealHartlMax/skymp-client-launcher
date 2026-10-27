<?php
require_once __DIR__ . '/game-auth.php';

const PASSWORD_RESET_LIFETIME = 1800;

function password_reset_user(array $entry): ?array
{
    if (manage_db_is_enabled() && !manage_db_available()) { throw new RuntimeException('Account database unavailable.'); }
    $user = manage_db_available() ? find_db_user_by_id((string) $entry['user']) : find_user_by_id(load_state(), (string) $entry['user']);
    if ($user === null || ($user['provider'] ?? '') === 'demo' || ($entry['expires'] ?? 0) <= time()
        || !hash_equals((string) ($entry['credential'] ?? ''), auth_credential_version($user))
        || !hash_equals((string) ($entry['email'] ?? ''), hash('sha256', normalize_email((string) ($user['email'] ?? ''))))) { return null; }
    return $user;
}

function password_reset_mail_ready(): bool
{
    $url = parse_url((string) MANAGE_PUBLIC_URL);
    return mailer_is_ready() && class_exists(\PHPMailer\PHPMailer\PHPMailer::class)
        && is_array($url) && in_array($url['scheme'] ?? '', ['http', 'https'], true)
        && !empty($url['host']) && !isset($url['user']) && !isset($url['pass'])
        && !isset($url['query']) && !isset($url['fragment']);
}

// The public response is identical for unknown addresses and password accounts.
function request_password_reset(string $email): void
{
    ga_limit('password-reset-request', 10);
    if (!password_reset_mail_ready()) { throw new RuntimeException('Password reset mail is not configured.'); }
    $email = normalize_email($email);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254) { return; }
    if (manage_db_is_enabled() && !manage_db_available()) { throw new RuntimeException('Account database unavailable.'); }
    $rawToken = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $rawToken);
    $user = ga_transaction(static function (array &$state) use ($email, $tokenHash): ?array {
        $id = hash('sha256', 'password-reset-email|' . $email);
        $limit = $state['limits'][$id] ?? ['count' => 0, 'expires' => time() + 3600];
        $state['limits'][$id] = ['count' => $limit['count'] + 1, 'expires' => $limit['expires']];
        if ($limit['count'] >= 3) { return null; }
        $user = find_auth_user_by_email($email);
        if ($user === null || ($user['provider'] ?? '') === 'demo'
            || (empty($user['password_hash']) && empty($user['password_sha256']))) { return null; }
        $state['password_resets'][$tokenHash] = ['user' => $user['id'], 'credential' => auth_credential_version($user),
            'email' => hash('sha256', $email), 'expires' => time() + PASSWORD_RESET_LIFETIME];
        return $user;
    });
    if ($user === null) { return; }
    $url = app_absolute_url('reset-password.php?token=' . $rawToken . '&lang=' . current_language());
    $html = '<!doctype html><html lang="' . e(current_language()) . '"><meta charset="utf-8"><body style="margin:0;background:#0b1014;color:#e8edef;font-family:Arial,sans-serif;padding:32px">'
        . '<h1 style="color:#c7a875">SkyMP Worlds</h1><h2>' . e(t('reset_title')) . '</h2><p>' . e(t('reset_mail_intro')) . '</p>'
        . '<p><a style="color:#c7a875" href="' . e($url) . '">' . e(t('reset_title')) . '</a></p><p>' . e(t('reset_mail_expiry')) . '</p>'
        . '<p>' . e(t('reset_mail_ignore')) . '</p></body></html>';
    if (!send_transactional_email($email, t('reset_mail_subject'), $html, t('reset_mail_intro') . "\n\n" . $url . "\n\n" . t('reset_mail_expiry') . "\n" . t('reset_mail_ignore'))) {
        ga_transaction(static function (array &$state) use ($tokenHash): void { unset($state['password_resets'][$tokenHash]); });
        // No recipient, SMTP credentials or reset link in public responses or logs.
        consume_mail_error();
        error_log('SkyMP password reset: transactional email delivery failed. Check SMTP configuration.');
    }
}

function password_reset_is_valid(string $hash): bool
{
    if (!preg_match('/^[a-f0-9]{64}$/D', $hash)) { return false; }
    return ga_transaction(static function (array &$state) use ($hash): bool {
        return isset($state['password_resets'][$hash]) && password_reset_user($state['password_resets'][$hash]) !== null;
    });
}

function complete_password_reset(string $hash, string $password): bool
{
    if (!preg_match('/^[a-f0-9]{64}$/D', $hash) || !auth_password_is_valid($password)) { return false; }
    return ga_transaction(static function (array &$state) use ($hash, $password): bool {
        $entry = $state['password_resets'][$hash] ?? null;
        if ($entry === null || password_reset_user($entry) === null) { return false; }
        $newHash = password_hash($password, PASSWORD_ARGON2ID);
        if (manage_db_is_enabled()) {
            $pdo = manage_db_connection();
            if (!$pdo) { throw new RuntimeException('Account database unavailable.'); }
            $pdo->beginTransaction();
            try {
                $statement = $pdo->prepare('SELECT * FROM manage_users WHERE id = :id FOR UPDATE');
                $statement->execute([':id' => $entry['user']]);
                $user = $statement->fetch();
                if (!$user || !hash_equals($entry['credential'], auth_credential_version($user))
                    || !hash_equals($entry['email'], hash('sha256', normalize_email((string) $user['email'])))) {
                    $pdo->rollBack(); return false;
                }
                $statement = $pdo->prepare('UPDATE manage_users SET password_hash = :hash, password_sha256 = NULL, updated_at = :now WHERE id = :id');
                $statement->execute([':hash' => $newHash, ':now' => date('Y-m-d H:i:s'), ':id' => $entry['user']]);
                $pdo->commit();
            } catch (Throwable $error) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $error; }
        } else {
            $changed = storage_transaction(static function (array &$accounts) use ($entry, $newHash): bool {
                foreach ($accounts['users'] as &$user) {
                    if (($user['id'] ?? '') !== $entry['user']) { continue; }
                    if (!hash_equals($entry['credential'], auth_credential_version($user))
                        || !hash_equals($entry['email'], hash('sha256', normalize_email((string) ($user['email'] ?? ''))))) { return false; }
                    $user['password_hash'] = $newHash;
                    $user['password_sha256'] = '';
                    $user['updated_at'] = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
                    return true;
                }
                return false;
            });
            if (!$changed) { return false; }
        }
        foreach (['password_resets', 'tokens', 'handoffs'] as $table) {
            foreach ($state[$table] ?? [] as $id => $record) {
                if (($record['user'] ?? '') === $entry['user']) { unset($state[$table][$id]); }
            }
        }
        return true;
    });
}
