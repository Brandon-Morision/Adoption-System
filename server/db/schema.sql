-- =====================================================================
-- COUNTY ADOPTION RECORDS SYSTEM (AODS)
-- Centralized PostgreSQL Enterprise Schema
-- Version: 3.0.0 (Multi-User LAN & Regional Deployment)
-- Compatible with PostgreSQL 14, 15, 16, 17
-- =====================================================================

-- Ensure necessary extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. USERS & ACCESS CONTROL TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(32) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160),
    role VARCHAR(32) NOT NULL CHECK (role IN ('Administrator', 'Employee', 'Auditor')),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Suspended')),
    password VARCHAR(255) NOT NULL,
    last_login VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- =====================================================================
-- 2. SESSIONS TABLE (Centralized Session Management)
-- =====================================================================
CREATE TABLE IF NOT EXISTS sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    employee_id VARCHAR(32) NOT NULL,
    role VARCHAR(32) NOT NULL,
    name VARCHAR(120) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- =====================================================================
-- 3. ADOPTION RECORDS TABLE (Optimistic Concurrency Control)
-- =====================================================================
CREATE TABLE IF NOT EXISTS records (
    id SERIAL PRIMARY KEY,
    no VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    dob DATE NOT NULL,
    country VARCHAR(80) NOT NULL DEFAULT 'Kenya',
    sex VARCHAR(10) NOT NULL CHECK (sex IN ('Male', 'Female')),
    adopters TEXT NOT NULL,
    adopters_address TEXT NOT NULL DEFAULT '',
    adopters_occupation TEXT NOT NULL DEFAULT '',
    adoption DATE NOT NULL,
    court VARCHAR(100) NOT NULL,
    entered DATE NOT NULL,
    officer VARCHAR(120) NOT NULL DEFAULT 'Jane Mwangi',
    designation VARCHAR(150) NOT NULL DEFAULT 'Registrar, County Adoption Office',
    signature VARCHAR(100) NOT NULL DEFAULT 'J. Mwangi',
    status VARCHAR(30) NOT NULL DEFAULT 'Registered' CHECK (status IN ('Registered', 'Archived', 'Pending')),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_records_no ON records(no);
CREATE INDEX IF NOT EXISTS idx_records_name ON records(name);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE INDEX IF NOT EXISTS idx_records_court ON records(court);
CREATE INDEX IF NOT EXISTS idx_records_entered ON records(entered);

-- =====================================================================
-- 4. TAMPER-EVIDENT AUDIT TRAIL TABLE (Cryptographic Chaining)
-- =====================================================================
CREATE TABLE IF NOT EXISTS activity_audit (
    id SERIAL PRIMARY KEY,
    timestamp VARCHAR(40) NOT NULL,
    user_name VARCHAR(120) NOT NULL,
    action VARCHAR(60) NOT NULL,
    record_no VARCHAR(30) NOT NULL DEFAULT '—',
    description TEXT NOT NULL,
    ip_address VARCHAR(45) DEFAULT '127.0.0.1',
    prev_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created_at ON activity_audit(id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record_no ON activity_audit(record_no);
CREATE INDEX IF NOT EXISTS idx_audit_user_name ON activity_audit(user_name);
CREATE INDEX IF NOT EXISTS idx_audit_hash ON activity_audit(hash);

-- Enforce append-only immutability on audit trail
CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are immutable and cannot be updated or deleted by any user or application role.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_audit ON activity_audit;
CREATE TRIGGER trg_protect_audit
BEFORE UPDATE OR DELETE ON activity_audit
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_tampering();

-- =====================================================================
-- 5. LOGIN ATTEMPTS TABLE (Brute Force & Rate Limiting)
-- =====================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    ip_address VARCHAR(45) NOT NULL,
    employee_id VARCHAR(32) NOT NULL,
    attempt_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, attempt_time);
CREATE INDEX IF NOT EXISTS idx_login_attempts_emp_time ON login_attempts(employee_id, attempt_time);

-- =====================================================================
-- 6. AUTOMATIC TIMESTAMP TRIGGER FOR UPDATED_AT
-- =====================================================================
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_records_timestamp ON records;
CREATE TRIGGER trg_records_timestamp
BEFORE UPDATE ON records
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

DROP TRIGGER IF EXISTS trg_users_timestamp ON users;
CREATE TRIGGER trg_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_timestamp_column();

