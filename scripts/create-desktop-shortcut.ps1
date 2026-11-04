<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Server Desktop Shortcut Creator
.DESCRIPTION
    Creates a convenient one-click desktop shortcut on the central server machine.
    Points to launch-aods.ps1 with the custom county application icon.
    Does NOT modify global Windows execution policies.
.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
#>

[CmdletBinding()]
param(
    [string]$ShortcutName = "County Adoption Records System",
    [switch]$AllUsers
)

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SilentLauncher = Join-Path $ProjectRoot "scripts\launch-silent.vbs"
$GuiLauncher = Join-Path $ProjectRoot "scripts\launch-gui.ps1"
$CliLauncher = Join-Path $ProjectRoot "scripts\launch-aods.ps1"
$IconFile = Join-Path $ProjectRoot "deployment\icons\aods.ico"

# Verify prerequisites
if (-not (Test-Path $SilentLauncher) -and -not (Test-Path $GuiLauncher)) {
    Write-Error "Launcher scripts not found in: scripts\"
    exit 1
}

if (-not (Test-Path $IconFile)) {
    Write-Warning "Custom icon not found at: $IconFile."
}

# Determine Desktop Destination
$DesktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
if ($AllUsers) {
    $DesktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::CommonDesktopDirectory)
}

$ShortcutPath = Join-Path $DesktopPath "$ShortcutName.lnk"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - DESKTOP SHORTCUT CREATOR         " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Target Desktop  : $DesktopPath"
Write-Host "  Shortcut Path   : $ShortcutPath"
Write-Host "  Silent Launcher : $SilentLauncher"
Write-Host "  Application Icon: $IconFile"
Write-Host "---------------------------------------------------------------------"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)

if (Test-Path $SilentLauncher) {
    # Launch completely silent via Windows Script Host with zero terminal flash
    $Shortcut.TargetPath = "$env:SystemRoot\System32\wscript.exe"
    $Shortcut.Arguments = "//B //nologo `"$SilentLauncher`""
} else {
    $Shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $Shortcut.Arguments = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$GuiLauncher`""
}

$Shortcut.WorkingDirectory = "$ProjectRoot"
$Shortcut.Description = "County Adoption Records System (AODS) - Secure Desktop Launcher"

if (Test-Path $IconFile) {
    $Shortcut.IconLocation = "$IconFile,0"
}

$Shortcut.Save()

Write-Host "[SUCCESS] Silent desktop shortcut created successfully!" -ForegroundColor Green
Write-Host "When launched, the AODS loading screen appears with zero console window." -ForegroundColor White
Write-Host "Shortcut location: $ShortcutPath" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

