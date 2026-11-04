import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { initDatabase } from "./db.ts";
import { authenticate } from "./middleware/auth.ts";
import { cleanupExpiredSessions } from "./security.ts";
import { recordsRouter } from "./routes/records.ts";
import { reportsRouter } from "./routes/reports.ts";
import { usersRouter } from "./routes/users.ts";
import { activityRouter } from "./routes/activity.ts";
import { authRouter } from "./routes/auth.ts";
import { backupRouter } from "./routes/backup.ts";

// Initialize SQLite database, run schema migrations, hash passwords & verify audit chaining
initDatabase();

const app = express();
const PORT = Number(process.env.SERVER_PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const distPath = path.resolve(process.cwd(), "dist");

// 1. Security Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "0");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// 2. CORS Configuration for multi-client LAN access
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:8443", "http://127.0.0.1:8443", "http://localhost:5173", "http://localhost:3001"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server) or from LAN clients
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Dev & LAN permissive with credentials
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-auth-token", "x-requested-with"]
  })
);

// 3. Body & Cookie Parsing
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// 4. Session Authentication Middleware (Extracts from HttpOnly cookie or Authorization header)
app.use(authenticate);

// 5. Health Check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "County Adoption Records API",
    version: "3.0.0",
    security: {
      auth: "Cookie (HttpOnly) & Token-based (PBKDF2 SHA-512)",
      csrf: "Anti-CSRF verification header enforced",
      rateLimiting: "5 attempts per 15-minute window",
      concurrency: "Optimistic Concurrency Control (OCC v-locking)",
      rbac: "Enforced (Administrator / Employee)",
      audit: "Tamper-evident cryptographic hash chain",
      encryption: "PBKDF2 salted password hashing"
    },
    timestamp: new Date().toISOString()
  });
});

// 6. Mount Sub-routers
app.use("/api/auth", authRouter);
app.use("/api/records", recordsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/activity", activityRouter);
app.use("/api/backup", backupRouter);

// 7. Production Static Asset Serving & SPA Routing Fallback
if (fs.existsSync(distPath)) {
  console.log(`[AODS Server] Serving production frontend build from: ${distPath}`);
  app.use(express.static(distPath));

  app.use((req: Request, res: Response) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(distPath, "index.html"));
      return;
    }
    if (req.path.startsWith("/api")) {
      res.status(404).json({ success: false, error: `API route ${req.method} ${req.originalUrl} not found.` });
      return;
    }
    res.status(404).send("Not Found");
  });
} else {
  // 404 Route Handler for undefined API routes in development
  app.use((req: Request, res: Response) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ success: false, error: `API route ${req.method} ${req.originalUrl} not found.` });
      return;
    }
    res.status(404).send("Not Found");
  });
}

// 8. Global Centralized Error Handling Middleware (prevents leaking internal stack traces)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Unhandled Error] ${req.method} ${req.url}:`, err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "An unexpected error occurred while processing the request."
  });
});

// Periodic expired session purge every 30 minutes
setInterval(() => {
  try {
    const purged = cleanupExpiredSessions();
    if (purged > 0) {
      console.log(`[Security] Purged ${purged} expired session token(s).`);
    }
  } catch (err) {
    console.error("[Security] Error cleaning up expired sessions:", err);
  }
}, 30 * 60 * 1000);

app.listen(PORT, HOST, () => {
  console.log(`[AODS Server] Adoption Records API running on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  console.log(`[AODS Server] Multi-user LAN interface active on 0.0.0.0:${PORT}`);
});
