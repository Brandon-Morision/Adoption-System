import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "production";
process.env.HTTPS_ENABLED = "true";
process.env.HTTPS_PORT = "3443";
process.env.SERVER_PORT = "3001";
process.env.HOST = "127.0.0.1";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.TEST_URL = "https://127.0.0.1:3443/api";

async function main() {
  console.log("Initializing in-process test server...");
  await import("../server/index.ts");
  await new Promise((r) => setTimeout(r, 1500));

  console.log("Running main test suite against HTTPS endpoint...");
  await import("./suite.ts");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

