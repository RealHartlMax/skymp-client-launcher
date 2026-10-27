<?php
require_once __DIR__.'/includes/bootstrap.php';
require_login();
require_once __DIR__.'/includes/crash-reports.php';
require_once __DIR__.'/includes/page.php';
$error = '';
if (is_post_request()) {
    verify_csrf_or_abort();
    $receipt = null;
    try {
        $file = $_FILES['report'] ?? [];
        if (($file['error'] ?? -1) !== UPLOAD_ERR_OK || !is_int($file['size'] ?? null) || $file['size'] < 1 || $file['size'] > 1048576 || !is_uploaded_file($file['tmp_name'] ?? '')) { throw new RuntimeException('Invalid report file.'); }
        $bytes = file_get_contents($file['tmp_name'], false, null, 0, 1048577);
        if ($bytes === false || strlen($bytes) > 1048576) { throw new RuntimeException('Report too large.'); }
        $raw = json_decode($bytes, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($raw)) { throw new RuntimeException('Invalid report.'); }
        $dump = $_FILES['dump'] ?? [];
        $hasDump = ($dump['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
        if ($hasDump && (($dump['error'] ?? -1) !== UPLOAD_ERR_OK || ($_POST['dump_consent'] ?? '') !== '1'
            || !is_int($dump['size'] ?? null) || $dump['size'] < 32 || $dump['size'] > cr_max_dump() || !is_uploaded_file($dump['tmp_name'] ?? ''))) { throw new RuntimeException('Invalid dump file.'); }
        $receipt = cr_receive($raw, hash('sha256', 'developer-import|'.current_user()['id']));
        if ($hasDump) {
            $stream = fopen($dump['tmp_name'], 'rb');
            try { cr_store_dump($receipt['reportId'], $receipt['uploadToken'], hash_file('sha256', $dump['tmp_name']), $stream, $dump['size']); }
            finally { if (is_resource($stream)) { fclose($stream); } }
        }
        set_flash('success', dev_t('importSuccess'));
        redirect_to('crash-reports.php?id='.$receipt['reportId']);
    } catch (Throwable $exception) {
        http_response_code(400); $error = dev_t($receipt === null ? 'importError' : 'importDumpError');
    }
}
dev_page_start(dev_t('import'));
?><a class="docs-link" href="crash-reports.php">← <?=e(dev_t('reports'))?></a><p class="eyebrow">SKYMP WORLDS · DEVELOPERS</p><h1><?=e(dev_t('import'))?></h1><p class="muted"><?=e(dev_t('importHint'))?></p>
<?php if($error!==''):?><p class="flash flash-error" role="alert"><?=e($error)?></p><?php endif;?>
<form method="post" enctype="multipart/form-data" class="dev-import-form"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><label><?=e(dev_t('basisFile'))?><input type="file" name="report" accept=".json,application/json" required></label><label><?=e(dev_t('dumpFile'))?> (<?=e((string)round(cr_max_dump()/1048576, 1))?> MiB)<input type="file" name="dump" accept=".dmp,application/octet-stream"></label><label class="dev-consent"><input type="checkbox" name="dump_consent" value="1"><span><?=e(dev_t('dumpConsent'))?></span></label><button type="submit" class="button button-primary"><?=e(dev_t('importSubmit'))?></button></form>
<?php dev_page_end(); ?>
