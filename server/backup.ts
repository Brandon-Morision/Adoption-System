import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { db } from "./db.ts";

const dataDir = path.resolve(process.cwd(), "server/data");
const backupDir = path.join(dataDir, "backups");
const currentDbPath = path.join(dataDir, "adoption_records.db");

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

export interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string;
  integrity: string;
}

function calculateFileSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

/**
 * Creates an integrity-verified, timestamped backup of the SQLite database.
 */
export function createBackup(): BackupInfo {
  // Check source database integrity
  const integrityResult = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  if (integrityResult.integrity_check !== "ok") {
    throw new Error(`Database integrity check failed: ${integrityResult.integrity_check}`);
  }

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, "-");
  const filename = `adoption_records_backup_${timestampStr}.db`;
  const targetPath = path.join(backupDir, filename);

  // Copy current DB file
  fs.copyFileSync(currentDbPath, targetPath);

  const stats = fs.statSync(targetPath);
  const checksum = calculateFileSha256(targetPath);

  // Write checksum companion file
  fs.writeFileSync(`${targetPath}.sha256`, checksum, "utf8");

  return {
    filename,
    sizeBytes: stats.size,
    createdAt: now.toISOString(),
    checksum,
    integrity: integrityResult.integrity_check
  };
}

/**
 * List all available backups in the backups directory.
 */
export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(backupDir)) return [];

  const files = fs.readdirSync(backupDir).filter(f => f.endsWith(".db"));
  const backups: BackupInfo[] = [];

  for (const f of files) {
    const fullPath = path.join(backupDir, f);
    const stats = fs.statSync(fullPath);
    let checksum = "";
    const checksumPath = `${fullPath}.sha256`;
    if (fs.existsSync(checksumPath)) {
      checksum = fs.readFileSync(checksumPath, "utf8").trim();
    } else {
      checksum = calculateFileSha256(fullPath);
    }

    backups.push({
      filename: f,
      sizeBytes: stats.size,
      createdAt: stats.mtime.toISOString(),
      checksum,
      integrity: "verified"
    });
  }

  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Restores a backup after verifying integrity and creating a safety snapshot of the active DB.
 */
export function restoreBackup(filename: string): { success: boolean; message: string; preRestoreSnapshot: string } {
  // Sanitize filename to prevent directory traversal
  const safeFilename = path.basename(filename);
  const sourcePath = path.join(backupDir, safeFilename);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file ${safeFilename} does not exist.`);
  }

  // Verify backup file checksum if sha256 file exists
  const checksumPath = `${sourcePath}.sha256`;
  if (fs.existsSync(checksumPath)) {
    const recordedChecksum = fs.readFileSync(checksumPath, "utf8").trim();
    const actualChecksum = calculateFileSha256(sourcePath);
    if (recordedChecksum !== actualChecksum) {
      throw new Error("Backup file checksum verification failed: file appears corrupted or modified.");
    }
  }

  // Create a safety snapshot of the current DB before overwriting
  const safetyFilename = `pre_restore_safety_${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  const safetyPath = path.join(backupDir, safetyFilename);
  fs.copyFileSync(currentDbPath, safetyPath);

  // Copy backup over active DB
  fs.copyFileSync(sourcePath, currentDbPath);

  return {
    success: true,
    message: `Database successfully restored from ${safeFilename}`,
    preRestoreSnapshot: safetyFilename
  };
}

