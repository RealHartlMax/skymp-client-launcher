<?php
// Isolated account/state/transport checks. Never contacts Discord or a production database.
if (PHP_SAPI!=='cli' || empty($argv[1]) || !is_dir($argv[1])) { throw new RuntimeException('CLI test directory required'); }
$directory=realpath($argv[1]); ini_set('session.save_path',$directory); session_start();
define('MANAGE_STORAGE_FILE',$directory.'/discord-test-state.json');
define('MANAGE_EMAIL_VERIFICATION_REQUIRED',false);
define('MANAGE_DISCORD_CLIENT_ID','1496895150322876555');
define('MANAGE_DISCORD_CLIENT_SECRET','test-only-secret-not-real');
define('MANAGE_DISCORD_REDIRECT_URI','https://manage.skymp-worlds.net/oauth/discord-callback.php');
function manage_db_is_enabled(): bool { return false; }
function manage_db_available(): bool { return false; }
function current_language(): string { return $GLOBALS['testLanguage'] ?? 'de'; }
require __DIR__.'/../web/manage.skymp-worlds.net/includes/storage.php';
require __DIR__.'/../web/manage.skymp-worlds.net/includes/auth.php';
require __DIR__.'/../web/manage.skymp-worlds.net/includes/discord-oauth.php';
$checks=[];
function check(bool $result, string $message): void { if (!$result) { throw new RuntimeException($message); } }
function rejects(callable $operation, string $reason): void {
    try { $operation(); } catch (Throwable $error) { check($error->getMessage()===$reason,'Unexpected reason: '.$error->getMessage()); return; }
    throw new RuntimeException('Expected rejection '.$reason);
}
$password='Fixture-only-password-ÄÖÜ';
$owner=['id'=>'owner','login_name'=>'owner','display_name'=>'Hüter','email'=>'owner@example.invalid','provider'=>'email','password_hash'=>password_hash($password,PASSWORD_DEFAULT)];
$other=['id'=>'other','login_name'=>'other','display_name'=>'Other','email'=>'other@example.invalid','provider'=>'email','password_hash'=>password_hash($password,PASSWORD_DEFAULT)];
file_put_contents(MANAGE_STORAGE_FILE,json_encode(['users'=>[$owner,$other],'servers'=>[['id'=>'preserved-server','owner_id'=>'owner']]],JSON_THROW_ON_ERROR));
$state=begin_discord_oauth_state(); check(strlen($state)===64,'256-bit state'); check(consume_discord_oauth_state($state)!==null,'Valid state accepted'); check(consume_discord_oauth_state($state)===null,'Replay rejected');
$state=begin_discord_oauth_state(); $_SESSION['manage_discord_oauth_state']['created']=time()-601; check(consume_discord_oauth_state($state)===null,'Expiry rejected');
$state=begin_discord_oauth_state(); check(consume_discord_oauth_state(str_repeat('f',64))===null,'Mismatched state rejected'); check(consume_discord_oauth_state($state)===null,'Failed state consumed');
rejects(fn()=>begin_discord_oauth_state('link'),'Sign in before linking.');
check(complete_login_for_user_id('owner'),'Owner login');
$state=begin_discord_oauth_state('link'); check(complete_login_for_user_id('other'),'Other login'); check(consume_discord_oauth_state($state)===null,'Cross-account linking denied');
check(complete_login_for_user_id('owner'),'Owner login');
$state=begin_discord_oauth_state('link'); storage_transaction(function (array &$store): void { $store['users'][0]['password_hash']='changed-password-version'; });
check(consume_discord_oauth_state($state)===null,'Password reset invalidates link');
storage_transaction(function (array &$store) use ($owner): void { $store['users'][0]=$owner; }); check(complete_login_for_user_id('owner'),'Owner login');
$checks[]='One-time expiring state rejects replay, mismatch, account changes and credential changes';

$subject='1496895150322876001';
$profile=['id'=>$subject,'global_name'=>'Wächter Довакин','username'=>'fixture','email'=>'new@example.invalid','verified'=>true];
$id=discord_resolve_account($profile); check($id==='user_discord_'.$subject,'New account assigned stable ID');
check(discord_resolve_account($profile)===$id,'Repeated OAuth login maps same account'); check(complete_login_for_user_id($id,'discord'),'Discord login');
check(current_user()['display_name']==='Wächter Довакин','Unicode name kept');
check(count(load_state()['users'])===3 && count(load_state()['servers'])===1,'Accounts and servers preserved');
rejects(fn()=>discord_resolve_account(['id'=>'1496895150322876002','email'=>'owner@example.invalid','verified'=>true]),'collision');
rejects(fn()=>discord_resolve_account(['id'=>'1496895150322876002','email'=>'unverified@example.invalid','verified'=>false]),'email');
rejects(fn()=>discord_resolve_account(['id'=>'bad','email'=>'x@example.invalid','verified'=>true]),'profile');
$checks[]='Discord subject determines login; verified email required for new accounts; email collisions never auto-link';

$linkedProfile=['id'=>'1496895150322876003','username'=>'Linked ÄÖÜ','email'=>'different@example.invalid','verified'=>true];
check(discord_resolve_account($linkedProfile,'owner')==='owner','Explicit link retains owner ID');
check(discord_resolve_account($linkedProfile)==='owner','Subsequent login resolves existing owner');
check(discord_link_for_user('owner')['subject']===$linkedProfile['id'],'Linked identity shown');
check(find_user_by_id(load_state(),'owner')['password_hash']===$owner['password_hash'],'Password preserved');
check(load_state()['servers'][0]['owner_id']==='owner','Server ownership preserved');
rejects(fn()=>discord_resolve_account($linkedProfile,'other'),'linked_elsewhere');
rejects(fn()=>discord_resolve_account(['id'=>'1496895150322876004','username'=>'different'],'owner'),'already_linked');
$checks[]='Explicit authenticated linking preserves password and server ownership; duplicate and cross-account links rejected';

$requests=[];
$transport=static function (string $method,string $url,array $headers,string $body) use (&$requests,$profile): array {
    $requests[]=[$method,$url,$headers,$body];
    if (count($requests)===1) { parse_str($body,$data); check($method==='POST','Token POST'); check($data['grant_type']==='authorization_code','Code flow'); check($data['redirect_uri']===MANAGE_DISCORD_REDIRECT_URI,'Exact callback'); check($data['client_secret']===MANAGE_DISCORD_CLIENT_SECRET,'Server-side secret'); return ['access_token'=>str_repeat('x',32),'token_type'=>'Bearer']; }
    check($method==='GET' && $url==='https://discord.com/api/v10/users/@me','Profile GET'); check(in_array('Authorization: Bearer '.str_repeat('x',32),$headers,true),'Token in header'); return $profile;
};
check(discord_exchange_code('test-authorization-code',$transport)===$profile,'Token exchange result');
rejects(fn()=>discord_exchange_code('bad code',$transport),'code');
rejects(fn()=>discord_exchange_code('code',fn()=>['access_token'=>"bad\r\nheader",'token_type'=>'Bearer']),'token');
$raw=file_get_contents(MANAGE_STORAGE_FILE); foreach (['test-authorization-code',str_repeat('x',32),MANAGE_DISCORD_CLIENT_SECRET] as $secret) { check(!str_contains($raw,$secret),'No OAuth tokens or secret on disk'); }
$checks[]='Bounded code/token validation and fixed HTTPS endpoints; private secret used only in server-side exchange; no tokens persisted';
foreach (['de','en','ru'] as $language) { $GLOBALS['testLanguage']=$language; check(do_t('title')!=='title','Translation'); check(do_t('collision')!=='collision','Error translation'); }
$checks[]='German, English and Russian account and error messages available';
session_destroy();
echo json_encode(['ok'=>true,'checks'=>$checks,'liveDiscord'=>false,'liveMysql'=>false],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT)."\n";
