# County Adoption Records System (AODS)
## Employee Workstation Setup Guide & Security Trust Configuration

This guide describes how to configure employee workstation computers to access the central County Adoption Records System securely over the office LAN using HTTPS/TLS encryption.

---

## 1. Zero-Install Footprint Architecture

The County Adoption Records System uses a client-server architecture designed for zero client-side footprint:
- **No Node.js** is required on employee computers.
- **No SQLite or database engine** is installed on employee computers.
- **No background services or open ports** are run on employee workstations.
- **No server private keys** are ever distributed to employee workstations.
- All application processing, database transactions, cryptographic audit chaining, and backups occur strictly on the central server.
- Employees interact with the system through modern web browsers over an encrypted HTTPS connection.

---

## 2. Certificate Trust Setup (One-Time per Workstation)

To establish secure TLS encryption without browser certificate warnings, employee workstations trust the County Adoption Records Root Certificate Authority (`aods-ca.crt`).

> [!IMPORTANT]
> **Zero Private Key Exposure:** The server's private key (`server.key`) remains strictly confined to the central server and protected by NTFS permissions. Workstations receive ONLY the public root certificate (`aods-ca.crt`). Standard employees do not need Administrator elevation to trust this root certificate in their current user certificate store.

### Automated Certificate Trust & Shortcut (Recommended)

1. On the central server, generate the workstation deployment package:
   ```powershell
   powershell.exe -ExecutionPolicy Bypass -File .\scripts\create-workstation-shortcut.ps1 -ExportPackage
   ```
2. Distribute the folder `deployment\workstation-package\` to a shared office network drive or USB.
3. On the employee workstation, right-click `install-shortcut.ps1` and select **"Run with PowerShell"**.
4. The script automatically:
   - Imports `aods-ca.crt` into the workstation's `Cert:\CurrentUser\Root` store (no admin rights needed).
   - Generates the desktop shortcut pointing to `https://<SERVER-IP>:3443`.

---

### Manual Certificate Trust Procedure

If installing manually on Windows 10/11:

1. Obtain `aods-ca.crt` from IT administration.
2. Double-click `aods-ca.crt`.
3. In the Certificate dialog, click **"Install Certificate..."**.
4. Select **"Current User"** (does not require local administrative rights) and click **Next**.
5. Select **"Place all certificates in the following store"** and click **Browse...**.
6. Select **"Trusted Root Certification Authorities"** and click **OK**, then click **Next** and **Finish**.
7. When prompted with the Windows Security Warning asking if you wish to install this certificate, click **"Yes"**.
8. Close and re-open your browser. Secure lock icon will now appear without warnings.

Alternatively, via PowerShell:
```powershell
Import-Certificate -FilePath .\aods-ca.crt -CertStoreLocation Cert:\CurrentUser\Root
```

---

## 3. Workstation Access Methods

### Option A: Desktop Shortcut (Dedicated Window Mode)

Launches AODS in a distraction-free, dedicated application window using Microsoft Edge or Google Chrome app mode:
```powershell
powershell.exe -ExecutionPolicy Bypass -File .\scripts\create-workstation-shortcut.ps1 -ServerAddress "https://192.168.1.108:3443" -DedicatedWindow
```

### Option B: Direct Browser Navigation

Open any modern browser and navigate directly to:
```text
https://192.168.1.108:3443/
```
*(Any requests sent to plain HTTP `http://192.168.1.108:3001` are automatically redirected via HTTP 301 to the secure HTTPS interface).*

---

## 4. Mandatory Initial Password Rotation

For county compliance and data privacy regulations:
1. **Initial Accounts:** Accounts seeded with initial or temporary passwords (such as `countyrecords`) are automatically flagged by the central server.
2. **Forced Password Rotation:** Upon initial sign-in, the system displays a mandatory password update dialog that cannot be bypassed.
3. **Password Policy:**
   - **Minimum 12 characters:** Enforced for confidential child welfare and adoption record security. Long passphrases (e.g. 4+ random words) are strongly encouraged.
   - **Default Passwords Forbidden:** Reusing the system setup password (`countyrecords`) is strictly rejected.
   - **Current Password Verification:** The employee must enter their current password to verify identity before setting a new password.
   - **Cryptographic Audit Log:** The password change is recorded in the immutable SHA-256 activity audit chain without ever logging or exposing passwords.

---

## 5. Workstation Browser Compatibility

AODS supports all modern evergreen web browsers:
- **Microsoft Edge:** Version 90+ (Pre-installed on Windows 10 and 11).
- **Google Chrome:** Version 90+.
- **Mozilla Firefox:** Version 90+.
- **Apple Safari:** Version 15+ (on macOS or iOS devices connected to office Wi-Fi).

---

## 6. Daily Workstation Operations

1. **Launching the System:** Double-click the **"County Adoption Records System"** icon on your desktop.
2. **Signing In:** Enter your authorized Employee ID (e.g., `EMP-014` or `ADM-001`) and personal password.
3. **Session Expiration:** Sessions remain active for 8 hours (standard county workday). Inactive sessions will automatically prompt the user to sign in again.
4. **Optimistic Concurrency Control:** If two employees edit the same adoption record concurrently and another user saves first, the system alerts you:
   > *"Concurrency Conflict: Record was modified by another officer. The record will refresh with the latest data."*
   This ensures no data is overwritten inadvertently.
5. **Signing Out:** Click **"Sign Out"** in the navigation sidebar or user profile menu when leaving your workstation.

---

## 7. Workstation Acceptance Test Checklist (Second Physical Computer)

Use this checklist when deploying and validating AODS on a second computer connected to the county office LAN.

> [!CAUTION]
> **Data Privacy Notice:** Never enter real child welfare, adoption, or citizen information during testing. Always use synthetic sample data.

| Check | Verification Step | Expected Result | Pass / Fail |
|:-----:|-------------------|-----------------|:-----------:|
| 1 | **Copy Package** | Copy `deployment\workstation-package\` to the second computer via LAN share or USB. | Folder copied with `install-shortcut.ps1`, `aods-ca.crt`, `aods.ico`. | [ ] |
| 2 | **Install Trust & Shortcut** | Right-click `install-shortcut.ps1` and select **"Run with PowerShell"**. | Script imports `aods-ca.crt` to `Cert:\CurrentUser\Root` (no admin rights required) and places shortcut on Desktop. | [ ] |
| 3 | **Open HTTPS Application** | Double-click the desktop shortcut or open browser to `https://192.168.1.108:3443/`. | Browser displays the AODS login screen. Lock icon is closed and valid; **no SSL/TLS security warning** appears. | [ ] |
| 4 | **Test Plain HTTP Redirect** | In browser, enter `http://192.168.1.108:3001/`. | Browser automatically redirects via **HTTP 308** to `https://192.168.1.108:3443/`. | [ ] |
| 5 | **Sign In with Default Account** | Sign in with employee ID `EMP-014` and temporary password `countyrecords`. | Authentication succeeds; the **Mandatory Password Update** modal immediately appears, blocking access to records. | [ ] |
| 6 | **Enforce Password Policy** | Attempt to set a password `< 12 characters` or enter `countyrecords`. | System rejects the update with a clear error: *"New password must be at least 12 characters long."* | [ ] |
| 7 | **Complete Password Rotation** | Enter a secure 12+ character passphrase (e.g. `harbor-sunset-county-2026!`). | Password updates successfully; the modal dismisses and dashboard opens. | [ ] |
| 8 | **Create Synthetic Record** | Navigate to **"Add New Record"** and submit synthetic data (e.g., Child: *"Synthetic Test Subject A"*, Adopters: *"Foster Test Family B"*). | System saves record, assigns auto-generated entry number (e.g. `#001285`), and appends to SHA-256 audit log. | [ ] |
| 9 | **Retrieve & Search Record** | Use the global search bar (or Ctrl+K) to search for *"Synthetic Test Subject A"*. | Record appears in search results and opens cleanly in details view. | [ ] |
| 10 | **Sign Out & Invalidation** | Click **"Sign Out"** in top bar. After redirecting to login, press the browser **Back** button. | Access is denied; protected views do not load; session cookie `aods_session` is cleared. | [ ] |

