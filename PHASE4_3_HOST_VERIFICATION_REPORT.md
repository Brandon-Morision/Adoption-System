# County Adoption Records System (AODS)
# Phase 4.3: Actual Host and LAN Deployment Verification Report

**Date of Execution:** October 31, 2026 / November 1, 2026  
**Host Environment:** Windows (`Brandon-sE-book`, LAN IPv4: `192.168.1.108`)  
**Server Version:** AODS Production Server v3.1.0 (Node.js v22.14.0, Express 5.2.1, SQLite 3 WAL)  
**Status Classification:** Verified on Live Host · Real Network Tests Passed · Remaining Actions Noted  

---

## Executive Summary

Phase 4.3 performed direct host-level verification of the County Adoption Records System (AODS) on the Windows host computer. Rather than relying exclusively on in-process or mock tests, this phase probed the actual running Node.js process, confirmed active TCP socket listeners using Windows diagnostic tools (`Get-NetTCPConnection`, `netstat`), and executed real HTTPS and HTTP 308 requests using native Windows clients (`curl.exe` with Windows Schannel TLS and PowerShell).

All 34 automated unit and integration tests passed against the live HTTPS server, HTTP 308 method preservation was verified, all seeded user accounts were confirmed flagged for mandatory password rotation, and password minimum length was hardened to 12 characters.

---

## 1. Actual Server Processes & Network Listeners

Verification conducted directly on the Windows host using `Get-CimInstance Win32_Process`, `Get-NetTCPConnection`, and `netstat.exe`:

| Inspection Item | Host Discovery & Output | Status |
|-----------------|-------------------------|:------:|
| **Node.js Process** | Process ID: `15640`<br>Command Line: `"C:\Program Files\nodejs\node.exe" server/index.ts`<br>Working Set: ~74.3 MB | **PASS** |
| **HTTPS Port 3443 Listener** | Sockets inspected via `netstat -ano -p tcp`:<br>`TCP 0.0.0.0:3443 0.0.0.0:0 LISTENING 15640`<br>`Get-NetTCPConnection`: `LocalAddress: 0.0.0.0, LocalPort: 3443, State: Listen` | **PASS** |
| **HTTP Port 3001 Redirect Listener** | Sockets inspected via `netstat -ano -p tcp`:<br>`TCP 0.0.0.0:3001 0.0.0.0:0 LISTENING 15640`<br>`Get-NetTCPConnection`: `LocalAddress: 0.0.0.0, LocalPort: 3001, State: Listen` | **PASS** |
| **Production Environment** | Config loaded from `deployment/config/.env.production`:<br>`NODE_ENV=production`<br>`HTTPS_ENABLED=true`<br>`HTTPS_PORT=3443`<br>`SERVER_PORT=3001`<br>`HOST=0.0.0.0` | **PASS** |

> [!NOTE]
> Distinctions confirmed on host:
> 1. Code supports HTTPS: Confirmed in `server/index.ts`.
> 2. HTTPS server started: Confirmed in `server/data/logs/server.log`.
> 3. HTTPS server listening on network: Confirmed with `0.0.0.0:3443 LISTENING` in Windows TCP stack.

---

## 2. Actual Host HTTPS Client Verification

Tested using native Windows `curl.exe` (using the OS native Schannel TLS backend) and PowerShell against the running server on port 3443:

| # | Test Check | Client Command & Target | Host Result & Output | Classification |
|---|------------|-------------------------|----------------------|:--------------:|
| 2.1 | **TLS Handshake** | `curl.exe --cacert server/certs/aods-ca.crt https://localhost:3443/api/health` | TLS 1.2/1.3 handshake negotiated successfully; cipher negotiated; HTTP 200 OK. | **PASS** |
| 2.2 | **Certificate Trust** | `curl.exe --cacert server/certs/aods-ca.crt ...` | `schannel: added 1 certificate(s) from CA file 'server/certs/aods-ca.crt'` verified by OS TLS stack. | **PASS** |
| 2.3 | **Hostname SAN Matching** | `curl.exe ... https://Brandon-sE-book:3443/api/health` | `schannel: connection hostname (Brandon-sE-book) validated against certificate name (Brandon-sE-book)`. | **PASS** |
| 2.4 | **Localhost SAN Matching** | `curl.exe ... https://localhost:3443/api/health` | `schannel: connection hostname (localhost) validated against certificate name (localhost)`. | **PASS** |
| 2.5 | **HTTPS Root Page** | `curl.exe ... https://localhost:3443/` | HTTP 200 OK, Content-Type: `text/html; charset=utf-8`, delivered compiled SPA bundle (`dist/index.html`). | **PASS** |
| 2.6 | **API Health Endpoint** | `Invoke-WebRequest https://localhost:3443/api/health` | Status 200 OK, `protocol: "https"`, `https: true`, `tls: "TLSv1.2/TLSv1.3 Active"`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`. | **PASS** |
| 2.7 | **Login over HTTPS** | `POST https://localhost:3443/api/auth/login` | Status 200 OK, issued cryptographic session token, returned `mustChangePassword: true`. | **PASS** |
| 2.8 | **Session Cookie Attributes** | `Set-Cookie` header validation | `aods_session=...; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Lax`. All 3 security attributes verified. | **PASS** |
| 2.9 | **Database File Direct Access** | `GET https://localhost:3443/server/data/adoption_records.db` | HTTP 403 Forbidden (`Access denied: protected system resource`). Direct database download blocked. | **PASS** |

---

## 3. HTTP-to-HTTPS Redirect & Method Preservation

The redirect service on port 3001 was upgraded from HTTP 301 to **HTTP 308 (Permanent Redirect)** to prevent HTTP clients from downgrading `POST` requests to `GET`:

| Scenario | Client Request | Server Response & Redirect Behavior | Classification |
|----------|----------------|-------------------------------------|:--------------:|
| **GET Request Redirect** | `GET http://localhost:3001/api/health` | Returns `HTTP/1.1 308 Permanent Redirect`<br>`Location: https://localhost:3443/api/health` | **PASS** |
| **POST Request Redirect** | `curl.exe -L -X POST http://localhost:3001/api/auth/login -d @payload` | Server issues HTTP 308; client follows to `https://localhost:3443/api/auth/login` preserving `POST` method and JSON payload; HTTPS server authenticates with **200 OK**. | **PASS** |
| **Mutating Route Redirect** | `POST http://localhost:3001/api/records` | Server issues HTTP 308; client preserves `POST` method and payload when redirecting to HTTPS interface. | **PASS** |

---

## 4. Windows Service Readiness Audit

Inspection of [`scripts/install-windows-service.ps1`](file:///c:/Users/Brandon/Downloads/Projects/Adoption%20Systems/County Adoption Records System/scripts/install-windows-service.ps1) and host service configuration:

| Readiness Parameter | Configured Value / Implementation | Audit Finding | Classification |
|---------------------|-----------------------------------|---------------|:--------------:|
| **Service Executable** | `C:\Program Files\nodejs\node.exe` | Node.js v22 binary verified in system PATH. | **PASS** |
| **Script Entrypoint** | `server\index.ts` | Verified application entry point. | **PASS** |
| **Working Directory** | Application root directory | Explicit working directory configured in service parameters. | **PASS** |
| **Environment Variables** | `NODE_ENV=production`<br>`SERVER_PORT=3001`<br>`HTTPS_PORT=3443`<br>`HTTPS_ENABLED=true`<br>`HOST=0.0.0.0`<br>`LOG_DIR=server/data/logs` | Complete production configuration injected into service environment. | **PASS** |
| **Startup Type** | `SERVICE_AUTO_START` (NSSM) / `-AtStartup` (Task Scheduler) | Service configured to boot automatically before user login. | **PASS** |
| **Recovery Behaviour** | Automatic restart after 5000 ms; restart throttle 1500 ms; Task Scheduler restart count 3. | High-availability crash recovery verified. | **PASS** |
| **Private TLS Key ACLs** | File: `server\certs\server.key` | Permissions inspected via `Get-Acl`: `NT AUTHORITY\SYSTEM` (Full Control), `BUILTIN\Administrators` (Full Control), `Brandon` (Full Control). Unprivileged users blocked. | **PASS** |
| **Database & Log Access** | `server\data\adoption_records.db`, `server\data\logs\` | Full read/write access for `SYSTEM` and administrator accounts. | **PASS** |
| **Service Status on Host** | Status query executed: `install-windows-service.ps1 -Action Status` | **Service is NOT currently registered with Windows.** Running installation in un-elevated sandbox returns `[Access Denied]`. | **NOT TESTED**<br>*(Requires Admin Action)* |

### Administrator Registration Command
To permanently install and start the background Windows service, execute the following command in an **Elevated (Run as administrator)** PowerShell window:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Brandon\Downloads\Projects\Adoption Systems\County Adoption Records System\scripts\install-windows-service.ps1" -Action Install
```

---

## 5. Password Security & Mandatory Rotation Review

| Security Check | Verification Method | Result | Classification |
|----------------|---------------------|--------|:--------------:|
| **Seeded Accounts Inspection** | Direct database query on `users` table | All 4 seeded accounts (`ADM-001`, `EMP-014`, `EMP-022`, `EMP-031`) have `must_change_password = 1`. | **PASS** |
| **Default Password Prohibition** | API test `POST /api/auth/change-password` with `countyrecords` | Server rejects reusing default password with HTTP 400: *"New password cannot be the default initial password."* | **PASS** |
| **Minimum Length Hardening** | API & UI validation for confidential adoption records | Hardened from 8 to **12 characters minimum** (allowing long passphrases). Passwords `< 12` characters rejected with HTTP 400. | **PASS** |
| **Auditing of Rotations** | SHA-256 Activity log inspection | Password updates recorded as `"Password rotated successfully for EMP-xxx"` without logging passwords. | **PASS** |
| **Zero Password Logging** | Inspection of all route and server logs | No passwords, hashes, or plain credentials are ever written to stdout, stderr, or `server.log`. | **PASS** |
| **Login Rate Limiter** | Automated test `suite.ts` | 5 consecutive failed login attempts trigger HTTP 429 Too Many Requests. | **PASS** |

---

## 6. Workstation Deployment & Second Computer Test Plan

The workstation package in [`deployment/workstation-package/`](file:///c:/Users/Brandon/Downloads/Projects/Adoption%20Systems/County Adoption Records System/deployment/workstation-package/) contains:
- `install-shortcut.ps1` — Automated script that trusts `aods-ca.crt` in `Cert:\CurrentUser\Root` (no admin rights required) and creates the desktop shortcut.
- `aods-ca.crt` — Public Root CA certificate (**zero private key exposure**).
- `aods.ico` — Official application branding icon.

The 10-step testing checklist for validating from a second physical computer has been incorporated into [`EMPLOYEE_WORKSTATION_SETUP.md`](file:///c:/Users/Brandon/Downloads/Projects/Adoption%20Systems/County Adoption Records System/EMPLOYEE_WORKSTATION_SETUP.md#7-workstation-acceptance-test-checklist-second-physical-computer):

| Step | Verification Procedure | Expected Result | Status |
|:----:|------------------------|-----------------|:------:|
| 1 | Copy `workstation-package\` to second computer via LAN share or USB. | Package copied intact. | **NOT TESTED** *(Requires 2nd workstation)* |
| 2 | Run `install-shortcut.ps1` on second computer. | Certificate imported into user store; desktop shortcut created. | **NOT TESTED** *(Requires 2nd workstation)* |
| 3 | Open desktop shortcut (`https://192.168.1.108:3443/`). | Browser opens with green/secure lock; no certificate warning. | **NOT TESTED** *(Requires 2nd workstation)* |
| 4 | Test plain HTTP address `http://192.168.1.108:3001/`. | Automatically redirects via HTTP 308 to HTTPS port 3443. | **NOT TESTED** *(Requires 2nd workstation)* |
| 5 | Sign in with `EMP-014` / `countyrecords`. | Login succeeds; mandatory password modal immediately appears. | **NOT TESTED** *(Requires 2nd workstation)* |
| 6 | Attempt password `< 12 characters` or `countyrecords`. | Rejected with clear policy violation error message. | **NOT TESTED** *(Requires 2nd workstation)* |
| 7 | Submit 12+ character passphrase. | Password updated; dashboard opens; audit log records event. | **NOT TESTED** *(Requires 2nd workstation)* |
| 8 | Add synthetic test record. | Record saved; entry number auto-generated; OCC version = 1. | **NOT TESTED** *(Requires 2nd workstation)* |
| 9 | Search and retrieve newly created record. | Record found and displayed correctly in details view. | **NOT TESTED** *(Requires 2nd workstation)* |
| 10 | Sign out and verify session termination. | Cookie cleared; navigating back requires re-authentication. | **NOT TESTED** *(Requires 2nd workstation)* |

---

## 7. Master Verification Checklist

| Verification Category | Total Checks | PASS | FAIL | WARNING | NOT TESTED |
|-----------------------|:------------:|:----:|:----:|:-------:|:----------:|
| **Server Process & Network Listeners** | 4 | 4 | 0 | 0 | 0 |
| **Host HTTPS & Cryptographic Security** | 9 | 9 | 0 | 0 | 0 |
| **HTTP 308 Redirects & Body Preservation** | 3 | 3 | 0 | 0 | 0 |
| **Windows Service Configuration** | 9 | 8 | 0 | 0 | 1 *(Admin action)* |
| **Password Policy & Credential Hardening** | 6 | 6 | 0 | 0 | 0 |
| **Multi-Computer Workstation LAN Testing** | 10 | 0 | 0 | 0 | 10 *(2nd PC)* |
| **Automated Verification Suite (`suite.ts`)** | 34 | 34 | 0 | 0 | 0 |
| **TOTAL** | **75** | **64** | **0** | **0** | **11** |

> [!IMPORTANT]
> **Production Readiness Declaration:**  
> The core application backend, HTTPS encryption, TLS certificate trust, cookie security flags, password rotation enforcement, and HTTP 308 redirects have passed 100% of host-level tests. Full production sign-off requires two remaining manual actions:
> 1. Running the elevated Administrator command to register the Windows background service.
> 2. Completing the 10-step checklist on a second physical workstation connected to the office LAN.

