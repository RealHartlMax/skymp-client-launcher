<?php
// Website accounts, with a separate profile-only launcher session. Never a game/admin token.
require_once __DIR__ . '/game-auth.php';

function la_begin(string $rawState): void
{
    $id = ga_state($rawState);
    ga_limit('launcher-begin', 120);
    ga_transaction(static function (array &$state) use ($id): void {
        if (isset($state['handoffs'][$id]) && ($state['handoffs'][$id]['kind'] ?? '') !== 'launcher') { throw new GameAuthError(409, 'Anmeldung nicht verfügbar.'); }
        $state['handoffs'][$id] ??= ['kind' => 'launcher', 'expires' => time() + 600];
    });
}

function la_approve(string $rawState, array $user): void
{
    $id = ga_state($rawState);
    if (ga_user((string) $user['id']) === null) { throw new GameAuthError(403, 'Konto nicht verfügbar.'); }
    ga_transaction(static function (array &$state) use ($id, $user): void {
        $handoff = $state['handoffs'][$id] ?? [];
        if (($handoff['kind'] ?? '') !== 'launcher') { throw new GameAuthError(410, 'Anmeldung abgelaufen. Bitte im Launcher erneut öffnen.'); }
        if (isset($handoff['user'])) {
            if ($handoff['user'] !== $user['id']) { throw new GameAuthError(409, 'Anmeldung bereits bestätigt.'); }
            return;
        }
        $token = bin2hex(random_bytes(32));
        $state['identities'][$user['id']] ??= count($state['identities']) + 1;
        $state['tokens'][hash('sha256', $token)] = ['kind' => 'launcher', 'user' => $user['id'], 'credential' => auth_credential_version($user), 'expires' => time() + 8 * 3600];
        $state['handoffs'][$id] = ['kind' => 'launcher', 'user' => $user['id'], 'token' => ga_seal($token), 'expires' => time() + 300];
    });
}

function la_profile(array $state, array $login, array $user): array
{
    return ['id' => (int) $state['identities'][$user['id']], 'displayName' => (string) ($user['display_name'] ?? $user['login_name'] ?? ''),
        'loginName' => (string) ($user['login_name'] ?? ''), 'email' => (string) ($user['email'] ?? ''),
        'emailVerified' => !empty($user['email_verified_at']), 'discordLinked' => !empty($user['discord_id']), 'expiresAt' => (int) $login['expires']];
}

function la_dispatch(string $method, string $path, array $query, string $authorization): array
{
    if ($method === 'GET' && $path === '/api/users/launcher/status') {
        $id = ga_state((string) ($query['state'] ?? ''));
        ga_limit('launcher-status|' . $id, 120, 60);
        return ga_transaction(static function (array &$state) use ($id): array {
            $handoff = $state['handoffs'][$id] ?? [];
            if (($handoff['kind'] ?? '') !== 'launcher' || empty($handoff['token'])) { throw new GameAuthError(401, 'Wartet auf Anmeldung.'); }
            $token = ga_unseal($handoff['token']);
            $login = $state['tokens'][hash('sha256', $token)] ?? [];
            $user = ga_user((string) ($login['user'] ?? ''));
            if (($login['kind'] ?? '') !== 'launcher' || $user === null || !hash_equals((string) ($login['credential'] ?? ''), auth_credential_version($user))) { throw new GameAuthError(401, 'Anmeldung abgelaufen.'); }
            unset($state['handoffs'][$id]); // One successful redemption; no credentials in browser URLs.
            return ['token' => $token, 'profile' => la_profile($state, $login, $user)];
        });
    }
    if (($method === 'GET' && $path === '/api/users/launcher/me') || ($method === 'POST' && $path === '/api/users/launcher/logout')) {
        if (!preg_match('/^Bearer ([a-f0-9]{64})$/D', $authorization, $match)) { throw new GameAuthError(401, 'Anmeldung erforderlich.'); }
        $hash = hash('sha256', $match[1]);
        return ga_transaction(static function (array &$state) use ($hash, $path): array {
            $login = $state['tokens'][$hash] ?? [];
            $user = ga_user((string) ($login['user'] ?? ''));
            if (($login['kind'] ?? '') !== 'launcher' || $user === null || !hash_equals((string) ($login['credential'] ?? ''), auth_credential_version($user))) { throw new GameAuthError(401, 'Anmeldung abgelaufen.'); }
            if ($path === '/api/users/launcher/logout') { unset($state['tokens'][$hash]); return ['ok' => true]; }
            return ['profile' => la_profile($state, $login, $user)];
        });
    }
    throw new GameAuthError(404, 'Route nicht gefunden.');
}
