<?php
require_once __DIR__ . '/includes/bootstrap.php';

if (is_logged_in()) {
    redirect_to('dashboard.php');
}

redirect_to('login.php');
