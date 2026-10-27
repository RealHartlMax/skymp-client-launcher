<?php
// OAuth credentials/tokens stay on this webhosting. Rich Presence only uses the public App ID.
function do_t(string $key): string
{
    $text = [
        'de' => [
            'title'=>'Verknüpfte Konten', 'intro'=>'Verbinde Discord mit deinem bestehenden SkyMP-Konto. Deine Server und Berechtigungen bleiben diesem Konto zugeordnet.',
            'link'=>'Discord verknüpfen', 'linked'=>'Discord wurde mit deinem Konto verknüpft.', 'not_linked'=>'Noch kein Discord-Konto verknüpft.',
            'back'=>'Zur Verwaltung', 'cancelled'=>'Die Discord-Anmeldung wurde abgebrochen oder der Rückruf ist ungültig.',
            'collision'=>'Zu dieser E-Mail-Adresse besteht bereits ein Konto. Melde dich mit dessen Passwort an und verknüpfe Discord unter „Verknüpfte Konten“.',
            'email'=>'Für ein neues Discord-Konto benötigen wir eine bestätigte E-Mail-Adresse bei Discord.',
            'linked_elsewhere'=>'Dieses Discord-Konto ist bereits mit einem anderen SkyMP-Konto verbunden.',
            'already_linked'=>'Dein SkyMP-Konto ist bereits mit einem anderen Discord-Konto verknüpft.',
            'unavailable'=>'Discord-Anmeldung derzeit nicht verfügbar. Bitte Konfiguration und Datenbank prüfen oder später erneut versuchen.',
            'configured'=>'Discord-Anmeldung ist eingerichtet.', 'missing'=>'Discord ist noch nicht eingerichtet. Der Betreiber muss das Client-Secret privat in config.php hinterlegen.',
            'identity'=>'Discord-ID', 'login'=>'SkyMP-Konto', 'notice'=>'Die Verknüpfung ändert deine Steam-Spielidentität nicht.',
        ],
        'en' => [
            'title'=>'Linked accounts', 'intro'=>'Link Discord to your existing SkyMP account. Your servers and permissions stay with this account.',
            'link'=>'Link Discord', 'linked'=>'Discord was linked to your account.', 'not_linked'=>'No Discord account linked yet.',
            'back'=>'Back to management', 'cancelled'=>'Discord sign-in was cancelled or its callback is invalid.',
            'collision'=>'An account already uses this email. Sign in with its password, then link Discord under Linked accounts.',
            'email'=>'A new Discord account requires a verified email address at Discord.',
            'linked_elsewhere'=>'This Discord account is already linked to another SkyMP account.',
            'already_linked'=>'Your SkyMP account is already linked to a different Discord account.',
            'unavailable'=>'Discord sign-in is unavailable. Check configuration and database setup, or try again later.',
            'configured'=>'Discord sign-in is configured.', 'missing'=>'Discord is not configured yet. The operator must add the client secret privately in config.php.',
            'identity'=>'Discord ID', 'login'=>'SkyMP account', 'notice'=>'Linking does not change your Steam game identity.',
        ],
        'ru' => [
            'title'=>'Связанные аккаунты', 'intro'=>'Привяжите Discord к существующему аккаунту SkyMP. Серверы и права останутся у этого аккаунта.',
            'link'=>'Привязать Discord', 'linked'=>'Discord привязан к вашему аккаунту.', 'not_linked'=>'Аккаунт Discord ещё не привязан.',
            'back'=>'К управлению', 'cancelled'=>'Вход через Discord отменён или обратный запрос недействителен.',
            'collision'=>'Эта почта уже используется. Войдите по паролю существующего аккаунта и привяжите Discord в разделе «Связанные аккаунты».',
            'email'=>'Для нового аккаунта Discord нужен подтверждённый адрес электронной почты в Discord.',
            'linked_elsewhere'=>'Этот Discord уже привязан к другому аккаунту SkyMP.',
            'already_linked'=>'Ваш аккаунт SkyMP уже привязан к другому Discord.',
            'unavailable'=>'Вход через Discord недоступен. Проверьте конфигурацию и базу данных или повторите позже.',
            'configured'=>'Вход через Discord настроен.', 'missing'=>'Discord ещё не настроен. Владелец должен указать client secret в закрытом config.php.',
            'identity'=>'Discord ID', 'login'=>'Аккаунт SkyMP', 'notice'=>'Привязка не меняет вашу игровую личность Steam.',
        ],
    ];
    return $text[current_language()][$key] ?? $text['en'][$key] ?? $key;
}

/** Bounded TLS requests to fixed Discord endpoints. Never follow redirects or log a body. */
function discord_http(string $method, string $url, array $headers, string $body): array
{
    if (!in_array($url, ['https://discord.com/api/oauth2/token','https://discord.com/api/v10/users/@me'], true)) { throw new RuntimeException('endpoint'); }
    if (function_exists('curl_init')) {
        $handle = curl_init($url); $response = '';
        curl_setopt_array($handle, [CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_HTTPHEADER=>$headers, CURLOPT_TIMEOUT=>12,
            CURLOPT_CONNECTTIMEOUT=>5, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_SSL_VERIFYPEER=>true, CURLOPT_SSL_VERIFYHOST=>2,
            CURLOPT_WRITEFUNCTION=>static function ($handle, string $part) use (&$response): int {
                if (strlen($response)+strlen($part)>65536) { return 0; } $response.=$part; return strlen($part);
            }]);
        if ($method==='POST') { curl_setopt($handle, CURLOPT_POSTFIELDS, $body); }
        $ok = curl_exec($handle); $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE); curl_close($handle);
        if ($ok===false) { throw new RuntimeException('upstream'); }
    } else {
        $context = stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),'content'=>$body,
            'timeout'=>12,'ignore_errors'=>true,'follow_location'=>0,'max_redirects'=>0], 'ssl'=>['verify_peer'=>true,'verify_peer_name'=>true]]);
        $response = @file_get_contents($url, false, $context, 0, 65537);
        $status=0; foreach (($http_response_header ?? []) as $line) { if (preg_match('#^HTTP/\S+ (\d{3})#',$line,$match)) { $status=(int)$match[1]; } }
        if ($response===false || strlen($response)>65536) { throw new RuntimeException('upstream'); }
    }
    if ($status!==200) { throw new RuntimeException('upstream'); }
    $result=json_decode($response,true,32,JSON_THROW_ON_ERROR);
    if (!is_array($result)) { throw new RuntimeException('upstream'); }
    return $result;
}

function discord_exchange_code(string $code, ?callable $request = null): array
{
    if ($code==='' || strlen($code)>2048 || preg_match('/[\x00-\x20\x7f]/',$code)) { throw new RuntimeException('code'); }
    $request ??= 'discord_http';
    $token=$request('POST','https://discord.com/api/oauth2/token',['Content-Type: application/x-www-form-urlencoded','Accept: application/json'],
        http_build_query(['client_id'=>MANAGE_DISCORD_CLIENT_ID,'client_secret'=>MANAGE_DISCORD_CLIENT_SECRET,
            'grant_type'=>'authorization_code','code'=>$code,'redirect_uri'=>MANAGE_DISCORD_REDIRECT_URI]));
    if (!is_string($token['access_token'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{16,2048}$/D',$token['access_token'])
        || strcasecmp((string)($token['token_type'] ?? ''),'Bearer')!==0) { throw new RuntimeException('token'); }
    $profile=$request('GET','https://discord.com/api/v10/users/@me',['Authorization: Bearer '.$token['access_token'],'Accept: application/json'],'');
    unset($token); return $profile;
}

function discord_db(): PDO
{
    $pdo=manage_db_connection(); if (!$pdo) { throw new RuntimeException('storage'); }
    static $ready=false;
    if (!$ready) {
        try { $pdo->query('SELECT provider FROM manage_oauth_accounts LIMIT 1'); }
        catch (PDOException $error) {
            if ($error->getCode()!=='42S02') { throw $error; }
            $pdo->exec("CREATE TABLE IF NOT EXISTS manage_oauth_accounts (
                provider VARCHAR(20) NOT NULL, subject VARCHAR(32) NOT NULL, user_id VARCHAR(64) NOT NULL,
                display_name VARCHAR(64) NOT NULL, created_at DATETIME NOT NULL,
                PRIMARY KEY (provider,subject), UNIQUE KEY uq_manage_oauth_user (provider,user_id),
                CONSTRAINT fk_manage_oauth_user FOREIGN KEY (user_id) REFERENCES manage_users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        }
        $ready=true;
    }
    return $pdo;
}

function discord_link_for_user(string $userId): ?array
{
    if (manage_db_is_enabled()) {
        $query=discord_db()->prepare("SELECT subject, display_name FROM manage_oauth_accounts WHERE provider='discord' AND user_id=:id");
        $query->execute([':id'=>$userId]); $value=$query->fetch(PDO::FETCH_ASSOC); return is_array($value)?$value:null;
    }
    foreach ((load_state()['oauth_accounts'] ?? []) as $subject=>$link) {
        if (is_array($link) && ($link['user_id'] ?? '')===$userId) { return ['subject'=>(string)$subject,'display_name'=>(string)($link['display_name'] ?? '')]; }
    }
    return null;
}

function discord_resolve_account(array $profile, ?string $linkUserId = null): string
{
    $subject=$profile['id'] ?? null;
    if (!is_string($subject) || !preg_match('/^[0-9]{17,20}$/D',$subject) || !empty($profile['bot'])) { throw new RuntimeException('profile'); }
    $name=$profile['global_name'] ?? $profile['username'] ?? 'Discord';
    $name=is_string($name)?trim((string)preg_replace('/[\x00-\x1f\x7f<>\x{200b}-\x{200f}\x{202a}-\x{202e}\x{2060}-\x{206f}]/u','',$name)):'Discord';
    $name=implode('',array_slice(preg_split('//u',$name,-1,PREG_SPLIT_NO_EMPTY) ?: [],0,64));
    if ($name==='') { $name='Discord'; }
    $email=is_string($profile['email'] ?? null)?normalize_email($profile['email']):'';
    $verified=($profile['verified'] ?? false)===true && strlen($email)<=190 && filter_var($email,FILTER_VALIDATE_EMAIL)!==false;
    $now=gmdate('Y-m-d H:i:s');
    $newUser=static function () use ($subject,$name,$email,$verified,$now): array {
        if (!$verified) { throw new RuntimeException('email'); }
        return ['id'=>'user_discord_'.$subject,'login_name'=>'discord_'.$subject,'display_name'=>$name,'email'=>$email,
            'password_hash'=>'','password_sha256'=>null,'provider'=>'discord','email_verified_at'=>$now,'created_at'=>$now,'updated_at'=>$now];
    };
    if (manage_db_is_enabled()) {
        $pdo=discord_db(); $pdo->beginTransaction();
        try {
            $query=$pdo->prepare("SELECT user_id FROM manage_oauth_accounts WHERE provider='discord' AND subject=:subject FOR UPDATE");
            $query->execute([':subject'=>$subject]); $mapped=$query->fetchColumn();
            if (is_string($mapped)) {
                if ($linkUserId!==null && $mapped!==$linkUserId) { throw new RuntimeException('linked_elsewhere'); }
                $pdo->commit(); return $mapped;
            }
            if ($linkUserId!==null) {
                $query=$pdo->prepare('SELECT id FROM manage_users WHERE id=:id AND provider<>:demo FOR UPDATE');
                $query->execute([':id'=>$linkUserId,':demo'=>'demo']); if (!$query->fetchColumn()) { throw new RuntimeException('storage'); }
                $query=$pdo->prepare("SELECT subject FROM manage_oauth_accounts WHERE provider='discord' AND user_id=:id");
                $query->execute([':id'=>$linkUserId]); if ($query->fetchColumn()) { throw new RuntimeException('already_linked'); }
                $userId=$linkUserId;
            } else {
                $user=$newUser();
                $query=$pdo->prepare('SELECT id FROM manage_users WHERE email=:email OR login_name=:login');
                $query->execute([':email'=>$email,':login'=>$user['login_name']]); if ($query->fetchColumn()) { throw new RuntimeException('collision'); }
                $query=$pdo->prepare('INSERT INTO manage_users (id,login_name,display_name,email,password_hash,password_sha256,provider,email_verified_at,created_at,updated_at) VALUES (:id,:login_name,:display_name,:email,:password_hash,:password_sha256,:provider,:email_verified_at,:created_at,:updated_at)');
                $query->execute($user); $userId=$user['id'];
            }
            $query=$pdo->prepare("INSERT INTO manage_oauth_accounts (provider,subject,user_id,display_name,created_at) VALUES ('discord',:subject,:id,:name,:now)");
            $query->execute([':subject'=>$subject,':id'=>$userId,':name'=>$name,':now'=>$now]); $pdo->commit(); return $userId;
        } catch (Throwable $error) { if ($pdo->inTransaction()) { $pdo->rollBack(); } throw $error; }
    }
    return storage_transaction(static function (array &$state) use ($subject,$name,$email,$linkUserId,$newUser,$now): string {
        if (!isset($state['oauth_accounts'])) { $state['oauth_accounts']=[]; }
        if (!is_array($state['oauth_accounts'])) { throw new RuntimeException('storage'); }
        $mapped=$state['oauth_accounts'][$subject]['user_id'] ?? null;
        if (is_string($mapped)) {
            if ($linkUserId!==null && $mapped!==$linkUserId) { throw new RuntimeException('linked_elsewhere'); }
            if (find_user_by_id($state,$mapped)===null) { throw new RuntimeException('storage'); } return $mapped;
        }
        if ($linkUserId!==null) {
            $user=find_user_by_id($state,$linkUserId); if ($user===null || ($user['provider'] ?? '')==='demo') { throw new RuntimeException('storage'); }
            foreach ($state['oauth_accounts'] as $link) { if (($link['user_id'] ?? '')===$linkUserId) { throw new RuntimeException('already_linked'); } }
            $userId=$linkUserId;
        } else {
            $user=$newUser();
            if (find_user_by_email($state,$email)!==null || find_user_by_login($state,$user['login_name'])!==null) { throw new RuntimeException('collision'); }
            $userId=$user['id']; $state['users'][]=$user;
        }
        $state['oauth_accounts'][$subject]=['user_id'=>$userId,'display_name'=>$name,'created_at'=>$now]; return $userId;
    });
}
