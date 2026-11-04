import { Router, type Request, type Response } from "express";
import { db } from "../db.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";
import { verifyAuditChain } from "../audit.ts";

export const activityRouter = Router();

activityRouter.use(requireAuth);

// GET /api/activity - Retrieve activity logs with filtering
activityRouter.get("/", (req: Request, res: Response) => {
  try {
    const user = (req.query.user as string) || "";
    const action = (req.query.action as string) || "";
    const entry = (req.query.entry as string) || "";

    let sql = "SELECT id, timestamp, user_name, action, record_no, description, prev_hash, hash, created_at FROM activity WHERE 1=1";
    const params: any[] = [];

    if (user && user !== "All users") {
      sql += " AND user_name = ?";
      params.push(user);
    }

    if (action && action !== "All actions") {
      sql += " AND action = ?";
      params.push(action);
    }

    if (entry) {
      sql += " AND record_no LIKE ?";
      params.push(`%${entry}%`);
    }

    sql += " ORDER BY id DESC LIMIT 100";

    const rows = db.prepare(sql).all(...params);
    res.json({ success: true, count: rows.length, activity: rows });
  } catch (err: any) {
    console.error("[Activity] Query error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve activity log." });
  }
});

// GET /api/activity/verify - Cryptographically verify the tamper-evident hash chain (Administrator only)
activityRouter.get("/verify", requireRole(["Administrator"]), (req: Request, res: Response) => {
  try {
    const result = verifyAuditChain();
    res.json({
      success: true,
      auditIntegrity: result
    });
  } catch (err: any) {
    console.error("[Activity] Verification error:", err);
    res.status(500).json({ success: false, error: "Audit integrity check failed." });
  }
});

// Enforce immutability: Audit log records cannot be updated or deleted
activityRouter.use((req: Request, res: Response, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    res.status(405).json({
      success: false,
      error: "Activity log is an immutable append-only audit trail. Modification or deletion is strictly forbidden by county records compliance policy."
    });
    return;
  }
  next();
});
