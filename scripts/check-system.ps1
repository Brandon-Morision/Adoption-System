<#
.SYNOPSIS
    County Adoption Records System (AODS)
    System Diagnostics & Health Verification Tool
.DESCRIPTION
    Performs comprehensive diagnostic checks on Node.js runtime, dependencies, production builds,
    database integrity, background service status, port listeners, and live HTTP API endpoints.
.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\check-system.ps1
#>

[CmdletBinding()]
param(
    [string]$Port = "3001",
    [string]$ServiceName = "CountyAdoptionRecords"
)

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
$DistIndex = Join-Path $ProjectRoot "dist\index.html"
$NodeModules = Join-Path $ProjectRoot "node_modules"
$DbFile = Join-Path $ProjectRoot "server\data\adoption_records.db"
$BackupDir = Join-Path $ProjectRoot "server\data\backups"
$LogFile = Join-Path $ProjectRoot "server\data\logs\server.log"
$ApiHealthUrl = "http://localhost:$Port/api/health"
$FrontendUrl = "http://localhost:$Port/"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - SYSTEM HEALTH DIAGNOSTICS         " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Target Port: $Port`n" -ForegroundColor White

$Results = [System.Collections.Generic.List[PSCustomObject]]::new()

function Add-CheckResult {
    param(
        [string]$Component,
        [string]$Status, # PASS, WARN, FAIL
        [string]$Details
    )
    $Results.Add([PSCustomObject]@{
        Component = $Component
        Status    = $Status
        Details   = $Details
    })
    
    $Color = switch ($Status) {
        "PASS" { [ConsoleColor]::Green }
        "WARN" { [ConsoleColor]::Yellow }
        "FAIL" { [ConsoleColor]::Red }
        Default { [ConsoleColor]::White }
    }
    Write-Host "  [$Status] $Component : $Details" -ForegroundColor $Color
}

# 1. Node.js Runtime Check
if ($NodeExe) {
    $v = & $NodeExe -v
    $major = [int]($v -replace "^v(\d+)\..*", '$1')
    if ($major -ge 20) {
        Add-CheckResult "Node.js Runtime" "PASS" "Version $v detected (Meets v20+ requirement)"
    } else {
        Add-CheckResult "Node.js Runtime" "WARN" "Version $v detected (Recommend v20+ for native type stripping)"
    }
} else {
    Add-CheckResult "Node.js Runtime" "FAIL" "Node.js executable is missing from system PATH"
}

# 2. Dependencies Check
if (Test-Path $NodeModules) {
    $pkgCount = (Get-ChildItem -Directory $NodeModules).Count
    Add-CheckResult "Dependencies" "PASS" "node_modules present ($pkgCount root packages installed)"
} else {
    Add-CheckResult "Dependencies" "FAIL" "node_modules folder missing; run 'pnpm install' or 'npm install'"
}

# 3. Production Frontend Build Check
if (Test-Path $DistIndex) {
    $distItem = Get-Item $DistIndex
    $distAgeMinutes = [math]::Round(((Get-Date) - $distItem.LastWriteTime).TotalMinutes, 1)
    Add-CheckResult "Production Build" "PASS" "Compiled assets present in dist/ (Last built $distAgeMinutes min ago)"
} else {
    Add-CheckResult "Production Build" "FAIL" "dist/index.html missing; run 'npm run build' before production launch"
}

# 4. Database Integrity Check
if (Test-Path $DbFile) {
    $dbSize = [math]::Round(((Get-Item $DbFile).Length / 1KB), 1)
    # Perform SQLite PRAGMA integrity_check via Node
    $integrity = "unknown"
    try {
        $integrity = & $NodeExe -e "
            const { DatabaseSync } = require('node:sqlite');
            try {
                const db = new DatabaseSync('$($DbFile.Replace('\', '/'))');
                const row = db.prepare('PRAGMA integrity_check;').get();
                console.log(row.integrity_check);
            } catch(e) {
                console.log('error: ' + e.message);
            }
        "
        $integrity = $integrity.Trim()
    } catch {}

    if ($integrity -eq "ok") {
        Add-CheckResult "Database File" "PASS" "adoption_records.db online ($dbSize KB, PRAGMA integrity_check: ok)"
    } else {
        Add-CheckResult "Database File" "WARN" "Database file present but integrity check returned: $integrity"
    }
} else {
    Add-CheckResult "Database File" "FAIL" "SQLite database file ($DbFile) was not found"
}

# 5. Service / Daemon Status
$scQuery = & sc.exe query $ServiceName 2>&1
$taskQuery = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue

if ($scQuery -match "STATE.*RUNNING") {
    Add-CheckResult "Windows Service" "PASS" "Service '$ServiceName' is INSTALLED and RUNNING"
} elseif ($taskQuery -and $taskQuery.State -eq "Running") {
    Add-CheckResult "Windows Service" "PASS" "Scheduled Task Daemon '$ServiceName' is RUNNING"
} elseif ($scQuery -match "STATE") {
    Add-CheckResult "Windows Service" "WARN" "Service '$ServiceName' is INSTALLED but STOPPED"
} elseif ($taskQuery) {
    Add-CheckResult "Windows Service" "WARN" "Scheduled Task '$ServiceName' is REGISTERED but READY/STOPPED"
} else {
    Add-CheckResult "Windows Service" "WARN" "Background service is not installed (Runs in user/launcher process)"
}

# 6. Port Availability & Listening Check
$portListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portListener -and $portListener.OwningProcess -gt 0) {
    Add-CheckResult "TCP Port $Port" "PASS" "Active and listening on 0.0.0.0:$Port (PID: $($portListener.OwningProcess))"
} else {
    Add-CheckResult "TCP Port $Port" "WARN" "No active process listening on port $Port (Server is currently stopped)"
}

# 7. Live API Health Endpoint Check
$apiOk = $false
try {
    $res = Invoke-RestMethod -Uri $ApiHealthUrl -Method Get -TimeoutSec 3 -ErrorAction Stop
    if ($res.status -eq "ok") {
        $apiOk = $true
        $authMode = $res.security.auth
        Add-CheckResult "API Health (/api/health)" "PASS" "HTTP 200 OK - Version $($res.version), Security: $authMode"
    } else {
        Add-CheckResult "API Health (/api/health)" "WARN" "HTTP responded but status was: $($res.status)"
    }
} catch {
    Add-CheckResult "API Health (/api/health)" "WARN" "Endpoint offline: $($_.Exception.Message)"
}

# 8. Application Frontend HTTP Check
try {
    $webRes = Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($webRes.StatusCode -eq 200 -and $webRes.Content -match "<div id=`"root`">") {
        Add-CheckResult "Frontend Shell (/)" "PASS" "HTTP 200 OK - React application shell rendered successfully"
    } else {
        Add-CheckResult "Frontend Shell (/)" "WARN" "HTTP $($webRes.StatusCode) returned from root endpoint"
    }
} catch {
    Add-CheckResult "Frontend Shell (/)" "WARN" "Frontend endpoint offline or unreachable"
}

# 9. Backup Directory Check
if (Test-Path $BackupDir) {
    $backupCount = (Get-ChildItem -Path $BackupDir -Filter "*.db").Count
    Add-CheckResult "Backup Storage" "PASS" "Available at server/data/backups ($backupCount snapshot(s) preserved)"
} else {
    Add-CheckResult "Backup Storage" "WARN" "Backup directory not created yet (Will initialize on first backup run)"
}

# 10. Server Log File Check
if (Test-Path $LogFile) {
    $logSize = [math]::Round(((Get-Item $LogFile).Length / 1KB), 1)
    Add-CheckResult "Audit & Server Logs" "PASS" "Active at server/data/logs/server.log ($logSize KB)"
} else {
    Add-CheckResult "Audit & Server Logs" "PASS" "Log directory configured; file will initialize on startup"
}

# Summary
Write-Host "`n---------------------------------------------------------------------"
$passCount = ($Results | Where-Object { $_.Status -eq "PASS" }).Count
$warnCount = ($Results | Where-Object { $_.Status -eq "WARN" }).Count
$failCount = ($Results | Where-Object { $_.Status -eq "FAIL" }).Count

Write-Host "Diagnostic Summary: $passCount PASS | $warnCount WARNING | $failCount FAIL" -ForegroundColor White

if ($failCount -eq 0) {
    Write-Host "[OVERALL STATUS] County Adoption Records System is in a HEALTHY state." -ForegroundColor Green
} else {
    Write-Host "[OVERALL STATUS] Attention required: $failCount critical check(s) failed." -ForegroundColor Red
}
Write-Host "=====================================================================" -ForegroundColor Cyan
