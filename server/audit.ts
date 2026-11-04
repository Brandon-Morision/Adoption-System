import crypto from "node:crypto";
import { db } from "./db.ts";

export interface ActivityRow {
  id: number;
  timestamp: string;
  user_name: string;
  action: string;
  record_no: string;
  description: string;
  prev_hash: string;
  hash: string;
  created_at?: string;
}

const GENESIS_PREV_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Compute the SHA-256 hash for an audit entry linking to the previous entry hash.
 */
export function computeAuditHash(
  id: number,
  timestamp: string,
  userName: string,
  action: string,
  recordNo: string,
  description: string,
  prevHash: string
): string {
  const payload = [
    id,
    timestamp,
    userName.trim(),
    action.trim(),
    (recordNo || "—").trim(),
    description.trim(),
    prevHash
  ].join("|");

  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Insert a new tamper-evident activity log record with hash chaining.
 */
export function recordActivity(options: {
  user_name: string;
  action: string;
  record_no?: string;
  description: string;
  timestamp?: string;
}): { id: number; hash: string } {
  const timestamp =
    options.timestamp ||
    new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

  const recordNo = options.record_no || "—";

  // Fetch the last activity record to get its hash
  const last = db.prepare("SELECT id, hash FROM activity ORDER BY id DESC LIMIT 1").get() as
    | { id: number; hash: string }
    | undefined;

  const prevHash = last?.hash && last.hash.length === 64 ? last.hash : GENESIS_PREV_HASH;

  // Insert entry first to obtain ID
  const insertStmt = db.prepare(`
    INSERT INTO activity (timestamp, user_name, action, record_no, description, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, ?, '')
  `);

  const result = insertStmt.run(
    timestamp,
    options.user_name,
    options.action,
    recordNo,
    options.description,
    prevHash
  );

  const newId = Number(result.lastInsertRowid);
  const entryHash = computeAuditHash(
    newId,
    timestamp,
    options.user_name,
    options.action,
    recordNo,
    options.description,
    prevHash
  );

  db.prepare("UPDATE activity SET hash = ? WHERE id = ?").run(entryHash, newId);

  return { id: newId, hash: entryHash };
}

/**
 * Verifies the integrity of the cryptographic audit chain from genesis to the latest record.
 * Detects any modified, inserted, or deleted records.
 */
export function verifyAuditChain(): {
  valid: boolean;
  totalChecked: number;
  brokenAtId?: number;
  error?: string;
} {
  const rows = db.prepare("SELECT * FROM activity ORDER BY id ASC").all() as ActivityRow[];

  if (rows.length === 0) {
    return { valid: true, totalChecked: 0 };
  }

  let expectedPrevHash = GENESIS_PREV_HASH;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check prev_hash matches previous record's hash
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        totalChecked: i,
        brokenAtId: row.id,
        error: `Broken hash chain at ID ${row.id}: expected prev_hash ${expectedPrevHash}, found ${row.prev_hash}`
      };
    }

    // Recompute current row hash
    const computedHash = computeAuditHash(
      row.id,
      row.timestamp,
      row.user_name,
      row.action,
      row.record_no,
      row.description,
      row.prev_hash
    );

    if (computedHash !== row.hash) {
      return {
        valid: false,
        totalChecked: i,
        brokenAtId: row.id,
        error: `Tampered record detected at ID ${row.id}: recomputed hash ${computedHash} does not match stored hash ${row.hash}`
      };
    }

    expectedPrevHash = row.hash;
  }

  return { valid: true, totalChecked: rows.length };
}

/**
 * Initialize audit hash chaining: backfills any unhashed legacy rows sequentially.
 */
export function initializeAuditChaining(): void {
  const unhashed = db.prepare("SELECT id FROM activity WHERE hash IS NULL OR hash = '' ORDER BY id ASC").all() as { id: number }[];

  if (unhashed.length > 0) {
    const allRows = db.prepare("SELECT * FROM activity ORDER BY id ASC").all() as ActivityRow[];
    let prev = GENESIS_PREV_HASH;
    const updateStmt = db.prepare("UPDATE activity SET prev_hash = ?, hash = ? WHERE id = ?");

    for (const row of allRows) {
      const h = computeAuditHash(
        row.id,
        row.timestamp,
        row.user_name,
        row.action,
        row.record_no,
        row.description,
        prev
      );
      updateStmt.run(prev, h, row.id);
      prev = h;
    }
    console.log(`[Audit] Initialized cryptographic hash chain for ${allRows.length} activity records.`);
  }
}

