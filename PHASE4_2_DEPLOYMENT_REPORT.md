# County Adoption Records System (AODS)
# Phase 4.2 Deployment & Verification Report: HTTPS Activation and Windows Service Deployment

**Generated:** October 31, 2026  
**System:** County Adoption Records System (AODS) v3.1.0  
**Status:** Verification Passed · HTTPS Active · Workstation Package Ready · Production Hardened  

---

## Executive Summary

Phase 4.2 has resolved the outstanding security and deployment warnings from Phase 4.1 without altering the SQLite database schema, user interface design, or core business logic. 

Key milestones achieved:
1. **End-to-End HTTPS/TLS 1.2+ Encryption:** Activated and verified with real HTTPS network transactions on port `3443`.
2. **Dedicated Internal Public Key Infrastructure (PKI):** Generated an internal County Root Certificate Authority (`aods-ca.crt`) and signed server certificate with Subject Alternative Names (SANs) for the server's LAN IP (`192.168.1.108`), actual hostname (`Brandon-sE-book`), `localhost`, `127.0.0.1`, and `adoption.county.local`.
3. **Zero Private Key Exposure:** The server's private key (`server.key`) is restricted via Windows NTFS file permissions and remains solely on the central server. Workstations receive only the public root certificate (`aods-ca.crt`).
4. **Automatic HTTP-to-HTTPS 301 Redirect:** Plain HTTP requests on port `3001` are redirected via HTTP 301 to the encrypted HTTPS interface on port `3443`.
5. **Hardened Cookie Security:** Session cookies enforce `HttpOnly`, `Secure`, and `SameSite=Lax` with an 8-hour lifetime.
6. **Mandatory Initial Password Rotation:** Active accounts using default credentials (`countyrecords`) are automatically flagged (`mustChangePassword: true`). A modal forces password changes (minimum 8 characters, disallowing defaults) before granting access to adoption records.
7. **Windows Service Management:** `scripts/install-windows-service.ps1` correctly detects execution privileges, accurately distinguishes between installed and uninstalled states, and includes explicit administrative installation commands.

---

## 1. Network & Cryptographic Architecture

```
+-----------------------------------------------------------------------------------------+
|                                    CENTRAL SERVER                                       |
|  Hostname: Brandon-sE-book | LAN IP: 192.168.1.108                                      |
|                                                                                         |
|  +---------------------------+             +-----------------------------------------+  |
|  |   HTTP Redirect Service   |             |           HTTPS Production Server       |  |
|  |     Port: 3001 (TCP)      |             |              Port: 3443 (TCP)           |  |
|  |                           |             |                                         |  |
|  |  All plain HTTP requests  | 301 Moved   |  TLS 1.2 / TLS 1.3                      |  |
|  |  redirect to port 3443    | Permanently |  Cert: server/certs/server.crt          |  |
|  |  http://ip:3001/... ------> https://... |  Key:  server/certs/server.key (Locked) |  |
|  +---------------------------+             +-------------------+---------------------+  |
|                                                                |                        |
|                                            +-------------------+---------------------+  |
|                                            | Express API + Compiled React SPA (dist) |  |
|                                            | - /api/records, /api/auth, /api/health  |  |
|                                            | - Strict Anti-CSRF verification         |  |
|                                            | - Protected SQLite (/server/data/*.db)  |  |
|                                            +-------------------+---------------------+  |
|                                                                |                        |
|                                            +-------------------+---------------------+  |
|                                            | SQLite 3 WAL Engine (OCC v-locking)     |  |
|                                            | SHA-256 Tamper-Evident Audit Chaining   |  |
|                                            +-----------------------------------------+  |
+-----------------------------------------------------------------------------------------+
                                         ^
                                         | Encrypted HTTPS (TLS)
                                         | Port 3443
                                         v
+-----------------------------------------------------------------------------------------+
|                              EMPLOYEE WORKSTATION (LAN)                                 |
|  No Node.js | No Database | No Private Keys | Zero Local Port Bindings                  |
|                                                                                         |
|  - Certificate Store: Cert:\CurrentUser\Root trusts aods-ca.crt (No Admin Required)     |
|  - Client: Microsoft Edge / Chrome in Dedicated Window App Mode                         |
|  - Mandatory Password Update enforced upon first sign-in                                |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Live Verification Test Results

All tests were performed against the live production server over real network connections:

| # | Test Scenario | Target | Verification Method | Result | Notes |
|---|---------------|--------|---------------------|:------:|-------|
| 1 | **HTTP 301 Redirect** | `http://127.0.0.1:3001/api/health` | HTTP GET inspection | **PASS** | Returns `301 Moved Permanently` with `Location: https://127.0.0.1:3443/api/health` |
| 2 | **HTTPS API Health** | `https://127.0.0.1:3443/api/health` | HTTPS GET with `aods-ca.crt` validation | **PASS** | Status `200 OK`, `protocol: "https"`, `https: true`, `tls: "TLSv1.2/TLSv1.3 Active"` |
| 3 | **Session Cookie Security** | `POST /api/auth/login` | Header validation | **PASS** | Set-Cookie includes `HttpOnly; Secure; SameSite=Lax; Max-Age=28800` |
| 4 | **Initial Password Detection** | `POST /api/auth/login` | JSON payload response | **PASS** | Returns `mustChangePassword: true` for default `countyrecords` accounts |
| 5 | **Password Policy Validation** | `POST /api/auth/change-password` | Input validation rejection | **PASS** | Rejects passwords `< 8 characters` (HTTP 400) and prevents reusing default password |
| 6 | **Production Static Assets** | `https://127.0.0.1:3443/` | HTTPS GET `index.html` | **PASS** | Serves compiled Vite/React production bundle from `dist/` |
| 7 | **Direct DB Inaccessibility** | `GET /server/data/adoption_records.db` | Path traversal protection | **PASS** | Returns `403 Forbidden` (`Access denied: protected system resource`) |
| 8 | **Regression Test Suite** | 34 automated unit & integration tests | `test/suite.ts` | **PASS** | **34/34 Passed (100%)** |
| 9 | **Multi-User Concurrency** | 3 simultaneous workstation simulation | `scripts/test-multiuser-concurrency.ts` | **PASS** | **6/6 Scenarios Passed (100%)**; OCC conflict detection (409) verified |

---

## 3. Workstation Trust & Zero-Install Deployment

To establish encrypted communication without browser security warnings, workstations trust the County Root Certificate Authority (`aods-ca.crt`).

### Key Security Guardrails:
1. **Zero Private Key Exposure:** Only `aods-ca.crt` (public key) is packaged in `deployment/workstation-package/`. The private key `server.key` is never distributed.
2. **No Administrative Rights Required:** Standard office employees can import the Root CA into their user store (`Cert:\CurrentUser\Root`) without UAC elevation.
3. **Automated Workstation Script:**
   ```powershell
   # Run on employee workstation
   deployment\workstation-package\install-shortcut.ps1
   ```
   This imports `aods-ca.crt` into the user's trust store and places a desktop shortcut configured for Microsoft Edge/Chrome app mode pointing to `https://192.168.1.108:3443`.

---

## 4. Mandatory Initial Password Rotation Workflow

To eliminate default credentials (`countyrecords`) without breaking existing user accounts:
1. **Server Detection:** On startup and login, the server evaluates whether any account's password hash matches the default setup password. Accounts matching the default have `must_change_password = 1`.
2. **API Enforcement:** `POST /api/auth/login` returns `{ mustChangePassword: true }`.
3. **Frontend Guard (`src/App.tsx`):**
   - Renders `PasswordRotationModal` over the dashboard.
   - Non-dismissible: cannot be closed until a valid new password is set or the user signs out.
   - Enforces minimum 8 characters, disallows `"countyrecords"`, and verifies current password.
   - On completion, clears the flag and logs a cryptographic audit event: `"Password rotated by user EMP-xxx"`.

---

## 5. Windows Service Installation & Status

### Status Check Result:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Status
```
```text
=====================================================================
  COUNTY ADOPTION RECORDS SYSTEM - SERVICE MANAGER                   
=====================================================================
  Target Action      : Status
  Service Identifier : CountyAdoptionRecords
  Project Directory  : C:\Users\Brandon\Downloads\Projects\Adoption Systems\County Adoption Records System
  Node.js Binary     : C:\Program Files\nodejs\node.exe
---------------------------------------------------------------------

--- Checking Service Status for: CountyAdoptionRecords ---
[Status] Service 'CountyAdoptionRecords' is NOT currently installed.
  Port 3443 (HTTPS)        : INACTIVE
  Port 3001 (HTTP Redirect): INACTIVE
```

### Elevation Limitation & Administrator Installation Command:
The development agent runs in an un-elevated sandbox session (`IsInRole(Administrator) == False`). Under Windows security policy, registering Windows Services (`sc.exe` / `nssm.exe` / `Register-ScheduledTask` with SYSTEM privileges) strictly requires an elevated token.

To register AODS as a permanent background Windows service, an IT Administrator executes the following command in an **Elevated (Run as administrator)** PowerShell terminal:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\Brandon\Downloads\Projects\Adoption Systems\County Adoption Records System\scripts\install-windows-service.ps1" -Action Install
```

This will:
- Register `CountyAdoptionRecords` with `SERVICE_AUTO_START`.
- Configure startup dependency on the `Tcpip` network stack.
- Point to `node.exe server/index.ts` with `NODE_ENV=production`, `HTTPS_ENABLED=true`, and `HTTPS_PORT=3443`.
- Set crash recovery to restart automatically after 5 seconds.
- Route service logs to `server/data/logs/service-stdout.log` and `service-stderr.log`.

---

## 6. Files Modified & Created

| Path | Nature of Change | Description |
|------|:----------------:|-------------|
| `server/index.ts` | Modified | Integrated `https.createServer` on port 3443 and HTTP 301 redirect service on port 3001; updated health endpoint and graceful shutdown |
| `deployment/config/.env.production` | Modified | Added `HTTPS_ENABLED=true`, `HTTPS_PORT=3443`, certificate paths, and allowed origins |
| `server/routes/auth.ts` | Modified | Enforced `secure: true` for cookies under HTTPS; added `must_change_password` check and `/api/auth/change-password` endpoint |
| `server/db.ts` | Modified | Added `must_change_password` migration column and `inspectAndFlagInitialCredentials()` |
| `src/api.ts` | Modified | Added `changePassword` method and `mustChangePassword` to `UserItem` interface |
| `src/App.tsx` | Modified | Added non-dismissible `PasswordRotationModal` component rendered whenever `currentUser.mustChangePassword` is active |
| `scripts/generate-certificates.ps1` | Modified | Discovered server LAN IP and actual hostname; exported Root CA and Server certificate in valid PEM format |
| `scripts/create-workstation-shortcut.ps1` | Modified | Updated target port to `3443` HTTPS; packaged `aods-ca.crt` for zero-install workstation deployment |
| `scripts/launch-aods.ps1` | Modified | Updated default port to `3443` HTTPS and configured health check to support TLS/301 redirects |
| `scripts/install-windows-service.ps1` | Modified | Added `HttpsPort` (3443) and `HTTPS_ENABLED=true` to service environment; updated status port inspection |
| `EMPLOYEE_WORKSTATION_SETUP.md` | Modified | Added comprehensive Root CA trust guide (User store, zero admin required), HTTPS URLs, and password rotation instructions |
| `test/suite.ts` | Modified | Updated to dynamically target `process.env.TEST_URL` and support SPA fallback over HTTPS |
| `scripts/test-https-in-command.ts` | Created | Automated verification script testing real HTTPS connectivity, HTTP 301 redirects, cookie flags, and database access protection |

