<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Native Windows Loading Screen & Silent Startup Manager
.DESCRIPTION
    Provides a polished Windows desktop startup experience for AODS.
    Launches a modern, dark-navy WPF splash screen that visualizes real-time
    initialization stages while silently managing the Node.js Express backend.
    Reuses existing healthy servers, avoids duplicate processes, detects port conflicts
    without killing unrelated software, and launches the dashboard once verified healthy.
.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\launch-gui.ps1
    powershell.exe -ExecutionPolicy Bypass -File .\scripts\launch-gui.ps1 -NoBrowser
#>

[CmdletBinding()]
param(
    [string]$Port = "3443",
    [string]$HttpPort = "3001",
    [switch]$NoBrowser
)

# -----------------------------------------------------------------------------
# 1. PREREQUISITES & ASSEMBLY LOADING
# -----------------------------------------------------------------------------
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
$DistIndex = Join-Path $ProjectRoot "dist\index.html"
$DbFile = Join-Path $ProjectRoot "server\data\adoption_records.db"
$ServerScript = Join-Path $ProjectRoot "server\index.ts"
$DataDir = Join-Path $ProjectRoot "server\data"
$LogDir = Join-Path $DataDir "logs"
$LauncherLog = Join-Path $LogDir "launcher.log"
$PidFile = Join-Path $DataDir "aods.pid"
$IconFile = Join-Path $ProjectRoot "deployment\icons\aods.ico"
$Url = "https://127.0.0.1:$Port"
$HealthUrl = "https://127.0.0.1:$Port/api/health"

if (-not (Test-Path $LogDir)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}

function Write-LauncherLog([string]$level, [string]$message) {
    $timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    $entry = "[$timestamp] [$level] $message"
    try {
        Add-Content -Path $LauncherLog -Value $entry -Encoding utf8 -ErrorAction SilentlyContinue
    } catch {}
}

Write-LauncherLog "INFO" "=========================================================="
Write-LauncherLog "INFO" "AODS Desktop GUI Launcher starting..."
Write-LauncherLog "INFO" "Target Application URL: $Url"

# -----------------------------------------------------------------------------
# 2. HELPER FUNCTIONS (PORT & HEALTH CHECKS)
# -----------------------------------------------------------------------------
function Get-PortListenerPid([int]$TargetPort) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $TargetPort -ErrorAction SilentlyContinue |
            Where-Object { $_.OwningProcess -gt 0 -and ($_.RemoteAddress -eq "0.0.0.0" -or $_.RemoteAddress -eq "::" -or $_.RemotePort -eq 0 -or "$($_.State)" -match "Listen") } |
            Select-Object -First 1
        if ($conn -and [int]$conn.OwningProcess -gt 0) {
            return [int]$conn.OwningProcess
        }
    } catch {}

    try {
        $netstatOutput = netstat -ano -p tcp
        $pattern = ":$TargetPort\b\s+.*?(0\.0\.0\.0:0|\[::\]:0|LISTENING)\s+.*?(\d+)$"
        foreach ($line in $netstatOutput) {
            if ($line -match $pattern) {
                $matchedPid = [int]$Matches[2]
                if ($matchedPid -gt 0) { return $matchedPid }
            }
        }
    } catch {}

    return 0
}

function Test-AodsHealthStatus([string]$TargetHealthUrl) {
    $curlExe = (Get-Command curl.exe -ErrorAction SilentlyContinue).Source
    if ($curlExe) {
        try {
            $output = & $curlExe -k --ssl-no-revoke -s --max-time 1 $TargetHealthUrl
            if ($output -match '"status"\s*:\s*"ok"') {
                return $true
            }
        } catch {}
    }

    try {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = [System.Net.Security.RemoteCertificateValidationCallback]{ $true }
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "AODS-SplashLauncher")
        $output = $wc.DownloadString($TargetHealthUrl)
        if ($output -match '"status"\s*:\s*"ok"') {
            return $true
        }
    } catch {}

    return $false
}

function Get-ProcessDetails([int]$ProcessId) {
    $res = @{ Pid = $ProcessId; Name = "Unknown"; Path = ""; CommandLine = "" }
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

function Test-IsAodsProcess([int]$ProcessId) {
    if ($ProcessId -le 4) { return $false }

    if (Test-Path $PidFile) {
        try {
            $savedPid = (Get-Content $PidFile -ErrorAction SilentlyContinue).Trim()
            if ($savedPid -eq "$ProcessId") { return $true }
        } catch {}
    }

    try {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if ($proc) {
            $cmd = $proc.CommandLine
            if ($cmd -match "server[/\\]index\.ts") { return $true }
            if ($cmd -and -not ($cmd -match "server[/\\]index\.ts")) { return $false }
        }
    } catch {}

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

    if (Test-AodsHealthStatus $HealthUrl) { return $true }

    return $false
}

# -----------------------------------------------------------------------------
# 3. WPF XAML SPLASH SCREEN DEFINITION
# -----------------------------------------------------------------------------
$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="AODS - Starting System"
        Width="500" Height="345"
        WindowStartupLocation="CenterScreen"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        ResizeMode="NoResize"
        ShowInTaskbar="True"
        Topmost="True">
    <Window.Resources>
        <Style x:Key="BtnPrimary" TargetType="Button">
            <Setter Property="Background" Value="#1d4ed8"/>
            <Setter Property="Foreground" Value="#ffffff"/>
            <Setter Property="FontWeight" Value="SemiBold"/>
            <Setter Property="FontSize" Value="11"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" CornerRadius="5" Padding="14,7">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
        <Style x:Key="BtnSecondary" TargetType="Button">
            <Setter Property="Background" Value="Transparent"/>
            <Setter Property="Foreground" Value="#94a3b8"/>
            <Setter Property="BorderBrush" Value="#334155"/>
            <Setter Property="BorderThickness" Value="1"/>
            <Setter Property="FontSize" Value="11"/>
            <Setter Property="Cursor" Value="Hand"/>
            <Setter Property="Template">
                <Setter.Value>
                    <ControlTemplate TargetType="Button">
                        <Border Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="5" Padding="14,7">
                            <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
                        </Border>
                    </ControlTemplate>
                </Setter.Value>
            </Setter>
        </Style>
    </Window.Resources>
    <Border Name="WindowBorder" CornerRadius="10" BorderThickness="1" BorderBrush="#1e3a5f">
        <Border.Background>
            <LinearGradientBrush StartPoint="0,0" EndPoint="0,1">
                <GradientStop Color="#091a2e" Offset="0"/>
                <GradientStop Color="#050e1a" Offset="1"/>
            </LinearGradientBrush>
        </Border.Background>
        <Border.Effect>
            <DropShadowEffect BlurRadius="25" ShadowDepth="4" Opacity="0.65" Color="#000000"/>
        </Border.Effect>
        <Grid Margin="24,18,24,18">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Close Action (Top Right) -->
            <Button Name="BtnExit" Grid.Row="0" HorizontalAlignment="Right" VerticalAlignment="Top"
                    Content="✕" Width="24" Height="24" Background="Transparent" Foreground="#64748b"
                    BorderThickness="0" FontSize="11" Cursor="Hand" Margin="0,-6,-10,0"/>

            <!-- Main Content Area -->
            <StackPanel Grid.Row="1" VerticalAlignment="Center" HorizontalAlignment="Center">
                <!-- Official County Shield Emblem Badge -->
                <Border Width="56" Height="56" CornerRadius="12" BorderThickness="1" BorderBrush="#2563eb"
                        HorizontalAlignment="Center" Margin="0,0,0,10">
                    <Border.Background>
                        <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
                            <GradientStop Color="#1d4b7c" Offset="0"/>
                            <GradientStop Color="#0d2847" Offset="1"/>
                        </LinearGradientBrush>
                    </Border.Background>
                    <Viewbox Width="32" Height="32" HorizontalAlignment="Center" VerticalAlignment="Center">
                        <Canvas Width="24" Height="24">
                            <Path Data="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"
                                  Stroke="#60a5fa" StrokeThickness="1.8" StrokeLineJoin="Round" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
                            <Path Data="M9 12l2 2 4-4"
                                  Stroke="#ffffff" StrokeThickness="2.2" StrokeLineJoin="Round" StrokeStartLineCap="Round" StrokeEndLineCap="Round"/>
                        </Canvas>
                    </Viewbox>
                </Border>

                <!-- Application Title & Subtitle -->
                <TextBlock Text="AODS" FontSize="22" FontWeight="Bold" Foreground="#ffffff"
                           HorizontalAlignment="Center"/>
                <TextBlock Text="Adoption Office Database System" FontSize="10.5" Foreground="#8faec8"
                           HorizontalAlignment="Center" Margin="0,2,0,0"/>

                <!-- Welcome Message & Supporting Text -->
                <TextBlock Text="Welcome to AODS" FontSize="14" FontWeight="SemiBold" Foreground="#e2ebf4"
                           HorizontalAlignment="Center" Margin="0,12,0,2"/>
                <TextBlock Name="SubtitleText" Text="Preparing your secure workspace" FontSize="11" Foreground="#7f9fb9"
                           HorizontalAlignment="Center"/>

                <!-- Active Progress Section -->
                <StackPanel Name="LoadingPanel" Margin="0,14,0,0">
                    <ProgressBar Name="ProgressBar" Height="4" Width="360" IsIndeterminate="True"
                                 Background="#0d2847" Foreground="#38bdf8" BorderThickness="0"/>
                    <TextBlock Name="StageLabel" Text="Stage 1 of 7: Preparing application environment"
                               FontSize="11" FontWeight="SemiBold" Foreground="#93c5fd"
                               HorizontalAlignment="Center" Margin="0,10,0,0"/>
                    <TextBlock Name="DetailLabel" Text="Validating system runtime and dependencies..."
                               FontSize="9.5" Foreground="#6488aa"
                               HorizontalAlignment="Center" Margin="0,3,0,0"/>
                </StackPanel>

                <!-- Failure / Error Panel -->
                <StackPanel Name="ErrorPanel" Visibility="Collapsed" Margin="0,8,0,0" Width="410">
                    <TextBlock Name="ErrorTitle" Text="Startup Attention Required" FontSize="13" FontWeight="Bold"
                               Foreground="#f87171" HorizontalAlignment="Center"/>
                    <TextBlock Name="ErrorMessage" Text="Unable to complete system initialization."
                               FontSize="11" Foreground="#cbd5e1" HorizontalAlignment="Center"
                               TextWrapping="Wrap" TextAlignment="Center" Margin="0,6,0,12" LineHeight="16"/>
                    <StackPanel Orientation="Horizontal" HorizontalAlignment="Center">
                        <Button Name="BtnRetry" Content="Retry" Style="{StaticResource BtnPrimary}"
                                Width="110" Height="30" Margin="0,0,8,0"/>
                        <Button Name="BtnClose" Content="Close Application" Style="{StaticResource BtnSecondary}"
                                Width="125" Height="30" Margin="8,0,0,0"/>
                    </StackPanel>
                </StackPanel>
            </StackPanel>

            <!-- Bottom Compliance Line -->
            <TextBlock Grid.Row="2" Text="County Government · Confidential Adoption Records"
                       FontSize="9" Foreground="#475569" HorizontalAlignment="Center"
                       VerticalAlignment="Bottom" Margin="0,8,0,0"/>
        </Grid>
    </Border>
</Window>
'@

$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xaml))
$win = [System.Windows.Markup.XamlReader]::Load($reader)

# Wire element references
$windowBorder = $win.FindName("WindowBorder")
$btnExit = $win.FindName("BtnExit")
$loadingPanel = $win.FindName("LoadingPanel")
$progressBar = $win.FindName("ProgressBar")
$stageLabel = $win.FindName("StageLabel")
$detailLabel = $win.FindName("DetailLabel")
$subtitleText = $win.FindName("SubtitleText")
$errorPanel = $win.FindName("ErrorPanel")
$errorTitle = $win.FindName("ErrorTitle")
$errorMessage = $win.FindName("ErrorMessage")
$btnRetry = $win.FindName("BtnRetry")
$btnClose = $win.FindName("BtnClose")

# Set Window Icon for taskbar
if (Test-Path $IconFile) {
    try {
        $iconUri = New-Object Uri($IconFile, [UriKind]::Absolute)
        $win.Icon = New-Object System.Windows.Media.Imaging.BitmapImage($iconUri)
    } catch {}
}

# Allow window dragging
$windowBorder.add_MouseLeftButtonDown({
    $win.DragMove()
})

$btnExit.add_Click({
    Write-LauncherLog "INFO" "User closed loading window via [✕]."
    $win.Close()
    exit 0
})

$btnClose.add_Click({
    Write-LauncherLog "INFO" "User clicked [Close Application]."
    $win.Close()
    exit 1
})

# -----------------------------------------------------------------------------
# 4. INITIALIZATION STATE MACHINE
# -----------------------------------------------------------------------------
$script:state = 1
$script:attempt = 0
$script:maxAttempts = 25
$script:alreadyRunning = $false
$script:serverPid = 0

function Set-ErrorState([string]$title, [string]$msg, [string]$logMsg) {
    Write-LauncherLog "ERROR" "$title - $logMsg"
    $timer.Stop()
    $loadingPanel.Visibility = [System.Windows.Visibility]::Collapsed
    $errorTitle.Text = $title
    $errorMessage.Text = $msg
    $subtitleText.Text = "Initialization paused"
    $errorPanel.Visibility = [System.Windows.Visibility]::Visible
}

$btnRetry.add_Click({
    Write-LauncherLog "INFO" "User triggered [Retry Startup]."
    $errorPanel.Visibility = [System.Windows.Visibility]::Collapsed
    $loadingPanel.Visibility = [System.Windows.Visibility]::Visible
    $subtitleText.Text = "Preparing your secure workspace"
    $script:state = 1
    $script:attempt = 0
    $script:alreadyRunning = $false
    $script:serverPid = 0
    $timer.Start()
})

$timer = New-Object System.Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(90)

$timer.add_Tick({
    switch ($script:state) {
        # ---------------------------------------------------------------------
        # STAGE 1: Preparing application environment
        # ---------------------------------------------------------------------
        1 {
            $stageLabel.Text = "Stage 1 of 7: Preparing application environment"
            $detailLabel.Text = "Validating Node.js runtime and application files..."

            if (-not $NodeExe) {
                Set-ErrorState "Node.js Runtime Missing" `
                    "Node.js v20+ was not found in the system PATH. Please contact your system administrator or install Node.js." `
                    "Node.js executable missing from PATH."
                return
            }

            if (-not (Test-Path $DistIndex)) {
                Set-ErrorState "Application Build Missing" `
                    "The production frontend bundle was not found. Please notify your IT administrator to compile the build." `
                    "dist/index.html not found."
                return
            }

            Write-LauncherLog "INFO" "Stage 1 Complete: Environment verified."
            $script:state = 2
        }

        # ---------------------------------------------------------------------
        # STAGE 2: Checking existing AODS server
        # ---------------------------------------------------------------------
        2 {
            $stageLabel.Text = "Stage 2 of 7: Checking existing AODS server"
            $detailLabel.Text = "Inspecting network ports and running instances..."

            $l3443 = Get-PortListenerPid ([int]$Port)
            $l3001 = Get-PortListenerPid ([int]$HttpPort)

            # Check for conflicting foreign process on port 3443
            if ($l3443 -gt 0 -and (-not (Test-IsAodsProcess $l3443))) {
                $pInfo = Get-ProcessDetails $l3443
                Set-ErrorState "Network Port Conflict ($Port)" `
                    "Required HTTPS port $Port is occupied by an unrelated program ($($pInfo.Name), PID $($pInfo.Pid)). AODS will not terminate other software. Please close the conflicting application and click Retry." `
                    "Foreign listener on port $Port by PID $($pInfo.Pid) ($($pInfo.Name))."
                return
            }

            # Check for conflicting foreign process on port 3001
            if ($l3001 -gt 0 -and (-not (Test-IsAodsProcess $l3001))) {
                $pInfo = Get-ProcessDetails $l3001
                Set-ErrorState "Network Port Conflict ($HttpPort)" `
                    "Required HTTP port $HttpPort is occupied by an unrelated program ($($pInfo.Name), PID $($pInfo.Pid)). AODS will not terminate other software. Please close the conflicting application and click Retry." `
                    "Foreign listener on port $HttpPort by PID $($pInfo.Pid) ($($pInfo.Name))."
                return
            }

            # Check if an existing AODS server is already listening
            $activePid = 0
            if ($l3443 -gt 0 -and (Test-IsAodsProcess $l3443)) { $activePid = $l3443 }
            elseif ($l3001 -gt 0 -and (Test-IsAodsProcess $l3001)) { $activePid = $l3001 }

            if ($activePid -gt 0) {
                Write-LauncherLog "INFO" "Existing AODS process detected (PID: $activePid). Testing health..."
                if (Test-AodsHealthStatus $HealthUrl) {
                    Write-LauncherLog "INFO" "Existing AODS server (PID: $activePid) is healthy. Reusing instance."
                    $script:alreadyRunning = $true
                    $script:serverPid = $activePid
                    # Fast-forward directly to Stage 6 & 7
                    $script:state = 6
                    return
                } else {
                    Write-LauncherLog "WARN" "AODS process (PID: $activePid) is unresponsive. Safely recycling..."
                    Stop-Process -Id $activePid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 600
                }
            }

            Write-LauncherLog "INFO" "Stage 2 Complete: Port checks passed. No existing active instance."
            $script:state = 3
        }

        # ---------------------------------------------------------------------
        # STAGE 3: Starting secure application services, if necessary
        # ---------------------------------------------------------------------
        3 {
            $stageLabel.Text = "Stage 3 of 7: Starting secure application services"
            $detailLabel.Text = "Initializing background backend processes..."

            if (-not $script:alreadyRunning) {
                $script:serverPid = 0

                # Method 1: WMI Win32_Process.Create with Win32_ProcessStartup ShowWindow = 0 (SW_HIDE)
                # Spawns node.exe under WmiPrvSE.exe fully detached with zero visible console window.
                try {
                    $cmdLine = "`"$NodeExe`" `"$ServerScript`""
                    $startup = New-CimInstance -ClassName Win32_ProcessStartup -Property @{ ShowWindow = [uint16]0 } -ClientOnly
                    $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
                        CommandLine = [string]$cmdLine
                        CurrentDirectory = [string]$ProjectRoot
                        ProcessStartupInformation = $startup
                    } -ErrorAction Stop

                    if ($res -and $res.ReturnValue -eq 0 -and $res.ProcessId -gt 0) {
                        $script:serverPid = [int]$res.ProcessId
                        Write-LauncherLog "INFO" "Server process spawned via WMI with ShowWindow=0 (SW_HIDE) (PID: $($script:serverPid))."
                    }
                } catch {
                    Write-LauncherLog "WARN" "WMI silent process creation failed: $_"
                }

                # Fallback 1: .NET ProcessStartInfo with CreateNoWindow = $true and WindowStyle = Hidden
                if ($script:serverPid -le 0) {
                    try {
                        $psi = New-Object System.Diagnostics.ProcessStartInfo
                        $psi.FileName = $NodeExe
                        $psi.Arguments = "`"$ServerScript`""
                        $psi.WorkingDirectory = "$ProjectRoot"
                        $psi.UseShellExecute = $false
                        $psi.CreateNoWindow = $true
                        $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
                        $psi.RedirectStandardOutput = $false
                        $psi.RedirectStandardError = $false
                        $proc = [System.Diagnostics.Process]::Start($psi)
                        if ($proc -and -not $proc.HasExited) {
                            $script:serverPid = $proc.Id
                            Write-LauncherLog "INFO" "Server process spawned via ProcessStartInfo with CreateNoWindow=true (PID: $($script:serverPid))."
                        }
                    } catch {
                        Write-LauncherLog "WARN" "ProcessStartInfo spawn failed: $_"
                    }
                }

                # Fallback 2: Start-Process with -WindowStyle Hidden
                if ($script:serverPid -le 0) {
                    try {
                        $p = Start-Process -FilePath $NodeExe -ArgumentList "`"$ServerScript`"" -WorkingDirectory "$ProjectRoot" -WindowStyle Hidden -PassThru
                        if ($p -and -not $p.HasExited) {
                            $script:serverPid = $p.Id
                            Write-LauncherLog "INFO" "Server process spawned via Start-Process -WindowStyle Hidden (PID: $($script:serverPid))."
                        }
                    } catch {
                        Set-ErrorState "Server Launch Failure" `
                            "Unable to spawn the Node.js backend process. Please check permissions or contact IT support." `
                            "Failed to spawn Node process: $_"
                        return
                    }
                }

                try {
                    Set-Content -Path $PidFile -Value "$($script:serverPid)" -Encoding utf8 -ErrorAction SilentlyContinue
                } catch {}
            }

            $script:attempt = 0
            $script:state = 4
        }

        # ---------------------------------------------------------------------
        # STAGE 4: Verifying HTTPS availability
        # ---------------------------------------------------------------------
        4 {
            $script:attempt++
            $stageLabel.Text = "Stage 4 of 7: Verifying HTTPS availability"
            $detailLabel.Text = "Connecting to secure local endpoint (check $($script:attempt) of $($script:maxAttempts))..."

            if (Test-AodsHealthStatus $HealthUrl) {
                Write-LauncherLog "INFO" "Stage 4 Complete: HTTPS health endpoint responding successfully."
                $script:state = 5
                return
            }

            # Check if spawned process exited unexpectedly
            if ($script:serverPid -gt 0) {
                $procCheck = Get-Process -Id $script:serverPid -ErrorAction SilentlyContinue
                if (-not $procCheck -or $procCheck.HasExited) {
                    Set-ErrorState "Backend Server Stopped" `
                        "The AODS backend server exited unexpectedly during startup. Please review server logs or click Retry." `
                        "Process PID $($script:serverPid) terminated prematurely."
                    return
                }
            }

            if ($script:attempt -ge $script:maxAttempts) {
                Set-ErrorState "Connection Timeout" `
                    "The AODS server did not become responsive within the expected timeframe. Click Retry to attempt reconnecting, or review logs." `
                    "Timed out polling $HealthUrl after $($script:maxAttempts) attempts."
                return
            }
        }

        # ---------------------------------------------------------------------
        # STAGE 5: Checking database connectivity
        # ---------------------------------------------------------------------
        5 {
            $stageLabel.Text = "Stage 5 of 7: Checking database connectivity"
            $detailLabel.Text = "Verifying adoption records database integrity..."

            if (-not (Test-Path $DbFile)) {
                Set-ErrorState "Database Unavailable" `
                    "The central adoption records database could not be located. Please contact your IT administrator." `
                    "Database file not found at: $DbFile"
                return
            }

            Write-LauncherLog "INFO" "Stage 5 Complete: Database connectivity confirmed."
            $script:state = 6
        }

        # ---------------------------------------------------------------------
        # STAGE 6: Preparing secure workspace
        # ---------------------------------------------------------------------
        6 {
            $stageLabel.Text = "Stage 6 of 7: Preparing secure workspace"
            $detailLabel.Text = "Finalizing session environment..."

            Write-LauncherLog "INFO" "Stage 6 Complete: Workspace ready for launch."
            $script:state = 7
        }

        # ---------------------------------------------------------------------
        # STAGE 7: Opening AODS
        # ---------------------------------------------------------------------
        7 {
            $timer.Stop()
            $stageLabel.Text = "Stage 7 of 7: Opening AODS"
            $detailLabel.Text = "Opening dashboard in default web browser..."

            Write-LauncherLog "INFO" "Stage 7 Complete: Launching browser ($Url)."

            if (-not $NoBrowser) {
                try {
                    Start-Process $Url
                } catch {
                    Write-LauncherLog "WARN" "Failed to invoke default browser: $_"
                }
            }

            # Graceful delay to show completion state before closing splash window
            Start-Sleep -Milliseconds 450
            $win.Close()
            Write-LauncherLog "INFO" "Splash screen closed. AODS backend remains active in background."
            exit 0
        }
    }
})

$win.add_Loaded({
    $timer.Start()
})

# Show modal dialog
$win.ShowDialog() | Out-Null
exit 0
