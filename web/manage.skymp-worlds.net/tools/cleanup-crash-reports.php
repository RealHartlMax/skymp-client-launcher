<?php
if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only.'); }
$config=dirname(__DIR__).'/config.php';if(is_file($config)){require_once $config;}
require_once dirname(__DIR__).'/includes/crash-reports.php';
try {
    cr_transaction(static function(array &$index,string $root):void{cr_cleanup($index,$root);});
    fwrite(STDOUT,"Crash report retention applied.\n");
}catch(Throwable $error){fwrite(STDERR,"Crash retention unavailable; check private storage configuration.\n");exit(1);}
