# County Adoption Records System (AODS)
## Start & Stop Operations Guide

This guide details the procedures for starting, stopping, restarting, and verifying the County Adoption Records System during daily operations, server maintenance, and emergency procedures.

---

## 1. Starting the System

### Method 1: Automatic Startup on Windows Boot (Recommended for Production)
When the AODS Windows Service is installed, no manual intervention is needed.
1. Power on the central server machine.
2. Windows boots and initializes the network.
3. The `CountyAdoptionRecords` background service starts automatically within 10 seconds of boot.
4. Employees can immediately connect to `http://<SERVER-IP>:3001` from their workstations.

---

### Method 2: One-Click Desktop Shortcut (Administrator Launch)
On the server desktop:
1. Double-click the **"County Adoption Records System"** shortcut.
2. A status window will verify prerequisites, ensure no duplicate instances are running, start the server if stopped, and automatically open the application in the default web browser.

Alternatively, execute via PowerShell:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\launch-aods.ps1
```

---

### Method 3: Starting via Service Management Command
From an elevated Administrator PowerShell prompt:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Start
```

---

### Method 4: Manual Terminal Start (Development or Debugging)
To run the server in the foreground with live console logs:
```powershell
npm run server
```

---

## 2. Stopping the System Safely

### Method 1: The Safe Shutdown Script (Recommended)
To stop the server while ensuring all database transactions finalize cleanly without corruption:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-aods.ps1
```

#### What the Safe Shutdown Script Does:
1. Signals the Windows Service or background daemon to stop accepting new requests.
2. Closes the HTTP server listening on port 3001.
3. Allows in-flight SQLite WAL write transactions to flush to disk.
4. Removes the runtime PID tracking file (`server\data\aods.pid`).
5. Confirms that all database files (`adoption_records.db`) and historical backup snapshots remain 100% intact.

---

### Method 2: Stopping via Service Management Command
From an Administrator PowerShell prompt:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Stop
```

---

## 3. Restarting the System

During software updates, configuration changes, or system maintenance:

```powershell
# Graceful restart
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Restart
```

---

## 4. Checking System Health & Running Status

To check if the server is active, verify database integrity, and inspect endpoint response:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\check-system.ps1
```

### Quick Command Line Checks
```powershell
# Check if port 3001 is listening
Get-NetTCPConnection -LocalPort 3001 -State Listen

# Test API health response directly from PowerShell
(Invoke-RestMethod -Uri "http://localhost:3001/api/health").status
```

---

## 5. Server Maintenance & Reboot Procedure

When applying Windows Updates or performing server hardware maintenance:
1. **Notify Employees:** Inform office staff 10 minutes prior so they can complete pending record edits.
2. **Execute Safe Shutdown:**
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\stop-aods.ps1
   ```
3. **Trigger On-Demand Backup Snapshot (Optional but Recommended):**
   ```powershell
   # Make a quick copy of the current database before reboot
   Copy-Item "server\data\adoption_records.db" "server\data\backups\pre_reboot_backup.db"
   ```
4. **Reboot Windows Server.**
5. **Verify Post-Reboot:** Log into the server and run `.\scripts\check-system.ps1` to confirm all 10 checks return `[PASS]`.

