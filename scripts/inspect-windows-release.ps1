# Read-only binary inspection. A release gate must explicitly use -RequireSignature.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$FilePath,
    [string]$ReportPath,
    [ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedSha256,
    [ValidatePattern('^[a-fA-F0-9]{40}$')][string]$ExpectedSignerThumbprint,
    [switch]$RequireSignature
)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $FilePath -ErrorAction Stop
if ($file.PSIsContainer) { throw 'FilePath must be a binary file.' }
$signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
$report = [ordered]@{
    schemaVersion = 1
    file = $file.Name
    bytes = $file.Length
    sha256 = $hash
    productName = $file.VersionInfo.ProductName
    fileVersion = $file.VersionInfo.FileVersion
    signatureStatus = $signature.Status.ToString()
    signer = $(if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null })
    signerThumbprint = $(if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null })
    timestamped = ($null -ne $signature.TimeStamperCertificate)
    signatureRequired = $RequireSignature.IsPresent
    malwareScanPerformed = $false
}
$json = $report | ConvertTo-Json -Depth 4
if ($ReportPath) {
    $parent = Split-Path -Parent ([System.IO.Path]::GetFullPath($ReportPath))
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $json | Set-Content -LiteralPath $ReportPath -Encoding utf8
}
Write-Output $json
if ($ExpectedSha256 -and $hash -ne $ExpectedSha256) {
    throw 'SHA-256 mismatch. This is not the expected release file.'
}
if ($RequireSignature -or $ExpectedSignerThumbprint) {
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate) {
        throw "Release blocked: Authenticode signature is $($signature.Status). Sign the final EXE with a trusted code-signing certificate before packaging."
    }
    if (-not $signature.TimeStamperCertificate) {
        throw 'Release blocked: a trusted timestamp is required.'
    }
    if ($ExpectedSignerThumbprint -and $signature.SignerCertificate.Thumbprint -ne $ExpectedSignerThumbprint) {
        throw 'Release blocked: unexpected signing certificate.'
    }
}
