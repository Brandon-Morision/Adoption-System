<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Employee Workstation Shortcut & Certificate Trust Package Generator
.DESCRIPTION
    Creates a zero-install desktop shortcut on employee workstations to access the central
    County Adoption Records System securely over HTTPS on the office LAN.
    Also exports the workstation deployment package including the public Root CA (aods-ca.crt)
    for seamless client trust without exposing any server private keys.
.EXAMPLE
    .\create-workstation-shortcut.ps1 -ServerAddress "https://192.168.1.108:3443"
    .\create-workstation-shortcut.ps1 -ExportPackage
#>

[CmdletBinding()]
param(
    [string]$ServerAddress = "",
    [string]$ShortcutName = "County Adoption Records System",
    [switch]$DedicatedWindow,
    [switch]$ExportPackage
)

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$IconSource = Join-Path $ProjectRoot "deployment\icons\aods.ico"
$CaSource = Join-Path $ProjectRoot "server\certs\aods-ca.crt"

# If ServerAddress was not provided, discover the local server LAN IPv4
if (-not $ServerAddress) {
    try {
        $Hostname = [System.Net.Dns]::GetHostName()
        $LocalIPs = @( [System.Net.Dns]::GetHostAddresses($Hostname) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '127.*' -and $_.IPAddressToString -notlike '169.254.*' } |
            ForEach-Object { $_.IPAddressToString } )

        if ($LocalIPs.Count -gt 0) {
            $DefaultIP = $LocalIPs[0]
            $ServerAddress = "https://${DefaultIP}:3443"
        } else {
            $ServerAddress = "https://localhost:3443"
        }
    } catch {
        $ServerAddress = "https://localhost:3443"
    }
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - WORKSTATION SHORTCUT GENERATOR    " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Server LAN URL     : $ServerAddress"
Write-Host "  Security Protocol  : HTTPS / TLS 1.2+ (Encrypted LAN Communication)"
Write-Host "  Dedicated Window   : $(if ($DedicatedWindow) { 'Enabled (Edge/Chrome App Mode)' } else { 'Disabled (Standard Browser)' })"
Write-Host "  Client Footprint   : ZERO INSTALL (Browser-only, no Node.js/SQLite)"
Write-Host "---------------------------------------------------------------------"

# Option A: Export Deployable Package for IT distribution
if ($ExportPackage) {
    $DeployDir = Join-Path $ProjectRoot "deployment\workstation-package"
    if (-not (Test-Path $DeployDir)) { New-Item -Path $DeployDir -ItemType Directory -Force | Out-Null }

    # Copy Icon & Public Root CA (NEVER copy private keys)
    if (Test-Path $IconSource) {
        Copy-Item $IconSource (Join-Path $DeployDir "aods.ico") -Force
    }
    if (Test-Path $CaSource) {
        Copy-Item $CaSource (Join-Path $DeployDir "aods-ca.crt") -Force
    }

    # Generate deploy.ps1 inside package
    $DeployScript = @"
# County Adoption Records System - Workstation One-Click Setup
`$ServerUrl = "$ServerAddress"
`$Desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
`$LocalAppDir = Join-Path `$env:LOCALAPPDATA "CountyAdoptionRecords"
if (-not (Test-Path `$LocalAppDir)) { New-Item -Path `$LocalAppDir -ItemType Directory -Force | Out-Null }

# 1. Install County Root CA into Current User store (No admin elevation required)
`$CaFile = Join-Path `$PSScriptRoot "aods-ca.crt"
if (Test-Path `$CaFile) {
    try {
        Import-Certificate -FilePath `$CaFile -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
        Write-Host "[OK] Trusted County Root CA Certificate." -ForegroundColor Green
    } catch {
        Write-Warning "Could not import root certificate automatically. You can double click aods-ca.crt to install."
    }
}

# 2. Copy application icon
`$IconFile = Join-Path `$PSScriptRoot "aods.ico"
if (Test-Path `$IconFile) {
    Copy-Item `$IconFile (Join-Path `$LocalAppDir "aods.ico") -Force
}

# 3. Create Desktop Shortcut
`$WshShell = New-Object -ComObject WScript.Shell
`$Shortcut = `$WshShell.CreateShortcut((Join-Path `$Desktop "$ShortcutName.lnk"))

# Locate Microsoft Edge or Chrome for dedicated app window mode
`$Edge = (Get-Item "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ErrorAction SilentlyContinue).FullName
if (-not `$Edge) { `$Edge = (Get-Item "C:\Program Files\Microsoft\Edge\Application\msedge.exe" -ErrorAction SilentlyContinue).FullName }

if (`$Edge) {
    `$Shortcut.TargetPath = `$Edge
    `$Shortcut.Arguments = "--app=`"`$ServerUrl`""
} else {
    `$Shortcut.TargetPath = `$ServerUrl
}

`$Shortcut.IconLocation = "`$LocalAppDir\aods.ico,0"
`$Shortcut.Description = "County Adoption Records System (AODS) - Office LAN"
`$Shortcut.Save()

Write-Host "[SUCCESS] Shortcut created on your desktop!" -ForegroundColor Green
Write-Host "Target URL: `$ServerUrl" -ForegroundColor White
Start-Sleep -Seconds 3
"@
    Set-Content -Path (Join-Path $DeployDir "install-shortcut.ps1") -Value $DeployScript -Encoding UTF8

    Write-Host "[SUCCESS] Portable workstation deployment package generated at:" -ForegroundColor Green
    Write-Host "  $DeployDir" -ForegroundColor White
    Write-Host "Package Contents:"
    Write-Host "  - install-shortcut.ps1 (Automated trust & shortcut installer)"
    Write-Host "  - aods-ca.crt         (Public County Root CA - no private key)"
    Write-Host "  - aods.ico            (Application brand icon)"
    Write-Host "`nIT Administrators can copy this folder to a shared network drive or USB"
    Write-Host "and run 'install-shortcut.ps1' on employee workstations." -ForegroundColor White
    exit 0
}

# Option B: Create shortcut directly on this computer's desktop
$DesktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
$ShortcutPath = Join-Path $DesktopPath "$ShortcutName.lnk"

# Copy Icon to persistent local app data
$LocalAppDir = Join-Path $env:LOCALAPPDATA "CountyAdoptionRecords"
if (-not (Test-Path $LocalAppDir)) { New-Item -Path $LocalAppDir -ItemType Directory -Force | Out-Null }
$LocalIcon = Join-Path $LocalAppDir "aods.ico"
if (Test-Path $IconSource) {
    Copy-Item $IconSource $LocalIcon -Force
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)

# Check for Edge or Chrome for dedicated window mode
$EdgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $EdgePath)) { $EdgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

if ($DedicatedWindow -and (Test-Path $EdgePath)) {
    $Shortcut.TargetPath = $EdgePath
    $Shortcut.Arguments = "--app=`"$ServerAddress`""
} elseif ($DedicatedWindow -and (Test-Path $ChromePath)) {
    $Shortcut.TargetPath = $ChromePath
    $Shortcut.Arguments = "--app=`"$ServerAddress`""
} else {
    # Standard URL browser launch
    $Shortcut.TargetPath = "$env:SystemRoot\System32\cmd.exe"
    $Shortcut.Arguments = "/c start `"`" `"$ServerAddress`""
    $Shortcut.WindowStyle = 7 # Minimized
}

$Shortcut.WorkingDirectory = "$env:USERPROFILE"
$Shortcut.Description = "County Adoption Records System - Access via Office LAN"

if (Test-Path $LocalIcon) {
    $Shortcut.IconLocation = "$LocalIcon,0"
}

$Shortcut.Save()

Write-Host "[SUCCESS] Employee workstation shortcut created at:" -ForegroundColor Green
Write-Host "  $ShortcutPath" -ForegroundColor Cyan
Write-Host "Target URL: $ServerAddress" -ForegroundColor White
Write-Host "=====================================================================" -ForegroundColor Cyan
