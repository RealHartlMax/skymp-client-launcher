[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$Executable,
    [switch]$AllowUnsigned,
    [switch]$AllowDirty
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -Raw -LiteralPath (Join-Path $project 'launcher/package.json') | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Expected a stable launcher version.' }
if (-not $Executable) { $Executable = Join-Path $project 'launcher/src-tauri/target/release/SkyMP Launcher.exe' }
$exe = Get-Item -LiteralPath $Executable
if ($exe.VersionInfo.FileVersion -ne $version) { throw 'EXE/package version mismatch.' }
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) { throw 'Choose a new release directory; existing packages are preserved.' }
$dirty = [bool](git -C $project status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect source state.' }
if ($dirty -and -not $AllowDirty) { throw 'Commit the reviewed source changes before producing the final release.' }
$commit = (git -C $project rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify source commit.' }
$inspection = & (Join-Path $PSScriptRoot 'inspect-windows-release.ps1') -FilePath $exe.FullName -RequireSignature:(-not $AllowUnsigned)
$auth = $inspection | ConvertFrom-Json
$full = Join-Path $output 'portable'
$update = Join-Path $output 'update'
$upload = Join-Path $output 'upload'
$diagnostics = Join-Path $output 'diagnostics'
@($full,$update,$upload,$diagnostics) | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
$inspection | Set-Content -LiteralPath (Join-Path $diagnostics 'AUTHENTICODE.json') -Encoding utf8
$exeName = "SkyMP-Launcher-v$version.exe"
$build = [ordered]@{product='SkyMP Launcher';version=$version;architecture='windows-x64';sourceCommit=$commit;sourceWorkingTreeDirty=$dirty;distribution='portable';embeddedFrontend=$true;requiredSystemRuntime='Microsoft Edge WebView2 Runtime';executable=[ordered]@{name=$exeName;bytes=$exe.Length;sha256=$auth.sha256;signatureStatus=$auth.signatureStatus};containsGame=$false;containsServer=$false;containsNativeClientRuntime=$false}
$licenses = @{
    'Noto-OFL.txt'='launcher/public/licenses/Noto-OFL.txt'
    'Flag-icons-MIT.txt'='launcher/public/flags/LICENSE.txt'
    'React-LICENSE.txt'='launcher/node_modules/react/LICENSE'
    'ReactDOM-LICENSE.txt'='launcher/node_modules/react-dom/LICENSE'
    'Tauri-API-APACHE-2.0.txt'='launcher/node_modules/@tauri-apps/api/LICENSE_APACHE-2.0'
    'Tauri-API-MIT.txt'='launcher/node_modules/@tauri-apps/api/LICENSE_MIT'
}
foreach ($directory in @($full,$update)) {
    Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $directory $exeName)
    Copy-Item -LiteralPath (Join-Path $project 'LICENSE') -Destination (Join-Path $directory 'LICENSE')
    New-Item -ItemType Directory -Path (Join-Path $directory 'licenses') | Out-Null
    foreach ($license in $licenses.GetEnumerator()) { Copy-Item -LiteralPath (Join-Path $project $license.Value) -Destination (Join-Path $directory "licenses/$($license.Key)") }
    $build | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $directory 'BUILD-INFO.json') -Encoding utf8
}
$fullReadme = @(
    "# SkyMP Launcher v$version - Full / Windows x64", '',
    'DE: Vollständiges portables Launcher-Paket. ZIP in einen eigenen Ordner entpacken und die EXE starten. Windows x64 mit WebView2, Steam und eine passende Skyrim-Installation sind erforderlich. Im Launcher den Spielpfad auswählen. Kontoanmeldung und Steam-Prüfung stehen unter Einstellungen > Konto; offizielle Updates werden im Launcher angezeigt.', '',
    'EN: Complete portable launcher package. Extract into its own folder and run the EXE. Requires Windows x64 with WebView2, Steam and a supported Skyrim installation. Select the game folder in the launcher. Account sign-in and Steam verification are in Settings > Account; official updates are shown in the launcher.', '',
    'RU: Полный портативный пакет лаунчера. Распакуйте в отдельную папку и запустите EXE. Нужны Windows x64 с WebView2, Steam и поддерживаемая Skyrim. Выберите папку игры. Вход и проверка Steam находятся в Настройки > Аккаунт; официальные обновления показываются в лаунчере.', '',
    'Launcher only. Skyrim, the game server and native client runtime are separate. User settings and profiles are stored in the Windows user profile.', '',
    "Source: https://github.com/RealHartlMax/skymp-client-launcher/tree/$commit"
)
$fullReadme -join "`n" | Set-Content -LiteralPath (Join-Path $full 'README.md') -Encoding utf8
$updateReadme = @(
    "# SkyMP Launcher v$version - Update / Windows x64", '',
    'DE: Laufenden Launcher schließen. Nur die bisherige Launcher-EXE durch die neue EXE ersetzen; bei Bedarf den bisherigen Dateinamen beibehalten oder die Verknüpfung anpassen. Einstellungen, Profile und Berichte im Windows-Benutzerprofil bleiben erhalten. Das Paket enthält keine zurückzusetzende Konfiguration und ersetzt keine Spiel- oder Runtime-Dateien.', '',
    'EN: Close the running launcher. Replace the existing launcher EXE with the new EXE; retain the old filename or update your shortcut if needed. Settings, profiles and reports in your Windows user profile are retained. This package supplies no configuration reset and replaces no game or runtime files.', '',
    'RU: Закройте лаунчер. Замените старую EXE новой; при необходимости сохраните прежнее имя файла или измените ярлык. Настройки, профили и отчёты в профиле Windows сохраняются. Пакет не сбрасывает конфигурацию и не заменяет файлы игры или runtime.', '',
    'The Full and Update packages contain the identical launcher EXE. No installer, automatic replacement script or game/server payload is included.', '',
    "Source: https://github.com/RealHartlMax/skymp-client-launcher/tree/$commit"
)
$updateReadme -join "`n" | Set-Content -LiteralPath (Join-Path $update 'UPDATE-README.md') -Encoding utf8
foreach ($language in @('de','en','ru')) {
    $notes = Join-Path $project "docs/releases/v$version.$language.md"
    Copy-Item -LiteralPath $notes -Destination (Join-Path $output "RELEASE-NOTES.$language.md")
    Copy-Item -LiteralPath $notes -Destination (Join-Path $full "RELEASE-NOTES.$language.md")
}
Copy-Item -LiteralPath $exe.FullName -Destination (Join-Path $upload $exeName)
$verified = @()
foreach ($item in @(@{name="SkyMP-Launcher-v$version-Full-windows-x64.zip";directory=$full},@{name="SkyMP-Launcher-v$version-Update-windows-x64.zip";directory=$update})) {
    $zipPath = Join-Path $upload $item.name
    Compress-Archive -LiteralPath @(Get-ChildItem -LiteralPath $item.directory | ForEach-Object FullName) -DestinationPath $zipPath -CompressionLevel Optimal
    $expected = @{}
    Get-ChildItem -LiteralPath $item.directory -File -Recurse | ForEach-Object {
        $relative = [System.IO.Path]::GetRelativePath($item.directory,$_.FullName).Replace('\','/')
        $expected[$relative] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName.Replace('\','/')
            if ($name.EndsWith('/')) { continue }
            if (-not $seen.Add($name) -or -not $expected.ContainsKey($name)) { throw "Unexpected archive entry: $name" }
            $stream = $entry.Open()
            try { $hash = [Convert]::ToHexString($sha.ComputeHash($stream)) } finally { $stream.Dispose() }
            if ($hash -ne $expected[$name]) { throw "Archive entry hash mismatch: $name" }
        }
        if ($seen.Count -ne $expected.Count) { throw 'Incomplete archive.' }
    } finally { $zip.Dispose(); $sha.Dispose() }
    $verified += [ordered]@{name=$item.name;filesVerified=$seen.Count;allEntriesMatch=$true}
}
$assets = @(Get-ChildItem -LiteralPath $upload -File | ForEach-Object { [ordered]@{name=$_.Name;bytes=$_.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()} })
($assets | ForEach-Object { "$($_.sha256)  $($_.name)" }) | Set-Content -LiteralPath (Join-Path $upload 'SHA256SUMS') -Encoding ascii
[ordered]@{version=$version;sourceCommit=$commit;sourceWorkingTreeDirty=$dirty;executable=$build.executable;releaseAssets=$assets;archives=$verified;fullAndUpdateExeIdentical=$true;unsignedExplicitlyAllowed=$AllowUnsigned.IsPresent;published=$false} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'PACKAGE-VALIDATION.json') -Encoding utf8
@("# GitHub v$version",'',"Source commit: $commit",'',"Upload only the four files in upload/: EXE, Full ZIP, Update ZIP and SHA256SUMS. Use RELEASE-NOTES.de.md, RELEASE-NOTES.en.md and RELEASE-NOTES.ru.md for the description.",'','Read VALIDATION.json and the signature/Defender evidence before publishing. This packaging script creates no commit, tag, release or deployment. After any signing, regenerate the entire package and checksums.') -join "`n" | Set-Content -LiteralPath (Join-Path $output 'GITHUB-UPLOAD.md') -Encoding utf8
Write-Output ([pscustomobject]@{ok=$true;version=$version;sourceCommit=$commit;sourceWorkingTreeDirty=$dirty;assets=$assets;archives=$verified} | ConvertTo-Json -Depth 6)
