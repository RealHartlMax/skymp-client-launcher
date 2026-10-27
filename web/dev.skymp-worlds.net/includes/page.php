<?php
function dev_page_start(string $title): void
{
    $language = current_language();
    ?><!doctype html><html lang="<?=e($language)?>"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=e($title)?> · SkyMP Worlds</title><link rel="stylesheet" href="assets/worlds.css?v=8de9376aef2a"><link rel="stylesheet" href="assets/dev.css?v=2"></head><body class="dev-shell"><div class="site-layout"><header class="panel topbar"><a class="dev-brand" href="index.php"><span class="dev-mark" aria-hidden="true">S</span><span>SkyMP <em>Worlds</em><small><?=e(dev_t('portal'))?></small></span></a><nav class="topbar-actions" aria-label="SkyMP Worlds"><?php foreach(['de'=>'DE','en'=>'EN','ru'=>'RU'] as $code=>$label):?><a class="button button-ghost" href="?lang=<?=$code?>" lang="<?=$code?>" <?=$language===$code?'aria-current="true"':''?>><?=$label?></a><?php endforeach;?></nav></header><main class="panel dev-auth"><?php
}
function dev_page_end(): void
{
    ?></main><footer class="community-footer" aria-label="SkyMP Worlds"><a class="docs-link" data-platform-docs="footer" href="https://docs.skymp-worlds.net/?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Dokumentation', 'en' => 'Documentation', 'ru' => 'Документация'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="docs-link" data-platform-downloads="footer" href="https://update.skymp-worlds.net/index.html?lang=<?= e(current_language()) ?>"><?= e(['de' => 'Downloads', 'en' => 'Downloads', 'ru' => 'Загрузки'][current_language()]) ?> <span aria-hidden="true">↗</span></a><a class="community-link" data-platform-community="footer" href="https://discord.gg/NSXtNNbjuR" target="_blank" rel="noopener noreferrer">SkyMP Discord <span aria-hidden="true">↗</span></a></footer></div><script src="<?= e(app_url('assets/country-flags.js?v=0c29f00b2b6d')) ?>" defer></script>
</body></html><?php
}
