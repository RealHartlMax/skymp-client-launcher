<?php
require_once __DIR__.'/includes/bootstrap.php';
require_login();
require_once __DIR__.'/includes/crash-reports.php';
require_once __DIR__.'/includes/crash-translations.php';
$user=current_user();
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: no-referrer');
if (!cr_is_admin($user)) {
    http_response_code(403);
    echo '<!doctype html><html lang="'.e(current_language()).'"><meta charset="utf-8"><title>'.e(cr_t('title')).'</title><link rel="stylesheet" href="'.e(app_url('assets/worlds.css?v=8de9376aef2a')).'"><body class="dashboard-shell"><main class="panel"><h1>'.e(cr_t('title')).'</h1><p>'.e(cr_t('denied')).'</p><p>'.e(cr_t('account')).': <code>'.e((string)($user['id']??'')).'</code></p><a class="button button-secondary" href="'.e(app_url('dashboard.php')).'">'.e(cr_t('back')).'</a></main></body></html>';exit;
}
// DEV_PORTAL_REDIRECT_START
if (!is_post_request() && defined('MANAGE_DEV_SSO_SECRET') && strlen((string)MANAGE_DEV_SSO_SECRET)>=32) {
    require_once __DIR__.'/includes/developer-sso.php';
    $origin=ds_origin((string)(defined('MANAGE_DEV_PUBLIC_URL')?MANAGE_DEV_PUBLIC_URL:'https://dev.skymp-worlds.net'));
    $query=array_filter(array_intersect_key($_GET,array_flip(['id','download','q','kind','status','signature','from','to','page','lang'])),static fn($value):bool=>is_string($value)&&strlen($value)<=200);
    header('Location: '.$origin.'/crash-reports.php'.($query?'?'.http_build_query($query):''),true,303);exit;
}
// DEV_PORTAL_REDIRECT_END
$error='';$notice='';$entries=[];$selected=null;$details=null;$groups=[];
try {
    if(is_post_request()) {
        verify_csrf_or_abort();
        $action=(string)($_POST['action']??'');$id=(string)($_POST['id']??'');
        cr_transaction(static function(array &$index,string $root)use($action,$id):void{
            if($action==='cleanup'){cr_cleanup($index,$root);return;}
            cr_id($id);if(!isset($index['reports'][$id])){throw new CrashReportError(404,'Report not found.');}
            if($action==='delete'){cr_remove_report($index,$root,$id);return;}
            $status=(string)($_POST['status']??'');
            if($action!=='status'||!in_array($status,['new','investigating','resolved'],true)){throw new CrashReportError(400,'Invalid report status.');}
            $index['reports'][$id]['status']=$status;
        });
        set_flash('success',cr_t($action==='cleanup'?'cleaned':($action==='delete'?'deleted':'updated')));
        redirect_to('crash-reports.php'.($action==='status'?'?id='.rawurlencode($id):''));
    }
    $entries=cr_transaction(static fn(array &$index,string $root):array=>$index['reports']);
    $id=(string)($_GET['id']??'');
    if($id!==''){
        cr_id($id);$selected=$entries[$id]??null;
        if($selected===null){throw new CrashReportError(404,'Report not found.');}
        $directory=cr_path(cr_directory(),$selected);
        if(isset($_GET['download'])){
            $file=(string)$_GET['download'];
            $allowed=['report'=>'report.json','dump'=>'attachments/crash.dmp','contact'=>'contact.json','launcher'=>'logs/launcher.log','loader'=>'logs/skse64_loader.log','skse'=>'logs/skse64.log','platform'=>'logs/skyrim-platform.log','implementation'=>'logs/SkyrimPlatformImpl.log'];
            if(!isset($allowed[$file])){throw new CrashReportError(400,'Invalid attachment.');}
            $path=$directory.'/'.$allowed[$file];
            if(!cr_file_exists($path)){throw new CrashReportError(404,'Attachment not found.');}
            header('Content-Type: application/octet-stream');header('Content-Disposition: attachment; filename="'.$id.'-'.basename($path).'"');header('Content-Length: '.cr_file_size($path));
            session_write_close();cr_stream($path);exit;
        }
        $details=json_decode(cr_read($directory.'/report.json'),true,32,JSON_THROW_ON_ERROR);
    }
    foreach($entries as $entry){
        $signature=$entry['fingerprint'];
        $group=$groups[$signature]??['count'=>0,'first'=>$entry['receivedAtUnix'],'last'=>$entry['receivedAtUnix']];
        $group['count']++;$group['first']=min($group['first'],$entry['receivedAtUnix']);$group['last']=max($group['last'],$entry['receivedAtUnix']);$groups[$signature]=$group;
    }
}catch(CrashReportError $exception){http_response_code($exception->status);$error=$exception->status===503?cr_t('setup'):cr_t('error');}
catch(Throwable $exception){http_response_code(503);$error=cr_t('error');}
$query=trim(substr((string)($_GET['q']??''),0,200));$kind=(string)($_GET['kind']??'');$status=(string)($_GET['status']??'');$signature=(string)($_GET['signature']??'');
$from=(string)($_GET['from']??'');$to=(string)($_GET['to']??'');
foreach(['from'=>$from,'to'=>$to]as $name=>$date){if($date!==''&&!preg_match('/^\d{4}-\d{2}-\d{2}$/D',$date)){if($name==='from'){$from='';}else{$to='';}}}
$filtered=array_filter($entries,static function(array $entry)use($query,$kind,$status,$from,$to,$signature):bool{
    $date=gmdate('Y-m-d',$entry['receivedAtUnix']);
    if($kind!==''&&$entry['eventKind']!==$kind||$status!==''&&$entry['status']!==$status||$from!==''&&strcmp($date,$from)<0||$to!==''&&strcmp($date,$to)>0||$signature!==''&&$entry['fingerprint']!==$signature){return false;}
    return $query===''||str_contains(strtolower(implode(' ',[$entry['id'],$entry['buildId'],$entry['launcherVersion'],$entry['runtime'],$entry['serverId'],$entry['module'],$entry['code']])),strtolower($query));
});
uasort($filtered,static fn(array $a,array $b):int=>($b['receivedAtUnix']<=>$a['receivedAtUnix'])?:strcmp($a['id'],$b['id']));
$total=count($filtered);$pages=max(1,(int)ceil($total/50));$page=max(1,min($pages,(int)($_GET['page']??1)));$visible=array_slice($filtered,($page-1)*50,50,true);
$flash=consume_flash();$utc=static fn(int $stamp):string=>gmdate('Y-m-d H:i:s',$stamp);
?>
<!doctype html>
<html lang="<?=e(current_language())?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=e(cr_t('title'))?> · SkyMP Worlds</title><link rel="stylesheet" href="<?=e(app_url('assets/worlds.css?v=8de9376aef2a'))?>"><link rel="stylesheet" href="<?=e(app_url('assets/crash-reports.css?v=1'))?>"></head>
<body class="dashboard-shell"><div class="site-layout">
<header class="panel topbar"><div><p class="eyebrow">SKYMP WORLDS · DEVELOPERS</p><h1><?=e(cr_t('title'))?></h1></div><div class="topbar-actions">
                <a class="button button-ghost community-link" data-platform-community="navigation" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a>
                <a class="button button-ghost docs-link" data-platform-docs="navigation" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a>
                <a class="button button-ghost docs-link" data-platform-downloads="navigation" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="button button-secondary" href="<?=e(app_url('dashboard.php'))?>"><?=e(cr_t('back'))?></a><?php foreach(['de'=>'DE','en'=>'EN','ru'=>'RU']as $code=>$label):?><a class="button button-ghost" href="<?=e(app_url('crash-reports.php').'?'.http_build_query(array_merge($_GET,['lang'=>$code])))?>" lang="<?=$code?>"><?=$label?></a><?php endforeach;?></div></header>
<p class="muted"><?=e(cr_t('notice'))?></p>
<?php if($error!==''):?><div class="flash flash-error" role="alert"><?=e($error)?></div><?php endif;?>
<?php if($flash):?><div class="flash flash-success" role="status"><?=e((string)$flash['message'])?></div><?php endif;?>
<?php if($selected!==null&&$details!==null): $group=$groups[$selected['fingerprint']]??['count'=>1,'first'=>$selected['receivedAtUnix'],'last'=>$selected['receivedAtUnix']]; ?>
<main class="panel"><a class="docs-link" href="<?=e(app_url('crash-reports.php'))?>">← <?=e(cr_t('backList'))?></a><h2><?=e(cr_t($selected['eventKind']))?></h2><code class="crash-id"><?=e($selected['id'])?></code>
<dl class="crash-metadata"><div><dt><?=e(cr_t('received'))?></dt><dd><?=e($utc($selected['receivedAtUnix']))?></dd></div><div><dt><?=e(cr_t('version'))?></dt><dd><?=e($selected['buildId'].' / '.$selected['runtime'])?></dd></div><div><dt><?=e(cr_t('fault'))?></dt><dd><?=e($selected['code'].' '.$selected['module'].' '.$selected['rva'])?></dd></div><div><dt><?=e(cr_t('similar'))?></dt><dd><a href="<?=e(app_url('crash-reports.php').'?signature='.$selected['fingerprint'])?>"><?=e((string)$group['count'])?></a></dd></div><div><dt><?=e(cr_t('first'))?></dt><dd><?=e($utc($group['first']))?></dd></div><div><dt><?=e(cr_t('last'))?></dt><dd><?=e($utc($group['last']))?></dd></div></dl>
<p class="muted"><?=e(cr_t('fingerprint'))?>: <code><?=e($selected['fingerprint'])?></code></p>
<form method="post" class="crash-inline"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><input type="hidden" name="action" value="status"><input type="hidden" name="id" value="<?=e($selected['id'])?>"><label><?=e(cr_t('status'))?><select name="status"><?php foreach(['new','investigating','resolved']as $value):?><option value="<?=$value?>" <?=$selected['status']===$value?'selected':''?>><?=e(cr_t($value))?></option><?php endforeach;?></select></label><button type="submit" class="button button-primary"><?=e(cr_t('save'))?></button></form>
<div class="crash-downloads"><a class="button button-secondary" href="?<?=e(http_build_query(['id'=>$selected['id'],'download'=>'report']))?>"><?=e(cr_t('report'))?></a><?php if($selected['dumpBytes']>0):?><a class="button button-secondary" href="?<?=e(http_build_query(['id'=>$selected['id'],'download'=>'dump']))?>"><?=e(cr_t('dump'))?> (<?=e((string)round($selected['dumpBytes']/1048576,1))?> MiB)</a><?php else:?><span class="muted"><?=e(cr_t('noDump'))?></span><?php endif;?><?php if(cr_file_exists($directory.'/contact.json')):?><a class="button button-secondary" href="?<?=e(http_build_query(['id'=>$selected['id'],'download'=>'contact']))?>"><?=e(cr_t('contact'))?></a><?php endif;?></div>
<details class="crash-json"><summary><?=e(cr_t('details'))?></summary><pre><?=e(json_encode($details,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES))?></pre></details>
<form method="post" data-confirm="<?=e(cr_t('confirm'))?>"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="<?=e($selected['id'])?>"><button class="button button-danger" type="submit"><?=e(cr_t('delete'))?></button></form>
</main>
<?php else:?>
<main class="panel"><form class="crash-filters" method="get"><label class="crash-query"><?=e(cr_t('search'))?><input name="q" value="<?=e($query)?>" maxlength="200" type="search"></label><label><?=e(cr_t('from'))?><input type="date" name="from" value="<?=e($from)?>"></label><label><?=e(cr_t('to'))?><input type="date" name="to" value="<?=e($to)?>"></label><label><?=e(cr_t('kind'))?><select name="kind"><option value=""><?=e(cr_t('all'))?></option><?php foreach(['gameCrash','gameExitUnknown','launcherPanic','launcherCrash','launcherExitUnknown']as $value):?><option value="<?=$value?>" <?=$kind===$value?'selected':''?>><?=e(cr_t($value))?></option><?php endforeach;?></select></label><label><?=e(cr_t('status'))?><select name="status"><option value=""><?=e(cr_t('all'))?></option><?php foreach(['new','investigating','resolved']as $value):?><option value="<?=$value?>" <?=$status===$value?'selected':''?>><?=e(cr_t($value))?></option><?php endforeach;?></select></label><button class="button button-primary" type="submit"><?=e(cr_t('filter'))?></button></form>
<p class="muted"><?=e(cr_t('count'))?>: <?=e((string)$total)?></p><div class="crash-table-wrap"><table class="crash-table"><thead><tr><th><?=e(cr_t('received'))?></th><th><?=e(cr_t('kind'))?></th><th><?=e(cr_t('version'))?></th><th><?=e(cr_t('fault'))?></th><th><?=e(cr_t('similar'))?></th><th><?=e(cr_t('status'))?></th><th></th></tr></thead><tbody>
<?php foreach($visible as $entry):?><tr>
<td data-label="<?=e(cr_t('received'))?>"><?=e($utc($entry['receivedAtUnix']))?></td>
<td data-label="<?=e(cr_t('kind'))?>"><?=e(cr_t($entry['eventKind']))?></td>
<td data-label="<?=e(cr_t('version'))?>"><?=e($entry['buildId'])?><br><span class="muted"><?=e($entry['runtime'])?></span></td>
<td data-label="<?=e(cr_t('fault'))?>"><?=e($entry['module'])?><br><code><?=e($entry['code'].' '.$entry['rva'])?></code></td>
<td data-label="<?=e(cr_t('similar'))?>"><a href="?<?=e(http_build_query(['signature'=>$entry['fingerprint']]))?>"><?=e((string)($groups[$entry['fingerprint']]['count']??1))?></a></td>
<td data-label="<?=e(cr_t('status'))?>"><?=e(cr_t($entry['status']))?></td>
<td><a class="button button-secondary" href="?id=<?=e($entry['id'])?>"><?=e(cr_t('open'))?></a></td>
</tr><?php endforeach;?>
</tbody></table></div><?php if($visible===[]):?><p><?=e(cr_t('empty'))?></p><?php endif;?>
<nav class="crash-pagination" aria-label="<?=e(cr_t('page'))?>"><?php if($page>1):?><a class="button button-secondary" href="?<?=e(http_build_query(array_merge($_GET,['page'=>$page-1])))?>"><?=e(cr_t('previous'))?></a><?php endif;?><span><?=e(cr_t('page').' '.$page.' / '.$pages)?></span><?php if($page<$pages):?><a class="button button-secondary" href="?<?=e(http_build_query(array_merge($_GET,['page'=>$page+1])))?>"><?=e(cr_t('next'))?></a><?php endif;?></nav>
<form method="post"><input type="hidden" name="csrf_token" value="<?=e(csrf_token())?>"><input type="hidden" name="action" value="cleanup"><button class="button button-secondary" type="submit"><?=e(cr_t('cleanup'))?></button></form>
</main><?php endif;?>
</div><script src="<?=e(app_url('assets/crash-reports.js?v=1'))?>" defer></script><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer>
<script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
<script src="<?= e(app_url('assets/password-fields.js?v=b1886b4ff91d')) ?>" defer></script>
</body></html>
