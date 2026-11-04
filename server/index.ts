import express, { type Request, type Response, type NextFunction } from "express";
import http from "node:http";
import https from "node:https";
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
import { logger } from "./logger.ts";

// 0. Load Production Configuration if present
function loadEnvFile(envPath: string) {
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}
loadEnvFile(path.resolve(process.cwd(), "deployment/config/.env.production"));
loadEnvFile(path.resolve(process.cwd(), ".env.production"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

// Initialize SQLite database, run schema migrations, hash passwords & verify audit chaining
initDatabase();

const app = express();
const PORT = Number(process.env.SERVER_PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const distPath = path.resolve(process.cwd(), "dist");
const pidFile = path.resolve(process.cwd(), "server/data/aods.pid");

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

// Intercept malformed JSON body errors and return structured HTTP 400 Bad Request
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err && (err.status === 400 || (err as any).statusCode === 400)) {
    res.status(400).json({
      success: false,
      error: "Malformed request payload: JSON syntax is invalid."
    });
    return;
  }
  next(err);
});

// 4. Session Authentication Middleware (Extracts from HttpOnly cookie or Authorization header)
app.use(authenticate);

// 5. Health Check
app.get("/api/health", (req: Request, res: Response) => {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https" || process.env.HTTPS_ENABLED === "true";
  res.json({
    status: "ok",
    service: "County Adoption Records API",
    version: "3.1.0",
    protocol: isSecure ? "https" : "http",
    https: isSecure,
    security: {
      auth: "Cookie (HttpOnly) & Token-based (PBKDF2 SHA-512)",
      csrf: "Anti-CSRF verification header enforced",
      rateLimiting: "5 attempts per 15-minute window",
      concurrency: "Optimistic Concurrency Control (OCC v-locking)",
      rbac: "Enforced (Administrator / Employee)",
      audit: "Tamper-evident cryptographic hash chain",
      encryption: "PBKDF2 salted password hashing",
      tls: isSecure ? "TLSv1.2/TLSv1.3 Active" : "Disabled (Plain HTTP)"
    },
    timestamp: new Date().toISOString()
  });
});

// Protect sensitive paths and database files from direct web exposure
app.use((req: Request, res: Response, next: NextFunction) => {
  const p = req.path.toLowerCase();
  if (
    p.includes("/server/") ||
    p.includes("/scripts/") ||
    p.includes("/deployment/") ||
    p.endsWith(".db") ||
    p.endsWith(".sqlite") ||
    p.endsWith(".env") ||
    p.endsWith(".log") ||
    p.endsWith(".ts")
  ) {
    res.status(403).json({ success: false, error: "Access denied: protected system resource." });
    return;
  }
  next();
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
  logger.info(`[AODS Server] Serving production frontend build from: ${distPath}`);
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
  logger.error(`[Unhandled Error] ${req.method} ${req.url}:`, err);
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
      logger.info(`[Security] Purged ${purged} expired session token(s).`);
    }
  } catch (err) {
    logger.error("[Security] Error cleaning up expired sessions:", err);
  }
}, 30 * 60 * 1000);

const httpsEnabled = process.env.HTTPS_ENABLED === "true";
const HTTP_PORT = Number(process.env.SERVER_PORT || 3001);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 3443);

let httpsServer: https.Server | null = null;
let httpServer: http.Server | null = null;

const certPath = path.resolve(process.cwd(), process.env.TLS_CERT_PATH || "server/certs/server.crt");
const keyPath = path.resolve(process.cwd(), process.env.TLS_KEY_PATH || "server/certs/server.key");
const caPath = path.resolve(process.cwd(), process.env.TLS_CA_PATH || "server/certs/aods-ca.crt");

if (httpsEnabled && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    const tlsOptions: https.ServerOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      ca: fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined
    };

    httpsServer = https.createServer(tlsOptions, app);
    httpsServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`[AODS Server] Fatal: HTTPS port ${HTTPS_PORT} is already in use by another process.`);
        process.exit(1);
      }
      logger.error("[AODS Server] HTTPS server error:", err);
    });
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      logger.info(`[AODS Server] HTTPS server active on https://${HOST === "0.0.0.0" ? "localhost" : HOST}:${HTTPS_PORT}`);
      logger.info(`[AODS Server] Multi-user LAN interface active on 0.0.0.0:${HTTPS_PORT} (Process PID: ${process.pid})`);
      try { fs.writeFileSync(pidFile, String(process.pid), "utf8"); } catch {}
    });

    // Create HTTP redirect app to redirect all plain HTTP requests to HTTPS
    const redirectApp = express();
    redirectApp.use((req: Request, res: Response) => {
      const hostHeader = req.headers.host || "localhost";
      const hostname = hostHeader.split(":")[0];
      const redirectUrl = `https://${hostname}:${HTTPS_PORT}${req.url}`;
      // HTTP 308 Permanent Redirect strictly preserves HTTP method (POST/PUT/DELETE) and request body
      res.redirect(308, redirectUrl);
    });

    httpServer = http.createServer(redirectApp);
    httpServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`[AODS Server] Fatal: HTTP redirect port ${HTTP_PORT} is already in use by another process.`);
        process.exit(1);
      }
      logger.error("[AODS Server] HTTP redirect server error:", err);
    });
    httpServer.listen(HTTP_PORT, HOST, () => {
      logger.info(`[AODS Server] HTTP redirect service running on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${HTTP_PORT} -> https://${HOST === "0.0.0.0" ? "localhost" : HOST}:${HTTPS_PORT}`);
    });
  } catch (err) {
    logger.error("[AODS Server] Failed to initialize HTTPS server with certificates:", err);
    logger.warn(`[AODS Server] Falling back to plain HTTP on port ${HTTP_PORT}`);
    httpServer = http.createServer(app);
    httpServer.on("error", (err: any) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`[AODS Server] Fatal: HTTP port ${HTTP_PORT} is already in use by another process.`);
        process.exit(1);
      }
      logger.error("[AODS Server] HTTP server error:", err);
    });
    httpServer.listen(HTTP_PORT, HOST, () => {
      logger.info(`[AODS Server] Fallback HTTP running on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${HTTP_PORT}`);
      try { fs.writeFileSync(pidFile, String(process.pid), "utf8"); } catch {}
    });
  }
} else {
  if (httpsEnabled) {
    logger.warn(`[AODS Server] HTTPS_ENABLED=true but certificates not found at ${certPath} / ${keyPath}. Starting plain HTTP.`);
  }
  httpServer = http.createServer(app);
  httpServer.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`[AODS Server] Fatal: HTTP port ${HTTP_PORT} is already in use by another process.`);
      process.exit(1);
    }
    logger.error("[AODS Server] HTTP server error:", err);
  });
  httpServer.listen(HTTP_PORT, HOST, () => {
    logger.info(`[AODS Server] Adoption Records API running on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${HTTP_PORT}`);
    logger.info(`[AODS Server] Multi-user LAN interface active on 0.0.0.0:${HTTP_PORT} (Process PID: ${process.pid})`);
    try { fs.writeFileSync(pidFile, String(process.pid), "utf8"); } catch {}
  });
}

// 9. Graceful Shutdown & Process Recovery
let isShuttingDown = false;
function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`[Shutdown] Received ${signal}. Closing servers gracefully...`);

  const closePromises: Promise<void>[] = [];
  if (httpsServer) {
    closePromises.push(new Promise((resolve) => httpsServer!.close(() => resolve())));
  }
  if (httpServer) {
    closePromises.push(new Promise((resolve) => httpServer!.close(() => resolve())));
  }

  Promise.all(closePromises).then(() => {
    logger.info(`[Shutdown] All network listeners closed successfully.`);
    try {
      if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8").trim() === String(process.pid)) {
        fs.unlinkSync(pidFile);
      }
    } catch {}
    logger.info(`[Shutdown] County Adoption Records System stopped cleanly.`);
    process.exit(0);
  });

  // Force close after 10 seconds if lingering sockets block exit
  setTimeout(() => {
    logger.warn(`[Shutdown] Forcing exit after timeout.`);
    try {
      if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, "utf8").trim() === String(process.pid)) {
        fs.unlinkSync(pidFile);
      }
    } catch {}
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error("[Process] Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  logger.error("[Process] Unhandled Rejection:", reason);
});
