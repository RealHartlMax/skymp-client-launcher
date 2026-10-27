<?php
require_once __DIR__ . '/includes/bootstrap.php';

if (!is_post_request()) { http_response_code(405); header('Allow: POST'); exit('Bitte die Abmeldung im Dashboard verwenden.'); }
verify_csrf_or_abort();

logout_current_user();
set_flash('success', t('flash_signed_out'));
redirect_to('login.php');
