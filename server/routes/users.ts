import { Router, type Request, type Response } from "express";
import { db, runTransaction } from "../db.ts";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/auth.ts";
import { validateUserInput } from "../validation.ts";
import { hashPassword, revokeAllUserSessions } from "../security.ts";
import { recordActivity } from "../audit.ts";

export const usersRouter = Router();

// Strict RBAC: All user management endpoints require Administrator role
usersRouter.use(requireAuth);
usersRouter.use(requireRole(["Administrator"]));

// GET /api/users - List employee accounts (excluding password hashes)
usersRouter.get("/", (req: Request, res: Response) => {
  try {
    const users = db.prepare(
      "SELECT id, name, employee_id, role, status, last_login, email, created_at FROM users ORDER BY id ASC"
    ).all();

    res.json({ success: true, count: users.length, users });
  } catch (err: any) {
    console.error("[Users] List error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve employee directory." });
  }
});

// POST /api/users - Create new employee user
usersRouter.post("/", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { errors, data } = validateUserInput(req.body, false);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(" ") });
    }

    const createdUser = runTransaction(() => {
      const existing = db.prepare("SELECT id FROM users WHERE UPPER(employee_id) = ?").get(data.employee_id);
      if (existing) {
        throw new Error(`Employee ID ${data.employee_id} already exists.`);
      }

      const hashedPassword = hashPassword(data.password);

      const stmt = db.prepare(`
        INSERT INTO users (name, employee_id, role, status, last_login, email, password)
        VALUES (?, ?, ?, ?, 'Never', ?, ?)
      `);

      stmt.run(data.name, data.employee_id, data.role, data.status, data.email || "", hashedPassword);

      recordActivity({
        user_name: authReq.user?.name || "Administrator",
        action: "Created User",
        record_no: data.employee_id,
        description: `Created new user account for ${data.name} (${data.employee_id}, Role: ${data.role})`
      });

      return db.prepare(
        "SELECT id, name, employee_id, role, status, last_login, email FROM users WHERE employee_id = ?"
      ).get(data.employee_id);
    });

    res.status(201).json({ success: true, user: createdUser });
  } catch (err: any) {
    console.error("[Users] Create error:", err);
    res.status(400).json({ success: false, error: err.message || "Failed to create user account." });
  }
});

// PUT /api/users/:employee_id - Update employee user
usersRouter.put("/:employee_id", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const empId = req.params.employee_id?.trim().toUpperCase();

    if (!empId) {
      return res.status(400).json({ success: false, error: "Employee ID is required." });
    }

    const { errors, data } = validateUserInput(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(" ") });
    }

    const updatedUser = runTransaction(() => {
      const existing = db.prepare("SELECT * FROM users WHERE UPPER(employee_id) = ?").get(empId) as any;
      if (!existing) {
        throw new Error(`User with Employee ID ${empId} does not exist.`);
      }

      // If updating Jane Mwangi's role, prevent locking out the primary admin
      if (existing.employee_id === "ADM-001" && data.role && data.role !== "Administrator") {
        throw new Error("Cannot demote the primary root administrator account.");
      }

      let newPasswordHash = existing.password;
      let passwordChanged = false;

      if (data.password) {
        newPasswordHash = hashPassword(data.password);
        passwordChanged = true;
        // Invalidate all active sessions for this user so they must re-authenticate with new password
        revokeAllUserSessions(existing.employee_id);
      }

      const stmt = db.prepare(`
        UPDATE users SET
          name = COALESCE(?, name),
          role = COALESCE(?, role),
          status = COALESCE(?, status),
          email = COALESCE(?, email),
          password = ?
        WHERE UPPER(employee_id) = ?
      `);

      stmt.run(
        data.name || null,
        data.role || null,
        data.status || null,
        data.email !== undefined ? data.email : null,
        newPasswordHash,
        empId
      );

      recordActivity({
        user_name: authReq.user?.name || "Administrator",
        action: "Updated User",
        record_no: empId,
        description: `Updated profile details for ${empId}${passwordChanged ? " (password reset)" : ""}`
      });

      return db.prepare(
        "SELECT id, name, employee_id, role, status, last_login, email FROM users WHERE UPPER(employee_id) = ?"
      ).get(empId);
    });

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    console.error("[Users] Update error:", err);
    res.status(400).json({ success: false, error: err.message || "Failed to update user account." });
  }
});
