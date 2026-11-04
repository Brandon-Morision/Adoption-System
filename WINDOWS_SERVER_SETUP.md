# County Adoption Records System (AODS)
## Windows Server Setup & Administration Guide

This guide covers the initial deployment, service installation, firewall configuration, and automated startup of the County Adoption Records System on a dedicated Windows central server (Windows Server 2019/2022/2025 or Windows 10/11 Pro).

---

## 1. System Requirements

### Hardware Requirements
- **Processor:** 4 Cores, 2.0 GHz or higher (x64 architecture).
- **Memory (RAM):** 8 GB minimum (16 GB recommended for 20+ simultaneous workstation users).
- **Disk Storage:** 50 GB SSD or NVMe storage (sufficient for OS, Node.js, adoption records database, and daily encrypted backups).
- **Network Interface:** Gigabit Ethernet (1000BASE-T) connection to the county office LAN with a static IPv4 address or DHCP reservation.

### Software Prerequisites
- **Operating System:** Windows Server 2019, 2022, 2025, or Windows 10 / 11 Pro (64-bit).
- **Runtime:** Node.js v20.0.0 or newer (LTS recommended).
- **Package Manager:** `pnpm` (bundled via corepack/npm) or `npm`.
- **PowerShell:** Windows PowerShell 5.1 or PowerShell 7+.

---

## 2. Server Installation Procedure

### Step 1: Clone or Copy Application Files
Copy the application directory to a permanent path on the server:
```text
C:\CountyAdoptionRecords
```

### Step 2: Install Application Dependencies
Open PowerShell as Administrator, navigate to the project directory, and install dependencies:
```powershell
cd C:\CountyAdoptionRecords
pnpm install
```

### Step 3: Build the Production Frontend
Compile the React frontend into the `dist/` directory:
```powershell
npm run build
```
*Note: AODS serves the compiled static bundle directly from the Express server on port 3001, eliminating the need to run Vite development servers in production.*

### Step 4: Configure the Production Environment
Review and adjust `deployment\config\.env.production`:
```ini
NODE_ENV=production
SERVER_PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
SESSION_TTL_HOURS=8
MAX_FAILED_LOGIN_ATTEMPTS=5
RATE_LIMIT_WINDOW_MINUTES=15
```

---

## 3. Windows Background Service Configuration

To ensure AODS boots automatically when the server turns on and runs without any employee needing to log in:

### Installing the Service
Open PowerShell as **Administrator** and execute:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Install
```

### How the Service Operates
- **Auto-Start on Boot:** Configured to start with the `SYSTEM` account or dedicated service account as soon as Windows boots.
- **Dependency Handling:** Automatically waits for the TCP/IP network stack (`Tcpip`) before binding.
- **Crash Recovery:** If the application process terminates unexpectedly, Windows automatically restarts it after 5 seconds.
- **Working Directory:** Set explicitly to `C:\CountyAdoptionRecords`.
- **Logs:** Diagnostic output is automatically streamed to `server\data\logs\server.log`.

### Service Management Commands
```powershell
# Check service status and port listener
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Status

# Stop the service
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Stop

# Start the service
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Start

# Restart the service
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Restart

# Uninstall and remove the service
powershell.exe -ExecutionPolicy Bypass -File .\scripts\install-windows-service.ps1 -Action Uninstall
```

---

## 4. Windows Firewall & Network Access

Workstation computers on the office LAN require inbound access on port 3001 (or 8443 for HTTPS).

Execute the automated firewall configuration script as Administrator:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\configure-firewall.ps1
```

### Security Enforcement
- **Domain & Private Networks Only:** The firewall rule restricts access strictly to authorized office networks.
- **Public Networks Blocked:** Public or guest Wi-Fi networks cannot access port 3001.
- **Database Isolation:** SQLite and backend storage are not exposed over the network; only sanitized HTTP/HTTPS API endpoints are reachable.

---

## 5. Desktop Shortcut on Central Server

To allow server administrators to launch or view the system with a single click:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```
This generates a desktop shortcut named **"County Adoption Records System"** on the administrator desktop with the official county application icon (`deployment\icons\aods.ico`).

---

## 6. Verifying the Server Installation

Run the health diagnostics script to verify all 10 system components:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\check-system.ps1
```
Expected output:
```text
  [PASS] Node.js Runtime : Version v24.19.0 detected (Meets v20+ requirement)
  [PASS] Dependencies : node_modules present (17 root packages installed)
  [PASS] Production Build : Compiled assets present in dist/
  [PASS] Database File : adoption_records.db online (PRAGMA integrity_check: ok)
  [PASS] Windows Service : Service 'CountyAdoptionRecords' is INSTALLED and RUNNING
  [PASS] TCP Port 3001 : Active and listening on 0.0.0.0:3001
  [PASS] API Health (/api/health) : HTTP 200 OK - Version 3.1.0
  [PASS] Frontend Shell (/) : HTTP 200 OK - React application shell rendered successfully
  [PASS] Backup Storage : Available at server/data/backups
  [PASS] Audit & Server Logs : Active at server/data/logs/server.log
```

