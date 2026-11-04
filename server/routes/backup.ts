import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.ts";
import { createBackup, listBackups, restoreBackup } from "../backup.ts";
import { recordActivity } from "../audit.ts";

export const backupRouter = Router();

// Strict RBAC: All backup and restore operations require Administrator role
backupRouter.use(requireAuth);
backupRouter.use(requireRole(["Administrator"]));

// GET /api/backup - List existing backups
backupRouter.get("/", (req: Request, res: Response) => {
  try {
    const backups = listBackups();
    res.json({ success: true, count: backups.length, backups });
  } catch (err: any) {
    console.error("[Backup] List error:", err);
    res.status(500).json({ success: false, error: "Failed to list database backups." });
  }
});

// POST /api/backup - Create a new verified database backup
backupRouter.post("/", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const backup = createBackup();

    recordActivity({
      user_name: authReq.user?.name || "Administrator",
      action: "Database Backup",
      record_no: backup.filename,
      description: `Created verified backup ${backup.filename} (${backup.sizeBytes} bytes)`
    });

    res.status(201).json({ success: true, backup });
  } catch (err: any) {
    console.error("[Backup] Creation error:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to create database backup." });
  }
});

// POST /api/backup/restore - Restore from a verified backup
backupRouter.post("/restore", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const filename = req.body.filename?.trim();

    if (!filename) {
      return res.status(400).json({ success: false, error: "Backup filename is required for restoration." });
    }

    const result = restoreBackup(filename);

    recordActivity({
      user_name: authReq.user?.name || "Administrator",
      action: "Database Restore",
      record_no: filename,
      description: `Restored database from ${filename}; safety snapshot saved as ${result.preRestoreSnapshot}`
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Backup] Restore error:", err);
    res.status(400).json({ success: false, error: err.message || "Failed to restore database from backup." });
  }
});

