<?php
$config = __DIR__.'/config.php'; if (is_file($config)) { require_once $config; }
require_once __DIR__.'/includes/crash-reports.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
try {
    $expected = (string) cr_option('MANAGE_CRASH_PROXY_TOKEN','');
    $sent = (string) ($_SERVER['HTTP_X_SKYMP_REPORT_SERVICE'] ?? '');
    if (strlen($expected)<32) { throw new CrashReportError(503,'Crash upload is not configured.'); }
    if (!hash_equals($expected,$sent)) { throw new CrashReportError(403,'Access denied.'); }
    if (($_SERVER['REQUEST_METHOD'] ?? '')!=='POST') { throw new CrashReportError(405,'POST required.'); }
    if (($_GET['action'] ?? '')==='dump') {
        $authorization = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (!preg_match('/^Bearer ([a-f0-9]{64})$/D',$authorization,$match)) { throw new CrashReportError(401,'Dump authorization required.'); }
        $stream = fopen('php://input','rb');
        $result = cr_store_dump((string) ($_GET['id'] ?? ''),$match[1],(string) ($_SERVER['HTTP_X_CONTENT_SHA256'] ?? ''),$stream,(int) ($_SERVER['CONTENT_LENGTH'] ?? 0));
        fclose($stream);
    } else {
        if (strtolower(trim(explode(';',(string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]))!=='application/json') { throw new CrashReportError(415,'JSON required.'); }
        $bytes = file_get_contents('php://input',false,null,0,1048577);
        if ($bytes === false || strlen($bytes)>1048576) { throw new CrashReportError(413,'Report too large.'); }
        try {$report=json_decode($bytes,true,32,JSON_THROW_ON_ERROR);}catch(JsonException $error){throw new CrashReportError(400,'Invalid JSON.');}
        if (!is_array($report)) { throw new CrashReportError(400,'Invalid report.'); }
        $source = (string) ($_SERVER['HTTP_X_SKYMP_REPORT_SOURCE'] ?? '');
        $result = cr_receive($report,$source);
    }
    echo json_encode($result,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
} catch (CrashReportError $error) {http_response_code($error->status);echo json_encode(['error'=>$error->getMessage()]);}
catch (Throwable $error) {http_response_code(503);echo '{"error":"Crash storage unavailable."}';}
