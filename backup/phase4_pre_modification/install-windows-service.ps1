<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Windows Service Installation & Management Script
.DESCRIPTION
    Installs and configures AODS as an unattended, auto-starting Windows background service
    using NSSM (Non-Sucking Service Manager).
    Must be executed with elevated Administrator privileges.
#>

[CmdletBinding()]
param(
    [string]$ServiceName = "CountyAdoptionRecords",
    [string]$DisplayName = "County Adoption Records System (AODS)",
    [string]$Port = "3001",
    [string]$HostBinding = "0.0.0.0",
    [switch]$Uninstall
)

# Enforce Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Please launch PowerShell with 'Run as administrator'."
    exit 1
}

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodeExe) {
    Write-Error "Node.js executable could not be found in PATH. Please install Node.js v20+ first."
    exit 1
}

if ($Uninstall) {
    Write-Host "Stopping and removing Windows Service: $ServiceName..." -ForegroundColor Yellow
    & nssm stop $ServiceName 2>$null
    & nssm remove $ServiceName confirm
    Write-Host "Service $ServiceName removed successfully." -ForegroundColor Green
    exit 0
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - WINDOWS SERVICE INSTALLER        " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Project Directory : $ProjectRoot"
Write-Host "  Node.js Executable: $NodeExe"
Write-Host "  Port Binding      : $Port"
Write-Host "  Host Interface    : $HostBinding"
Write-Host "---------------------------------------------------------------------"

# Check if NSSM is available in PATH or project directory
$NssmExe = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $NssmExe) {
    $LocalNssm = Join-Path $ProjectRoot "bin\nssm.exe"
    if (Test-Path $LocalNssm) {
        $NssmExe = $LocalNssm
    } else {
        Write-Warning "NSSM is not installed in PATH. Falling back to PowerShell Background Process Service or downloading NSSM."
        Write-Host "To install NSSM via winget, execute: winget install nssm" -ForegroundColor Yellow
        Write-Host "Alternatively, creating scheduled background task '$ServiceName'..." -ForegroundColor Yellow
        
        # Fallback to Task Scheduler auto-start on boot
        $ServerScript = Join-Path $ProjectRoot "server\index.ts"
        $Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "$ServerScript" -WorkingDirectory $ProjectRoot
        $Trigger = New-ScheduledTaskTrigger -AtStartup
        $Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        
        Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue
        Register-ScheduledTask -TaskName $ServiceName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description $DisplayName
        Start-ScheduledTask -TaskName $ServiceName
        Write-Host "AODS successfully registered and started as a Scheduled Background Service." -ForegroundColor Green
        exit 0
    }
}

# Install via NSSM
$ServerEntry = Join-Path $ProjectRoot "server\index.ts"
$LogDir = Join-Path $ProjectRoot "server\data\logs"
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }

& $NssmExe install $ServiceName $NodeExe "$ServerEntry"
& $NssmExe set $ServiceName AppDirectory "$ProjectRoot"
& $NssmExe set $ServiceName DisplayName "$DisplayName"
& $NssmExe set $ServiceName Description "Centralized County Adoption Records System LAN Server"
& $NssmExe set $ServiceName Start SERVICE_AUTO_START

# Environment Variables
& $NssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production`nSERVER_PORT=$Port`nHOST=$HostBinding"

# Standard Out and Standard Error logging
& $NssmExe set $ServiceName AppStdout (Join-Path $LogDir "service-stdout.log")
& $NssmExe set $ServiceName AppStderr (Join-Path $LogDir "service-stderr.log")

# Auto-recovery configuration (restart after 5 seconds on crash)
& $NssmExe set $ServiceName AppRestartDelay 5000

# Start the service
& $NssmExe start $ServiceName

Write-Host "Service $ServiceName installed and started successfully!" -ForegroundColor Green
Write-Host "Status check: sc.exe query $ServiceName" -ForegroundColor White

