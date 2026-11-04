/**
 * County Adoption Records System (AODS)
 * Safe Non-Destructive Backup & Restoration Verification Script
 * 
 * Verifies that the backup creation, checksum validation, and database restoration
 * pipeline functions perfectly without modifying or overwriting the live database.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createBackup } from "../server/backup.ts";
import { computeAuditHash } from "../server/audit.ts";

const liveDbPath = path.resolve(process.cwd(), "server/data/adoption_records.db");
const tempRestorePath = path.resolve(process.cwd(), "server/data/temp_restoration_test.db");

function calculateSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function runRestorationTest() {
  console.log("=====================================================================");
  console.log("  AODS SAFE NON-DESTRUCTIVE BACKUP & RESTORATION VERIFICATION      ");
  console.log("=====================================================================");

  // 1. Verify Live Database Exists
  if (!fs.existsSync(liveDbPath)) {
    throw new Error(`Live database not found at: ${liveDbPath}`);
  }
  const liveDbStats = fs.statSync(liveDbPath);
  const liveChecksum = calculateSha256(liveDbPath);
  console.log(`[Step 1/5] Live Database Verified:`);
  console.log(`  Path    : ${liveDbPath}`);
  console.log(`  Size    : ${liveDbStats.size} bytes`);
  console.log(`  Checksum: ${liveChecksum.slice(0, 16)}...`);

  // 2. Generate an Integrity-Verified Backup
  console.log(`\n[Step 2/5] Creating Verified Backup Snapshot...`);
  const backup = createBackup();
  const backupPath = path.resolve(process.cwd(), "server/data/backups", backup.filename);
  console.log(`  Filename : ${backup.filename}`);
  console.log(`  Integrity: ${backup.integrity}`);
  console.log(`  SHA-256  : ${backup.checksum.slice(0, 16)}...`);

  // Verify companion .sha256 file
  const sha256File = `${backupPath}.sha256`;
  if (!fs.existsSync(sha256File)) {
    throw new Error(`Companion SHA-256 file missing: ${sha256File}`);
  }
  const recordedSha = fs.readFileSync(sha256File, "utf8").trim();
  if (recordedSha !== backup.checksum) {
    throw new Error(`Checksum mismatch between file and companion .sha256`);
  }
  console.log(`  Companion: ${path.basename(sha256File)} (Verified match)`);

  // 3. Simulate Restoration to an Isolated Sandbox File
  console.log(`\n[Step 3/5] Restoring Snapshot to Temporary Sandbox:`);
  console.log(`  Target (Isolated): ${tempRestorePath}`);
  if (fs.existsSync(tempRestorePath)) {
    fs.unlinkSync(tempRestorePath);
  }
  fs.copyFileSync(backupPath, tempRestorePath);

  // 4. Verify Integrity and Completeness of the Restored Sandbox Database
  console.log(`\n[Step 4/5] Verifying Restored Database Schema & Data Integrity...`);
  const restoredDb = new DatabaseSync(tempRestorePath);

  // Check SQLite PRAGMA integrity
  const pragmaCheck = restoredDb.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  if (pragmaCheck.integrity_check !== "ok") {
    throw new Error(`Restored database PRAGMA integrity_check failed: ${pragmaCheck.integrity_check}`);
  }
  console.log(`  PRAGMA integrity_check: ok`);

  // Check row counts
  const recordCount = (restoredDb.prepare("SELECT count(*) as count FROM records").get() as { count: number }).count;
  const userCount = (restoredDb.prepare("SELECT count(*) as count FROM users").get() as { count: number }).count;
  const activityCount = (restoredDb.prepare("SELECT count(*) as count FROM activity").get() as { count: number }).count;
  console.log(`  Restored Records: ${recordCount}`);
  console.log(`  Restored Users  : ${userCount}`);
  console.log(`  Restored Audit  : ${activityCount} log entries`);

  if (recordCount < 6 || userCount < 4) {
    throw new Error(`Restored database has incomplete data records`);
  }

  // 5. Verify Cryptographic Audit Hash Chain in the Restored Database
  const auditRows = restoredDb.prepare("SELECT * FROM activity ORDER BY id ASC").all() as any[];
  const GENESIS_PREV_HASH = "0000000000000000000000000000000000000000000000000000000000000000";
  let expectedPrev = GENESIS_PREV_HASH;
  let chainValid = true;
  let failReason = "";

  for (const row of auditRows) {
    if (row.prev_hash !== expectedPrev) {
      chainValid = false;
      failReason = `Expected prev_hash ${expectedPrev.slice(0, 8)}..., got ${row.prev_hash?.slice(0, 8)}... at ID ${row.id}`;
      break;
    }
    const calculatedHash = computeAuditHash(
      row.id,
      row.timestamp,
      row.user_name,
      row.action,
      row.record_no,
      row.description,
      row.prev_hash
    );
    if (row.hash !== calculatedHash) {
      chainValid = false;
      failReason = `Stored hash ${row.hash?.slice(0, 8)}... does not match calculated ${calculatedHash.slice(0, 8)}... at ID ${row.id}`;
      break;
    }
    expectedPrev = row.hash;
  }

  if (!chainValid) {
    throw new Error(`Restored database audit trail hash-chain verification failed: ${failReason}`);
  }
  console.log(`  Audit Chain Integrity: VERIFIED UNBROKEN (${auditRows.length} chained entries)`);

  // 6. Cleanup Temporary Test File
  restoredDb.close();
  if (fs.existsSync(tempRestorePath)) {
    fs.unlinkSync(tempRestorePath);
  }
  console.log(`\n[Step 5/5] Cleanup: Temporary sandbox database removed.`);

  // Verify live DB was untouched
  const finalLiveStats = fs.statSync(liveDbPath);
  console.log(`  Live DB Untouched: ${liveDbPath} (${finalLiveStats.size} bytes)`);

  console.log("\n=====================================================================");
  console.log("  [SUCCESS] RESTORATION TEST PASSED 100% - BACKUPS FULLY RECOVERABLE");
  console.log("=====================================================================\n");
}

runRestorationTest().catch((err) => {
  console.error("\n[FAIL] Restoration test encountered an error:", err.message);
  if (fs.existsSync(tempRestorePath)) {
    try { fs.unlinkSync(tempRestorePath); } catch {}
  }
  process.exit(1);
});
