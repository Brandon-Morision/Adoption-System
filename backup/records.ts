import { Router, type Request, type Response } from "express";
import { db } from "../db.ts";

export const recordsRouter = Router();

// GET all records with optional filtering & pagination
recordsRouter.get("/", (req: Request, res: Response) => {
  try {
    const q = ((req.query.q as string) || "").trim();
    const sex = (req.query.sex as string) || "";
    const country = (req.query.country as string) || "";
    const court = (req.query.court as string) || "";
    const status = (req.query.status as string) || "Registered";

    let sql = "SELECT * FROM records WHERE status = ?";
    const params: any[] = [status];

    if (q) {
      sql += " AND (no LIKE ? OR name LIKE ? OR adopters LIKE ?)";
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern);
    }

    if (sex) {
      sql += " AND sex = ?";
      params.push(sex);
    }

    if (country) {
      sql += " AND country = ?";
      params.push(country);
    }

    if (court) {
      sql += " AND court = ?";
      params.push(court);
    }

    sql += " ORDER BY id DESC";

    const rows = db.prepare(sql).all(...params);
    res.json({
      success: true,
      total: rows.length,
      records: rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single record by entry number
recordsRouter.get("/:no", (req: Request, res: Response) => {
  try {
    const no = req.params.no;
    const record = db.prepare("SELECT * FROM records WHERE no = ?").get(no);

    if (!record) {
      return res.status(404).json({ success: false, error: "Record not found" });
    }

    // Optionally log view
    const user = (req.query.user as string) || "Jane Mwangi";
    const now = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    db.prepare(`
      INSERT INTO activity (timestamp, user_name, action, record_no, description)
      VALUES (?, ?, 'Viewed Record', ?, ?)
    `).run(now, user, `#${no}`, "Record details viewed");

    res.json({ success: true, record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST new record
recordsRouter.post("/", (req: Request, res: Response) => {
  try {
    const body = req.body;
    let entryNo = body.no;

    // If no entry number provided, generate next consecutive number
    if (!entryNo) {
      const maxRow = db.prepare("SELECT MAX(CAST(no AS INTEGER)) as max_no FROM records").get() as { max_no: number } | undefined;
      const nextNum = (maxRow?.max_no || 1248) + 1;
      entryNo = nextNum.toString().padStart(6, "0");
    }

    const stmt = db.prepare(`
      INSERT INTO records (
        no, name, dob, country, sex, adopters, adopters_address, adopters_occupation,
        adoption, court, entered, officer, designation, signature, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Registered')
    `);

    stmt.run(
      entryNo,
      body.name || "",
      body.dob || "",
      body.country || "Kenya",
      body.sex || "Female",
      body.adopters || "",
      body.adopters_address || "",
      body.adopters_occupation || "",
      body.adoption || "",
      body.court || "High Court",
      body.entered || new Date().toISOString().split("T")[0],
      body.officer || "Jane Mwangi",
      body.designation || "Registrar, County Adoption Office",
      body.signature || "J. Mwangi"
    );

    // Log in audit trail
    const user = body.officer || "Jane Mwangi";
    const now = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    db.prepare(`
      INSERT INTO activity (timestamp, user_name, action, record_no, description)
      VALUES (?, ?, 'Created Record', ?, ?)
    `).run(now, user, `#${entryNo}`, `New adoption record created for ${body.name}`);

    const newRecord = db.prepare("SELECT * FROM records WHERE no = ?").get(entryNo);
    res.status(201).json({ success: true, record: newRecord });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update record
recordsRouter.put("/:no", (req: Request, res: Response) => {
  try {
    const no = req.params.no;
    const body = req.body;

    const existing = db.prepare("SELECT * FROM records WHERE no = ?").get(no);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Record not found" });
    }

    const stmt = db.prepare(`
      UPDATE records SET
        name = COALESCE(?, name),
        dob = COALESCE(?, dob),
        country = COALESCE(?, country),
        sex = COALESCE(?, sex),
        adopters = COALESCE(?, adopters),
        adopters_address = COALESCE(?, adopters_address),
        adopters_occupation = COALESCE(?, adopters_occupation),
        adoption = COALESCE(?, adoption),
        court = COALESCE(?, court),
        entered = COALESCE(?, entered),
        officer = COALESCE(?, officer),
        designation = COALESCE(?, designation),
        signature = COALESCE(?, signature),
        updated_at = CURRENT_TIMESTAMP
      WHERE no = ?
    `);

    stmt.run(
      body.name ?? null,
      body.dob ?? null,
      body.country ?? null,
      body.sex ?? null,
      body.adopters ?? null,
      body.adopters_address ?? null,
      body.adopters_occupation ?? null,
      body.adoption ?? null,
      body.court ?? null,
      body.entered ?? null,
      body.officer ?? null,
      body.designation ?? null,
      body.signature ?? null,
      no
    );

    // Audit log
    const user = body.officer || "Jane Mwangi";
    const now = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    db.prepare(`
      INSERT INTO activity (timestamp, user_name, action, record_no, description)
      VALUES (?, ?, 'Updated Record', ?, ?)
    `).run(now, user, `#${no}`, `Record #${no} details updated`);

    const updated = db.prepare("SELECT * FROM records WHERE no = ?").get(no);
    res.json({ success: true, record: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST archive record
recordsRouter.post("/:no/archive", (req: Request, res: Response) => {
  try {
    const no = req.params.no;
    db.prepare("UPDATE records SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE no = ?").run(no);

    const user = (req.body.user as string) || "Jane Mwangi";
    const now = new Date().toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    });
    db.prepare(`
      INSERT INTO activity (timestamp, user_name, action, record_no, description)
      VALUES (?, ?, 'Archived Record', ?, ?)
    `).run(now, user, `#${no}`, `Record #${no} archived`);

    res.json({ success: true, message: `Record #${no} archived successfully` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
