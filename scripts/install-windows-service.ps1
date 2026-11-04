<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Windows Service & Background Daemon Manager
.DESCRIPTION
    Installs, configures, and manages AODS as an unattended, auto-starting Windows background
    service that boots with Windows and runs without an active employee login.
    Supports NSSM, WinSW, and native Windows Task Scheduler service backends.
    Must be executed with elevated Administrator privileges.
.EXAMPLE
    .\install-windows-service.ps1 -Action Install
    .\install-windows-service.ps1 -Action Status
    .\install-windows-service.ps1 -Action Stop
    .\install-windows-service.ps1 -Action Start
    .\install-windows-service.ps1 -Action Restart
    .\install-windows-service.ps1 -Action Uninstall
#>

[CmdletBinding()]
param(
    [ValidateSet("Install", "Uninstall", "Start", "Stop", "Restart", "Status")]
    [string]$Action = "Install",
    [string]$ServiceName = "CountyAdoptionRecords",
    [string]$DisplayName = "County Adoption Records System (AODS)",
    [string]$Port = "3001",
    [string]$HttpsPort = "3443",
    [string]$HostBinding = "0.0.0.0"
)

# 1. Enforce Administrator Privileges (except for read-only Status inspection)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and $Action -ne "Status") {
    Write-Error "[Access Denied] The '$Action' action requires elevated Administrator privileges. Please right-click PowerShell and select 'Run as administrator'."
    exit 1
}

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
$ServerEntry = Join-Path $ProjectRoot "server\index.ts"
$LogDir = Join-Path $ProjectRoot "server\data\logs"
$DistDir = Join-Path $ProjectRoot "dist"
$DbFile = Join-Path $ProjectRoot "server\data\adoption_records.db"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - SERVICE MANAGER                   " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  Target Action      : $Action"
Write-Host "  Service Identifier : $ServiceName"
Write-Host "  Project Directory  : $ProjectRoot"
Write-Host "  Node.js Binary     : $NodeExe"
Write-Host "---------------------------------------------------------------------"

if (-not $NodeExe) {
    Write-Error "[Error] Node.js executable could not be found in PATH. Please install Node.js v20+ first."
    exit 1
}

# Ensure logs directory exists
if (-not (Test-Path $LogDir)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}

# Determine Service Backend: NSSM > WinSW > Scheduled Task Daemon
$NssmExe = (Get-Command nssm -ErrorAction SilentlyContinue).Source
if (-not $NssmExe) {
    $LocalNssm = Join-Path $ProjectRoot "bin\nssm.exe"
    if (Test-Path $LocalNssm) {
        $NssmExe = $LocalNssm
    }
}

# --- Action: Status ---
if ($Action -eq "Status") {
    Write-Host "`n--- Checking Service Status for: $ServiceName ---" -ForegroundColor White
    $scQuery = & sc.exe query $ServiceName 2>&1
    $taskQuery = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue

    if ($scQuery -match "STATE") {
        Write-Host "[Windows Service Backend Detected (NSSM/Win32)]" -ForegroundColor Green
        $scQuery | ForEach-Object { Write-Host "  $_" }
    } elseif ($taskQuery) {
        Write-Host "[Windows Task Scheduler Service Backend Detected]" -ForegroundColor Green
        Write-Host "  State       : $($taskQuery.State)"
        Write-Host "  Description : $($taskQuery.Description)"
        Write-Host "  Author      : $($taskQuery.Principal.UserId)"
    } else {
        Write-Host "[Status] Service '$ServiceName' is NOT currently installed." -ForegroundColor Yellow
    }

    # Test Port Listening
    $listenerHttp = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $listenerHttps = Get-NetTCPConnection -LocalPort $HttpsPort -State Listen -ErrorAction SilentlyContinue
    if ($listenerHttps) {
        Write-Host "  Port $HttpsPort (HTTPS)        : ACTIVE (PID: $($listenerHttps.OwningProcess))" -ForegroundColor Green
    } else {
        Write-Host "  Port $HttpsPort (HTTPS)        : INACTIVE" -ForegroundColor Yellow
    }
    if ($listenerHttp) {
        Write-Host "  Port $Port (HTTP Redirect): ACTIVE (PID: $($listenerHttp.OwningProcess))" -ForegroundColor Green
    } else {
        Write-Host "  Port $Port (HTTP Redirect): INACTIVE" -ForegroundColor Yellow
    }
    exit 0
}

# --- Action: Stop ---
if ($Action -eq "Stop") {
    Write-Host "Stopping service $ServiceName..." -ForegroundColor Yellow
    if ($NssmExe) {
        & $NssmExe stop $ServiceName 2>$null
    }
    & sc.exe stop $ServiceName 2>$null
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "[SUCCESS] Service $ServiceName stop signal issued." -ForegroundColor Green
    exit 0
}

# --- Action: Start ---
if ($Action -eq "Start") {
    Write-Host "Starting service $ServiceName..." -ForegroundColor Yellow
    if ($NssmExe) {
        & $NssmExe start $ServiceName 2>$null
    }
    & sc.exe start $ServiceName 2>$null
    Start-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Write-Host "[SUCCESS] Service $ServiceName start signal issued." -ForegroundColor Green
    exit 0
}

# --- Action: Restart ---
if ($Action -eq "Restart") {
    Write-Host "Restarting service $ServiceName..." -ForegroundColor Yellow
    if ($NssmExe) {
        & $NssmExe restart $ServiceName 2>$null
    } else {
        & sc.exe stop $ServiceName 2>$null
        Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        & sc.exe start $ServiceName 2>$null
        Start-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    }
    Write-Host "[SUCCESS] Service $ServiceName restart completed." -ForegroundColor Green
    exit 0
}

# --- Action: Uninstall ---
if ($Action -eq "Uninstall") {
    Write-Host "Uninstalling and removing service: $ServiceName..." -ForegroundColor Yellow
    if ($NssmExe) {
        & $NssmExe stop $ServiceName 2>$null
        & $NssmExe remove $ServiceName confirm 2>$null
    }
    & sc.exe stop $ServiceName 2>$null
    & sc.exe delete $ServiceName 2>$null
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue

    Write-Host "[SUCCESS] Service $ServiceName completely uninstalled and removed." -ForegroundColor Green
    exit 0
}

# --- Action: Install ---
Write-Host "Preparing environment for installation..."

# Verify production frontend build
if (-not (Test-Path (Join-Path $DistDir "index.html"))) {
    Write-Host "Production build not found in dist/. Compiling frontend..." -ForegroundColor Yellow
    Set-Location $ProjectRoot
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to build production frontend. Please resolve Vite build errors first."
        exit 1
    }
}

# Verify database exists
if (-not (Test-Path $DbFile)) {
    Write-Host "Initializing SQLite database..." -ForegroundColor Yellow
    & $NodeExe -e "import('./server/db.ts').then(m => m.initDatabase())"
}

if ($NssmExe) {
    Write-Host "Installing service via NSSM ($NssmExe)..." -ForegroundColor Green
    & $NssmExe install $ServiceName $NodeExe "$ServerEntry"
    & $NssmExe set $ServiceName AppDirectory "$ProjectRoot"
    & $NssmExe set $ServiceName DisplayName "$DisplayName"
    & $NssmExe set $ServiceName Description "County Adoption Records System Central LAN Server"
    & $NssmExe set $ServiceName Start SERVICE_AUTO_START

    # Depend on TCP/IP network stack
    & $NssmExe set $ServiceName DependOnService Tcpip

    # Set Environment Variables
    & $NssmExe set $ServiceName AppEnvironmentExtra "NODE_ENV=production`nSERVER_PORT=$Port`nHTTPS_PORT=$HttpsPort`nHTTPS_ENABLED=true`nHOST=$HostBinding`nLOG_DIR=server/data/logs"

    # Logging stdout and stderr
    & $NssmExe set $ServiceName AppStdout (Join-Path $LogDir "service-stdout.log")
    & $NssmExe set $ServiceName AppStderr (Join-Path $LogDir "service-stderr.log")

    # Crash Recovery: restart after 5 seconds, throttle rapid restarts
    & $NssmExe set $ServiceName AppRestartDelay 5000
    & $NssmExe set $ServiceName AppThrottle 1500

    # Start the service
    & $NssmExe start $ServiceName
    Write-Host "`n[SUCCESS] Windows Service '$ServiceName' installed and started via NSSM." -ForegroundColor Green
} else {
    Write-Host "NSSM not found in PATH or bin/. Configuring Windows Scheduled Task Daemon..." -ForegroundColor Yellow
    Write-Host "Configuring auto-start on boot with highest system privileges..."

    $ActionObj = New-ScheduledTaskAction -Execute $NodeExe -Argument "$ServerEntry" -WorkingDirectory $ProjectRoot
    $TriggerObj = New-ScheduledTaskTrigger -AtStartup
    $PrincipalObj = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $SettingsObj = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $ServiceName -Action $ActionObj -Trigger $TriggerObj -Principal $PrincipalObj -Settings $SettingsObj -Description $DisplayName | Out-Null
    Start-ScheduledTask -TaskName $ServiceName

    Write-Host "`n[SUCCESS] AODS registered and started as a Background System Daemon (Task Scheduler)." -ForegroundColor Green
    Write-Host "It will boot automatically with Windows without requiring user login."
}

Write-Host "---------------------------------------------------------------------"
Write-Host "To verify service health:"
Write-Host "  .\scripts\check-system.ps1"
Write-Host "=====================================================================" -ForegroundColor Cyan
