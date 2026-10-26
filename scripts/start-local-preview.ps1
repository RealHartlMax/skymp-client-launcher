param([ValidateRange(1024, 65535)][int] $Port = 8787)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previewEntry = Join-Path $projectRoot 'master-api/src/preview.mjs'
$previewDirectory = Join-Path $projectRoot 'local-builds/web-preview'
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($existing.CommandLine -and $existing.CommandLine.IndexOf($previewEntry, [StringComparison]::OrdinalIgnoreCase) -ge 0) { Write-Output "Preview already running: http://127.0.0.1:$Port"; exit 0 }
    throw "Port $Port is occupied. Choose another port with -Port."
}
New-Item -ItemType Directory -Force -Path $previewDirectory | Out-Null
$previewPreviousPort = $env:PORT
try {
    $env:PORT = [string] $Port
    $previewProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList ('"{0}"' -f $previewEntry) -WorkingDirectory (Join-Path $projectRoot 'master-api') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $previewDirectory 'preview.stdout.log') -RedirectStandardError (Join-Path $previewDirectory 'preview.stderr.log') -PassThru
} finally {
    if ($null -eq $previewPreviousPort) { Remove-Item Env:PORT -ErrorAction SilentlyContinue } else { $env:PORT = $previewPreviousPort }
}
Set-Content -LiteralPath (Join-Path $previewDirectory 'preview.pid') -Value $previewProcess.Id -Encoding ascii
$previewReady = $false
$previewDeadline = [DateTime]::UtcNow.AddSeconds(20)
while ([DateTime]::UtcNow -lt $previewDeadline) {
    $previewProcess.Refresh()
    if ($previewProcess.HasExited) { throw "Preview exited. See $previewDirectory/preview.stderr.log" }
    try {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($health.StatusCode -eq 200) { $previewReady = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 200
}
if (-not $previewReady) { throw "Preview did not become ready. See $previewDirectory/preview.stderr.log" }
Write-Output "Local preview: http://127.0.0.1:$Port (PID $($previewProcess.Id))"
Write-Output 'Stop with ./scripts/stop-local-preview.ps1'
