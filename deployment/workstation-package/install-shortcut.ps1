# County Adoption Records System - Workstation One-Click Setup
$ServerUrl = "https://192.168.1.108:3443"
$Desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
$LocalAppDir = Join-Path $env:LOCALAPPDATA "CountyAdoptionRecords"
if (-not (Test-Path $LocalAppDir)) { New-Item -Path $LocalAppDir -ItemType Directory -Force | Out-Null }

# 1. Install County Root CA into Current User store (No admin elevation required)
$CaFile = Join-Path $PSScriptRoot "aods-ca.crt"
if (Test-Path $CaFile) {
    try {
        Import-Certificate -FilePath $CaFile -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
        Write-Host "[OK] Trusted County Root CA Certificate." -ForegroundColor Green
    } catch {
        Write-Warning "Could not import root certificate automatically. You can double click aods-ca.crt to install."
    }
}

# 2. Copy application icon
$IconFile = Join-Path $PSScriptRoot "aods.ico"
if (Test-Path $IconFile) {
    Copy-Item $IconFile (Join-Path $LocalAppDir "aods.ico") -Force
}

# 3. Create Desktop Shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut((Join-Path $Desktop "County Adoption Records System.lnk"))

# Locate Microsoft Edge or Chrome for dedicated app window mode
$Edge = (Get-Item "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" -ErrorAction SilentlyContinue).FullName
if (-not $Edge) { $Edge = (Get-Item "C:\Program Files\Microsoft\Edge\Application\msedge.exe" -ErrorAction SilentlyContinue).FullName }

if ($Edge) {
    $Shortcut.TargetPath = $Edge
    $Shortcut.Arguments = "--app="$ServerUrl""
} else {
    $Shortcut.TargetPath = $ServerUrl
}

$Shortcut.IconLocation = "$LocalAppDir\aods.ico,0"
$Shortcut.Description = "County Adoption Records System (AODS) - Office LAN"
$Shortcut.Save()

Write-Host "[SUCCESS] Shortcut created on your desktop!" -ForegroundColor Green
Write-Host "Target URL: $ServerUrl" -ForegroundColor White
Start-Sleep -Seconds 3
