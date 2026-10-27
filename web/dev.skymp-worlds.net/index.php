<?php
require_once __DIR__.'/includes/bootstrap.php';
redirect_to(current_user() === null ? 'login.php' : 'crash-reports.php');
