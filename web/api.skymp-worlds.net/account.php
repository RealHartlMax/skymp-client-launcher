<?php
// Also works when this explicit PHP URL is opened without rewrite support.
if (is_file(__DIR__ . '/config.php')) { require_once __DIR__ . '/config.php'; }
define('SKYMP_NATIVE_LIBRARY_ONLY', true);
require_once __DIR__ . '/native.php';
header('Location: ' . native_manage_url() . '/index.php', true, 302);
