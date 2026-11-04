<#
.SYNOPSIS
    County Adoption Records System (AODS)
    Windows Defender Firewall LAN Configuration Script
.DESCRIPTION
    Configures inbound firewall rules on the hosting server to permit LAN workstation browsers
    to access AODS on ports 3001 and 8443 exclusively over Private and Domain networks.
    Must be executed with elevated Administrator privileges.
#>

[CmdletBinding()]
param(
    [string]$RuleName = "County Adoption Records System (AODS)",
    [int[]]$Ports = @(3001, 8443),
    [switch]$Remove
)

# Enforce Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be executed with Administrator privileges. Please right-click PowerShell and choose 'Run as administrator'."
    exit 1
}

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  COUNTY ADOPTION RECORDS SYSTEM - FIREWALL CONFIGURATION            " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan

if ($Remove) {
    Write-Host "Removing existing firewall rules for $RuleName..." -ForegroundColor Yellow
    Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
    Write-Host "Firewall rules removed." -ForegroundColor Green
    exit 0
}

# Remove existing rules with the same name to prevent duplicates
Remove-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue

$PortList = ($Ports -join ",")

Write-Host "Configuring inbound rule for TCP ports: $PortList"
Write-Host "Restricting to Profile: Domain, Private (Public networks blocked)"

New-NetFirewallRule `
    -DisplayName $RuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Ports `
    -Profile Domain, Private `
    -Description "Permits authorized county office LAN workstations to connect to the County Adoption Records System." `
    -Enabled True | Out-Null

Write-Host "`n[SUCCESS] Windows Defender Firewall rule created successfully!" -ForegroundColor Green
Write-Host "Authorized computers on the office LAN can now access the system at:"
$HostIPs = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }).IPAddress
foreach ($ip in $HostIPs) {
    Write-Host "  -> http://${ip}:3001/" -ForegroundColor White
}
Write-Host "=====================================================================" -ForegroundColor Cyan

