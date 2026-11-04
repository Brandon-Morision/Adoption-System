import fs from "node:fs";
import path from "node:path";

const logDir = path.resolve(process.cwd(), process.env.LOG_DIR || "server/data/logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFile = path.join(logDir, "server.log");
const MAX_LOG_SIZE_BYTES = (parseInt(process.env.MAX_LOG_SIZE_MB || "10", 10)) * 1024 * 1024;
const MAX_BACKUP_FILES = parseInt(process.env.MAX_LOG_FILES || "3", 10);

/**
 * Rotate log files if file size exceeds configured threshold.
 */
function rotateLogsIfNeeded() {
  try {
    if (!fs.existsSync(logFile)) return;
    const stats = fs.statSync(logFile);
    if (stats.size < MAX_LOG_SIZE_BYTES) return;

    for (let i = MAX_BACKUP_FILES - 1; i >= 1; i--) {
      const oldFile = `${logFile}.${i}`;
      const nextFile = `${logFile}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        if (i === MAX_BACKUP_FILES - 1 && fs.existsSync(nextFile)) {
          fs.unlinkSync(nextFile);
        }
        fs.renameSync(oldFile, nextFile);
      }
    }

    fs.renameSync(logFile, `${logFile}.1`);
  } catch (err) {
    console.error("[Logger] Failed to rotate log file:", err);
  }
}

function writeEntry(level: "INFO" | "WARN" | "ERROR", message: string, meta?: any) {
  const timestamp = new Date().toISOString();
  let line = `[${timestamp}] [${level}] ${message}`;
  if (meta !== undefined) {
    if (meta instanceof Error) {
      line += `\n  Stack: ${meta.stack || meta.message}`;
    } else if (typeof meta === "object") {
      try {
        line += `\n  Meta: ${JSON.stringify(meta)}`;
      } catch {
        line += `\n  Meta: [Unserializable Object]`;
      }
    } else {
      line += ` ${meta}`;
    }
  }

  // Print to stdout / stderr
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }

  // Append to disk log file
  try {
    rotateLogsIfNeeded();
    fs.appendFileSync(logFile, line + "\n", "utf8");
  } catch (err) {
    console.error("[Logger] Error writing to server.log:", err);
  }
}

export const logger = {
  info(message: string, meta?: any) {
    writeEntry("INFO", message, meta);
  },
  warn(message: string, meta?: any) {
    writeEntry("WARN", message, meta);
  },
  error(message: string, meta?: any) {
    writeEntry("ERROR", message, meta);
  },
  getLogPath(): string {
    return logFile;
  }
};

