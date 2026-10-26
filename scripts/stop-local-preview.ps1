$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previewEntry = Join-Path $projectRoot 'master-api/src/preview.mjs'
$pidFile = Join-Path $projectRoot 'local-builds/web-preview/preview.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No preview PID recorded.'; exit 0 }
$previewProcessId = [int] (Get-Content -LiteralPath $pidFile -Raw).Trim()
$previewProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$previewProcessId"
if (-not $previewProcess) { Write-Output 'Preview is already stopped.'; exit 0 }
if (-not $previewProcess.CommandLine -or $previewProcess.CommandLine.IndexOf($previewEntry, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Recorded PID no longer belongs to this preview; no process was stopped.' }
[System.Diagnostics.Process]::GetProcessById($previewProcessId).Kill()
Write-Output 'Local preview stopped.'
