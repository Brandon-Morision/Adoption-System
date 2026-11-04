process.env.NODE_ENV = "production";
process.env.HTTPS_ENABLED = "true";
process.env.HTTPS_PORT = "3443";
process.env.SERVER_PORT = "3001";
process.env.HOST = "127.0.0.1";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
process.env.TEST_URL = "https://127.0.0.1:3443/api";

async function main() {
  await import("../server/index.ts");
  await new Promise((r) => setTimeout(r, 1500));
  await import("./test-multiuser-concurrency.ts");
}

main().catch((err) => {
  console.error("Concurrency test failed:", err);
  process.exit(1);
});

