<?php
require_once __DIR__.'/includes/bootstrap.php';
if (!is_post_request()) { http_response_code(405); exit('POST required.'); }
verify_csrf_or_abort();
unset($_SESSION['dev_user'], $_SESSION['dev_expires'], $_SESSION['dev_signin']);
session_regenerate_id(true);
unset($_SESSION['dev_csrf']);
redirect_to('login.php');
