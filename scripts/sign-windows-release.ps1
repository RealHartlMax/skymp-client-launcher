# Sign a selected binary using a certificate already supplied by a CA/token provider.
# Does not import certificates, change trust stores, build, package, upload or publish.
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$CertificateThumbprint,
    [Parameter(Mandatory)][uri]$TimestampUrl,
    [ValidateSet('CurrentUser', 'LocalMachine')][string]$CertificateStore = 'CurrentUser',
    [string]$SignToolPath
)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $FilePath -ErrorAction Stop
if ($file.PSIsContainer -or $file.Extension -notin @('.exe', '.dll', '.msi')) {
    throw 'Select the final EXE, DLL or MSI to sign.'
}
if (-not $TimestampUrl.IsAbsoluteUri -or $TimestampUrl.Scheme -notin @('http', 'https')) {
    throw 'TimestampUrl must be the absolute RFC 3161 HTTP(S) URL supplied by your certificate provider.'
}
if (-not $SignToolPath) {
    $command = Get-Command signtool.exe -CommandType Application -ErrorAction SilentlyContinue
    if ($command) { $SignToolPath = $command.Source }
}
if (-not $SignToolPath) {
    $sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    if (Test-Path -LiteralPath $sdk -PathType Container) {
        $SignToolPath = Get-ChildItem -LiteralPath $sdk -Directory |
            Where-Object { $_.Name -match '^10\.\d+\.\d+\.\d+$' } |
            Sort-Object { [version]$_.Name } -Descending |
            ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
    }
}
if (-not $SignToolPath -or -not (Test-Path -LiteralPath $SignToolPath -PathType Leaf)) {
    throw 'SignTool is unavailable. Install the Windows SDK or pass -SignToolPath.'
}
$certificate = Get-Item -LiteralPath "Cert:\$CertificateStore\My\$CertificateThumbprint" -ErrorAction SilentlyContinue
if (-not $certificate -or -not $certificate.HasPrivateKey) {
    throw 'The selected signing certificate/private key is unavailable. Configure your CA/token provider first.'
}
if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -lt (Get-Date)) {
    throw 'The signing certificate is outside its validity period.'
}
$usages = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } |
    ForEach-Object { $_.EnhancedKeyUsages | ForEach-Object { $_.Value } })
if ('1.3.6.1.5.5.7.3.3' -notin $usages) {
    throw 'The certificate must permit code signing.'
}
if ($PSCmdlet.ShouldProcess($file.FullName, 'Apply SHA-256 Authenticode signature and RFC 3161 timestamp')) {
    $signArguments = @('sign', '/fd', 'SHA256', '/td', 'SHA256', '/tr', $TimestampUrl.AbsoluteUri,
        '/sha1', $CertificateThumbprint, '/s', 'My', '/d', 'SkyMP Launcher')
    if ($CertificateStore -eq 'LocalMachine') { $signArguments += '/sm' }
    & $SignToolPath @signArguments $file.FullName
    if ($LASTEXITCODE -ne 0) { throw "Signing failed or returned a warning (exit $LASTEXITCODE)." }
    & $SignToolPath verify /pa /all /v $file.FullName
    if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed (exit $LASTEXITCODE)." }
    & (Join-Path $PSScriptRoot 'inspect-windows-release.ps1') -FilePath $file.FullName `
        -RequireSignature -ExpectedSignerThumbprint $CertificateThumbprint
}
