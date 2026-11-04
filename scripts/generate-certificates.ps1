<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Internal PKI Certificate Authority & TLS Server Certificate Generator
.DESCRIPTION
    Generates a dedicated internal Root Certificate Authority (CA) and an end-entity
    TLS server certificate for the County Adoption Records System.
    Includes the county hostname, localhost, and all active LAN IPv4 addresses in the SAN.
    Exports the Root CA certificate (aods-ca.crt) for employee workstation trust without
    ever exposing or distributing private keys.
.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\generate-certificates.ps1
#>

[CmdletBinding()]
param(
    [string]$DnsName = "adoption.county.local",
    [string]$CertDir = "server\certs",
    [int]$ValidityYears = 5,
    [switch]$Force
)

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$TargetCertDir = Join-Path $ProjectRoot $CertDir

if (-not (Test-Path $TargetCertDir)) {
    New-Item -Path $TargetCertDir -ItemType Directory -Force | Out-Null
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - INTERNAL TLS CERTIFICATE SETUP   " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

# 1. Discover actual server hostname and all active LAN IPv4 addresses
$Hostname = [System.Net.Dns]::GetHostName()
$LocalIPs = [System.Net.Dns]::GetHostAddresses($Hostname) |
    Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '127.*' -and $_.IPAddressToString -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddressToString

$DnsNames = @("localhost", "127.0.0.1", $DnsName, $Hostname) + $LocalIPs | Select-Object -Unique

Write-Host "Discovered Server Identity:" -ForegroundColor White
Write-Host "  Hostname           : $Hostname"
Write-Host "  LAN IPv4 Address   : $($LocalIPs -join ', ')"
Write-Host "  Subject Alt Names  :"
$DnsNames | ForEach-Object { Write-Host "    - $_" }

# Determine certificate store
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$StoreLocation = if ($isAdmin) { "Cert:\LocalMachine\My" } else { "Cert:\CurrentUser\My" }
Write-Host "`nUsing Certificate Store: $StoreLocation" -ForegroundColor Gray

# 2. Create Internal Root Certificate Authority (CA)
Write-Host "`n[1/3] Generating County Root Certificate Authority..." -ForegroundColor Yellow
$CaSubject = "CN=County Adoption Records Authority Root CA, O=County Government, OU=Civil Registration and Adoption Records"

$CaCert = New-SelfSignedCertificate `
    -Subject $CaSubject `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -KeyUsageProperty All `
    -CertStoreLocation $StoreLocation `
    -NotAfter (Get-Date).AddYears($ValidityYears + 5) `
    -FriendlyName "County Adoption Records Root CA"

# 3. Create Server Certificate signed by the Root CA
Write-Host "[2/3] Generating Server Certificate signed by Root CA..." -ForegroundColor Yellow
$ServerCert = New-SelfSignedCertificate `
    -Subject "CN=$DnsName, O=County Government, OU=Civil Registration and Adoption Records" `
    -Signer $CaCert `
    -DnsName $DnsNames `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -CertStoreLocation $StoreLocation `
    -NotAfter (Get-Date).AddYears($ValidityYears) `
    -FriendlyName "County Adoption Records System Server Certificate"

# 4. Export Artifacts
Write-Host "[3/3] Exporting Certificates and Private Keys..." -ForegroundColor Yellow

# CA Public Certificate (for employee workstations to trust)
$caBytes = $CaCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$caPem = "-----BEGIN CERTIFICATE-----`r`n" + [Convert]::ToBase64String($caBytes, [Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END CERTIFICATE-----`r`n"
Set-Content -Path (Join-Path $TargetCertDir "aods-ca.crt") -Value $caPem -Encoding ASCII
Set-Content -Path (Join-Path $TargetCertDir "aods-ca.pem") -Value $caPem -Encoding ASCII
[IO.File]::WriteAllBytes((Join-Path $TargetCertDir "aods-ca.der"), $caBytes)

# Server Public Certificate (PEM format for Node.js TLS)
$serverBytes = $ServerCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$serverPem = "-----BEGIN CERTIFICATE-----`r`n" + [Convert]::ToBase64String($serverBytes, [Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END CERTIFICATE-----`r`n"
Set-Content -Path (Join-Path $TargetCertDir "server.crt") -Value $serverPem -Encoding ASCII
Set-Content -Path (Join-Path $TargetCertDir "server.pem") -Value $serverPem -Encoding ASCII
[IO.File]::WriteAllBytes((Join-Path $TargetCertDir "server.der"), $serverBytes)

# Server Private Key (PKCS#8 PEM format for Node.js https.createServer)
$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($ServerCert)
if ($rsa) {
    $pkcs8Bytes = $rsa.ExportPkcs8PrivateKey()
    $keyPem = "-----BEGIN PRIVATE KEY-----`r`n" + [Convert]::ToBase64String($pkcs8Bytes, [Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END PRIVATE KEY-----`r`n"
    $serverKeyPath = Join-Path $TargetCertDir "server.key"
    Set-Content -Path $serverKeyPath -Value $keyPem -Encoding ASCII
    Write-Host "  [OK] Server private key written to server.key" -ForegroundColor Green
}

# Server PFX Bundle (PKCS#12)
$CertPassword = ConvertTo-SecureString -String "CountyRecordsSecure2026" -Force -AsPlainText
Export-PfxCertificate -Cert $ServerCert -FilePath (Join-Path $TargetCertDir "server.pfx") -Password $CertPassword | Out-Null

Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] INTERNAL PKI CERTIFICATES GENERATED SUCCESSFULLY         " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "Server Certificate Files (KEEP PRIVATE on central server):" -ForegroundColor White
Write-Host "  Server Certificate : $(Join-Path $TargetCertDir 'server.crt')"
Write-Host "  Server Private Key : $(Join-Path $TargetCertDir 'server.key')"
Write-Host "  Server PFX Bundle  : $(Join-Path $TargetCertDir 'server.pfx')"
Write-Host "`nEmployee Workstation Trust Certificate (DISTRIBUTE TO WORKSTATIONS):" -ForegroundColor Cyan
Write-Host "  Root CA Certificate: $(Join-Path $TargetCertDir 'aods-ca.crt')" -ForegroundColor Green
Write-Host "---------------------------------------------------------------------"
Write-Host "CRITICAL SECURITY RULE:" -ForegroundColor Yellow
Write-Host "  DO NOT distribute 'server.key' or 'server.pfx' to employee workstations."
Write-Host "  ONLY distribute 'aods-ca.crt' (Public CA Root) to employee workstations."
Write-Host "=====================================================================" -ForegroundColor Cyan
