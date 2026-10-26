param(
    [Parameter(Mandatory = $true)][string] $OutputDirectory,
    [switch] $IncludeNodeReference,
    [string] $LauncherExecutable,
    [string] $RuntimeDirectory,
    [string[]] $Domains = @()
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sites = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'web-sites.json') -Raw | ConvertFrom-Json)
if ($Domains.Count -gt 0) {
    foreach ($domain in $Domains) { if ($domain -notin $sites.domain) { throw "Unknown web domain: $domain" } }
    $sites = @($sites | Where-Object { $_.domain -in $Domains })
}
$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) { throw 'Choose a new output directory; existing deployments are never overwritten.' }
& node (Join-Path $PSScriptRoot 'sync-web-assets.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Web asset synchronization failed.' }
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$allowedExtensions = @('.html', '.css', '.js', '.php', '.sql', '.md', '.jpg', '.png', '.svg', '.woff2')
$sourceRoots = @('web')
if ($IncludeNodeReference) { $sourceRoots += 'master-api' }
foreach ($sourceRoot in $sourceRoots) {
    $sourcePath = Join-Path $projectRoot $sourceRoot
    Get-ChildItem -LiteralPath $sourcePath -Recurse -File | ForEach-Object {
        $relative = [System.IO.Path]::GetRelativePath($sourcePath, $_.FullName)
        $parts = $relative -split '[\\/]'
        if ($sourceRoot -eq 'web' -and $parts[0] -eq 'shared') { return }
        if ($sourceRoot -eq 'web' -and $parts[0] -notin $sites.directory) { return }
        $isPrivate = ($parts | Where-Object { $_ -in @('data', 'game-auth', 'node_modules', 'vendor') }).Count -gt 0
        $isPrivate = $isPrivate -or $_.Name -in @('config.php', 'private.php', '.env', 'state.json', 'master.key') -or $_.Extension -in @('.sqlite', '.db', '.zip', '.log')
        if ($parts -contains 'reports') {
            # Never package real data, including protected report.json.php / crash.dmp.php files.
            $isPrivate = $isPrivate -or -not ($parts.Count -eq 3 -and $parts[0] -eq 'dev.skymp-worlds.net' -and $parts[1] -eq 'reports' -and $_.Name -in @('.htaccess', 'index.php'))
        }
        $isAllowed = $_.Extension -in $allowedExtensions -or $_.Name -in @('.htaccess', 'config.php.example', '.env.example', 'package.json', 'composer.json', 'OFL.txt')
        if ($parts -contains 'fonts' -and $_.Name -eq 'sources.json') { $isAllowed = $true }
        if ($parts -contains 'flags' -and $_.Name -in @('LICENSE.txt', 'sources.json', 'countries.json')) { $isAllowed = $true }
        if ($parts -contains 'PHPMailer' -and $_.Name -eq 'LICENSE') { $isAllowed = $true }
        if ($parts[0] -eq 'docs.skymp-worlds.net' -and $_.Name -in @('robots.txt', 'sitemap.xml')) { $isAllowed = $true }
        if ($sourceRoot -eq 'master-api') { $isAllowed = $_.Extension -eq '.mjs' -or $_.Name -in @('README.md', 'package.json', '.env.example') }
        if ($sourceRoot -eq 'web' -and $relative -match '^update\.skymp-worlds\.net[\\/](latest|version|channels[\\/](release|latest))\.json$') { $isAllowed = $true }
        if (-not $isPrivate -and $isAllowed) {
            $destination = Join-Path $outputRoot (Join-Path $sourceRoot $relative)
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $destination
        }
    }
}
# The synchronized CSS and local fonts above make each webroot deployable independently.
$updateRoot = Join-Path $outputRoot 'web/update.skymp-worlds.net'
if ($LauncherExecutable) {
    if ('update.skymp-worlds.net' -notin $sites.domain) { throw 'LauncherExecutable requires the update domain in this package.' }
    $executable = Get-Item -LiteralPath $LauncherExecutable
    $metadata = Get-Content -LiteralPath (Join-Path $updateRoot 'version.json') -Raw | ConvertFrom-Json
    $hash = (Get-FileHash -LiteralPath $executable.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($executable.PSIsContainer -or $executable.Extension -ne '.exe' -or $metadata.windowsAssetName -notmatch '^[A-Za-z0-9._-]+\.exe$' -or $hash -ne $metadata.windowsAssetSha256) { throw 'Launcher executable does not match the prepared download metadata.' }
    $downloads = Join-Path $updateRoot 'downloads'
    New-Item -ItemType Directory -Path $downloads | Out-Null
    Copy-Item -LiteralPath $executable.FullName -Destination (Join-Path $downloads $metadata.windowsAssetName)
    Set-Content -LiteralPath (Join-Path $downloads ($metadata.windowsAssetName + '.sha256')) -Value "$hash  $($metadata.windowsAssetName)" -Encoding ascii
    Copy-Item -LiteralPath (Join-Path $projectRoot 'web/shared/fonts/OFL.txt') -Destination (Join-Path $downloads 'Noto-OFL.txt')
}
if ($RuntimeDirectory) {
    if ('update.skymp-worlds.net' -notin $sites.domain) { throw 'RuntimeDirectory requires the update domain in this package.' }
    $runtimeRoot = (Resolve-Path -LiteralPath $RuntimeDirectory).Path
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'catalog.json') -PathType Leaf)) { throw 'RuntimeDirectory must contain a generated catalog.json.' }
    if (@(Get-ChildItem -LiteralPath $runtimeRoot -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Runtime package must not contain links.' }
    if (@(Get-ChildItem -LiteralPath $runtimeRoot -Recurse -File | Where-Object { $_.Name -match 'auth-data|skymp5-client-settings|server-settings|^config\.php$|^state\.json$' }).Count) { throw 'Private runtime files must not be published.' }
    Copy-Item -LiteralPath $runtimeRoot -Destination (Join-Path $updateRoot 'client-runtime') -Recurse
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/PHP_HOSTING.md') -Destination (Join-Path $outputRoot 'READ-ME-FIRST.md')
$firstReadme = Join-Path $outputRoot 'READ-ME-FIRST.md'
$firstReadmeText = Get-Content -LiteralPath $firstReadme -Raw
$firstReadmeText = [regex]::Replace($firstReadmeText, '\]\(([A-Z][A-Za-z0-9_.-]+\.md(?:#[a-zA-Z0-9_-]+)?)\)', '](docs/$1)')
Set-Content -LiteralPath $firstReadme -Value $firstReadmeText -Encoding utf8NoBOM
New-Item -ItemType Directory -Path (Join-Path $outputRoot 'docs') | Out-Null
foreach ($document in @('LOCAL_AND_LIVE.md', 'PHP_HOSTING.md', 'CONNECTING.md', 'MODPACK_PROTOCOL.md', 'RUNTIME_UPDATES.md', 'SERVER_OWNER_GUIDE.de.md', 'SERVER_OWNER_GUIDE.en.md', 'SERVER_OWNER_GUIDE.ru.md', 'CRASH_REPORTS.md', 'CRASH_REPORTS_SETUP.de.md', 'CRASH_REPORTS_SETUP.en.md', 'CRASH_REPORTS_SETUP.ru.md', 'DEV_PORTAL_SETUP.de.md', 'DEV_PORTAL_SETUP.en.md', 'DEV_PORTAL_SETUP.ru.md', 'LAUNCHER_SETTINGS.md', 'DISCORD_SETUP.de.md', 'DISCORD_SETUP.en.md', 'DISCORD_SETUP.ru.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "docs/$document") -Destination (Join-Path $outputRoot "docs/$document")
}
foreach ($site in $sites) {
    $domain = $site.domain
    $children = @(Get-ChildItem -LiteralPath (Join-Path $outputRoot "web/$($site.directory)") -Force | Select-Object -ExpandProperty FullName)
    Compress-Archive -LiteralPath $children -DestinationPath (Join-Path $outputRoot "$domain.zip")
}
if ($IncludeNodeReference) {
    New-Item -ItemType Directory -Path (Join-Path $outputRoot 'scripts') | Out-Null
    foreach ($helper in @('start-local-preview.ps1', 'stop-local-preview.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $helper) -Destination (Join-Path $outputRoot "scripts/$helper") }
}
Write-Output "$($sites.Count) independent domain ZIPs: $outputRoot (no combined ZIP, credentials, accounts, state or demo data)"
