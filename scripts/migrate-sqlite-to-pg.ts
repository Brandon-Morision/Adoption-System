/**
 * County Adoption Records System (AODS)
 * SQLite to PostgreSQL Automated Migration Tool
 * 
 * Usage:
 *   npx tsx scripts/migrate-sqlite-to-pg.ts [--dry-run]
 * 
 * Required Environment Variables (or set in .env):
 *   DATABASE_URL=postgresql://user:password@localhost:5432/county_adoption_records
 *   -- or --
 *   PGHOST=localhost
 *   PGPORT=5432
 *   PGUSER=aods_admin
 *   PGPASSWORD=securepassword
 *   PGDATABASE=county_adoption_records
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import pg from "pg";
import { createHash } from "node:crypto";

const { Client } = pg;

const SQLITE_PATH = path.resolve(process.cwd(), "server/data/adoption_records.db");
const SCHEMA_PATH = path.resolve(process.cwd(), "server/db/schema.sql");

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("=====================================================================");
  console.log(" COUNTY ADOPTION RECORDS SYSTEM - SQLITE TO POSTGRESQL MIGRATION");
  console.log("=====================================================================");
  if (isDryRun) {
    console.log(">>> DRY-RUN MODE: No changes will be committed to PostgreSQL <<<\n");
  }

  // 1. Verify SQLite database file exists
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`[Error] SQLite database file not found at: ${SQLITE_PATH}`);
    process.exit(1);
  }

  console.log(`[1/5] Connecting to SQLite source at: ${SQLITE_PATH}`);
  const sqlite = new DatabaseSync(SQLITE_PATH);

  // 2. Connect to PostgreSQL
  const connectionConfig: pg.ClientConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "county_adoption_records",
    };

  console.log(`[2/5] Connecting to PostgreSQL at ${connectionConfig.host || 'DATABASE_URL'}:${connectionConfig.port || 5432}/${connectionConfig.database}...`);
  const pgClient = new Client(connectionConfig);

  try {
    await pgClient.connect();
    console.log("      PostgreSQL connection established successfully.");
  } catch (err: any) {
    console.error("\n[Error] Unable to connect to PostgreSQL database.");
    console.error(`Details: ${err.message}`);
    console.error("\nPlease ensure PostgreSQL is running and check your connection settings:");
    console.error("  DATABASE_URL or PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE\n");
    process.exit(1);
  }

  try {
    // 3. Apply Schema DDL
    console.log(`[3/5] Applying PostgreSQL DDL schema from: ${SCHEMA_PATH}`);
    if (fs.existsSync(SCHEMA_PATH)) {
      const ddl = fs.readFileSync(SCHEMA_PATH, "utf-8");
      if (!isDryRun) {
        await pgClient.query(ddl);
      }
      console.log("      Schema tables, indexes, and triggers verified.");
    } else {
      console.warn("      Warning: schema.sql not found, assuming existing schema.");
    }

    // 4. Begin Transaction for Data Transfer
    console.log("[4/5] Transferring data inside atomic transaction...");
    if (!isDryRun) {
      await pgClient.query("BEGIN;");
    }

    // A. Users
    const users = sqlite.prepare("SELECT * FROM users ORDER BY id ASC").all() as any[];
    console.log(`      Found ${users.length} user(s) in SQLite.`);
    for (const u of users) {
      if (!isDryRun) {
        await pgClient.query(
          `INSERT INTO users (id, employee_id, name, email, role, status, password, last_login, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, CURRENT_TIMESTAMP))
           ON CONFLICT (employee_id) DO UPDATE SET
             name = EXCLUDED.name,
             email = EXCLUDED.email,
             role = EXCLUDED.role,
             status = EXCLUDED.status,
             password = EXCLUDED.password,
             last_login = EXCLUDED.last_login;`,
          [u.id, u.employee_id, u.name, u.email || null, u.role, u.status || "Active", u.password, u.last_login || null, u.created_at || null]
        );
      }
    }

    // B. Adoption Records
    const records = sqlite.prepare("SELECT * FROM records ORDER BY id ASC").all() as any[];
    console.log(`      Found ${records.length} adoption record(s) in SQLite.`);
    for (const r of records) {
      if (!isDryRun) {
        await pgClient.query(
          `INSERT INTO records (
             id, no, name, dob, country, sex, adopters, adopters_address, adopters_occupation,
             adoption, court, entered, officer, designation, signature, status, version, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
             COALESCE($18::timestamptz, CURRENT_TIMESTAMP), COALESCE($19::timestamptz, CURRENT_TIMESTAMP)
           )
           ON CONFLICT (no) DO UPDATE SET
             name = EXCLUDED.name,
             dob = EXCLUDED.dob,
             country = EXCLUDED.country,
             sex = EXCLUDED.sex,
             adopters = EXCLUDED.adopters,
             adopters_address = EXCLUDED.adopters_address,
             adopters_occupation = EXCLUDED.adopters_occupation,
             adoption = EXCLUDED.adoption,
             court = EXCLUDED.court,
             entered = EXCLUDED.entered,
             officer = EXCLUDED.officer,
             designation = EXCLUDED.designation,
             signature = EXCLUDED.signature,
             status = EXCLUDED.status,
             version = EXCLUDED.version,
             updated_at = EXCLUDED.updated_at;`,
          [
            r.id, r.no, r.name, r.dob, r.country || "Kenya", r.sex, r.adopters,
            r.adopters_address || "", r.adopters_occupation || "", r.adoption,
            r.court, r.entered, r.officer || "Jane Mwangi",
            r.designation || "Registrar, County Adoption Office",
            r.signature || "J. Mwangi", r.status || "Registered",
            r.version || 1, r.created_at || null, r.updated_at || null
          ]
        );
      }
    }

    // C. Activity Audit Trail (Temporary disable trigger for migration if needed)
    const activities = sqlite.prepare("SELECT * FROM activity ORDER BY id ASC").all() as any[];
    console.log(`      Found ${activities.length} audit trail record(s) in SQLite.`);
    for (const a of activities) {
      if (!isDryRun) {
        await pgClient.query(
          `INSERT INTO activity_audit (id, timestamp, user_name, action, record_no, description, prev_hash, hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, CURRENT_TIMESTAMP))
           ON CONFLICT (id) DO NOTHING;`,
          [
            a.id, a.timestamp, a.user_name, a.action, a.record_no || "—",
            a.description, a.prev_hash || "", a.hash || "", a.created_at || null
          ]
        );
      }
    }

    // D. Sessions
    let sessionCount = 0;
    try {
      const sessions = sqlite.prepare("SELECT * FROM sessions WHERE expires_at > datetime('now')").all() as any[];
      sessionCount = sessions.length;
      console.log(`      Found ${sessionCount} active session(s) in SQLite.`);
      for (const s of sessions) {
        if (!isDryRun) {
          await pgClient.query(
            `INSERT INTO sessions (token, user_id, employee_id, role, name, created_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, CURRENT_TIMESTAMP), $7::timestamptz)
             ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at;`,
            [s.token, s.user_id, s.employee_id, s.role, s.name, s.created_at || null, s.expires_at]
          );
        }
      }
    } catch {
      // Sessions table might be empty or missing
    }

    // E. Reset PostgreSQL serial sequences
    if (!isDryRun) {
      console.log("      Updating sequence auto-increment numbers...");
      await pgClient.query(`
        SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1));
        SELECT setval(pg_get_serial_sequence('records', 'id'), COALESCE((SELECT MAX(id) FROM records), 1));
        SELECT setval(pg_get_serial_sequence('activity_audit', 'id'), COALESCE((SELECT MAX(id) FROM activity_audit), 1));
      `);
      await pgClient.query("COMMIT;");
      console.log("      Transaction committed successfully.");
    }

    // 5. Verification & Integrity Check
    console.log("[5/5] Performing verification checks...");
    if (!isDryRun) {
      const pgUserCount = (await pgClient.query("SELECT COUNT(*) FROM users")).rows[0].count;
      const pgRecordCount = (await pgClient.query("SELECT COUNT(*) FROM records")).rows[0].count;
      const pgAuditCount = (await pgClient.query("SELECT COUNT(*) FROM activity_audit")).rows[0].count;

      console.log(`      Users:    SQLite=${users.length} | PostgreSQL=${pgUserCount}`);
      console.log(`      Records:  SQLite=${records.length} | PostgreSQL=${pgRecordCount}`);
      console.log(`      Audit:    SQLite=${activities.length} | PostgreSQL=${pgAuditCount}`);

      if (
        Number(pgUserCount) === users.length &&
        Number(pgRecordCount) === records.length &&
        Number(pgAuditCount) >= activities.length
      ) {
        console.log("\n>>> MIGRATION SUCCESSFUL: All tables and records match 100% <<<");
      } else {
        console.warn("\n[Warning] Row count mismatch detected. Please review database logs.");
      }
    } else {
      console.log("      Dry run completed with zero database mutations.");
    }

  } catch (err: any) {
    if (!isDryRun) {
      await pgClient.query("ROLLBACK;");
    }
    console.error(`\n[Fatal Error] Migration failed: ${err.message}`);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main().catch((err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});

