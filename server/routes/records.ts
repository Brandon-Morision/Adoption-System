import { Router, type Request, type Response } from "express";
import { db, runTransaction } from "../db.ts";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.ts";
import { validateRecordInput } from "../validation.ts";
import { recordActivity } from "../audit.ts";

export const recordsRouter = Router();

// Apply authentication to all adoption records endpoints
recordsRouter.use(requireAuth);

// GET /api/records - Retrieve records with search and filtering
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

    if (sex && (sex === "Female" || sex === "Male")) {
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
    console.error("[Records] Query error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve adoption records." });
  }
});

// GET /api/records/:no - Retrieve single record by entry number
recordsRouter.get("/:no", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const no = req.params.no?.trim();

    if (!no) {
      return res.status(400).json({ success: false, error: "Entry number is required." });
    }

    const record = db.prepare("SELECT * FROM records WHERE no = ?").get(no);

    if (!record) {
      return res.status(404).json({ success: false, error: "Record not found." });
    }

    // Log view event in tamper-evident audit trail
    recordActivity({
      user_name: authReq.user?.name || "Authorized Officer",
      action: "Viewed Record",
      record_no: `#${no}`,
      description: `Record details viewed for #${no}`
    });

    res.json({ success: true, record });
  } catch (err: any) {
    console.error("[Records] Get error:", err);
    res.status(500).json({ success: false, error: "Failed to retrieve record details." });
  }
});

// POST /api/records - Create a new adoption record
recordsRouter.post("/", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { errors, data } = validateRecordInput(req.body, false);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(" ") });
    }

    // Atomic transaction for entry number allocation and insertion
    const createdRecord = runTransaction(() => {
      let entryNo = data.no;

      if (!entryNo) {
        const maxRow = db.prepare("SELECT MAX(CAST(no AS INTEGER)) as max_no FROM records").get() as
          | { max_no: number }
          | undefined;

        let nextNum = (maxRow?.max_no || 1248) + 1;
        entryNo = nextNum.toString().padStart(6, "0");

        // Guard against any collision
        while (db.prepare("SELECT id FROM records WHERE no = ?").get(entryNo)) {
          nextNum++;
          entryNo = nextNum.toString().padStart(6, "0");
        }
      } else {
        // Verify manual entry number uniqueness
        const existing = db.prepare("SELECT id FROM records WHERE no = ?").get(entryNo);
        if (existing) {
          throw new Error(`Record with entry number #${entryNo} already exists.`);
        }
      }

      const stmt = db.prepare(`
        INSERT INTO records (
          no, name, dob, country, sex, adopters, adopters_address, adopters_occupation,
          adoption, court, entered, officer, designation, signature, status, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Registered', 1)
      `);

      stmt.run(
        entryNo,
        data.name,
        data.dob,
        data.country,
        data.sex,
        data.adopters,
        data.adopters_address,
        data.adopters_occupation,
        data.adoption,
        data.court,
        data.entered,
        data.officer,
        data.designation,
        data.signature
      );

      // Record in tamper-evident audit trail
      recordActivity({
        user_name: authReq.user?.name || data.officer || "Authorized Officer",
        action: "Created Record",
        record_no: `#${entryNo}`,
        description: `New adoption record registered for ${data.name} (Adopters: ${data.adopters})`
      });

      return db.prepare("SELECT * FROM records WHERE no = ?").get(entryNo);
    });

    res.status(201).json({ success: true, record: createdRecord });
  } catch (err: any) {
    console.error("[Records] Create error:", err);
    res.status(400).json({ success: false, error: err.message || "Failed to create adoption record." });
  }
});

// PUT /api/records/:no - Update an existing record with Optimistic Concurrency Control (OCC)
recordsRouter.put("/:no", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const no = req.params.no?.trim();

    if (!no) {
      return res.status(400).json({ success: false, error: "Entry number is required." });
    }

    const { errors, data } = validateRecordInput(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join(" ") });
    }

    const clientVersion = req.body.version !== undefined ? Number(req.body.version) : undefined;

    const updatedRecord = runTransaction(() => {
      const existing = db.prepare("SELECT * FROM records WHERE no = ?").get(no) as any;
      if (!existing) {
        const notFoundErr: any = new Error(`Record #${no} was not found.`);
        notFoundErr.statusCode = 404;
        throw notFoundErr;
      }

      const currentVersion = existing.version !== undefined ? Number(existing.version) : 1;

      // Optimistic concurrency check: reject if another user updated this record first
      if (clientVersion !== undefined && clientVersion !== currentVersion) {
        const conflictErr: any = new Error(
          `Concurrency Conflict: Record #${no} was modified by another officer (expected v${clientVersion}, but database has v${currentVersion}). Please refresh and review latest changes before saving.`
        );
        conflictErr.statusCode = 409;
        conflictErr.currentRecord = existing;
        throw conflictErr;
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
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
        WHERE no = ?
      `);

      stmt.run(
        data.name || null,
        data.dob || null,
        data.country || null,
        data.sex || null,
        data.adopters || null,
        data.adopters_address || null,
        data.adopters_occupation || null,
        data.adoption || null,
        data.court || null,
        data.entered || null,
        data.officer || null,
        data.designation || null,
        data.signature || null,
        no
      );

      recordActivity({
        user_name: authReq.user?.name || "Authorized Officer",
        action: "Updated Record",
        record_no: `#${no}`,
        description: `Record details modified for #${no} (${data.name || (existing as any).name}) [v${currentVersion} -> v${currentVersion + 1}]`
      });

      return db.prepare("SELECT * FROM records WHERE no = ?").get(no);
    });

    res.json({ success: true, record: updatedRecord });
  } catch (err: any) {
    console.error("[Records] Update error:", err);
    const statusCode = err.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      error: err.message || "Failed to update adoption record.",
      currentRecord: err.currentRecord
    });
  }
});

// POST /api/records/:no/archive - Archive a record
recordsRouter.post("/:no/archive", (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const no = req.params.no?.trim();

    if (!no) {
      return res.status(400).json({ success: false, error: "Entry number is required." });
    }

    runTransaction(() => {
      const existing = db.prepare("SELECT * FROM records WHERE no = ?").get(no) as any;
      if (!existing) {
        throw new Error(`Record #${no} was not found.`);
      }

      if (existing.status === "Archived") {
        throw new Error(`Record #${no} is already archived.`);
      }

      db.prepare("UPDATE records SET status = 'Archived', updated_at = CURRENT_TIMESTAMP WHERE no = ?").run(no);

      recordActivity({
        user_name: authReq.user?.name || "Authorized Officer",
        action: "Archived Record",
        record_no: `#${no}`,
        description: `Adoption record #${no} (${existing.name}) was archived`
      });
    });

    res.json({ success: true, message: `Record #${no} archived successfully.` });
  } catch (err: any) {
    console.error("[Records] Archive error:", err);
    res.status(400).json({ success: false, error: err.message || "Failed to archive record." });
  }
});
