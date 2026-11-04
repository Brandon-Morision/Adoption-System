import { Router, type Request, type Response } from "express";
import { db } from "../db.ts";

export const authRouter = Router();

// POST login
authRouter.post("/login", (req: Request, res: Response) => {
  try {
    const { employee_id, password } = req.body;
    if (!employee_id || !password) {
      return res.status(400).json({ success: false, error: "Employee ID and password required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE employee_id = ?").get(employee_id) as any;
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid Employee ID or credentials" });
    }

    if (user.password !== password) {
      return res.status(401).json({ success: false, error: "Invalid password" });
    }

    // Update last login
    const now = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    db.prepare("UPDATE users SET last_login = ? WHERE id = ?").run(`Today, ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`, user.id);

    // Audit log
    db.prepare(`
      INSERT INTO activity (timestamp, user_name, action, record_no, description)
      VALUES (?, ?, 'Login', '—', 'Secure session started')
    `).run(now, user.name);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        employee_id: user.employee_id,
        role: user.role,
        email: user.email,
        status: user.status
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET current session user profile
authRouter.get("/me", (req: Request, res: Response) => {
  try {
    const user = db.prepare("SELECT id, name, employee_id, role, status, email, last_login FROM users WHERE employee_id = 'ADM-001'").get();
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
