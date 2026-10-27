<?php
require_once __DIR__.'/includes/bootstrap.php';
require_once __DIR__.'/includes/crash-reports.php';
require_once __DIR__.'/includes/page.php';
try {
    if (!is_post_request()) { throw new RuntimeException('POST required.'); }
    $pending = $_SESSION['dev_signin'] ?? null;
    unset($_SESSION['dev_signin']);
    if (!is_array($pending) || !is_int($pending['created'] ?? null) || $pending['created'] < time()-300
        || !is_string($pending['state'] ?? null) || !is_string($_POST['ticket'] ?? null)) { throw new RuntimeException('Invalid sign-in.'); }
    $claims = ds_verify($_POST['ticket'], (string)(defined('DEV_SSO_SECRET') ? DEV_SSO_SECRET : ''), ds_origin(DEV_MANAGE_PUBLIC_URL), ds_origin(DEV_PUBLIC_URL), $pending['state']);
    cr_transaction(static function(array &$index, string $root) use ($claims): void {
        $index['signins'] = array_filter($index['signins'] ?? [], static fn($expires):bool => is_int($expires) && $expires >= time());
        if (isset($index['signins'][$claims['nonce']])) { throw new RuntimeException('Ticket already used.'); }
        $index['signins'][$claims['nonce']] = $claims['exp'];
    });
    session_regenerate_id(true);
    unset($_SESSION['dev_csrf']);
    $_SESSION['dev_user'] = ['id'=>$claims['sub'], 'display_name'=>$claims['name'], 'provider'=>'developer-sso'];
    $_SESSION['dev_expires'] = time()+900;
    redirect_to('crash-reports.php');
} catch (Throwable $error) {
    http_response_code(403); dev_page_start(dev_t('portal'));
    echo '<h1>'.e(dev_t('portal')).'</h1><p class="flash flash-error" role="alert">'.e(dev_t('failed')).'</p><a class="button button-primary" href="login.php">'.e(dev_t('retry')).'</a>';
    dev_page_end();
}
