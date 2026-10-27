<?php
// Public bounded upload bridge; all report storage stays in the developer site's private directory.
$config=__DIR__.'/config.php';if(is_file($config)){require_once $config;}
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
function api_crash_max_dump(): int {
    $maximum=max(0,min(128*1024*1024,defined('API_CRASH_MAX_DUMP_BYTES')?(int)API_CRASH_MAX_DUMP_BYTES:128*1024*1024));
    foreach(['post_max_size','upload_max_filesize']as $name){$value=trim((string)ini_get($name));if(preg_match('/^(\d+)\s*([KMG]?)$/iD',$value,$match)){$bytes=(int)$match[1]*(1024**(int)array_search(strtoupper($match[2]),['','K','M','G'],true));if($bytes>0){$maximum=min($maximum,$bytes);}}}
    return $maximum;
}
try {
    if (($_SERVER['REQUEST_METHOD'] ?? '')!=='POST') {http_response_code(405);echo '{"error":"POST required."}';exit;}
    $token=defined('API_CRASH_PROXY_TOKEN')?(string)API_CRASH_PROXY_TOKEN:'';
    if(strlen($token)<32 || !function_exists('curl_init')){http_response_code(503);echo '{"error":"Crash upload is not configured."}';exit;}
    $base=rtrim(defined('API_CRASH_PUBLIC_URL')?(string)API_CRASH_PUBLIC_URL:'https://dev.skymp-worlds.net','/');
    $parts=parse_url($base);
    if(!$parts || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || !in_array($parts['scheme']??'',['http','https'],true)
        || !empty($parts['path']) || ($parts['scheme']!=='https' && !in_array($parts['host']??'',['127.0.0.1','localhost','[::1]'],true))){throw new RuntimeException('Invalid crash service origin.');}
    $dump=($_GET['action']??'')==='dump';
    $headers=['X-SkyMP-Report-Service: '.$token,'X-SkyMP-Report-Source: '.hash_hmac('sha256',(string)($_SERVER['REMOTE_ADDR']??''),$token)];
    $url=$base.'/crash-ingest.php';$stream=null;$body='';
    if($dump){
        $id=(string)($_GET['id']??'');$authorization=(string)($_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');$hash=(string)($_SERVER['HTTP_X_CONTENT_SHA256']??'');
        if(!preg_match('/^[a-f0-9]{32}$/D',$id)||!preg_match('/^Bearer [a-f0-9]{64}$/D',$authorization)||!preg_match('/^[a-f0-9]{64}$/D',$hash)){http_response_code(400);echo '{"error":"Invalid dump request."}';exit;}
        $length=(int)($_SERVER['CONTENT_LENGTH']??0);$maximum=api_crash_max_dump();
        if($length<32||$length>$maximum){http_response_code(413);echo '{"error":"Dump exceeds hosting limit."}';exit;}
        $url.='?action=dump&id='.$id;$stream=fopen('php://input','rb');
        $headers[]='Content-Type: application/octet-stream';$headers[]='Authorization: '.$authorization;$headers[]='X-Content-SHA256: '.$hash;$headers[]='Content-Length: '.$length;$headers[]='Expect:';
    }else{
        if(strtolower(trim(explode(';',(string)($_SERVER['CONTENT_TYPE']??''))[0]))!=='application/json'){http_response_code(415);echo '{"error":"JSON required."}';exit;}
        if((int)($_SERVER['CONTENT_LENGTH']??0)>1048576){http_response_code(413);echo '{"error":"Report too large."}';exit;}
        $body=file_get_contents('php://input',false,null,0,1048577);
        if($body===false||strlen($body)>1048576){http_response_code(413);echo '{"error":"Report too large."}';exit;}
        $headers[]='Content-Type: application/json';
    }
    $handle=curl_init($url);$response='';
    curl_setopt_array($handle,[CURLOPT_CUSTOMREQUEST=>'POST',CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROXY=>'',CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>180,CURLOPT_HTTPHEADER=>$headers,CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,
        CURLOPT_WRITEFUNCTION=>static function($handle,string $chunk)use(&$response):int{if(strlen($response)+strlen($chunk)>65536){return 0;}$response.=$chunk;return strlen($chunk);}]);
    if($dump){curl_setopt_array($handle,[CURLOPT_UPLOAD=>true,CURLOPT_READFUNCTION=>static function($handle,$unused,int $maximum)use($stream):string{return (string)fread($stream,$maximum);},CURLOPT_INFILESIZE=>$length,CURLOPT_CUSTOMREQUEST=>'POST']);}
    else{curl_setopt($handle,CURLOPT_POSTFIELDS,$body);}
    try{$ok=curl_exec($handle);$status=(int)curl_getinfo($handle,CURLINFO_RESPONSE_CODE);}finally{curl_close($handle);if(is_resource($stream)){fclose($stream);}}
    if($ok===false||$status<200||$status>=600||json_decode($response)===null){throw new RuntimeException('Crash upload unavailable.');}
    if(!$dump&&$status>=200&&$status<300){$receipt=json_decode($response,true);if(is_array($receipt)&&isset($receipt['maxDumpBytes'])){$receipt['maxDumpBytes']=min((int)$receipt['maxDumpBytes'],api_crash_max_dump());$response=json_encode($receipt,JSON_UNESCAPED_SLASHES);}}
    http_response_code($status);echo $response;
}catch(Throwable $error){http_response_code(502);echo '{"error":"Crash upload service unavailable."}';}
