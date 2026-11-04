import { Router, type Request, type Response } from "express";
import { db } from "../db.ts";

export const usersRouter = Router();

// GET all users
usersRouter.get("/", (req: Request, res: Response) => {
  try {
    const users = db.prepare("SELECT id, name, employee_id, role, status, last_login, email FROM users ORDER BY id ASC").all();
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST add user
usersRouter.post("/", (req: Request, res: Response) => {
  try {
    const { name, employee_id, role, email, password } = req.body;
    if (!name || !employee_id) {
      return res.status(400).json({ success: false, error: "Name and Employee ID are required" });
    }

    const stmt = db.prepare(`
      INSERT INTO users (name, employee_id, role, status, last_login, email, password)
      VALUES (?, ?, ?, 'Active', 'Never', ?, ?)
    `);

    stmt.run(name, employee_id, role || "Employee", email || "", password || "countyrecords");
    const newUser = db.prepare("SELECT id, name, employee_id, role, status, last_login, email FROM users WHERE employee_id = ?").get(employee_id);
    res.status(201).json({ success: true, user: newUser });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update user
usersRouter.put("/:employee_id", (req: Request, res: Response) => {
  try {
    const empId = req.params.employee_id;
    const { name, role, status, email } = req.body;

    const stmt = db.prepare(`
      UPDATE users SET
        name = COALESCE(?, name),
        role = COALESCE(?, role),
        status = COALESCE(?, status),
        email = COALESCE(?, email)
      WHERE employee_id = ?
    `);

    stmt.run(name ?? null, role ?? null, status ?? null, email ?? null, empId);
    const updated = db.prepare("SELECT id, name, employee_id, role, status, last_login, email FROM users WHERE employee_id = ?").get(empId);
    res.json({ success: true, user: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
