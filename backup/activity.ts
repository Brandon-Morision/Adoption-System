import { Router, type Request, type Response } from "express";
import { db } from "../db.ts";

export const activityRouter = Router();

// GET activity log with optional search/filter
activityRouter.get("/", (req: Request, res: Response) => {
  try {
    const user = (req.query.user as string) || "";
    const action = (req.query.action as string) || "";
    const entry = (req.query.entry as string) || "";

    let sql = "SELECT * FROM activity WHERE 1=1";
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
    res.status(500).json({ success: false, error: err.message });
  }
});
