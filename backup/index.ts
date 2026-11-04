import express from "express";
import cors from "cors";
import { initDatabase } from "./db.ts";
import { recordsRouter } from "./routes/records.ts";
import { reportsRouter } from "./routes/reports.ts";
import { usersRouter } from "./routes/users.ts";
import { activityRouter } from "./routes/activity.ts";
import { authRouter } from "./routes/auth.ts";

// Initialize SQLite database
initDatabase();

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors());
app.use(express.json());

// API health route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "County Adoption Records API", timestamp: new Date().toISOString() });
});

// Mount Routes
app.use("/api/records", recordsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/users", usersRouter);
app.use("/api/activity", activityRouter);
app.use("/api/auth", authRouter);

app.listen(PORT, () => {
  console.log(`[AODS Server] Adoption Records API running on http://localhost:${PORT}`);
});
