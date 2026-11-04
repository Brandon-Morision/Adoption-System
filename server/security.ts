import crypto from "node:crypto";
import { db } from "./db.ts";

const ITERATIONS = 100000;
const KEY_LEN = 64;
const DIGEST = "sha512";
const SALT_LEN = 16;
const SESSION_TTL_HOURS = 8;
export const SESSION_IDLE_TIMEOUT_MINUTES = 15;

/**
 * Hash a password using PBKDF2 with SHA-512 and a cryptographically secure random salt.
 * Stored format: pbkdf2:<iterations>:<hex_salt>:<hex_hash>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return `pbkdf2:${ITERATIONS}:${salt}:${hash}`;
}

/**
 * Verify a candidate password against a stored hash string.
 * Supports legacy plaintext migration: if the stored value is plaintext,
 * it verifies equality and allows the caller to upgrade the password.
 */
export function verifyPassword(candidate: string, storedHash: string): { valid: boolean; needsUpgrade: boolean } {
  if (!storedHash) return { valid: false, needsUpgrade: false };

  // Check if already hashed with PBKDF2
  if (storedHash.startsWith("pbkdf2:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 4) return { valid: false, needsUpgrade: false };
    const iterations = parseInt(parts[1], 10);
    const salt = parts[2];
    const originalHash = parts[3];

    const candidateHash = crypto.pbkdf2Sync(candidate, salt, iterations, KEY_LEN, DIGEST).toString("hex");
    const valid = crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(originalHash, "hex"));
    return { valid, needsUpgrade: false };
  }

  // Legacy plaintext match check
  const legacyBuffer = Buffer.from(storedHash, "utf8");
  const candidateBuffer = Buffer.from(candidate, "utf8");
  if (legacyBuffer.length === candidateBuffer.length && crypto.timingSafeEqual(legacyBuffer, candidateBuffer)) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}

/**
 * Automatically migrate all legacy plaintext passwords in the database to PBKDF2 hashes.
 */
export function migratePlaintextPasswords(): number {
  const users = db.prepare("SELECT id, password FROM users").all() as { id: number; password: string }[];
  let count = 0;
  const updateStmt = db.prepare("UPDATE users SET password = ? WHERE id = ?");

  for (const u of users) {
    if (!u.password.startsWith("pbkdf2:")) {
      const hashed = hashPassword(u.password);
      updateStmt.run(hashed, u.id);
      count++;
    }
  }

  if (count > 0) {
    console.log(`[Security] Upgraded ${count} legacy user password(s) to PBKDF2 hashes.`);
  }
  return count;
}

export interface SessionData {
  userId: number;
  employeeId: string;
  role: string;
  name: string;
  token: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

/**
 * Create a new cryptographically secure session token in SQLite.
 * Initializes both the absolute 8-hour expiry and 15-minute idle tracking.
 */
export function createSession(userId: number, employeeId: string, role: string, name: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, employee_id, role, name, created_at, last_active_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, userId, employeeId, role, name, now, now, expiresAt);

  return token;
}

/**
 * Validate a session token. Returns session details or null if expired or invalid.
 * Enforces BOTH:
 * 1. Absolute 8-hour session lifetime (unextendable).
 * 2. 15-minute inactivity / idle timeout.
 * 
 * If touchActivity=true and at least 30 seconds have elapsed, throttles an update to last_active_at.
 */
export function validateSession(token: string, options: { touchActivity?: boolean } = {}): SessionData | null {
  if (!token || typeof token !== "string" || token.length < 32) return null;

  const now = new Date();
  const nowIso = now.toISOString();

  const session = db.prepare(`
    SELECT token, user_id as userId, employee_id as employeeId, role, name,
           created_at as createdAt,
           COALESCE(last_active_at, created_at) as lastActiveAt,
           expires_at as expiresAt
    FROM sessions
    WHERE token = ?
  `).get(token) as SessionData | undefined;

  if (!session) return null;

  // 1. Absolute 8-hour session expiration
  const expiresAtMs = new Date(session.expiresAt).getTime();
  if (now.getTime() > expiresAtMs) {
    revokeSession(token);
    return null;
  }

  // 2. 15-minute idle / inactivity expiration
  const lastActiveMs = new Date(session.lastActiveAt).getTime();
  const idleMs = now.getTime() - lastActiveMs;
  const maxIdleMs = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;

  if (idleMs > maxIdleMs) {
    revokeSession(token);
    return null;
  }

  // 3. Update activity timestamp if genuine user activity is signaled and throttled (>= 30 seconds)
  if (options.touchActivity && idleMs >= 30 * 1000) {
    try {
      db.prepare("UPDATE sessions SET last_active_at = ? WHERE token = ?").run(nowIso, token);
      session.lastActiveAt = nowIso;
    } catch (err) {
      console.error("[Security] Error updating session activity:", err);
    }
  }

  return session;
}

/**
 * Update the last_active_at timestamp following genuine user activity.
 * Throttled to at most once per 30 seconds unless force=true.
 */
export function touchSession(token: string, force: boolean = false): boolean {
  if (!token || typeof token !== "string" || token.length < 32) return false;

  const session = validateSession(token);
  if (!session) return false;

  const now = new Date();
  const nowIso = now.toISOString();
  const lastActiveMs = new Date(session.lastActiveAt).getTime();
  const idleMs = now.getTime() - lastActiveMs;

  if (force || idleMs >= 30 * 1000) {
    try {
      db.prepare("UPDATE sessions SET last_active_at = ? WHERE token = ?").run(nowIso, token);
      return true;
    } catch (err) {
      console.error("[Security] Error touching session activity:", err);
      return false;
    }
  }
  return true;
}

/**
 * Revoke/delete a specific session token (used for logout).
 */
export function revokeSession(token: string): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/**
 * Revoke all active sessions for a user (e.g. on password change or deactivation).
 */
export function revokeAllUserSessions(employeeId: string): void {
  db.prepare("DELETE FROM sessions WHERE employee_id = ?").run(employeeId);
}

/**
 * Periodic cleanup of expired and idle-timed-out session tokens.
 */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  const nowIso = now.toISOString();
  const maxIdleIso = new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const result = db.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= ? OR COALESCE(last_active_at, created_at) < ?
  `).run(nowIso, maxIdleIso);

  return Number(result.changes);
}

const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MINUTES = 15;

/**
 * Check if an IP or Employee ID has exceeded the maximum allowed failed attempts.
 */
export function checkRateLimit(ip: string, employeeId: string): { limited: boolean; retryAfterMinutes: number; count: number } {
  try {
    const row = db.prepare(`
      SELECT COUNT(*) as count, MIN(timestamp) as earliest
      FROM login_attempts
      WHERE (ip = ? OR (employee_id = ? AND employee_id != ''))
        AND success = 0
        AND timestamp >= datetime('now', '-' || ? || ' minutes')
    `).get(ip, employeeId, RATE_LIMIT_WINDOW_MINUTES) as { count: number; earliest?: string } | undefined;

    const count = row?.count || 0;
    if (count >= MAX_FAILED_ATTEMPTS) {
      return { limited: true, retryAfterMinutes: RATE_LIMIT_WINDOW_MINUTES, count };
    }
    return { limited: false, retryAfterMinutes: 0, count };
  } catch (err) {
    console.error("[RateLimit] Error checking rate limit:", err);
    return { limited: false, retryAfterMinutes: 0, count: 0 };
  }
}

/**
 * Record a login attempt (success or failure) for auditing and rate limiting.
 */
export function recordLoginAttempt(ip: string, employeeId: string, success: boolean): void {
  try {
    db.prepare(`
      INSERT INTO login_attempts (ip, employee_id, success)
      VALUES (?, ?, ?)
    `).run(ip, employeeId, success ? 1 : 0);

    // If successful, purge prior failures for this employee & IP to avoid lingering lockout
    if (success) {
      db.prepare(`
        DELETE FROM login_attempts
        WHERE (employee_id = ? OR ip = ?) AND success = 0
      `).run(employeeId, ip);
    }
  } catch (err) {
    console.error("[RateLimit] Error recording login attempt:", err);
  }
}


