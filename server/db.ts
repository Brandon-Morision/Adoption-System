import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { migratePlaintextPasswords, hashPassword, verifyPassword } from "./security.ts";
import { initializeAuditChaining } from "./audit.ts";

// Ensure data folder exists
const dataDir = path.resolve(process.cwd(), "server/data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "adoption_records.db");
export const db = new DatabaseSync(dbPath);

/**
 * Execute an operation inside a SQLite transaction (BEGIN IMMEDIATE ... COMMIT/ROLLBACK).
 */
export function runTransaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // rollback may fail if already aborted
    }
    throw err;
  }
}

// Initialize Tables and run schema migrations
export function initDatabase() {
  // Enforce WAL mode and foreign keys for durability and data integrity
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");

  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      dob TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Kenya',
      sex TEXT NOT NULL,
      adopters TEXT NOT NULL,
      adopters_address TEXT DEFAULT '',
      adopters_occupation TEXT DEFAULT '',
      adoption TEXT NOT NULL,
      court TEXT NOT NULL,
      entered TEXT NOT NULL,
      officer TEXT DEFAULT 'Jane Mwangi',
      designation TEXT DEFAULT 'Registrar, County Adoption Office',
      signature TEXT DEFAULT 'J. Mwangi',
      status TEXT DEFAULT 'Registered',
      version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      employee_id TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      last_login TEXT,
      email TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_no TEXT DEFAULT '—',
      description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      employee_id TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      success INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_records_no ON records(no);
    CREATE INDEX IF NOT EXISTS idx_records_name ON records(name);
    CREATE INDEX IF NOT EXISTS idx_activity_time ON activity(id DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, timestamp);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_emp_time ON login_attempts(employee_id, timestamp);
  `);

  // Migrate records table to include optimistic concurrency version column if missing
  const recordCols = db.prepare("PRAGMA table_info(records)").all() as { name: string }[];
  const recColNames = new Set(recordCols.map(c => c.name));
  if (!recColNames.has("version")) {
    db.exec("ALTER TABLE records ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
  }

  // Migrate sessions table to include last_active_at column if missing
  const sessionCols = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  const sessionColNames = new Set(sessionCols.map(c => c.name));
  if (!sessionColNames.has("last_active_at")) {
    db.exec("ALTER TABLE sessions ADD COLUMN last_active_at DATETIME;");
    db.exec("UPDATE sessions SET last_active_at = created_at WHERE last_active_at IS NULL;");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at);");

  // Migrate activity table to include tamper-evident hash chaining columns if missing
  const activityCols = db.prepare("PRAGMA table_info(activity)").all() as { name: string }[];
  const colNames = new Set(activityCols.map(c => c.name));

  if (!colNames.has("prev_hash")) {
    db.exec("ALTER TABLE activity ADD COLUMN prev_hash TEXT DEFAULT ''");
  }
  if (!colNames.has("hash")) {
    db.exec("ALTER TABLE activity ADD COLUMN hash TEXT DEFAULT ''");
  }

  // Migrate users table to include mandatory password rotation column if missing
  const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const userColNames = new Set(userCols.map(c => c.name));
  if (!userColNames.has("must_change_password")) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
  }

  // Check if initial records exist, if not, seed data
  const recordCount = (db.prepare("SELECT count(*) as count FROM records").get() as { count: number }).count;
  if (recordCount === 0) {
    seedData();
  }

  // Ensure all existing user passwords are encrypted with PBKDF2
  migratePlaintextPasswords();

  // Audit initial seeded accounts: flag active accounts still using default initial credentials
  inspectAndFlagInitialCredentials();

  // Initialize or verify cryptographic hash chain for activity records
  initializeAuditChaining();
}

/**
 * Inspect user accounts for initial or default credentials and enforce rotation flags.
 * Securely tests without ever logging or exposing passwords.
 */
export function inspectAndFlagInitialCredentials(): { totalUsers: number; flaggedAccounts: string[] } {
  const users = db.prepare("SELECT id, employee_id, password, must_change_password FROM users").all() as any[];
  const flagged: string[] = [];
  const defaultInitials = ["countyrecords"];

  for (const user of users) {
    for (const initial of defaultInitials) {
      const { valid } = verifyPassword(initial, user.password);
      if (valid) {
        if (user.must_change_password === 0) {
          db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(user.id);
        }
        flagged.push(user.employee_id);
        break;
      }
    }
  }

  return { totalUsers: users.length, flaggedAccounts: flagged };
}

function seedData() {
  const insertRecord = db.prepare(`
    INSERT INTO records (
      no, name, dob, country, sex, adopters, adopters_address, adopters_occupation,
      adoption, court, entered, officer, designation, signature, status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const initialRecords = [
    [
      "001248", "Jane Wanjiku Kamau", "2018-03-14", "Kenya", "Female",
      "John Kamau and Mary Kamau", "P.O. Box 1842, Riverside Drive, Nairobi", "Civil Engineer and Educator",
      "2024-08-21", "High Court", "2024-08-23", "Jane Mwangi", "Registrar, County Adoption Office", "J. Mwangi", "Registered"
    ],
    [
      "001247", "Daniel Otieno Njoroge", "2017-11-09", "Kenya", "Male",
      "Samuel & Ruth Njoroge", "P.O. Box 450, Milimani, Nakuru", "Architect and Accountant",
      "2024-08-19", "Children’s Court", "2024-08-20", "Jane Mwangi", "Registrar, County Adoption Office", "J. Mwangi", "Registered"
    ],
    [
      "001246", "Amina Chebet Hassan", "2019-06-28", "Kenya", "Female",
      "Idris & Salma Hassan", "P.O. Box 89, Nyali, Mombasa", "Business Owners",
      "2024-08-15", "High Court", "2024-08-16", "Peter Kamau", "Officer, County Adoption Office", "P. Kamau", "Registered"
    ],
    [
      "001245", "Eliud Baraka Mwangi", "2020-02-03", "Tanzania", "Male",
      "Peter & Lucy Mwangi", "P.O. Box 320, Karen, Nairobi", "Medical Doctors",
      "2024-08-12", "Children’s Court", "2024-08-14", "Jane Mwangi", "Registrar, County Adoption Office", "J. Mwangi", "Registered"
    ],
    [
      "001244", "Grace Naliaka Ouma", "2018-09-22", "Kenya", "Female",
      "David & Anne Ouma", "P.O. Box 112, Kisumu Central", "University Lecturers",
      "2024-08-08", "High Court", "2024-08-09", "Ruth Njeri", "Officer, County Adoption Office", "R. Njeri", "Registered"
    ],
    [
      "001243", "Noah Kiptoo Kibet", "2019-01-11", "Uganda", "Male",
      "James & Faith Kibet", "P.O. Box 56, Eldoret", "Agronomist and Nurse",
      "2024-08-02", "High Court", "2024-08-05", "Jane Mwangi", "Registrar, County Adoption Office", "J. Mwangi", "Registered"
    ],
  ];

  for (const r of initialRecords) {
    insertRecord.run(...r);
  }

  // Seed Users with hashed passwords
  const insertUser = db.prepare(`
    INSERT INTO users (name, employee_id, role, status, last_login, email, password)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const initialAdminPass = process.env.INITIAL_ADMIN_PASSWORD || "countyrecords";

  const initialUsers = [
    ["Jane Mwangi", "ADM-001", "Administrator", "Active", "Today, 08:02", "jane.mwangi@county.gov", hashPassword(initialAdminPass)],
    ["Peter Kamau", "EMP-014", "Employee", "Active", "Today, 09:14", "peter.kamau@county.gov", hashPassword("countyrecords")],
    ["Ruth Njeri", "EMP-022", "Employee", "Active", "Yesterday, 16:48", "ruth.njeri@county.gov", hashPassword("countyrecords")],
    ["David Ouma", "EMP-031", "Employee", "Inactive", "24 Sep 2026", "david.ouma@county.gov", hashPassword("countyrecords")]
  ];

  for (const u of initialUsers) {
    insertUser.run(...u);
  }

  // Seed Activity
  const insertActivity = db.prepare(`
    INSERT INTO activity (timestamp, user_name, action, record_no, description, prev_hash, hash)
    VALUES (?, ?, ?, ?, ?, '', '')
  `);

  const initialActivities = [
    ["02 Oct 2026, 10:42", "Jane Mwangi", "Created Record", "#001248", "New adoption record created"],
    ["02 Oct 2026, 10:51", "Peter Kamau", "Updated Record", "#001120", "Adopter address updated"],
    ["02 Oct 2026, 11:03", "Jane Mwangi", "Viewed Record", "#000981", "Record details viewed"],
    ["02 Oct 2026, 11:12", "Ruth Njeri", "Printed Record", "#001034", "Official record printed"],
    ["02 Oct 2026, 11:18", "Jane Mwangi", "Login", "—", "Secure session started"]
  ];

  for (const a of initialActivities) {
    insertActivity.run(...a);
  }
}
