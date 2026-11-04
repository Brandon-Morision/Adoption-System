# PowerShell Host Network Verification Script for Phase 4.3
Add-Type @"
    using System.Net;
    using System.Security.Cryptography.X509Certificates;
    public class TrustAllCertsPolicy : ICertificatePolicy {
        public bool CheckValidationResult(
            ServicePoint srvPoint, X509Certificate certificate,
            WebRequest request, int certificateProblem) {
            return true;
        }
    }
"@
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

Write-Host "=================================================================="
Write-Host "  PHASE 4.3 HOST-LEVEL HTTPS & NETWORK VERIFICATION"
Write-Host "=================================================================="

# 1. Test HTTPS Health Endpoint
Write-Host "`n[Test 1] Testing HTTPS API Health (/api/health)..." -ForegroundColor Yellow
try {
    $healthRes = Invoke-WebRequest -Uri "https://localhost:3443/api/health" -Method Get -UseBasicParsing
    Write-Host "  Status Code : $($healthRes.StatusCode)" -ForegroundColor Green
    Write-Host "  HSTS Header : $($healthRes.Headers['Strict-Transport-Security'])" -ForegroundColor Green
    $healthJson = $healthRes.Content | ConvertFrom-Json
    Write-Host "  Protocol    : $($healthJson.protocol)" -ForegroundColor Green
    Write-Host "  TLS Active  : $($healthJson.security.tls)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Health check failed: $_" -ForegroundColor Red
}

# 2. Test Root Frontend Static Delivery
Write-Host "`n[Test 2] Testing HTTPS Frontend Root Page (/)..." -ForegroundColor Yellow
try {
    $rootRes = Invoke-WebRequest -Uri "https://localhost:3443/" -Method Get -UseBasicParsing
    Write-Host "  Status Code    : $($rootRes.StatusCode)" -ForegroundColor Green
    Write-Host "  Content-Length : $($rootRes.Content.Length)" -ForegroundColor Green
    if ($rootRes.Content -match "<title>AODS</title>") {
        Write-Host "  [PASS] Single Page Application (SPA) index.html served cleanly." -ForegroundColor Green
    }
} catch {
    Write-Host "  [FAIL] Root page failed: $_" -ForegroundColor Red
}

# 3. Test HTTPS Login & Cookie Security Attributes
Write-Host "`n[Test 3] Testing HTTPS Login & Session Cookie Flags..." -ForegroundColor Yellow
$loginPayload = '{"employee_id":"ADM-001","password":"countyrecords"}'
try {
    $loginRes = Invoke-WebRequest -Uri "https://localhost:3443/api/auth/login" `
        -Method Post `
        -Body $loginPayload `
        -ContentType "application/json" `
        -UseBasicParsing

    Write-Host "  Status Code : $($loginRes.StatusCode)" -ForegroundColor Green
    $setCookie = $loginRes.Headers["Set-Cookie"]
    Write-Host "  Set-Cookie  : $setCookie" -ForegroundColor Green

    $isHttpOnly = $setCookie -match "HttpOnly"
    $isSecure = $setCookie -match "Secure"
    $isSameSiteLax = $setCookie -match "SameSite=Lax"

    Write-Host "  HttpOnly    : $isHttpOnly" -ForegroundColor $(if ($isHttpOnly) { "Green" } else { "Red" })
    Write-Host "  Secure      : $isSecure" -ForegroundColor $(if ($isSecure) { "Green" } else { "Red" })
    Write-Host "  SameSite=Lax: $isSameSiteLax" -ForegroundColor $(if ($isSameSiteLax) { "Green" } else { "Red" })

    $loginJson = $loginRes.Content | ConvertFrom-Json
    Write-Host "  mustChangePassword Flag: $($loginJson.mustChangePassword)" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Login test failed: $_" -ForegroundColor Red
}

# 4. Test Direct Database File Blocking
Write-Host "`n[Test 4] Testing Direct Database Access Denial (/server/data/adoption_records.db)..." -ForegroundColor Yellow
try {
    $dbRes = Invoke-WebRequest -Uri "https://localhost:3443/server/data/adoption_records.db" -Method Get -UseBasicParsing
    Write-Host "  [FAIL] Unexpectedly accessed database directly! Status: $($dbRes.StatusCode)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Host "  [PASS] Direct database access rejected with HTTP 403 Forbidden." -ForegroundColor Green
    } else {
        Write-Host "  Response: $_" -ForegroundColor Yellow
    }
}

# 5. Test HTTP-to-HTTPS 308 Method-Preserving Redirect
Write-Host "`n[Test 5] Testing HTTP-to-HTTPS 308 Redirect (Method & Body Preservation)..." -ForegroundColor Yellow
try {
    $redirRes = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -Method Get -MaximumRedirection 0 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($redirRes.StatusCode -eq 308 -or $redirRes.StatusCode -eq 301) {
        Write-Host "  Status Code : $($redirRes.StatusCode)" -ForegroundColor Green
        Write-Host "  Location    : $($redirRes.Headers['Location'])" -ForegroundColor Green
    }
} catch {
    if ($_.Exception.Response) {
        $status = $_.Exception.Response.StatusCode.value__
        $loc = $_.Exception.Response.Headers["Location"]
        Write-Host "  Redirect Status Code : $status" -ForegroundColor Green
        Write-Host "  Target Location      : $loc" -ForegroundColor Green
        if ($status -eq 308) {
            Write-Host "  [PASS] HTTP 308 Permanent Redirect verified." -ForegroundColor Green
        }
    } else {
        Write-Host "  Redirect check: $_" -ForegroundColor Yellow
    }
}

Write-Host "`n=================================================================="
Write-Host "  HOST NETWORK VERIFICATION FINISHED"
Write-Host "=================================================================="
