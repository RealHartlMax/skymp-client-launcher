<?php
function normalize_login_name(string $loginName): string
{
    return strtolower(trim($loginName));
}

function normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function is_valid_login_name(string $loginName): bool
{
    $length = strlen($loginName);

    if ($length < 3 || $length > 32) {
        return false;
    }

    return (bool) preg_match('/^[a-z0-9._-]+$/', $loginName);
}

function csrf_token(): string
{
    if (empty($_SESSION['manage_csrf_token'])) {
        $_SESSION['manage_csrf_token'] = bin2hex(random_bytes(32));
    }

    return $_SESSION['manage_csrf_token'];
}

function verify_csrf_or_abort(): void
{
    $sentToken = (string) ($_POST['csrf_token'] ?? '');
    $sessionToken = (string) ($_SESSION['manage_csrf_token'] ?? '');

    if ($sentToken === '' || $sessionToken === '' || !hash_equals($sessionToken, $sentToken)) {
        http_response_code(403);
        exit('CSRF validation failed.');
    }
}

function auth_credential_version(array $user): string
{
    return hash('sha256', (string) ($user['password_hash'] ?? '') . '|' . (string) ($user['password_sha256'] ?? ''));
}

function auth_password_is_valid(string $password): bool
{
    if (strlen($password) > 1024) { return false; }
    $length = preg_match_all('/./us', $password);
    return $length !== false && $length >= 8 && $length <= 256;
}

function current_user(): ?array
{
    $userId = (string) ($_SESSION['manage_user_id'] ?? '');

    if ($userId === '' || (manage_db_is_enabled() && !manage_db_available())) {
        return null;
    }

    if (manage_db_available()) {
        $user = find_db_user_by_id($userId);
    } else {
        $state = load_state();
        $user = find_user_by_id($state, $userId);
    }
    if ($user === null || ($user['provider'] ?? '') === 'demo'
        || !hash_equals((string) ($_SESSION['manage_credential_version'] ?? ''), auth_credential_version($user))) {
        unset($_SESSION['manage_user_id'], $_SESSION['manage_auth_driver'], $_SESSION['manage_credential_version']);
        return null;
    }
    return $user;
}

function is_logged_in(): bool
{
    return current_user() !== null;
}

function complete_login_for_user_id(string $userId, string $driver = 'password', ?string $expectedCredential = null): bool
{
    if (manage_db_available()) {
        $user = find_db_user_by_id($userId);
    } else {
        $state = load_state();
        $user = find_user_by_id($state, $userId);
    }

    if ($user === null || ($user['provider'] ?? '') === 'demo'
        || ($expectedCredential !== null && !hash_equals($expectedCredential, auth_credential_version($user)))) {
        return false;
    }

    session_regenerate_id(true);
    $_SESSION['manage_user_id'] = $userId;
    $_SESSION['manage_auth_driver'] = $driver;
    $_SESSION['manage_credential_version'] = auth_credential_version($user);

    return true;
}

function attempt_demo_login(string $loginName, string $password): bool
{
    return false;
}

function attempt_password_login(string $identity, string $password): array
{
    $needle = trim($identity);

    if ($needle === '' || $password === '') {
        return ['ok' => false, 'reason' => 'missing'];
    }

    $user = find_auth_user_by_identity($needle);

    if ($user === null) {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    if (($user['provider'] ?? '') === 'demo') {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    $passwordHash = (string) ($user['password_hash'] ?? '');
    $legacySha256 = (string) ($user['password_sha256'] ?? '');
    $valid = false;

    if ($passwordHash !== '') {
        $valid = password_verify($password, $passwordHash);
    } elseif ($legacySha256 !== '') {
        $valid = hash_equals($legacySha256, hash('sha256', $password));
    }

    if (!$valid) {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    if (MANAGE_EMAIL_VERIFICATION_REQUIRED && ($user['provider'] ?? '') === 'email') {
        if (trim((string) ($user['email_verified_at'] ?? '')) === '') {
            return ['ok' => false, 'reason' => 'unverified'];
        }
    }

    if (!complete_login_for_user_id((string) $user['id'], (string) ($user['provider'] ?? 'local'), auth_credential_version($user))) {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    return ['ok' => true, 'reason' => 'ok'];
}

function register_email_user(string $loginName, string $email, string $password): array
{
    $normalizedLogin = normalize_login_name($loginName);
    $normalizedEmail = normalize_email($email);

    if (!is_valid_login_name($normalizedLogin)) {
        return ['ok' => false, 'reason' => 'invalid_login_name'];
    }

    if (!filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL)) {
        return ['ok' => false, 'reason' => 'invalid_email'];
    }

    if (strlen($password) < 8) {
        return ['ok' => false, 'reason' => 'weak_password'];
    }

    if (find_auth_user_by_login($normalizedLogin) !== null) {
        return ['ok' => false, 'reason' => 'login_exists'];
    }

    if (find_auth_user_by_email($normalizedEmail) !== null) {
        return ['ok' => false, 'reason' => 'email_exists'];
    }

    $rawToken = bin2hex(random_bytes(32));
    $now = new DateTimeImmutable();
    $verifyExpiresAt = $now->modify('+1 day')->format(DateTimeInterface::ATOM);

    $user = [
        'id' => 'user_email_' . bin2hex(random_bytes(8)),
        'login_name' => $normalizedLogin,
        'display_name' => $normalizedLogin,
        'email' => $normalizedEmail,
        'password_sha256' => '',
        'password_hash' => password_hash($password, PASSWORD_ARGON2ID),
        'provider' => 'email',
        'email_verified_at' => null,
        'email_verify_token_hash' => hash('sha256', $rawToken),
        'email_verify_expires_at' => $verifyExpiresAt,
        'created_at' => $now->format(DateTimeInterface::ATOM),
    ];

    if (manage_db_is_enabled()) {
        if (!manage_db_available()) {
            return ['ok' => false, 'reason' => 'storage_error'];
        }

        if (!manage_db_begin_transaction()) {
            return ['ok' => false, 'reason' => 'storage_error'];
        }

        $insertedUser = insert_db_email_user($user);
        $insertedToken = $insertedUser && insert_db_verification_token((string) $user['id'], hash('sha256', $rawToken), $verifyExpiresAt);

        if (!$insertedUser || !$insertedToken || !manage_db_commit()) {
            manage_db_rollback();
            return ['ok' => false, 'reason' => 'storage_error'];
        }
    } else {
        $state = load_state();
        $state['users'][] = $user;
        save_state($state);
    }

    return [
        'ok' => true,
        'reason' => 'ok',
        'token' => $rawToken,
        'user' => $user,
    ];
}

function complete_email_verification(string $rawToken): array
{
    $token = trim($rawToken);
    if ($token === '') {
        return ['ok' => false, 'reason' => 'missing_token'];
    }

    $tokenHash = hash('sha256', $token);

    if (manage_db_is_enabled()) {
        if (!manage_db_available()) {
            return ['ok' => false, 'reason' => 'storage_error'];
        }

        return complete_db_email_verification($tokenHash);
    }

    $state = load_state();

    foreach ($state['users'] as $index => $user) {
        $storedHash = (string) ($user['email_verify_token_hash'] ?? '');
        if ($storedHash === '' || !hash_equals($storedHash, $tokenHash)) {
            continue;
        }

        $expiresAtRaw = trim((string) ($user['email_verify_expires_at'] ?? ''));
        if ($expiresAtRaw !== '') {
            try {
                $expiresAt = new DateTimeImmutable($expiresAtRaw);
                if ($expiresAt < new DateTimeImmutable()) {
                    return ['ok' => false, 'reason' => 'expired'];
                }
            } catch (Throwable $throwable) {
                return ['ok' => false, 'reason' => 'expired'];
            }
        }

        $state['users'][$index]['email_verified_at'] = (new DateTimeImmutable())->format(DateTimeInterface::ATOM);
        $state['users'][$index]['email_verify_token_hash'] = null;
        $state['users'][$index]['email_verify_expires_at'] = null;
        save_state($state);

        return ['ok' => true, 'reason' => 'ok', 'user' => $state['users'][$index]];
    }

    return ['ok' => false, 'reason' => 'invalid_token'];
}

function find_auth_user_by_identity(string $identity): ?array
{
    if (str_contains($identity, '@')) {
        $emailUser = find_auth_user_by_email(normalize_email($identity));
        if ($emailUser !== null) {
            return $emailUser;
        }
    }

    return find_auth_user_by_login(normalize_login_name($identity));
}

function find_auth_user_by_login(string $loginName): ?array
{
    if (manage_db_available()) {
        return find_db_user_by_login($loginName);
    }

    $state = load_state();
    return find_user_by_login($state, $loginName);
}

function find_auth_user_by_email(string $email): ?array
{
    if (manage_db_available()) {
        return find_db_user_by_email($email);
    }

    $state = load_state();
    return find_user_by_email($state, $email);
}

function find_db_user_by_id(string $userId): ?array
{
    return manage_db_fetch_one('SELECT * FROM manage_users WHERE id = :id LIMIT 1', [
        ':id' => $userId,
    ]);
}

function find_db_user_by_login(string $loginName): ?array
{
    return manage_db_fetch_one('SELECT * FROM manage_users WHERE login_name = :login_name LIMIT 1', [
        ':login_name' => $loginName,
    ]);
}

function find_db_user_by_email(string $email): ?array
{
    return manage_db_fetch_one('SELECT * FROM manage_users WHERE email = :email LIMIT 1', [
        ':email' => $email,
    ]);
}

function insert_db_email_user(array $user): bool
{
    $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');

    return manage_db_execute(
        'INSERT INTO manage_users (id, login_name, display_name, email, password_hash, password_sha256, provider, email_verified_at, created_at, updated_at)
         VALUES (:id, :login_name, :display_name, :email, :password_hash, :password_sha256, :provider, :email_verified_at, :created_at, :updated_at)',
        [
            ':id' => (string) $user['id'],
            ':login_name' => (string) $user['login_name'],
            ':display_name' => (string) $user['display_name'],
            ':email' => (string) $user['email'],
            ':password_hash' => (string) $user['password_hash'],
            ':password_sha256' => trim((string) ($user['password_sha256'] ?? '')) !== '' ? (string) $user['password_sha256'] : null,
            ':provider' => (string) $user['provider'],
            ':email_verified_at' => null,
            ':created_at' => $now,
            ':updated_at' => $now,
        ]
    );
}

function insert_db_verification_token(string $userId, string $tokenHash, string $expiresAtAtom): bool
{
    $expiresAt = new DateTimeImmutable($expiresAtAtom);
    $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');

    return manage_db_execute(
        'INSERT INTO manage_email_verification_tokens (user_id, token_hash, expires_at, created_at)
         VALUES (:user_id, :token_hash, :expires_at, :created_at)',
        [
            ':user_id' => $userId,
            ':token_hash' => $tokenHash,
            ':expires_at' => $expiresAt->format('Y-m-d H:i:s'),
            ':created_at' => $now,
        ]
    );
}

function complete_db_email_verification(string $tokenHash): array
{
    $record = manage_db_fetch_one(
        'SELECT t.id AS token_id, t.user_id, t.expires_at, t.consumed_at
         FROM manage_email_verification_tokens t
         WHERE t.token_hash = :token_hash
         LIMIT 1',
        [':token_hash' => $tokenHash]
    );

    if ($record === null) {
        return ['ok' => false, 'reason' => 'invalid_token'];
    }

    if (!empty($record['consumed_at'])) {
        return ['ok' => false, 'reason' => 'invalid_token'];
    }

    try {
        $expiresAt = new DateTimeImmutable((string) $record['expires_at']);
    } catch (Throwable $throwable) {
        return ['ok' => false, 'reason' => 'expired'];
    }

    if ($expiresAt < new DateTimeImmutable()) {
        return ['ok' => false, 'reason' => 'expired'];
    }

    if (!manage_db_begin_transaction()) {
        return ['ok' => false, 'reason' => 'storage_error'];
    }

    $now = (new DateTimeImmutable())->format('Y-m-d H:i:s');
    $updatedUser = manage_db_execute(
        'UPDATE manage_users SET email_verified_at = :email_verified_at, updated_at = :updated_at WHERE id = :user_id',
        [
            ':email_verified_at' => $now,
            ':updated_at' => $now,
            ':user_id' => (string) $record['user_id'],
        ]
    );

    $consumedToken = $updatedUser && manage_db_execute(
        'UPDATE manage_email_verification_tokens SET consumed_at = :consumed_at WHERE id = :token_id',
        [
            ':consumed_at' => $now,
            ':token_id' => (int) $record['token_id'],
        ]
    );

    if (!$updatedUser || !$consumedToken || !manage_db_commit()) {
        manage_db_rollback();
        return ['ok' => false, 'reason' => 'storage_error'];
    }

    $user = find_db_user_by_id((string) $record['user_id']);

    if ($user === null) {
        return ['ok' => false, 'reason' => 'invalid_token'];
    }

    return ['ok' => true, 'reason' => 'ok', 'user' => $user];
}

function email_registration_is_enabled(): bool
{
    return MANAGE_EMAIL_REGISTRATION_ENABLED;
}

function logout_current_user(bool $revokeGameSessions = true): void
{
    require_once __DIR__ . '/game-auth.php';
    if ($revokeGameSessions && !empty($_SESSION['manage_user_id'])) { ga_revoke_user((string) $_SESSION['manage_user_id']); }
    unset($_SESSION['manage_user_id'], $_SESSION['manage_auth_driver'], $_SESSION['manage_discord_oauth_state'], $_SESSION['manage_credential_version']);
    session_regenerate_id(true);
}

function require_login(): void
{
    if (is_logged_in()) {
        return;
    }

    set_flash('warning', t('flash_require_login'));
    redirect_to('login.php');
}

// A fixed internal return route, never a browser-supplied URL.
function login_destination(): string
{
    $pending = $_SESSION['developer_access_request'] ?? null;
    unset($_SESSION['developer_access_request']);
    if (is_array($pending) && is_int($pending['created'] ?? null) && $pending['created'] >= time()-300
        && is_string($pending['state'] ?? null) && preg_match('/^[a-f0-9]{64}$/D', $pending['state'])) {
        return 'developer-access.php?'.http_build_query(['state'=>$pending['state'], 'lang'=>current_language()]);
    }
    $accountReturn = $_SESSION['manage_account_return'] ?? 0;
    unset($_SESSION['manage_account_return']);
    if (is_int($accountReturn) && $accountReturn >= time() - 600 && $accountReturn <= time()) { return 'account.php'; }
    return 'dashboard.php';
}

function discord_oauth_is_configured(): bool
{
    return trim(MANAGE_DISCORD_CLIENT_ID) !== ''
        && trim(MANAGE_DISCORD_CLIENT_SECRET) !== ''
        && trim(MANAGE_DISCORD_REDIRECT_URI) !== '';
}

function begin_discord_oauth_state(string $mode = 'login'): string
{
    $state = bin2hex(random_bytes(32));
    $user = $mode === 'link' ? current_user() : null;
    if ($mode === 'link' && $user === null) { throw new RuntimeException('Sign in before linking.'); }
    $_SESSION['manage_discord_oauth_state'] = ['state' => $state, 'created' => time(), 'mode' => $mode,
        'user' => $user['id'] ?? null, 'credential' => $user !== null ? auth_credential_version($user) : null];

    return $state;
}

function verify_discord_oauth_state(string $incomingState): bool
{
    return consume_discord_oauth_state($incomingState) !== null;
}

function consume_discord_oauth_state(string $incomingState): ?array
{
    $expected = $_SESSION['manage_discord_oauth_state'] ?? null;
    unset($_SESSION['manage_discord_oauth_state']);
    if (!is_array($expected) || !is_int($expected['created'] ?? null) || $expected['created'] < time()-600 || $expected['created'] > time()
        || !is_string($expected['state'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $incomingState)
        || !hash_equals($expected['state'], $incomingState)) { return null; }
    if (($expected['mode'] ?? '') === 'link') {
        $user = current_user();
        if ($user === null || $user['id'] !== ($expected['user'] ?? null) || !hash_equals(auth_credential_version($user), (string)($expected['credential'] ?? ''))) { return null; }
    }
    return $expected;
}
