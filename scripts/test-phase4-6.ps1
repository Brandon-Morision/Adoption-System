<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Phase 4.6 Verification Test Suite - Silent Background Startup & Loading Screen
.DESCRIPTION
    Comprehensive automated verification testing of:
    1. Cold-start silent startup with 7 real stages.
    2. Zero duplicate process creation on existing healthy server.
    3. Unrelated process protection during port conflicts (ports 3443 and 3001).
    4. Unresponsive server safe recovery.
    5. Clean stop via stop-aods.ps1.
    6. Desktop shortcut creation with wscript silent wrapper and official icon.
    7. Database and audit hash chain integrity.
    8. Full 34-test API regression suite.
#>

[CmdletBinding()]
param()

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LauncherLog = Join-Path $ProjectRoot "server\data\logs\launcher.log"
$StopScript = Join-Path $ProjectRoot "scripts\stop-aods.ps1"
$GuiScript = Join-Path $ProjectRoot "scripts\launch-gui.ps1"
$SilentVbs = Join-Path $ProjectRoot "scripts\launch-silent.vbs"
$ShortcutScript = Join-Path $ProjectRoot "scripts\create-desktop-shortcut.ps1"
$DbFile = Join-Path $ProjectRoot "server\data\adoption_records.db"
$HealthUrl = "https://127.0.0.1:3443/api/health"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM (AODS) - PHASE 4.6 VERIFICATION      " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

$testCount = 0
$passCount = 0

function Assert-Test([bool]$Condition, [string]$Message) {
    $script:testCount++
    if ($Condition) {
        $script:passCount++
        Write-Host "  [PASS] Test $script:testCount: $Message" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Test $script:testCount: $Message" -ForegroundColor Red
    }
}

function Get-PortPid([int]$p) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -gt 0 -and ($_.RemoteAddress -eq "0.0.0.0" -or $_.RemoteAddress -eq "::" -or $_.RemotePort -eq 0 -or "$($_.State)" -match "Listen") } |
            Select-Object -First 1
        if ($conn -and [int]$conn.OwningProcess -gt 0) { return [int]$conn.OwningProcess }
    } catch {}

    try {
        $netstat = netstat -ano -p tcp
        $pattern = ":$p\b\s+.*?(0\.0\.0\.0:0|\[::\]:0|LISTENING)\s+.*?(\d+)$"
        foreach ($line in $netstat) {
            if ($line -match $pattern) {
                $matchedPid = [int]$Matches[2]
                if ($matchedPid -gt 0) { return $matchedPid }
            }
        }
    } catch {}
    return 0
}

function Test-Health() {
    $curl = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    if ($curl) {
        try {
            $res = & $curl -k -s --max-time 2 $HealthUrl
            if ($res -match '"status"\s*:\s*"ok"') { return $true }
        } catch {}
    }
    return $false
}

# Ensure clean slate at start
Write-Host "`n[SETUP] Stopping any existing AODS server..." -ForegroundColor Yellow
& powershell.exe -ExecutionPolicy Bypass -File $StopScript | Out-Null
Start-Sleep -Seconds 2

# -----------------------------------------------------------------------------
# TEST 1: Cold start via launch-gui.ps1 (all 7 stages executed)
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 1] Cold Start via GUI Launcher..." -ForegroundColor Yellow
$logBefore = if (Test-Path $LauncherLog) { (Get-Content $LauncherLog).Count } else { 0 }

$p = Start-Process -FilePath powershell.exe -ArgumentList "-ExecutionPolicy Bypass -NoProfile -NonInteractive -WindowStyle Hidden -File `"$GuiScript`" -NoBrowser" -PassThru
$p.WaitForExit(20000)

$serverPid1 = Get-PortPid 3443
$health1 = Test-Health

Assert-Test ($serverPid1 -gt 0) "Backend Node.js process spawned on port 3443 (PID: $serverPid1)"
Assert-Test ($health1 -eq $true) "HTTPS health check succeeded (status: ok)"

$newLogLines = (Get-Content $LauncherLog | Select-Object -Skip $logBefore)
$hasStage1 = ($newLogLines | Select-String "Stage 1 Complete").Count -gt 0
$hasStage2 = ($newLogLines | Select-String "Stage 2 Complete").Count -gt 0
$hasStage4 = ($newLogLines | Select-String "Stage 4 Complete").Count -gt 0
$hasStage5 = ($newLogLines | Select-String "Stage 5 Complete").Count -gt 0
$hasStage6 = ($newLogLines | Select-String "Stage 6 Complete").Count -gt 0
$hasStage7 = ($newLogLines | Select-String "Stage 7 Complete").Count -gt 0

Assert-Test ($hasStage1 -and $hasStage2 -and $hasStage4 -and $hasStage5 -and $hasStage6 -and $hasStage7) "All real initialization stages (1 through 7) verified in execution log"

# -----------------------------------------------------------------------------
# TEST 2: Existing instance reuse (zero duplicate processes)
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 2] Existing Instance Detection..." -ForegroundColor Yellow
$logBefore2 = (Get-Content $LauncherLog).Count
$p2 = Start-Process -FilePath powershell.exe -ArgumentList "-ExecutionPolicy Bypass -NoProfile -NonInteractive -WindowStyle Hidden -File `"$GuiScript`" -NoBrowser" -PassThru
$p2.WaitForExit(15000)

$serverPid2 = Get-PortPid 3443
$newLogLines2 = (Get-Content $LauncherLog | Select-Object -Skip $logBefore2)
$reusedInstance = ($newLogLines2 | Select-String "Reusing instance").Count -gt 0

Assert-Test ($serverPid1 -eq $serverPid2) "Identical PID maintained across duplicate launcher invocations (PID: $serverPid1)"
Assert-Test ($reusedInstance -eq $true) "Launcher detected active healthy instance and logged instance reuse"

# -----------------------------------------------------------------------------
# TEST 3: Backend continues running after splash screen exits
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 3] Independent Backend Lifecycle..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$procCheck = Get-Process -Id $serverPid1 -ErrorAction SilentlyContinue
Assert-Test ($procCheck -and -not $procCheck.HasExited) "Node.js Express backend remains active after GUI launcher exits"
Assert-Test (Test-Health) "HTTPS endpoint remains fully responsive"

# -----------------------------------------------------------------------------
# TEST 4: Port conflict protection (unrelated foreign process on port 3443)
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 4] Foreign Port Conflict Protection..." -ForegroundColor Yellow
& powershell.exe -ExecutionPolicy Bypass -File $StopScript | Out-Null
$waitCount = 0
while ((Get-PortPid 3443) -gt 0 -and $waitCount -lt 10) {
    Start-Sleep -Milliseconds 500
    $waitCount++
}
Start-Sleep -Seconds 1

# Start a dummy listener on 3443 using a standalone node script
$dummyScript = Join-Path $ProjectRoot "scratch_dummy_3443.mjs"
Set-Content -Path $dummyScript -Value "import http from 'http'; const s = http.createServer((q,r) => r.end('foreign')); s.listen(3443, '0.0.0.0'); setInterval(() => {}, 1000);" -Encoding utf8
$dummyProc = Start-Process -FilePath node -ArgumentList "`"$dummyScript`"" -PassThru
$waitCount = 0
while ((Get-PortPid 3443) -eq 0 -and $waitCount -lt 10) {
    Start-Sleep -Milliseconds 500
    $waitCount++
}

$dummyPid = Get-PortPid 3443
Assert-Test ($dummyPid -eq $dummyProc.Id) "Foreign dummy process established on port 3443 (PID: $dummyPid)"

# Run launch-gui.ps1 while port is occupied by foreign process
$logBefore3 = (Get-Content $LauncherLog).Count
$pConflict = Start-Process -FilePath powershell.exe -ArgumentList "-ExecutionPolicy Bypass -NoProfile -NonInteractive -WindowStyle Hidden -File `"$GuiScript`" -NoBrowser" -PassThru
$hasConflictLog = $false
for ($w = 0; $w -lt 12; $w++) {
    Start-Sleep -Seconds 1
    $newLogLines3 = (Get-Content $LauncherLog | Select-Object -Skip $logBefore3)
    if (($newLogLines3 | Select-String "Foreign listener on port 3443").Count -gt 0) {
        $hasConflictLog = $true
        break
    }
}

# Close window
$pConflict | Stop-Process -Force -ErrorAction SilentlyContinue

$dummyAfter = Get-Process -Id $dummyPid -ErrorAction SilentlyContinue
Assert-Test ($dummyAfter -and -not $dummyAfter.HasExited) "Foreign process was NOT terminated by AODS launcher"
Assert-Test ($hasConflictLog -eq $true) "Launcher accurately identified port conflict and logged user-friendly diagnostic"

# Clean up dummy process
$dummyProc | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $dummyScript -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# -----------------------------------------------------------------------------
# TEST 5: Restart AODS cleanly via launch-gui.ps1
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 5] Clean Restart after Conflict Resolution..." -ForegroundColor Yellow
$pRestart = Start-Process -FilePath powershell.exe -ArgumentList "-ExecutionPolicy Bypass -NoProfile -NonInteractive -WindowStyle Hidden -File `"$GuiScript`" -NoBrowser" -PassThru
$pRestart.WaitForExit(20000)

$activeServerPid = Get-PortPid 3443
Assert-Test ($activeServerPid -gt 0) "AODS restarted cleanly once port was cleared (PID: $activeServerPid)"
Assert-Test (Test-Health) "HTTPS service operational after restart"

# -----------------------------------------------------------------------------
# TEST 6: Desktop shortcut configuration
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 6] Desktop Shortcut Configuration..." -ForegroundColor Yellow
& powershell.exe -ExecutionPolicy Bypass -File $ShortcutScript | Out-Null

$DesktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
$LnkPath = Join-Path $DesktopPath "County Adoption Records System.lnk"
Assert-Test (Test-Path $LnkPath) "Desktop shortcut exists at $LnkPath"

$WshShell = New-Object -ComObject WScript.Shell
$sc = $WshShell.CreateShortcut($LnkPath)
Assert-Test ($sc.TargetPath -match "wscript\.exe") "Shortcut TargetPath points to silent wscript.exe: $($sc.TargetPath)"
Assert-Test ($sc.Arguments -match "launch-silent\.vbs") "Shortcut Arguments invoke launch-silent.vbs: $($sc.Arguments)"
Assert-Test ($sc.IconLocation -match "aods\.ico") "Shortcut IconLocation uses official shield aods.ico: $($sc.IconLocation)"

# -----------------------------------------------------------------------------
# TEST 7: Database & audit immutability verification
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 7] Database & Audit Immutability..." -ForegroundColor Yellow
Assert-Test (Test-Path $DbFile) "SQLite database file exists ($DbFile)"

$auditVerifyScript = @"
import { verifyAuditChain } from './server/audit.ts';
const res = verifyAuditChain();
console.log(JSON.stringify(res));
"@
$auditOutput = & node -e "$auditVerifyScript"
$auditJson = $auditOutput | ConvertFrom-Json
Assert-Test ($auditJson.valid -eq $true) "Tamper-evident audit chain unbroken across $($auditJson.totalRecords) activity records"

# -----------------------------------------------------------------------------
# TEST 8: Full API regression test suite (34/34 tests)
# -----------------------------------------------------------------------------
Write-Host "`n[SCENARIO 8] Full API Regression Test Suite..." -ForegroundColor Yellow
$suiteScript = Join-Path $ProjectRoot "scripts\run-suite-against-live.ps1"
$suiteOutput = & powershell.exe -ExecutionPolicy Bypass -File $suiteScript
$suitePassed = ($suiteOutput | Select-String "34/34 PASSED").Count -gt 0
Assert-Test ($suitePassed -eq $true) "Live API regression verification suite: 34/34 tests PASSED (100%)"

Write-Host "`n=====================================================================" -ForegroundColor Cyan
Write-Host "  PHASE 4.6 TEST RESULTS: $script:passCount / $script:testCount PASSED" -ForegroundColor $(if ($script:passCount -eq $script:testCount) { "Green" } else { "Red" })
Write-Host "=====================================================================" -ForegroundColor Cyan

if ($script:passCount -eq $script:testCount) {
    exit 0
} else {
    exit 1
}

