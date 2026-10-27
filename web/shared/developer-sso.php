<?php
// Shared by the independent manage/dev webroots. No browser-provided redirect URLs.
function ds_origin(string $value): string
{
    $value = rtrim($value, '/');
    $parts = parse_url($value);
    if (!$parts || isset($parts['user']) || isset($parts['pass'])
        || isset($parts['query']) || isset($parts['fragment']) || !empty($parts['path'])
        || !isset($parts['host']) || !in_array($parts['scheme'] ?? '', ['https', 'http'], true)
        || ($parts['scheme'] !== 'https' && !in_array($parts['host'], ['127.0.0.1', 'localhost', '[::1]'], true))) {
        throw new RuntimeException('Invalid developer service origin.');
    }
    return $value;
}
function ds_encode(string $bytes): string { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }
function ds_decode(string $value): string
{
    if (!preg_match('/^[A-Za-z0-9_-]+$/D', $value)) { throw new RuntimeException('Invalid sign-in ticket.'); }
    $result = base64_decode(strtr($value, '-_', '+/'), true);
    if ($result === false || ds_encode($result) !== $value) { throw new RuntimeException('Invalid sign-in ticket.'); }
    return $result;
}
function ds_sign(array $claims, string $secret): string
{
    if (strlen($secret) < 32) { throw new RuntimeException('Developer sign-in is not configured.'); }
    $payload = ds_encode(json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    return $payload . '.' . hash_hmac('sha256', 'skymp-dev-sign-in-v1|' . $payload, $secret);
}
function ds_verify(string $ticket, string $secret, string $issuer, string $audience, string $state): array
{
    if (strlen($secret) < 32 || strlen($ticket) > 4096) { throw new RuntimeException('Invalid sign-in ticket.'); }
    $parts = explode('.', $ticket);
    if (count($parts) !== 2 || !preg_match('/^[a-f0-9]{64}$/D', $parts[1])
        || !hash_equals(hash_hmac('sha256', 'skymp-dev-sign-in-v1|' . $parts[0], $secret), $parts[1])) {
        throw new RuntimeException('Invalid sign-in ticket.');
    }
    $claims = json_decode(ds_decode($parts[0]), true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($claims) || ($claims['v'] ?? null) !== 1 || ($claims['iss'] ?? null) !== $issuer
        || ($claims['aud'] ?? null) !== $audience || !is_string($claims['state'] ?? null)
        || !hash_equals($state, $claims['state']) || !is_int($claims['iat'] ?? null) || !is_int($claims['exp'] ?? null)
        || $claims['iat'] > time() + 5 || $claims['iat'] < time() - 65 || $claims['exp'] < time()
        || $claims['exp'] <= $claims['iat'] || $claims['exp'] > $claims['iat'] + 60
        || !is_string($claims['sub'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $claims['sub'])
        || !is_string($claims['nonce'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $claims['nonce'])
        || !is_string($claims['name'] ?? null) || strlen($claims['name']) > 256) {
        throw new RuntimeException('Invalid sign-in ticket.');
    }
    return $claims;
}
