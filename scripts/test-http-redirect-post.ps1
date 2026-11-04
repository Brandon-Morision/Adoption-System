# Test HTTP 308 Method-Preserving Redirect for POST requests
Add-Type @"
    using System.Net;
    using System.Security.Cryptography.X509Certificates;
    public class TrustAllCertsPolicy2 : ICertificatePolicy {
        public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) {
            return true;
        }
    }
"@
[System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy2
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

Write-Host "=================================================================="
Write-Host "  TESTING HTTP 308 METHOD AND BODY PRESERVATION FOR POST REQUESTS"
Write-Host "=================================================================="

# 1. Test POST /api/auth/login directly against HTTP port 3001
Write-Host "`n[Step 1] Sending POST to HTTP entry point: http://localhost:3001/api/auth/login..." -ForegroundColor Yellow
$loginPayload = '{"employee_id":"ADM-001","password":"countyrecords"}'

$req = [System.Net.HttpWebRequest]::Create("http://localhost:3001/api/auth/login")
$req.Method = "POST"
$req.ContentType = "application/json"
$req.AllowAutoRedirect = $false
$bytes = [System.Text.Encoding]::UTF8.GetBytes($loginPayload)
$req.ContentLength = $bytes.Length
$os = $req.GetRequestStream()
$os.Write($bytes, 0, $bytes.Length)
$os.Close()

try {
    $resp = $req.GetResponse() -as [System.Net.HttpWebResponse]
    Write-Host "  Unexpected 200 without redirect: $($resp.StatusCode)" -ForegroundColor Red
}
catch [System.Net.WebException] {
    $resp = $_.Exception.Response -as [System.Net.HttpWebResponse]
    $statusCode = [int]$resp.StatusCode
    $location = $resp.Headers["Location"]
    Write-Host "  HTTP Redirect Status Code : $statusCode (Expected 308)" -ForegroundColor Green
    Write-Host "  Redirect Target Location  : $location" -ForegroundColor Green
    if ($statusCode -eq 308 -and $location -match "^https://") {
        Write-Host "  [PASS] Server responded with HTTP 308 Permanent Redirect to HTTPS." -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] Did not return 308 redirect: $statusCode" -ForegroundColor Red
    }
}

# 2. Test following the 308 redirect while preserving POST method and body
Write-Host "`n[Step 2] Sending POST to HTTP port 3001 and following 308 redirect to HTTPS..." -ForegroundColor Yellow
$req2 = [System.Net.HttpWebRequest]::Create("http://localhost:3001/api/auth/login")
$req2.Method = "POST"
$req2.ContentType = "application/json"
$req2.AllowAutoRedirect = $true
$bytes = [System.Text.Encoding]::UTF8.GetBytes($loginPayload)
$req2.ContentLength = $bytes.Length
$os = $req2.GetRequestStream()
$os.Write($bytes, 0, $bytes.Length)
$os.Close()

try {
    $resp2 = $req2.GetResponse() -as [System.Net.HttpWebResponse]
    $reader = New-Object System.IO.StreamReader($resp2.GetResponseStream())
    $body = $reader.ReadToEnd()
    $json = $body | ConvertFrom-Json
    Write-Host "  Final HTTP Status Code    : $([int]$resp2.StatusCode)" -ForegroundColor Green
    Write-Host "  Final Response URL        : $($resp2.ResponseUri.AbsoluteUri)" -ForegroundColor Green
    Write-Host "  Login Success             : $($json.success)" -ForegroundColor Green
    Write-Host "  Token Issued              : $([bool]$json.token)" -ForegroundColor Green
    Write-Host "  mustChangePassword        : $($json.mustChangePassword)" -ForegroundColor Green
    if ($json.success -eq $true -and $resp2.ResponseUri.Scheme -eq "https") {
        Write-Host "  [PASS] POST request preserved across redirect and authenticated successfully over HTTPS." -ForegroundColor Green
    }
}
catch {
    Write-Host "  [FAIL] Failed following redirect: $_" -ForegroundColor Red
}

Write-Host "`n=================================================================="
Write-Host "  HTTP 308 REDIRECT TEST COMPLETED"
Write-Host "=================================================================="

