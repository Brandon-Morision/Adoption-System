$TargetPort = 3443
$lines = netstat -ano -p tcp | Select-String ":$TargetPort\s+.*LISTENING\s+(\d+)"
if ($lines) {
    Write-Host "Matched: $($lines[0].Matches[0].Groups[1].Value)"
} else {
    Write-Host "No match"
}

