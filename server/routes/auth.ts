import { Router, type Request, type Response } from "express";
import { db } from "../db.ts";
import { verifyPassword, hashPassword, createSession, revokeSession, checkRateLimit, recordLoginAttempt, touchSession } from "../security.ts";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.ts";
import { recordActivity } from "../audit.ts";

export const authRouter = Router();

// POST /api/auth/login
authRouter.post("/login", (req: Request, res: Response) => {
  try {
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "127.0.0.1";
    const { employee_id, password } = req.body;
    if (!employee_id || !password) {
      return res.status(400).json({ success: false, error: "Employee ID and password are required." });
    }

    const cleanEmpId = String(employee_id).trim().toUpperCase();

    // Check rate limit before proceeding
    const rateCheck = checkRateLimit(clientIp, cleanEmpId);
    if (rateCheck.limited) {
      return res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Please wait ${rateCheck.retryAfterMinutes} minutes before retrying.`
      });
    }

    const user = db.prepare("SELECT * FROM users WHERE UPPER(employee_id) = ?").get(cleanEmpId) as any;

    if (!user) {
      recordLoginAttempt(clientIp, cleanEmpId, false);
      return res.status(401).json({ success: false, error: "Invalid Employee ID or credentials." });
    }

    if (user.status === "Inactive") {
      recordLoginAttempt(clientIp, cleanEmpId, false);
      return res.status(403).json({ success: false, error: "Account is inactive. Please contact your system administrator." });
    }

    const { valid, needsUpgrade } = verifyPassword(String(password), user.password);
    if (!valid) {
      recordLoginAttempt(clientIp, cleanEmpId, false);
      return res.status(401).json({ success: false, error: "Invalid password." });
    }

    // Transparently upgrade legacy plaintext password to secure PBKDF2 hash
    if (needsUpgrade) {
      const newHash = hashPassword(String(password));
      db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newHash, user.id);
    }

    // Update last login
    const nowTimeStr = `Today, ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(nowTimeStr, user.id);

    // Record successful login for rate limiting
    recordLoginAttempt(clientIp, cleanEmpId, true);

    // Issue cryptographic session token
    const token = createSession(user.id, user.employee_id, user.role, user.name);

    // Set secure HttpOnly cookie
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.HTTPS_ENABLED === "true";
    res.cookie("aods_session", token, {
      httpOnly: true,
      secure: isHttps || process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    });

    // Record audit event
    recordActivity({
      user_name: user.name,
      action: "Login",
      record_no: "—",
      description: `Secure session started for ${user.employee_id} (${user.role})`
    });

    const mustChange = Boolean(user.must_change_password);

    res.json({
      success: true,
      token,
      mustChangePassword: mustChange,
      user: {
        id: user.id,
        name: user.name,
        employee_id: user.employee_id,
        role: user.role,
        email: user.email,
        status: user.status,
        mustChangePassword: mustChange
      }
    });
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    res.status(500).json({ success: false, error: "An internal server error occurred during sign in." });
  }
});

// POST /api/auth/logout
authRouter.post("/logout", requireAuth, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.token) {
      revokeSession(authReq.user.token);
      recordActivity({
        user_name: authReq.user.name,
        action: "Logout",
        record_no: "—",
        description: `Session closed for ${authReq.user.employeeId}`
      });
    }

    // Clear HttpOnly session cookie with matching security parameters
    const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.HTTPS_ENABLED === "true";
    res.clearCookie("aods_session", {
      path: "/",
      httpOnly: true,
      secure: isHttps || process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    res.json({ success: true, message: "Logged out successfully." });
  } catch (err: any) {
    console.error("[Auth] Logout error:", err);
    res.status(500).json({ success: false, error: "Failed to sign out cleanly." });
  }
});

// POST /api/auth/touch - Refresh last_active_at timestamp for genuine user activity
authRouter.post("/touch", requireAuth, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.token) {
      touchSession(authReq.user.token);
    }
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Failed to refresh session activity." });
  }
});

// GET /api/auth/me - Profile of the active authenticated user
authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = db.prepare(
      "SELECT id, name, employee_id, role, status, email, last_login, must_change_password FROM users WHERE id = ?"
    ).get(authReq.user!.userId) as any;

    if (!user) {
      return res.status(404).json({ success: false, error: "User session not found." });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        employee_id: user.employee_id,
        role: user.role,
        status: user.status,
        email: user.email,
        last_login: user.last_login,
        mustChangePassword: Boolean(user.must_change_password)
      }
    });
  } catch (err: any) {
    console.error("[Auth] /me error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve session profile." });
  }
});

// POST /api/auth/change-password - Mandatory or voluntary password rotation
authRouter.post("/change-password", requireAuth, (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: "Current password and new password are required." });
    }

    const cleanNewPassword = String(newPassword).trim();
    if (cleanNewPassword.length < 12) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 12 characters long. Secure passphrases are recommended for confidential adoption records."
      });
    }

    if (cleanNewPassword.toLowerCase() === "countyrecords") {
      return res.status(400).json({ success: false, error: "New password cannot be the default initial password." });
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(authReq.user!.userId) as any;
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    const { valid } = verifyPassword(String(currentPassword), user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Current password verification failed." });
    }

    if (String(currentPassword) === cleanNewPassword) {
      return res.status(400).json({ success: false, error: "New password must be different from current password." });
    }

    const newHash = hashPassword(cleanNewPassword);
    db.prepare("UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?").run(newHash, user.id);

    recordActivity({
      user_name: authReq.user!.name,
      action: "Password Rotation",
      record_no: "—",
      description: `Password rotated successfully for ${authReq.user!.employeeId} (initial credential retired)`
    });

    res.json({
      success: true,
      message: "Password updated successfully. Security rotation requirements met."
    });
  } catch (err: any) {
    console.error("[Auth] Password rotation error:", err);
    res.status(500).json({ success: false, error: "Failed to update password." });
  }
});
