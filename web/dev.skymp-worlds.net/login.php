<?php
require_once __DIR__.'/includes/bootstrap.php';
require_once __DIR__.'/includes/page.php';
require_once __DIR__.'/includes/crash-reports.php';
require_once __DIR__.'/includes/setup-status.php';
if (current_user() !== null) { redirect_to('crash-reports.php'); }
$setup = dev_setup_status(); $ready = $setup['ready'];
if (is_post_request()) {
    verify_csrf_or_abort();
    if ($ready) {
        $_SESSION['dev_signin'] = ['state'=>bin2hex(random_bytes(32)), 'created'=>time()];
        header('Location: '.dev_manage_url('developer-access.php').'?'.http_build_query(['state'=>$_SESSION['dev_signin']['state'], 'lang'=>current_language()]), true, 303); exit;
    }
}
if (!$ready) { http_response_code(503); }
dev_page_start(dev_t('portal'));
?><p class="eyebrow">SKYMP WORLDS · DEVELOPERS</p><h1><?=e(dev_t('tagline'))?></h1><p class="dev-intro"><?=e(dev_t('intro'))?></p><p class="muted"><?=e(dev_t('signInHint'))?></p>
<?php if(isset($_GET['failed'])):?><p class="flash flash-error" role="alert"><?=e(dev_t('failed'))?></p><?php endif;?>
<?php if(!$ready):?><p class="flash flash-error" role="status"><?=e(dev_t('notConfigured'))?></p><?php endif;?>
<?php if(!$ready || !$setup['checks']['upload']['ok'] || isset($_GET['setup'])):?>
<section class="dev-setup" aria-labelledby="dev-setup-title"><h2 id="dev-setup-title"><?=e(dev_t('setupTitle'))?></h2><p class="muted"><?=e(dev_t('setupHint'))?></p>
<ul class="dev-setup-checks"><?php foreach($setup['checks'] as $name=>$check):?>
<li data-setup="<?=e($name)?>" data-status="<?=$check['ok']?'ready':'missing'?>"><div><strong><?=e(dev_t($check['label']))?></strong><span class="dev-setup-status"><?=e(dev_t($check['ok']?'setupReady':'setupMissing'))?></span></div><p><?=e(dev_t($check['hint']))?></p></li>
<?php endforeach;?></ul><p class="dev-setup-path"><code>define('DEV_CRASH_DIRECTORY', __DIR__ . '/reports');</code></p></section>
<?php endif;?>
<?php if($ready):?><form method="post"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><button class="button button-primary" type="submit"><?=e(dev_t('signIn'))?> <span aria-hidden="true">↗</span></button></form><?php endif;?>
<p class="muted dev-session-hint"><?=e(dev_t('session'))?></p>
<?php dev_page_end(); ?>
