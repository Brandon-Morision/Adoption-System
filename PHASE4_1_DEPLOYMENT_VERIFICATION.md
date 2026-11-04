# County Adoption Records System (AODS)
## Phase 4.1: Deployment Verification & Production Readiness Report

**Audit Date:** 2026-10-31  
**System Version:** AODS v3.1.0 (Enterprise Multi-User LAN Edition)  
**Target Environment:** Central Windows Server & Client Workstations on County Office LAN  
**Database Engine:** SQLite 3 (WAL Mode, Parameterized Prepared Statements, Tamper-Evident Hash-Chaining)  
**Evaluator:** Automated Deployment & Security Verification Harness  

---

## Executive Summary

This report documents the deployment-readiness verification of the County Adoption Records System (AODS) conducted in accordance with Phase 4.1 instructions. 

All verification was performed against the live application and its deployment artifacts without destructive modifications to live production data. The system demonstrates robust multi-user concurrency handling, optimistic locking, tamper-evident audit chaining, isolated workstation packages, and automated non-destructive backup restoration.

| Subsystem / Requirement | Status | Summary of Verification |
| :--- | :---: | :--- |
| **1. Windows Service Installation** | `WARNING` | Script logic validated, crash recovery configured, duplicate prevention tested; actual SCM registration requires an elevated Administrator console. |
| **2. Production Environment Config** | `PASS` | Configuration loaded reliably, secrets excluded from git, fast-fail on missing build, sensitive files blocked via HTTP 403. |
| **3. HTTPS / TLS Implementation** | `WARNING` | Node.js dual-stack HTTPS/HTTP architecture implemented; full activation requires running `scripts/generate-certificates.ps1` and setting `HTTPS_ENABLED=true`. |
| **4. LAN Deployment & Workstation Package** | `PASS` | Workstation package contains zero server secrets or DB files; zero-install client footprint; dynamic IP binding verified. |
| **5. Backup & Recovery Pipeline** | `PASS` | Non-destructive sandbox restoration test passed 100%; SHA-256 companion checksums and unbroken audit chain verified. |
| **6. Multi-User Concurrency & Integrity** | `PASS` | 3 simultaneous sessions, 25 concurrent reads, atomic ID generation, OCC 409 conflict catching, and raw DB blocking verified. |

> [!IMPORTANT]
> **Production-Readiness Clarification:** Passing the automated test suite (34/34 tests) confirms software code quality. However, full operational readiness requires physical completion of two operator actions: (1) executing the service installer from an elevated Administrator prompt, and (2) configuring a static IP or DHCP reservation on the county office router.

---

## 1. Windows Service Installation

### Verification Status: `WARNING`

### What Was Actually Tested:
1. **Service Registration State:** Inspected Windows Service Control Manager (`sc.exe query CountyAdoptionRecords`) and Windows Task Scheduler (`Get-ScheduledTask -TaskName CountyAdoptionRecords`). Windows confirmed that neither service is currently registered on the host machine.
2. **Installation Script Elevation Check:** Executed `scripts/install-windows-service.ps1 -Action Install` in the active terminal session. The script successfully detected an unelevated session and rejected unauthorized registration:
   ```text
   [Access Denied] The 'Install' action requires elevated Administrator privileges. 
   Please right-click PowerShell and select 'Run as administrator'.
   ```
3. **Status Check Command:** Executed `scripts/install-windows-service.ps1 -Action Status` without elevation. Verified that status inspection works cleanly without requiring administrator privileges:
   ```text
   --- Checking Service Status for: CountyAdoptionRecords ---
   [Status] Service 'CountyAdoptionRecords' is NOT currently installed.
     Port 3001 : INACTIVE (No listener detected)
   ```
4. **Duplicate Process Prevention:** Started the backend on port 3001, then executed `scripts/launch-aods.ps1 -NoBrowser`. Verified that the launcher detected the existing port listener and prevented spawning duplicate processes:
   ```text
   [OK] Server is already active and listening on port 3001.
   Preventing duplicate process launch.
   ```
5. **Safe Shutdown Verification:** Executed `scripts/stop-aods.ps1`. Verified that it reads the runtime PID (`server/data/aods.pid`), signals graceful shutdown, verifies port release, and preserves all database and backup files.

### Corrective Actions Taken:
- Modified `scripts/install-windows-service.ps1` to permit read-only `-Action Status` checks without administrator elevation.
- Refined `scripts/stop-aods.ps1` to filter port listeners with `Where-Object { $_.OwningProcess -gt 0 }`, eliminating `PID: 0 0` errors during port teardown.

### Remaining Manual Steps:
- Open PowerShell with **"Run as administrator"** on the physical server host.
- Execute:
  ```powershell
  powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Install
  ```
- Reboot the server machine to physically verify unattended startup before employee login.

---

## 2. Production Environment Configuration

### Verification Status: `PASS`

### What Was Actually Tested:
1. **Environment File Hierarchy:** Verified that `server/index.ts` loads environment variables in priority order:
   - `deployment/config/.env.production`
   - `.env.production`
   - `.env`
2. **Secrets Protection:** Inspected `.gitignore` (Line 5: `.env*`). Confirmed that no sensitive employee passwords, database connection strings, or private keys are tracked.
3. **Missing Build Fast-Fail:** Tested server startup with and without `dist/index.html`. Confirmed that if `NODE_ENV=production` is set but `dist/` is absent, the server halts with an explicit error rather than silently failing:
   ```text
   [FATAL] Production build missing at dist/. Please run 'npm run build' before starting in production mode.
   ```
4. **Static File Serving:** Tested HTTP GET requests to root `/`. Verified that Express serves compiled production assets (`dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`) with HTTP 200 OK.
5. **Protected Resource Shielding:** Tested direct web requests to internal files (`GET /server/data/adoption_records.db`, `GET /deployment/config/.env.production`, `GET /scripts/launch-aods.ps1`). Verified that the protective middleware intercepts and rejects them with **HTTP 403 Forbidden**:
   ```json
   { "success": false, "error": "Access denied: protected system resource." }
   ```

---

## 3. HTTPS / TLS Verification & Implementation

### Verification Status: `WARNING`

### What Was Actually Tested:
1. **Initial Code Inspection:** Inspected `server/index.ts`. Confirmed that previously the server only called `app.listen(PORT, HOST)` over unencrypted HTTP; no TLS certificate-loading or `https.createServer` existed in runtime code.
2. **Certificate Generation Capability:** Tested `scripts/generate-certificates.ps1`. Discovered that it previously exported `server.crt` and `server.pfx`, but omitted the private key file and assumed elevation to `Cert:\LocalMachine\My`.
3. **Corrective Implementation:**
   - Updated `scripts/generate-certificates.ps1` to automatically target `Cert:\CurrentUser\My` when unelevated and export DER binary (`server.crt`), Base64 PEM (`server.pem`), and PKCS#12 bundle (`server.pfx`).
   - Updated `server/index.ts` to implement dual-stack HTTPS/HTTP:
     - When `HTTPS_ENABLED=true` and `server/certs/server.pfx` (or `.crt` + `.key`) exists, boots `https.createServer` on port `8443`.
     - Automatically starts an HTTP-to-HTTPS redirect listener on port `3001` that forwards all plain HTTP traffic to `https://<host>:8443`.
     - Sets session cookies with `secure: true` under HTTPS.
     - Falls back gracefully to standard HTTP on port `3001` if HTTPS is disabled, maintaining 100% backward compatibility.
4. **TLS Context Validation:** Tested loading `server/certs/server.pfx` into Node.js `tls.createSecureContext`. Verified that Node.js initializes the secure TLS context cleanly without external dependencies.

### Remaining Manual Steps:
- Execute `.\scripts\generate-certificates.ps1` on the server machine to generate the production domain certificate for `CN=adoption.county.local`.
- In `deployment\config\.env.production`, set `HTTPS_ENABLED=true`.
- On client workstations, import `server\certs\server.crt` into **"Trusted Root Certification Authorities"** to prevent browser self-signed security warnings.

---

## 4. LAN Deployment & Workstation Package

### Verification Status: `PASS`

### What Was Actually Tested:
1. **Package Safety:** Inspected the contents of `deployment/workstation-package`. Confirmed that the directory contains strictly two files:
   - `aods.ico` (Application icon)
   - `install-shortcut.ps1` (Desktop shortcut generator)
   - **Zero** database files (`.db`), zero server source files (`.ts`), and zero environment configurations are packaged.
2. **Configurable Server Address:** Verified that `create-workstation-shortcut.ps1` accepts `-ServerAddress <URL>` and discovers local LAN IPv4 dynamically (`http://192.168.1.108:3001`).
3. **Zero-Install Client Verification:** Confirmed that `install-shortcut.ps1` runs using Windows built-in PowerShell and Microsoft Edge/Chrome app mode (`--app="http://..."`). No Node.js runtime, SQLite binaries, or development tools are required on client machines.
4. **Firewall Policy:** Inspected `scripts/configure-firewall.ps1`. Confirmed that inbound rules for ports 3001 & 8443 are strictly restricted to `Profile: Domain, Private`. Access over Public / Guest Wi-Fi networks is automatically blocked.

### Documentation: DHCP Reservation for the Central Server
To ensure the server's LAN address (`192.168.1.108`) never changes:
1. Open the office router or DHCP server management console (e.g. `http://192.168.1.1`).
2. Navigate to **LAN Setup > DHCP Server > Address Reservation**.
3. Locate the server's Physical MAC Address (obtain via `Get-NetAdapter` in PowerShell).
4. Bind the MAC address to a fixed IP: `192.168.1.50` (or `192.168.1.108`).
5. Set lease time to **Permanent / Never Expire**.

---

## 5. Backup & Recovery Pipeline

### Verification Status: `PASS`

### What Was Actually Tested:
1. **Timestamping & Integrity Pre-Check:** Inspected `server/backup.ts`. Verified that `PRAGMA integrity_check` is executed on the live database before copying, and filenames are timestamped down to the millisecond (`adoption_records_backup_YYYY-MM-DDTHH-mm-ss-sssZ.db`).
2. **Cryptographic Companion Files:** Verified that each backup generates a companion `.sha256` checksum file that is validated prior to any restoration attempt.
3. **Non-Destructive Sandbox Restoration Test (`scripts/test-backup-restoration.ts`):**
   - Live database verified online: `81,920 bytes`, Checksum: `d55867e5...`.
   - Created verified backup snapshot: `adoption_records_backup_2026-10-31T10-21-53-923Z.db`.
   - Restored snapshot to an isolated sandbox file: `server/data/temp_restoration_test.db` (zero live database modification).
   - Executed `PRAGMA integrity_check` on restored sandbox: **`ok`**.
   - Verified data completeness: **12 records**, **4 users**, **40 audit entries**.
   - Verified cryptographic hash-chain integrity: **UNBROKEN across all 40 entries**.
   - Cleaned up sandbox database; verified live database was 100% untouched.

### Scheduled Off-Site & Secondary Storage Strategy:
To schedule automated off-site backups:
```powershell
# Copy daily snapshots to an external USB drive or network share
$SourceBackups = "C:\CountyAdoptionRecords\server\data\backups"
$TargetStorage = "D:\AODS_Offsite_Backups" # External drive or \\CountyNAS\Backups
robocopy $SourceBackups $TargetStorage *.db *.sha256 /MIR /R:2 /W:5
```
Schedule via Windows Task Scheduler to run daily at 23:00.

---

## 6. Multi-User Operation & Concurrency Verification

### Verification Status: `PASS`

### What Was Actually Tested:
Executed automated multi-workstation simulation (`scripts/test-multiuser-concurrency.ts`) against the running server:

1. **Session Isolation:**
   - Authenticated 3 concurrent staff accounts: `ADM-001` (Jane Mwangi), `EMP-014` (Peter Kamau), and `EMP-022` (Ruth Njeri).
   - Verified that all 3 tokens are distinct, and `GET /api/auth/me` isolates user identity and RBAC privileges without session cross-talk.
2. **High-Concurrency Record Reads:**
   - Dispatched **25 simultaneous record search queries** in parallel using `Promise.all`.
   - Result: **25/25 requests returned HTTP 200 OK** in under 120ms with zero database locking or timeout errors.
3. **Simultaneous Record Creations:**
   - 3 officers simultaneously submitted distinct adoption records in parallel.
   - Result: All 3 succeeded (HTTP 201 Created) with sequential, non-colliding entry numbers (`#001264`, `#001265`, `#001266`).
4. **Optimistic Concurrency Control (OCC):**
   - Two officers opened Record `#001264` simultaneously with Version 1.
   - Officer 2 submitted an update first -> **Succeeded (HTTP 200, Version advanced to 2)**.
   - Officer 3 submitted an update with stale Version 1 -> **Rejected with HTTP 409 Conflict**:
     ```text
     Concurrency Conflict: Record was modified by another officer (expected v1, but database has v2).
     ```
   - Officer 3 refreshed to Version 2 and resubmitted -> **Succeeded (HTTP 200, Version advanced to 3)**.
5. **Network Database File Shielding:**
   - Attempted direct HTTP request to download raw SQLite file: `GET /server/data/adoption_records.db`.
   - Result: **Rejected with HTTP 403 Forbidden**.
6. **Audit Trail Immutability & Chaining:**
   - Invoked `/api/activity/verify` after the concurrent operations.
   - Result: **Cryptographic audit chain verified UNBROKEN across 87 chained events**.

---

## 7. Operational Test Matrix

| Test Suite / Script | Command | Result | Evidence / Details |
| :--- | :--- | :---: | :--- |
| **Automated Regression Suite** | `node test/suite.ts` | `PASS` | 34/34 tests passed (Health, Auth, RBAC, Validation, CRUD, OCC, Audit, Backups, Headers). |
| **System Diagnostics** | `check-system.ps1` | `PASS` | 9 PASS, 0 FAIL (Node, Dependencies, Build, Database PRAGMA, Port 3001, API, Frontend). |
| **Multi-User Concurrency** | `test-multiuser-concurrency.ts` | `PASS` | 6/6 scenarios passed (3 sessions, 25 reads, 3 writes, OCC 409 conflict, DB shielding). |
| **Backup Restoration** | `test-backup-restoration.ts` | `PASS` | 5/5 steps passed (Integrity ok, 12 records, 4 users, 40 audit entries, unbroken hash chain). |
| **Duplicate Instance Prevention** | `launch-aods.ps1 -NoBrowser` | `PASS` | Detected existing port 3001 listener; prevented spawning duplicate Node backend instances. |
| **Safe Server Shutdown** | `stop-aods.ps1` | `PASS` | Network listener closed, PID unlinked, database preserved untouched (81,920 bytes). |
| **Workstation Package Export** | `create-workstation-shortcut.ps1` | `PASS` | Exported `deployment/workstation-package` containing strictly `aods.ico` and `install-shortcut.ps1`. |

---

## 8. Remaining Manual & Administrative Prerequisites Before Final Go-Live

To achieve final production sign-off on the physical county network, the system administrator must execute the following physical steps:

1. **Windows Service Elevation (On-Host):** Launch PowerShell as Administrator and run:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Install
   ```
2. **Router DHCP Reservation:** Reserve static IP `192.168.1.108` (or `192.168.1.50`) for the server's network adapter in the office router.
3. **Server Power Settings:** In Windows Settings, set *"Put computer to sleep"* to **"Never"**.
4. **HTTPS Activation (Optional/Recommended):** Run `scripts\generate-certificates.ps1`, set `HTTPS_ENABLED=true` in `deployment\config\.env.production`, and deploy `server\certs\server.crt` to client workstations.
5. **Initial Production Password Rotation:** On first login, change the default administrator password (`countyrecords`) via the Users Management panel.

