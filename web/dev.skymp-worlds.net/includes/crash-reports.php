<?php
if (!defined('DEV_CRASH_ALLOW_WEBROOT_REPORTS')) { define('DEV_CRASH_ALLOW_WEBROOT_REPORTS', true); }
if (!defined('DEV_CRASH_DEFAULT_DIRECTORY')) { define('DEV_CRASH_DEFAULT_DIRECTORY', dirname(__DIR__).'/reports'); }
// Private crash storage and index. No game/account credentials are needed to submit a report.
final class CrashReportError extends RuntimeException
{
    public function __construct(public int $status, string $message, public string $reason = '') { parent::__construct($message); }
}
function cr_option(string $name, mixed $fallback): mixed { return defined($name) ? constant($name) : $fallback; }
function cr_max_dump(): int
{
    $maximum=max(0,min(128*1024*1024,(int)cr_option('DEV_CRASH_MAX_DUMP_BYTES',128*1024*1024)));
    foreach(['post_max_size','upload_max_filesize']as $name){
        $value=trim((string)ini_get($name));
        if(preg_match('/^(\d+)\s*([KMG]?)$/iD',$value,$match)){
            $bytes=(int)$match[1]*(1024**(int)array_search(strtoupper($match[2]),['','K','M','G'],true));
            if($bytes>0){$maximum=min($maximum,$bytes);}
        }
    }
    return $maximum;
}
function cr_id(string $id): string
{
    if (!preg_match('/^[a-f0-9]{32}$/D', $id)) { throw new CrashReportError(400, 'Invalid report ID.'); }
    return $id;
}
function cr_directory(): string
{
    $configured = (string) cr_option('DEV_CRASH_DIRECTORY', '');
    if ($configured === '') { $configured = (string) cr_option('DEV_CRASH_DEFAULT_DIRECTORY', ''); }
    if ($configured === '' || !preg_match('~^(?:/|[a-zA-Z]:[\\\\/])~', $configured)) { throw new CrashReportError(503, 'Private crash storage is not configured.', 'setupStoragePath'); }
    if (!is_dir($configured) && !@mkdir($configured, 0700, true) && !is_dir($configured)) { throw new CrashReportError(503, 'Crash storage unavailable.', 'setupStorageWrite'); }
    $directory = realpath($configured);
    if ($directory === false || is_link($configured)) { throw new CrashReportError(503, 'Invalid crash storage.', 'setupStoragePath'); }
    $guarded = cr_guarded_directory();
    foreach ([dirname(__DIR__), (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')] as $public) {
        $root = $public === '' ? false : realpath($public);
        if ($root !== false) {
            $root = strtolower(str_replace('\\', '/', rtrim($root, '/\\')));
            $candidate = strtolower(str_replace('\\', '/', $directory));
            if (($candidate === $root || str_starts_with($candidate, $root . '/')) && $directory !== $guarded) { throw new CrashReportError(503, 'Crash storage must be outside the webroot or in the protected DEV reports directory.', 'setupStoragePath'); }
        }
    }
    if (!is_writable($directory)) { throw new CrashReportError(503, 'Crash storage is not writable.', 'setupStorageWrite'); }
    if ($directory === $guarded) { cr_initialize_guarded($directory); }
    return $directory;
}
// DEV alone opts into its fixed reports/ folder. Other public directories remain forbidden.
function cr_guarded_directory(): ?string
{
    if (cr_option('DEV_CRASH_ALLOW_WEBROOT_REPORTS', false) !== true) { return null; }
    $path = dirname(__DIR__) . '/reports';
    return is_dir($path) && !is_link($path) ? (realpath($path) ?: null) : null;
}
function cr_guard_prefix(): string { return "<?php http_response_code(404); exit; __halt_compiler();\n"; }
function cr_disk_file(string $file): string
{
    $root = cr_guarded_directory();
    if ($root === null || !str_starts_with(str_replace('\\', '/', $file), str_replace('\\', '/', $root) . '/')) { return $file; }
    $relative = substr($file, strlen($root) + 1);
    $current = $root;
    foreach (preg_split('~[\\\\/]~', $relative) as $part) {
        if ($part === '' || $part === '.' || $part === '..') { throw new RuntimeException('Invalid crash storage path.'); }
        $current .= '/' . $part;
        if (is_link($current)) { throw new RuntimeException('Crash storage links are forbidden.'); }
    }
    if (is_link($file . '.php')) { throw new RuntimeException('Crash storage links are forbidden.'); }
    return $file . '.php';
}
function cr_open_read(string $file)
{
    $disk = cr_disk_file($file);
    if (is_link($disk)) { throw new RuntimeException('Crash storage links are forbidden.'); }
    $handle = @fopen($disk, 'rb');
    if ($handle === false) { throw new RuntimeException('Crash file unavailable.'); }
    if ($disk !== $file && fread($handle, strlen(cr_guard_prefix())) !== cr_guard_prefix()) {
        fclose($handle); throw new RuntimeException('Invalid crash storage envelope.');
    }
    return $handle;
}
function cr_file_exists(string $file): bool { $disk = cr_disk_file($file); return is_file($disk) && !is_link($disk); }
function cr_read(string $file): string
{
    $handle = cr_open_read($file);
    try { $bytes = stream_get_contents($handle); if ($bytes === false) { throw new RuntimeException('Crash read failed.'); } return $bytes; }
    finally { fclose($handle); }
}
function cr_file_size(string $file): int
{
    $handle = cr_open_read($file);
    try { return (int)fstat($handle)['size'] - ftell($handle); } finally { fclose($handle); }
}
function cr_file_hash(string $file): string
{
    $handle = cr_open_read($file);
    try { $hash = hash_init('sha256'); hash_update_stream($hash, $handle); return hash_final($hash); } finally { fclose($handle); }
}
function cr_stream(string $file): void { $handle = cr_open_read($file); try { fpassthru($handle); } finally { fclose($handle); } }
function cr_unlink(string $file): void { $disk = cr_disk_file($file); if (is_file($disk) || is_link($disk)) { unlink($disk); } }
function cr_temporary(string $file): array
{
    $disk = cr_disk_file($file);
    $temporary = dirname($disk) . '/.report-' . bin2hex(random_bytes(16)) . ($disk !== $file ? '.php' : '.tmp');
    $handle = @fopen($temporary, 'x+b');
    if ($handle === false) { throw new RuntimeException('Crash write unavailable.'); }
    try {
        chmod($temporary, 0600);
        if ($disk !== $file && fwrite($handle, cr_guard_prefix()) !== strlen(cr_guard_prefix())) { throw new RuntimeException('Crash envelope write failed.'); }
        return [$temporary, $handle, $disk];
    } catch (Throwable $error) { fclose($handle); unlink($temporary); throw $error; }
}
function cr_initialize_guarded(string $root): void
{
    if (cr_file_exists($root . '/.storage')) {
        if (cr_read($root . '/.storage') !== 'php-envelope-v1') { throw new CrashReportError(503, 'Invalid crash storage format.', 'setupStorageFormat'); }
        // Do not silently accept an old, unprotected store copied over a new one.
        if (file_exists($root . '/index.json') || file_exists($root . '/report.key')) { throw new CrashReportError(503, 'Unprotected legacy files in public crash storage.', 'setupStorageFormat'); }
        return;
    }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::SELF_FIRST) as $entry) {
        if ($entry->isLink()) { throw new CrashReportError(503, 'Crash storage links are forbidden.', 'setupStoragePath'); }
        if ($entry->isDir()) { continue; }
        if (in_array($entry->getPathname(), [$root . DIRECTORY_SEPARATOR . '.htaccess', $root . DIRECTORY_SEPARATOR . 'index.php'], true)) { continue; }
        $handle = @fopen($entry->getPathname(), 'rb');
        $protected = $handle !== false && str_ends_with($entry->getFilename(), '.php') && fread($handle, strlen(cr_guard_prefix())) === cr_guard_prefix();
        if (is_resource($handle)) { fclose($handle); }
        if (!$protected) { throw new CrashReportError(503, 'Unprotected files in public crash storage.', 'setupStorageFormat'); }
    }
    cr_atomic($root . '/.storage', 'php-envelope-v1');
}
function cr_transaction(callable $action): mixed
{
    $directory = cr_directory();
    $lockFile = cr_disk_file($directory . '/index.lock');
    if (is_link($lockFile)) { throw new RuntimeException('Crash storage links are forbidden.'); }
    $lock = fopen($lockFile, 'c+b');
    if ($lock === false || !flock($lock, LOCK_EX)) { throw new CrashReportError(503, 'Crash index unavailable.'); }
    try {
        if ($lockFile !== $directory . '/index.lock' && fstat($lock)['size'] === 0) {
            if (fwrite($lock, cr_guard_prefix()) !== strlen(cr_guard_prefix())) { throw new RuntimeException('Crash lock unavailable.'); }
            fflush($lock);
        }
        $file = $directory . '/index.json';
        $index = cr_file_exists($file) ? json_decode(cr_read($file), true, 32, JSON_THROW_ON_ERROR) : ['reports' => [], 'limits' => []];
        if (!is_array($index['reports'] ?? null) || !is_array($index['limits'] ?? null)) { throw new RuntimeException('Invalid crash index.'); }
        $result = $action($index, $directory);
        cr_atomic($file, json_encode($index, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        return $result;
    } finally { flock($lock, LOCK_UN); fclose($lock); }
}
function cr_atomic(string $file, string $bytes): void
{
    [$temporary, $handle, $disk] = cr_temporary($file);
    try {
        if (fwrite($handle, $bytes) !== strlen($bytes)) { throw new RuntimeException('Crash write failed.'); }
        fclose($handle); $handle = null;
        if (!rename($temporary, $disk)) { throw new RuntimeException('Crash replace failed.'); }
    } finally { if (is_resource($handle)) { fclose($handle); } if (is_file($temporary)) { unlink($temporary); } }
}
function cr_key(string $directory): string
{
    $file = $directory . '/report.key';
    if (!cr_file_exists($file)) { cr_atomic($file, random_bytes(32)); }
    $key = cr_read($file);
    if (strlen($key) !== 32) { throw new RuntimeException('Crash key unavailable.'); }
    return $key;
}
function cr_scrub(string $text, int $maximum = 65536): string
{
    if (strlen($text) > $maximum || !preg_match('//u', $text)) { throw new CrashReportError(400, 'Invalid report text.'); }
    $lines = explode("\n", $text);
    foreach ($lines as &$line) {
        if (preg_match('/password|passwd|authorization|bearer\s|cookie|master[_-]?key|api[_-]?key|private[_-]?key|client[_-]?secret|steam[\s_-]*(?:auth[\s_-]*)?(?:ticket|session)|(?:session|access|refresh)[_-]?token|auth-data|skymp_live_|\b(?:token|ticket|session|secret|credential|key|auth)[\w-]*["\']?\s*[:=]/i', $line)) { $line = '[credential-bearing line removed]'; continue; }
        $line = preg_replace('~https?://[^\s<>"\']+~i', '[URL removed]', $line);
        $line = preg_replace('~[a-z]:[\\\\/]users[\\\\/][^\\\\/\s]+|/(?:home|Users)/[^/\s]+~i', '%USERPROFILE%', $line);
        $line = preg_replace('/\b7656119\d{10}\b/', '[Steam ID removed]', $line);
        $line = preg_replace('/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i', '[email removed]', $line);
        $line = preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/', '', $line);
    }
    return implode("\n", $lines);
}
function cr_object(mixed $input, array $allowed): array
{
    if (!is_array($input) || array_is_list($input) && $input !== []) { throw new CrashReportError(400, 'Invalid report object.'); }
    if (array_diff(array_keys($input), $allowed) !== []) { throw new CrashReportError(400, 'Unexpected report field.'); }
    return $input;
}
function cr_text(mixed $value, int $max = 256): string
{
    if (!is_string($value)) { throw new CrashReportError(400, 'Invalid text field.'); }
    return cr_scrub($value, $max);
}
function cr_integer(mixed $value, int $maximum = 4102444800): void
{
    if (!is_int($value) || $value < 0 || $value > $maximum) { throw new CrashReportError(400,'Invalid numeric field.'); }
}
function cr_hex(mixed $value, int $length, bool $nullable = true): void
{
    if ($value === null && $nullable) { return; }
    if (!is_string($value) || !preg_match('/^[a-f0-9]{'.$length.'}$/iD',$value)) { throw new CrashReportError(400,'Invalid build identifier.'); }
}
function cr_version(mixed $value, bool $nullable = false): void
{
    if ($value === null && $nullable) { return; }
    cr_text($value,128);
}
function cr_module(mixed $module, bool $nullable = false): void
{
    if ($module === null && $nullable) { return; }
    cr_text($module,512);
    if ($module === '' || preg_match('~[/\\\\\x00-\x1f]~',$module)) { throw new CrashReportError(400,'Invalid module name.'); }
}
function cr_list(mixed $value, int $maximum): array
{
    if (!is_array($value) || !array_is_list($value) || count($value)>$maximum) { throw new CrashReportError(400,'Invalid report list.'); }
    return $value;
}
function cr_binary(array $binary, bool $loaded): void
{
    cr_object($binary,$loaded?['name','source','pdb','sha256','version']:['name','source','sha256','version']);
    if ($loaded) { cr_module($binary['name']??null); }
    else {
        $name=cr_text($binary['name']??null,512);
        if ($name==='' || preg_match('~(^|[/\\\\])\.\.($|[/\\\\])|^[/\\\\]|[\x00-\x1f:]~',$name)) { throw new CrashReportError(400,'Invalid binary path.'); }
    }
    if (!in_array($binary['source']??'',['installed','loaded'],true)) { throw new CrashReportError(400,'Invalid binary source.'); }
    cr_hex($binary['sha256']??null,64);cr_version($binary['version']??null,true);
    if (isset($binary['pdb'])) {
        $pdb=cr_object($binary['pdb'],['guid','age']);cr_hex($pdb['guid']??null,32,false);cr_integer($pdb['age']??null,4294967295);
    }
}
function cr_safe_value(mixed $value, int $depth = 0): mixed
{
    if ($depth > 6) { throw new CrashReportError(400, 'Report nesting too deep.'); }
    if (is_string($value)) { return cr_scrub($value, 2048); }
    if (is_array($value)) {
        if (count($value) > 512) { throw new CrashReportError(400, 'Too many report items.'); }
        $clean = [];
        foreach ($value as $key => $entry) {
            if (is_string($key) && !preg_match('/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/D', $key)) { throw new CrashReportError(400, 'Invalid field name.'); }
            $clean[$key] = cr_safe_value($entry, $depth + 1);
        }
        return $clean;
    }
    if (is_int($value) || is_bool($value) || $value === null || is_float($value) && is_finite($value)) { return $value; }
    throw new CrashReportError(400, 'Invalid report value.');
}
function cr_validate(array $input): array
{
    cr_object($input, ['schemaVersion','clientReportId','occurredAtUnix','eventKind','language','launcher','game','serverId','crash','timeline','environment','binaries','logs','comment','contact']);
    if(isset($input['language'])&&!in_array($input['language'],['de','en','ru','unknown'],true)){throw new CrashReportError(400,'Invalid report language.');}
    if (($input['schemaVersion'] ?? null) !== 1) { throw new CrashReportError(400, 'Unsupported report schema.'); }
    cr_id((string) ($input['clientReportId'] ?? ''));
    if (!in_array($input['eventKind'] ?? '', ['gameCrash','gameExitUnknown','launcherPanic','launcherCrash','launcherExitUnknown'], true)) { throw new CrashReportError(400, 'Invalid event kind.'); }
    if (!is_int($input['occurredAtUnix'] ?? null) || $input['occurredAtUnix'] < 0 || $input['occurredAtUnix'] > 4102444800) { throw new CrashReportError(400, 'Invalid event time.'); }
    cr_object($input['launcher'] ?? null, ['version','buildId']);
    cr_version($input['launcher']['version']??null);cr_text($input['launcher']['buildId']??null,128);
    cr_object($input['game'] ?? null, ['version','skseVersion','runtimeManifestSha256','verifiedFiles','loadOrder']);
    cr_version($input['game']['version']??null);cr_version($input['game']['skseVersion']??null);cr_hex($input['game']['runtimeManifestSha256']??null,64);cr_integer($input['game']['verifiedFiles']??null,10000000);
    foreach(cr_list($input['game']['loadOrder']??null,512)as $plugin){cr_text($plugin,512);}
    cr_object($input['timeline'] ?? null, ['startedAtUnix','elapsedSeconds','lastConfirmedPhase']);
    cr_integer($input['timeline']['startedAtUnix']??null);cr_integer($input['timeline']['elapsedSeconds']??null);
    if(!in_array($input['timeline']['lastConfirmedPhase']??'',['gameProcessStarted','launcherRunning'],true)){throw new CrashReportError(400,'Invalid lifecycle phase.');}
    cr_object($input['crash'] ?? null, ['exitCode','native']);
    if(isset($input['crash']['exitCode'])&&(!is_string($input['crash']['exitCode'])||!preg_match('/^0x[a-f0-9]{8}$/iD',$input['crash']['exitCode']))){throw new CrashReportError(400,'Invalid exit code.');}
    cr_object($input['environment'] ?? null, ['os','architecture','cpu','ramTotalKiB','ramFreeKiB','gpu','hardwareAvailable']);
    foreach(['os','architecture']as $field){cr_text($input['environment'][$field]??null,128);}
    if(isset($input['environment']['cpu'])){cr_text($input['environment']['cpu'],256);}
    foreach(['ramTotalKiB','ramFreeKiB']as $field){$value=$input['environment'][$field]??null;if($value!==null&&!(is_int($value)&&$value>=0)&&!(is_string($value)&&preg_match('/^\d{1,20}$/D',$value))){throw new CrashReportError(400,'Invalid memory value.');}}
    if(isset($input['environment']['hardwareAvailable'])&&!is_bool($input['environment']['hardwareAvailable'])){throw new CrashReportError(400,'Invalid hardware status.');}
    if(isset($input['environment']['gpu'])){foreach(cr_list($input['environment']['gpu'],4)as $gpu){cr_object($gpu,['Name','DriverVersion']);foreach(['Name','DriverVersion']as $field){if(isset($gpu[$field])){cr_text($gpu[$field],256);}}}}
    $native = $input['crash']['native'] ?? null;
    if ($native !== null) {
        cr_object($native, ['capturedAtUnix','exceptionCode','module','rva','access','invalidAddress','threadId','loadedModules','stackAvailable','dumpCaptured','dumpError']);
        cr_module($native['module']??null,true);
        if(isset($native['capturedAtUnix'])){cr_integer($native['capturedAtUnix']);}
        cr_integer($native['threadId']??null,4294967295);
        if(!is_string($native['exceptionCode']??null)||!preg_match('/^0x[a-f0-9]{8}$/iD',$native['exceptionCode'])){throw new CrashReportError(400,'Invalid exception code.');}
        if(isset($native['access'])&&!in_array($native['access'],['read','write','execute','unknown'],true)){throw new CrashReportError(400,'Invalid access type.');}
        foreach(['stackAvailable','dumpCaptured']as $field){if(isset($native[$field])&&!is_bool($native[$field])){throw new CrashReportError(400,'Invalid capture status.');}}
        if(isset($native['dumpError'])){cr_text($native['dumpError'],512);}
        foreach(cr_list($native['loadedModules']??null,256)as $binary){if(!is_array($binary)){throw new CrashReportError(400,'Invalid module entry.');}cr_binary($binary,true);}
        foreach (['exceptionCode','rva','invalidAddress'] as $field) {
            if (isset($native[$field]) && (!is_string($native[$field]) || !preg_match('/^0x[a-f0-9]{1,16}$/iD', $native[$field]))) { throw new CrashReportError(400, 'Invalid exception address.'); }
        }
    }
    if (isset($input['serverId']) && (!is_string($input['serverId']) || !preg_match('/^srv_[a-zA-Z0-9_]{1,124}$/D', $input['serverId']))) { throw new CrashReportError(400, 'Invalid public server ID.'); }
    if (!is_array($input['binaries'] ?? null) || count($input['binaries']) > 64 || !is_array($input['logs'] ?? null) || count($input['logs']) > 8) { throw new CrashReportError(400, 'Invalid report attachments.'); }
    foreach(cr_list($input['binaries'],64)as $binary){if(!is_array($binary)){throw new CrashReportError(400,'Invalid binary entry.');}cr_binary($binary,false);}
    cr_list($input['logs'],8);
    $clean = cr_safe_value(array_diff_key($input, ['logs'=>true,'comment'=>true,'contact'=>true]));
    $allowedLogs = ['launcher.log','skse64_loader.log','skse64.log','skyrim-platform.log','SkyrimPlatform.log','SkyrimPlatformImpl.log'];
    $seen = []; $clean['logs'] = [];
    foreach ($input['logs'] as $log) {
        cr_object($log, ['name','available','truncated','contents']);
        if (!in_array($log['name'] ?? '', $allowedLogs, true) || isset($seen[$log['name']])) { throw new CrashReportError(400, 'Invalid log name.'); }
        $seen[$log['name']] = true;
        if (!is_bool($log['available'] ?? null) || !is_bool($log['truncated'] ?? null)) { throw new CrashReportError(400, 'Invalid log status.'); }
        $clean['logs'][] = ['name'=>$log['name'],'available'=>$log['available'],'truncated'=>$log['truncated'],'contents'=>cr_text($log['contents'] ?? '', 196608)];
    }
    $clean['comment'] = cr_text($input['comment'] ?? '', 8000);
    $contact = $input['contact'] ?? '';
    if (!is_string($contact) || strlen($contact) > 254 || ($contact !== '' && !filter_var($contact, FILTER_VALIDATE_EMAIL))) { throw new CrashReportError(400, 'Invalid optional contact address.'); }
    $clean['contact'] = $contact;
    return $clean;
}
function cr_path(string $root, array $entry): string
{
    $relative = (string) ($entry['path'] ?? '');
    if (!preg_match('~^\d{4}/\d{2}/\d{2}/[a-f0-9]{32}$~D', $relative)) { throw new RuntimeException('Invalid stored report path.'); }
    return $root . '/' . $relative;
}
function cr_remove_report(array &$index, string $root, string $id): void
{
    if (!isset($index['reports'][$id])) { return; }
    $directory = cr_path($root, $index['reports'][$id]);
    // Fixed generated file list only; never follow or recursively delete uploaded paths.
    foreach (['report.json','contact.json','logs/launcher.log','logs/skse64_loader.log','logs/skse64.log','logs/skyrim-platform.log','logs/SkyrimPlatform.log','logs/SkyrimPlatformImpl.log','attachments/crash.dmp'] as $file) {
        cr_unlink($directory . '/' . $file);
    }
    foreach (['logs','attachments',''] as $folder) { if (is_dir($directory . '/' . $folder)) { @rmdir($directory . '/' . $folder); } }
    unset($index['reports'][$id]);
}
function cr_cleanup(array &$index, string $root): void
{
    $reportDays = max(1, (int) cr_option('DEV_CRASH_RETENTION_DAYS', 90));
    $dumpDays = max(1, (int) cr_option('DEV_CRASH_DUMP_RETENTION_DAYS', 30));
    foreach ($index['reports'] as $id => &$entry) {
        if (($entry['receivedAtUnix'] ?? 0) < time() - $reportDays * 86400) { continue; }
        if (($entry['dumpBytes'] ?? 0) > 0 && ($entry['receivedAtUnix'] ?? 0) < time() - $dumpDays * 86400) {
            $file = cr_path($root, $entry) . '/attachments/crash.dmp';
            cr_unlink($file); $entry['dumpBytes'] = 0;
        }
    }
    unset($entry);
    foreach (array_keys($index['reports']) as $id) {
        if (($index['reports'][$id]['receivedAtUnix'] ?? 0) < time() - $reportDays * 86400) { cr_remove_report($index, $root, $id); }
    }
    foreach ($index['limits'] as $id => $limit) { if (($limit['expires'] ?? 0) <= time()) { unset($index['limits'][$id]); } }
}
function cr_quota(array $index, int $addition): void
{
    $used = 0;
    foreach ($index['reports'] as $entry) { $used += (int) ($entry['bytes'] ?? 0) + (int) ($entry['dumpBytes'] ?? 0); }
    if ($used + $addition > (int) cr_option('DEV_CRASH_QUOTA_BYTES', 2 * 1024 * 1024 * 1024)) { throw new CrashReportError(507, 'Crash storage quota reached.'); }
}
function cr_fingerprint(array $report): string
{
    $native = $report['crash']['native'] ?? [];
    $module = strtolower((string) ($native['module'] ?? ''));
    $identity = '';
    foreach ($native['loadedModules'] ?? [] as $entry) {
        if (strtolower((string) ($entry['name'] ?? '')) === $module) { $identity = isset($entry['pdb']) ? json_encode($entry['pdb']) : (string)($entry['sha256'] ?? ''); break; }
    }
    if ($identity === '' || $identity === 'null') {
        foreach ($report['binaries'] as $entry) { if (strtolower(basename(str_replace('\\','/', (string) ($entry['name'] ?? '')))) === $module) { $identity = (string) ($entry['sha256'] ?? ''); break; } }
    }
    // Unknown addresses do not collapse into one supposedly identified native fault.
    if ($module === '' || !isset($native['rva']) || $identity === '') { return hash('sha256', 'unresolved|' . $report['clientReportId']); }
    return hash('sha256', implode('|', [$report['eventKind'],$module,$identity,strtolower((string) ($native['exceptionCode'] ?? $report['crash']['exitCode'] ?? '')),strtolower($native['rva'])]));
}
function cr_receive(array $raw, string $source): array
{
    $report = cr_validate($raw);
    return cr_transaction(static function (array &$index, string $root) use ($report, $source): array {
        cr_cleanup($index, $root);
        $key = cr_key($root);
        $id = substr(hash_hmac('sha256', 'report:' . $report['clientReportId'], $key), 0, 32);
        $body = json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $digest = hash('sha256', $body);
        $receipt = ['reportId'=>$id,'uploadToken'=>hash_hmac('sha256','dump:'.$id,$key),'maxDumpBytes'=>cr_max_dump()];
        if (isset($index['reports'][$id])) {
            if (!hash_equals($index['reports'][$id]['sha256'], $digest)) { throw new CrashReportError(409, 'Report ID already used for different content.'); }
            return $receipt + ['duplicate'=>true,'dumpStored'=>($index['reports'][$id]['dumpBytes'] ?? 0)>0];
        }
        if (count($index['reports']) >= (int) cr_option('DEV_CRASH_MAX_REPORTS', 10000)) { throw new CrashReportError(507, 'Crash report limit reached.'); }
        $bucket = hash_hmac('sha256', $source, $key);
        if (!isset($index['limits'][$bucket]) && count($index['limits']) >= 20000) { throw new CrashReportError(429, 'Upload limit reached.'); }
        $limit = $index['limits'][$bucket] ?? ['count'=>0,'expires'=>time()+3600];
        if ($limit['count'] >= (int) cr_option('DEV_CRASH_HOURLY_LIMIT', 20)) { throw new CrashReportError(429, 'Too many reports.'); }
        $limit['count']++; $index['limits'][$bucket] = $limit;
        cr_quota($index, strlen($body) * 2 + 1024);
        $relative = gmdate('Y/m/d') . '/' . $id;
        $directory = $root . '/' . $relative;
        if (!is_dir($directory.'/logs') && !mkdir($directory.'/logs',0700,true)) { throw new RuntimeException('Cannot store report.'); }
        $contact = $report['contact']; unset($report['contact']);
        cr_atomic($directory.'/report.json',json_encode($report, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
        if ($contact !== '') { cr_atomic($directory.'/contact.json',json_encode(['contact'=>$contact], JSON_THROW_ON_ERROR)); }
        foreach ($report['logs'] as $log) { if ($log['available']) { cr_atomic($directory.'/logs/'.$log['name'],$log['contents']); } }
        $index['reports'][$id] = ['id'=>$id,'path'=>$relative,'receivedAtUnix'=>time(),'occurredAtUnix'=>$report['occurredAtUnix'],'eventKind'=>$report['eventKind'],'launcherVersion'=>$report['launcher']['version'] ?? '', 'buildId'=>$report['launcher']['buildId'] ?? '', 'runtime'=>$report['game']['version'] ?? '', 'serverId'=>$report['serverId'] ?? '', 'module'=>$report['crash']['native']['module'] ?? '', 'rva'=>$report['crash']['native']['rva'] ?? '', 'code'=>$report['crash']['native']['exceptionCode'] ?? $report['crash']['exitCode'] ?? '', 'fingerprint'=>cr_fingerprint($report),'status'=>'new','sha256'=>$digest,'bytes'=>strlen($body)*2+1024,'dumpBytes'=>0];
        return $receipt + ['duplicate'=>false,'dumpStored'=>false];
    });
}
function cr_store_dump(string $id, string $token, string $expected, $stream, int $length): array
{
    cr_id($id);
    if (!preg_match('/^[a-f0-9]{64}$/D',$token) || !preg_match('/^[a-f0-9]{64}$/D',$expected)) { throw new CrashReportError(401,'Invalid dump authorization.'); }
    return cr_transaction(static function (array &$index,string $root) use ($id,$token,$expected,$stream,$length): array {
        $entry = $index['reports'][$id] ?? null;
        if ($entry === null || !hash_equals(hash_hmac('sha256','dump:'.$id,cr_key($root)),$token)) { throw new CrashReportError(401,'Invalid dump authorization.'); }
        if ($entry['receivedAtUnix'] < time()-7*86400) { throw new CrashReportError(410,'Dump authorization expired.'); }
        $maximum = cr_max_dump();
        if ($length < 32 || $length > $maximum) { throw new CrashReportError(413,'Dump exceeds hosting limit.'); }
        $directory = cr_path($root,$entry).'/attachments';
        if (!is_dir($directory) && !mkdir($directory,0700,true)) { throw new RuntimeException('Cannot store dump.'); }
        $target = $directory.'/crash.dmp';
        if (cr_file_exists($target)) {
            if (!hash_equals(cr_file_hash($target),$expected)) { throw new CrashReportError(409,'Different dump already stored.'); }
            return ['stored'=>true,'duplicate'=>true];
        }
        cr_quota($index,$length);
        [$temporary,$file,$disk] = cr_temporary($target);
        try {
            $offset = ftell($file);
            $copied = stream_copy_to_stream($stream,$file,$maximum+1);
            if ($copied !== $length || $copied > $maximum) { throw new CrashReportError(413,'Invalid dump size.'); }
            fseek($file,$offset); $signature = fread($file,4);
            fseek($file,$offset); $hash = hash_init('sha256'); hash_update_stream($hash,$file);
            if ($signature !== 'MDMP' || !hash_equals(hash_final($hash),$expected)) { throw new CrashReportError(400,'Invalid dump signature or checksum.'); }
            fclose($file);$file=null;
            if (!rename($temporary,$disk)) { throw new RuntimeException('Cannot finalize dump.'); }
            $index['reports'][$id]['dumpBytes']=$length;
            return ['stored'=>true,'duplicate'=>false];
        } finally { if (is_resource($file)) {fclose($file);} if (is_file($temporary)) {unlink($temporary);} }
    });
}
function cr_is_admin(?array $user): bool
{
    return $user !== null && function_exists('current_user') && current_user() === $user && ($user['provider'] ?? '') === 'developer-sso';
}
