<?php
// Isolated legacy dashboard checks. No database, email or real user state is touched.
if (PHP_SAPI !== 'cli' || empty($argv[1])) { throw new RuntimeException('CLI test workspace argument required'); }
$workspace = realpath($argv[1]);
if ($workspace === false) { throw new RuntimeException('Test workspace must already exist'); }
ini_set('session.save_path', $workspace);
session_start();
define('MANAGE_STORAGE_FILE', $workspace . '/auth-smoke-state.json');
define('MANAGE_DEMO_LOGIN_ENABLED', true); // Old deployment configs cannot enable the removed demo access.
define('MANAGE_EMAIL_VERIFICATION_REQUIRED', false);
function manage_db_available(): bool { return false; }
require __DIR__ . '/../web/manage.skymp-worlds.net/includes/storage.php';
require __DIR__ . '/../web/manage.skymp-worlds.net/includes/auth.php';
$password = 'Automated-test-password-123';
$users = [
    ['id' => 'demo-test', 'login_name' => 'demo-test', 'provider' => 'demo', 'password_sha256' => hash('sha256', $password)],
    ['id' => 'real-test', 'login_name' => 'real-test', 'email' => 'local-test@example.invalid', 'provider' => 'email', 'display_name' => 'Hüter ÄÖÜ', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)],
];
file_put_contents(MANAGE_STORAGE_FILE, json_encode(['users' => $users, 'servers' => []], JSON_THROW_ON_ERROR));
$count = 0;
function verify_test(bool $condition, string $message): void {
    global $count;
    if (!$condition) { throw new RuntimeException($message); }
    $count++;
}
$_SESSION['manage_user_id'] = 'demo-test';
verify_test(current_user() === null, 'Existing demo session must be rejected');
verify_test(!isset($_SESSION['manage_user_id']), 'Rejected demo session must be cleared');
verify_test(!attempt_demo_login('demo-test', $password), 'Legacy demo function must remain disabled');
verify_test(!complete_login_for_user_id('demo-test'), 'Demo user cannot complete login');
verify_test(!(attempt_password_login('demo-test', $password)['ok'] ?? false), 'Demo password login must be rejected');
verify_test(!(attempt_password_login('real-test', 'wrong-password')['ok'] ?? false), 'Wrong regular password must be rejected');
verify_test(attempt_password_login('real-test', $password)['ok'] ?? false, 'Regular password login must keep working');
verify_test((current_user()['display_name'] ?? '') === 'Hüter ÄÖÜ', 'UTF-8 identity must survive storage and login');
session_destroy();
echo "PHP dashboard auth: $count checks passed\n";
