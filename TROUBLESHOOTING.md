# County Adoption Records System (AODS)
## Diagnostics & Troubleshooting Guide

This guide provides troubleshooting solutions for common operational issues encountered during installation, LAN access, and daily office usage.

---

## 1. Quick Diagnostic Run

Whenever an issue arises, run the automated health check first:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\check-system.ps1
```
This script tests all 10 core subsystems and flags `[WARN]` or `[FAIL]` with actionable diagnostic messages.

---

## 2. Common Scenarios & Resolutions

### Scenario A: Employee Workstations Cannot Connect to Server
**Symptom:** Workstation browser displays *"Site can't be reached"* or *"Connection timed out"* when accessing `http://<SERVER-IP>:3001`.

**Possible Causes & Fixes:**
1. **Windows Firewall is blocking port 3001:**
   - On the server, run PowerShell as Administrator:
     ```powershell
     powershell.exe -ExecutionPolicy Bypass -File .\scripts\configure-firewall.ps1
     ```
2. **Server IP address has changed:**
   - If the server does not have a static IP or DHCP reservation, its IP may have changed after a router reboot.
   - Run `Get-NetIPAddress -AddressFamily IPv4` on the server to find its current address.
   - Configure a static IP in the router or Windows Network Adapter settings.
3. **Workstation is connected to Guest / Public Wi-Fi:**
   - Workstations must be on the private office LAN subnet (e.g. `192.168.1.x`), not an isolated visitor Wi-Fi network.
4. **Server is stopped:**
   - Run `.\scripts\launch-aods.ps1` on the server to verify the backend is running.

---

### Scenario B: Port 3001 Conflict / Port Already in Use
**Symptom:** Server reports `EADDRINUSE: address already in use 0.0.0.0:3001`.

**Fix:**
A previous instance of the server or another application is holding the port.
1. Run the safe shutdown script:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-aods.ps1
   ```
2. If another application is using port 3001, identify the owning process:
   ```powershell
   Get-NetTCPConnection -LocalPort 3001 -State Listen
   ```
3. Change the port in `deployment\config\.env.production` if needed:
   ```ini
   SERVER_PORT=3002
   ```

---

### Scenario C: Employee Account Locked Out (Rate Limit Lockout)
**Symptom:** Officer attempts to sign in and receives *"Too many failed login attempts. Please wait 15 minutes before retrying"* (HTTP 429).

**Cause:**
More than 5 invalid password attempts were submitted within 15 minutes for that Employee ID or from that workstation IP address.

**Fix:**
1. **Wait:** The lockout expires automatically after 15 minutes.
2. **Immediate Administrator Reset:**
   An administrator can reset the counter immediately by executing the following command on the server:
   ```powershell
   node -e "
     const { DatabaseSync } = require('node:sqlite');
     const db = new DatabaseSync('server/data/adoption_records.db');
     db.prepare('DELETE FROM login_attempts WHERE employee_id = ?').run('EMP-014');
     console.log('Login attempts reset for EMP-014');
   "
   ```

---

### Scenario D: White Screen / "Cannot GET /"
**Symptom:** Browser opens to `http://localhost:3001/` but shows a blank white page or *"Not Found"*.

**Cause:**
The compiled React production bundle in `dist/` is missing or out of date.

**Fix:**
Rebuild the production frontend:
```powershell
cd C:\CountyAdoptionRecords
npm run build
```
Then refresh the browser window (`Ctrl + F5`).

---

### Scenario E: Concurrency Conflict ("Record Modified by Another User")
**Symptom:** When saving an adoption record, a popup warns: *"Concurrency Conflict: Record was modified by another officer. The record will refresh with latest data."*

**Cause:**
Another staff member edited and saved changes to that same adoption entry while the current officer had the form open. The system detected an outdated version token (`v1` vs `v2`) and prevented silent data overwrite.

**Resolution:**
1. Click **OK** on the alert.
2. The form automatically refreshes with the latest saved details.
3. Review the current details, apply any additional notes, and click **Save** again.

---

### Scenario F: Service Does Not Start on Windows Boot
**Symptom:** After server restarts, AODS is not running.

**Fix:**
1. Check the Windows Service status:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Status
   ```
2. Check the service logs for error details:
   ```powershell
   Get-Content "server\data\logs\service-stderr.log" -Tail 20
   ```
3. Reinstall the service using elevated Administrator privileges:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Uninstall
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Install
   ```

---

## 3. Log File Locations

| Log File | Purpose | Location |
| :--- | :--- | :--- |
| **Application Server Log** | Startup, requests, audits, errors, shutdowns | `server\data\logs\server.log` |
| **Service Standard Output** | Windows Service console output | `server\data\logs\service-stdout.log` |
| **Service Standard Error** | Service crash and unhandled exceptions | `server\data\logs\service-stderr.log` |
| **Database File** | Primary SQLite records database | `server\data\adoption_records.db` |
| **Database Backups** | Daily snapshots with companion SHA-256 | `server\data\backups\*.db` |

### Viewing Real-Time Logs in PowerShell
```powershell
Get-Content "server\data\logs\server.log" -Wait -Tail 30
```

