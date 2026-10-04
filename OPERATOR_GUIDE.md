# OPAC Library System: Administrator & Operator Guide

Welcome to the newly modernized OPAC Library System. This guide explains how the system is deployed, managed, and maintained in a production environment.

## 1. System Architecture

The application uses a secure, decoupled three-tier architecture:
1. **Database Service (PostgreSQL)**: Runs silently in the background as a Windows Service. It only listens on `localhost` and cannot be accessed directly from the network.
2. **Backend Service (Node.js API)**: Runs silently in the background as a Windows Service. It connects to PostgreSQL and exposes a secure HTTP API on a configured port (e.g., 47821) for both OPAC clients and Admin clients.
3. **Admin Client (Electron)**: A desktop "thin client". When you open `OpacLibrary.exe`, it connects over HTTP to the Backend Service. Closing this application does *not* stop the backend or the database.

## 2. Installation & Setup

1. Run the **Admin Installer** (`OpacLibrary-Admin-Setup.exe`).
2. The installer will place the binaries in `C:\Program Files\OpacLibrary`.
3. To register the background services, open an Administrator command prompt or PowerShell window in the installation directory and run the registration scripts (e.g. `node scripts/register-service.js`).
4. Once registered, the Backend and Database services will start automatically every time the server PC is turned on.

## 3. Using the Admin App

- Double-click the **OpacLibrary** shortcut on your desktop.
- You will be prompted to log in.
- Any changes made in the Admin App (e.g., adding books, managing users) are sent securely to the Backend API.

## 4. Starting and Stopping Services Manually

If you need to stop the backend for maintenance, do not just close the Admin app (as this no longer stops the backend). Instead:
1. Open the Windows **Services** app (`services.msc`).
2. Locate **OPAC Library Backend** and **OPAC Library Postgres**.
3. Right-click and choose **Stop** or **Restart**.

## 5. Backups and Recovery

### Taking a Backup
Backups can be generated directly from the Admin App's **Settings > Backup** menu. 
These backups are securely stored in the system directory (e.g., `C:\ProgramData\OpacLibrarySystem\Backups`).

### Manual Restoration
If the Admin UI is unavailable, you can manually restore a backup using the embedded PostgreSQL tools:
1. Stop the Backend service.
2. Ensure the PostgreSQL service is running.
3. Use `pg_restore` (located in the extracted `embedded-postgres` binaries folder) to restore your `.sql` or `.dump` file.
4. Restart the Backend service.

## 6. Upgrading the System

When a new version is released:
1. Create a full backup from the Admin UI.
2. Run the new Admin Installer over the existing installation. The installer will safely replace the binaries without touching `C:\ProgramData\OpacLibrarySystem`.
3. The Backend service will restart automatically and apply any necessary database migrations.

## 7. Security Best Practices

- **Network Limits**: Use Windows Firewall to restrict inbound traffic to the API Port (e.g., 47821) to only allowed subnets (e.g., your school/library LAN).
- **Public Internet**: If exposing to the public internet, always place the Backend API behind a reverse proxy (like NGINX or IIS) with an SSL/TLS certificate.
- **Passwords**: Never share the developer PIN. Enforce strong passwords for all admin accounts.

## 8. Logs and Troubleshooting

If the API fails to start or the Admin UI says "Unable to connect":
1. Check the backend logs located in `C:\ProgramData\OpacLibrarySystem\Logs`.
2. Verify that PostgreSQL is running via `services.msc`.
3. Verify that the API port is not being used by another application.
