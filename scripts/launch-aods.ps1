<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Intelligent One-Click Server Launcher & Lifecycle Manager
.DESCRIPTION
    Launches and verifies the central AODS server, detecting existing instances,
    preventing duplicate process races, ensuring Windows Service compatibility,
    protecting unrelated applications from termination, and opening the HTTPS application.
.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\launch-aods.ps1
#>

[CmdletBinding()]
param(
    [string]$Port = "3443",
    [string]$HttpPort = "3001",
    [string]$ServiceName = "CountyAdoptionRecords",
    [switch]$NoBrowser,
    [switch]$ForceRestart
)

$Host.UI.RawUI.WindowTitle = "County Adoption Records System - Launcher"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
$DistIndex = Join-Path $ProjectRoot "dist\index.html"
$NodeModules = Join-Path $ProjectRoot "node_modules"
$DbFile = Join-Path $ProjectRoot "server\data\adoption_records.db"
$ServerScript = Join-Path $ProjectRoot "server\index.ts"
$DataDir = Join-Path $ProjectRoot "server\data"
$LockFile = Join-Path $DataDir "startup.lock"
$PidFile = Join-Path $DataDir "aods.pid"
$Url = "https://127.0.0.1:$Port"
$HealthUrl = "https://127.0.0.1:$Port/api/health"

if (-not (Test-Path $DataDir)) {
    New-Item -Path $DataDir -ItemType Directory -Force | Out-Null
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM (AODS)                              " -ForegroundColor Cyan
Write-Host "  Intelligent Launcher & Server Lifecycle Manager                   " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# HELPER FUNCTIONS
# -----------------------------------------------------------------------------

function Exit-Launcher([int]$code = 1) {
    if (-not $NoBrowser) {
        Start-Sleep -Seconds 2
    }
    exit $code
}

# Helper: Find owning PID for a listening TCP port
function Get-PortListenerPid([int]$TargetPort) {
    # 1. Primary: Get-NetTCPConnection (fast, structured CIM)
    try {
        $conn = Get-NetTCPConnection -LocalPort $TargetPort -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -gt 0 -and ($_.RemoteAddress -eq "0.0.0.0" -or $_.RemoteAddress -eq "::" -or $_.RemotePort -eq 0 -or "$($_.State)" -match "Listen") } |
            Select-Object -First 1
        if ($conn -and [int]$conn.OwningProcess -gt 0) {
            return [int]$conn.OwningProcess
        }
    } catch {}

    # 2. Universal Fallback: netstat -ano -p tcp
    try {
        $netstatOutput = netstat -ano -p tcp
        $pattern = ":$TargetPort\b\s+.*?(0\.0\.0\.0:0|\[::\]:0|LISTENING)\s+.*?(\d+)$"
        foreach ($line in $netstatOutput) {
            if ($line -match $pattern) {
                $matchedPid = [int]$Matches[2]
                if ($matchedPid -gt 0) {
                    return $matchedPid
                }
            }
        }
    } catch {}

    return 0
}

# Helper: Query HTTPS health endpoint reliably without PowerShell runspace threading issues
function Test-AodsHealthStatus([string]$TargetHealthUrl) {
    # 1. Primary: Use curl.exe if available (fastest, native Schannel, zero threadpool callback issues)
    $curlExe = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    if ($curlExe) {
        try {
            $output = & $curlExe -k --ssl-no-revoke -s --max-time 2 $TargetHealthUrl
            if ($output -match '"status"\s*:\s*"ok"') {
                return $true
            }
        } catch {}
    }

    # 2. Secondary: Native .NET WebClient / HttpWebRequest
    try {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = [System.Net.Security.RemoteCertificateValidationCallback]{ $true }
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "AODS-Launcher")
        $output = $wc.DownloadString($TargetHealthUrl)
        if ($output -match '"status"\s*:\s*"ok"') {
            return $true
        }
    } catch {}

    return $false
}

# Helper: Retrieve process metadata
function Get-ProcessDetails([int]$ProcessId) {
    $res = @{
        Pid = $ProcessId
        Name = "Unknown"
        Path = ""
        CommandLine = ""
    }
    try {
        $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($p) {
            $res.Name = $p.ProcessName
            try { $res.Path = $p.Path } catch {}
        }
    } catch {}

    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if ($proc) {
            if ($proc.Name) { $res.Name = $proc.Name }
            if ($proc.ExecutablePath) { $res.Path = $proc.ExecutablePath }
            if ($proc.CommandLine) { $res.CommandLine = $proc.CommandLine }
        }
    } catch {}

    return $res
}

# Helper: Detect if a given PID belongs to AODS
function Test-IsAodsProcess([int]$ProcessId) {
    if ($ProcessId -le 4) { return $false }

    # Check 1: Match against active aods.pid file
    if (Test-Path $PidFile) {
        try {
            $savedPid = (Get-Content $PidFile -ErrorAction SilentlyContinue).Trim()
            if ($savedPid -eq "$ProcessId") {
                return $true
            }
        } catch {}
    }

    # Check 2: CIM / WMI command line inspection (when permitted)
    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if ($proc) {
            $cmd = $proc.CommandLine
            if ($cmd -match "server[/\\]index\.ts") {
                return $true
            }
            # If CIM returned a command line and it definitely does NOT run server/index.ts, reject
            if ($cmd -and -not ($cmd -match "server[/\\]index\.ts")) {
                return $false
            }
        }
    } catch {}

    # Check 3: Process name & path inspection via Get-Process
    try {
        $sysProc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($sysProc) {
            if ($sysProc.ProcessName -ne "node" -and $sysProc.ProcessName -ne "node.exe") {
                return $false
            }
        } else {
            return $false
        }
    } catch {}

    # Check 4: Probe health endpoint to verify AODS identity
    if (Test-AodsHealthStatus $HealthUrl) {
        return $true
    }

    return $false
}

# -----------------------------------------------------------------------------
# STEP 1: WINDOWS SERVICE STATE HANDLING
# -----------------------------------------------------------------------------
$scQuery = & sc.exe query $ServiceName 2>&1
if ($scQuery -match "STATE") {
    if ($scQuery -match "STATE.*RUNNING") {
        Write-Host "  [DETECTED] AODS is running as an official Windows Service ($ServiceName)." -ForegroundColor Green
        Write-Host "  Verifying service health..." -ForegroundColor White
        if (Test-AodsHealthStatus $HealthUrl) {
            Write-Host "  [OK] Service is healthy and operational." -ForegroundColor Green
            if (-not $NoBrowser) {
                Write-Host "  Opening application in your default web browser..." -ForegroundColor Green
                Start-Process $Url
            }
            Start-Sleep -Seconds 2
            exit 0
        }
    } elseif ($scQuery -match "STATE.*STOPPED") {
        $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
        if ($isAdmin) {
            Write-Host "  [DETECTED] AODS Windows Service is installed but stopped. Starting service..." -ForegroundColor Yellow
            & sc.exe start $ServiceName 2>$null
            Start-Sleep -Seconds 3
            if (Test-AodsHealthStatus $HealthUrl) {
                Write-Host "  [OK] Service started successfully." -ForegroundColor Green
                if (-not $NoBrowser) { Start-Process $Url }
                exit 0
            }
        } else {
            Write-Host "`n[NOTICE] The CountyAdoptionRecords Windows Service is installed but currently stopped." -ForegroundColor Yellow
            Write-Host "Starting an installed Windows Service requires Administrator privileges." -ForegroundColor Yellow
            Write-Host "To start the background service, open an elevated PowerShell prompt and run:" -ForegroundColor White
            Write-Host "  net start $ServiceName" -ForegroundColor Cyan
            Write-Host "`nAlternatively, ask your system administrator to start the service." -ForegroundColor Gray
            Exit-Launcher 1
        }
    }
}

# -----------------------------------------------------------------------------
# STEP 2: ATOMIC STARTUP LOCK (RACE PREVENTION)
# -----------------------------------------------------------------------------
$lockStream = $null
$maxLockWaitSeconds = 6
$lockAcquired = $false

for ($attempt = 1; $attempt -le ($maxLockWaitSeconds * 2); $attempt++) {
    try {
        $lockStream = [System.IO.File]::Open($LockFile, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $lockAcquired = $true
        # Write launcher metadata to lock file
        $lockContent = [System.Text.Encoding]::UTF8.GetBytes("PID=$PID`nTime=$([DateTime]::UtcNow.ToString('o'))")
        $lockStream.SetLength(0)
        $lockStream.Write($lockContent, 0, $lockContent.Length)
        $lockStream.Flush()
        break
    } catch [System.IO.IOException] {
        # Lock held by concurrent launcher
        Write-Host "  [WAIT] Another AODS launcher instance is active. Checking status..." -ForegroundColor Gray
        Start-Sleep -Milliseconds 500
        # If the other instance has already made the server healthy, open browser and exit cleanly
        if (Test-AodsHealthStatus $HealthUrl) {
            Write-Host "  [OK] AODS server is already online and healthy. Launching browser..." -ForegroundColor Green
            if (-not $NoBrowser) { Start-Process $Url }
            exit 0
        }
    } catch {
        break
    }
}

if (-not $lockAcquired) {
    Write-Warning "Could not acquire exclusive startup lock. Checking system status directly..."
}

try {
    # -----------------------------------------------------------------------------
    # STEP 3: INTELLIGENT EXISTING-INSTANCE DETECTION
    # -----------------------------------------------------------------------------
    Write-Host "Inspecting active network ports and existing processes..." -ForegroundColor White
    $listener3443 = Get-PortListenerPid ([int]$Port)
    $listener3001 = Get-PortListenerPid ([int]$HttpPort)

    # Check for foreign/unrelated processes FIRST on both ports (CASE C)
    if ($listener3443 -gt 0 -and (-not (Test-IsAodsProcess $listener3443))) {
        $details = Get-ProcessDetails $listener3443
        Write-Host "`n=====================================================================" -ForegroundColor Red
        Write-Host "  [PORT CONFLICT] PORT $Port IS OCCUPIED BY AN UNRELATED APPLICATION  " -ForegroundColor Red
        Write-Host "=====================================================================" -ForegroundColor Red
        Write-Host "  Conflicting Port   : $Port (Required for AODS HTTPS)" -ForegroundColor Yellow
        Write-Host "  Conflicting PID    : $($details.Pid)" -ForegroundColor Yellow
        Write-Host "  Process Name       : $($details.Name)" -ForegroundColor Yellow
        if ($details.Path) { Write-Host "  Executable Path    : $($details.Path)" -ForegroundColor Yellow }
        if ($details.CommandLine) { Write-Host "  Command Line       : $($details.CommandLine)" -ForegroundColor Gray }
        Write-Host "`nAODS will NOT terminate unrelated processes. Please stop the conflicting" -ForegroundColor White
        Write-Host "application or change the port configuration in .env.production." -ForegroundColor White
        Exit-Launcher 1
    }

    if ($listener3001 -gt 0 -and (-not (Test-IsAodsProcess $listener3001))) {
        $details = Get-ProcessDetails $listener3001
        Write-Host "`n=====================================================================" -ForegroundColor Red
        Write-Host "  [PORT CONFLICT] PORT $HttpPort IS OCCUPIED BY AN UNRELATED APPLICATION" -ForegroundColor Red
        Write-Host "=====================================================================" -ForegroundColor Red
        Write-Host "  Conflicting Port   : $HttpPort (Required for AODS HTTP Redirect)" -ForegroundColor Yellow
        Write-Host "  Conflicting PID    : $($details.Pid)" -ForegroundColor Yellow
        Write-Host "  Process Name       : $($details.Name)" -ForegroundColor Yellow
        if ($details.Path) { Write-Host "  Executable Path    : $($details.Path)" -ForegroundColor Yellow }
        if ($details.CommandLine) { Write-Host "  Command Line       : $($details.CommandLine)" -ForegroundColor Gray }
        Write-Host "`nPlease stop the conflicting application before launching AODS." -ForegroundColor White
        Exit-Launcher 1
    }

    # Now evaluate identified AODS process
    $existingAodsPid = 0
    if ($listener3443 -gt 0 -and (Test-IsAodsProcess $listener3443)) {
        $existingAodsPid = $listener3443
    } elseif ($listener3001 -gt 0 -and (Test-IsAodsProcess $listener3001)) {
        $existingAodsPid = $listener3001
    }

    if ($existingAodsPid -gt 0) {
        Write-Host "  [DETECTED] AODS backend process (PID: $existingAodsPid) is active on network ports." -ForegroundColor Green
        Write-Host "  Verifying server health..." -ForegroundColor White

        # CASE A: AODS is already running and healthy
        if (Test-AodsHealthStatus $HealthUrl) {
            Write-Host "=====================================================================" -ForegroundColor Green
            Write-Host "  [PASS] AODS IS ALREADY RUNNING & HEALTHY (PID: $existingAodsPid)       " -ForegroundColor Green
            Write-Host "=====================================================================" -ForegroundColor Green
            Write-Host "  Application URL: $Url" -ForegroundColor White
            if (-not $NoBrowser) {
                Write-Host "  Opening application in default web browser..." -ForegroundColor Green
                Start-Process $Url
            }
            Start-Sleep -Seconds 1
            exit 0
        }

        # CASE B: AODS is running but unhealthy
        Write-Host "`n  [WARNING] AODS process (PID: $existingAodsPid) is listening but unresponsive." -ForegroundColor Yellow
        Write-Host "  Attempting safe recovery by recycling unresponsive AODS process..." -ForegroundColor Yellow
        Stop-Process -Id $existingAodsPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        $existingAodsPid = 0
    }

    # -----------------------------------------------------------------------------
    # CASE D: AODS IS NOT RUNNING -> START PRODUCTION INSTANCE
    # -----------------------------------------------------------------------------
    Write-Host "Validating system prerequisites..." -ForegroundColor White

    # Prerequisite 1: Node.js runtime
    if (-not $NodeExe) {
        Write-Host "`n[FAIL] Node.js is not installed or not found in system PATH." -ForegroundColor Red
        Write-Host "Please install Node.js v20+ from https://nodejs.org/" -ForegroundColor Yellow
        Exit-Launcher 1
    }
    $nodeVer = & $NodeExe -v
    Write-Host "  [OK] Node.js runtime detected: $nodeVer" -ForegroundColor Green

    # Prerequisite 2: Dependencies
    if (-not (Test-Path $NodeModules)) {
        Write-Host "`n[FAIL] Required node_modules folder is missing." -ForegroundColor Red
        Write-Host "Please run 'pnpm install' or 'npm install' inside the project directory." -ForegroundColor Yellow
        Exit-Launcher 1
    }
    Write-Host "  [OK] Application dependencies verified." -ForegroundColor Green

    # Prerequisite 3: Production Build
    if (-not (Test-Path $DistIndex)) {
        Write-Host "  [!] Production frontend build missing. Compiling now..." -ForegroundColor Yellow
        Push-Location $ProjectRoot
        & npm run build
        Pop-Location
        if (-not (Test-Path $DistIndex)) {
            Write-Host "`n[FAIL] Frontend build failed to compile." -ForegroundColor Red
            Exit-Launcher 1
        }
    }
    Write-Host "  [OK] Production frontend bundle verified." -ForegroundColor Green

    # Prerequisite 4: SQLite Database
    if (-not (Test-Path $DbFile)) {
        Write-Host "  [!] Database missing. Initializing new SQLite schema..." -ForegroundColor Yellow
        & $NodeExe -e "import('./server/db.ts').then(m => m.initDatabase())"
    }
    Write-Host "  [OK] Central adoption records database verified." -ForegroundColor Green

    # Start Node.js production server process independently (detached from launcher process tree)
    Write-Host "`nStarting AODS production backend server in background..." -ForegroundColor Yellow
    $newServerPid = 0
    $spawnMethod = ""
    try {
        $cmdLine = "`"$NodeExe`" `"$ServerScript`""
        $startup = New-CimInstance -ClassName Win32_ProcessStartup -Property @{ ShowWindow = [uint16]0 } -ClientOnly
        $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine = [string]$cmdLine
            CurrentDirectory = [string]$ProjectRoot
            ProcessStartupInformation = $startup
        } -ErrorAction Stop
        if ($res.ReturnValue -eq 0 -and $res.ProcessId -gt 0) {
            $newServerPid = [int]$res.ProcessId
            $spawnMethod = "WMI (Fully Detached & Hidden)"
        }
    } catch {}

    if ($newServerPid -le 0) {
        try {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $NodeExe
            $psi.Arguments = "`"$ServerScript`""
            $psi.WorkingDirectory = "$ProjectRoot"
            $psi.CreateNoWindow = $true
            $psi.UseShellExecute = $false
            $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
            $serverProcess = [System.Diagnostics.Process]::Start($psi)
            if ($serverProcess -and -not $serverProcess.HasExited) {
                $newServerPid = $serverProcess.Id
                $spawnMethod = "ProcessStartInfo (CreateNoWindow)"
            }
        } catch {}
    }

    if ($newServerPid -le 0) {
        $serverProcess = Start-Process -FilePath $NodeExe -ArgumentList "`"$ServerScript`"" -WorkingDirectory "$ProjectRoot" -WindowStyle Hidden -PassThru
        $newServerPid = $serverProcess.Id
        $spawnMethod = "Start-Process"
    }

    Write-Host "  [OK] Process spawned via $spawnMethod (PID: $newServerPid). Waiting for network initialization..." -ForegroundColor Green

    # Poll health endpoint until operational (max 15 seconds)
    $healthy = $false
    $maxWaitSeconds = 15
    for ($i = 1; $i -le $maxWaitSeconds; $i++) {
        if (Test-AodsHealthStatus $HealthUrl) {
            $healthy = $true
            break
        }
        # Check if process died prematurely
        $procCheck = Get-Process -Id $newServerPid -ErrorAction SilentlyContinue
        if (-not $procCheck -or $procCheck.HasExited) {
            Write-Host "`n[FAIL] Server process terminated unexpectedly." -ForegroundColor Red
            Write-Host "Check error logs at: $ProjectRoot\server\data\logs\server.log" -ForegroundColor Yellow
            Exit-Launcher 1
        }
        Start-Sleep -Seconds 1
        Write-Host "  Waiting for server initialization ($i/$maxWaitSeconds)..." -ForegroundColor Gray
    }

    if (-not $healthy) {
        Write-Host "`n[FAIL] Server failed to respond to health check after $maxWaitSeconds seconds." -ForegroundColor Red
        Write-Host "Check error logs at: $ProjectRoot\server\data\logs\server.log" -ForegroundColor Yellow
        Exit-Launcher 1
    }

    # Success Confirmation
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "  [PASS] COUNTY ADOPTION RECORDS SYSTEM IS ONLINE & OPERATIONAL      " -ForegroundColor Green
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "  Local HTTPS Access : $Url" -ForegroundColor White

    try {
        $Hostname = [System.Net.Dns]::GetHostName()
        $HostIPs = @( [System.Net.Dns]::GetHostAddresses($Hostname) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notlike '127.*' -and $_.IPAddressToString -notlike '169.254.*' } |
            ForEach-Object { $_.IPAddressToString } )
        if ($HostIPs) {
            Write-Host "  Office LAN Address :" -ForegroundColor White
            foreach ($ip in $HostIPs) {
                Write-Host "    -> https://${ip}:$Port" -ForegroundColor Cyan
            }
        }
    } catch {}
    Write-Host "---------------------------------------------------------------------"

    if (-not $NoBrowser) {
        Write-Host "Opening application in your default web browser..." -ForegroundColor Green
        Start-Process $Url
    }

    Start-Sleep -Seconds 1
} finally {
    # Release atomic startup lock
    if ($lockStream) {
        $lockStream.Close()
        $lockStream.Dispose()
    }
    if (Test-Path $LockFile) {
        Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
    }
}
