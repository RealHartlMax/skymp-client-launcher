<?php
// Show only static check results. Never expose values, secrets or hosting paths.
function dev_setup_status(): array
{
    $checks = [];
    $checks['config'] = ['ok'=>is_file(dirname(__DIR__).'/config.php'), 'label'=>'setupConfig', 'hint'=>'setupConfigHint'];
    $checks['sso'] = ['ok'=>defined('DEV_SSO_SECRET') && strlen((string)DEV_SSO_SECRET) >= 32, 'label'=>'setupSso', 'hint'=>'setupSsoHint'];
    $urls = true;
    try { ds_origin(DEV_PUBLIC_URL); ds_origin(DEV_MANAGE_PUBLIC_URL); } catch (Throwable $error) { $urls = false; }
    $checks['urls'] = ['ok'=>$urls, 'label'=>'setupUrls', 'hint'=>'setupUrlsHint'];
    $storage = true; $storageHint = 'setupStorageHint';
    try { @cr_directory(); }
    catch (CrashReportError $error) { $storage = false; $storageHint = in_array($error->reason,['setupStoragePath','setupStorageWrite','setupStorageFormat'],true) ? $error->reason : 'setupStorageWrite'; }
    catch (Throwable $error) { $storage = false; $storageHint = 'setupStorageWrite'; }
    $checks['storage'] = ['ok'=>$storage, 'label'=>'setupStorage', 'hint'=>$storageHint];
    $ready = !in_array(false, array_column($checks,'ok'), true);
    $checks['upload'] = ['ok'=>defined('DEV_CRASH_PROXY_TOKEN') && strlen((string)DEV_CRASH_PROXY_TOKEN) >= 32, 'label'=>'setupUpload', 'hint'=>'setupUploadHint'];
    return ['ready'=>$ready, 'checks'=>$checks];
}
