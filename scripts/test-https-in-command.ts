import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

// Set environment for test run
process.env.NODE_ENV = "production";
process.env.HTTPS_ENABLED = "true";
process.env.HTTPS_PORT = "3443";
process.env.SERVER_PORT = "3001";
process.env.HOST = "127.0.0.1";

const CA_PATH = path.resolve(process.cwd(), "server/certs/aods-ca.crt");
const caCert = fs.readFileSync(CA_PATH);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testHttpRedirect(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:3001/api/health", (res) => {
      console.log(`[HTTP Redirect Test] Status: ${res.statusCode}`);
      console.log(`[HTTP Redirect Test] Location Header: ${res.headers.location}`);
      if (res.statusCode === 301 && res.headers.location?.startsWith("https://")) {
        console.log("  PASS: HTTP 301 Redirect to HTTPS verified.");
        resolve(true);
      } else {
        console.error("  FAIL: Unexpected status or location:", res.statusCode, res.headers.location);
        resolve(false);
      }
    });
    req.on("error", (err) => {
      console.error("  FAIL: HTTP request error:", err);
      resolve(false);
    });
  });
}

async function testHttpsHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: "127.0.0.1",
      port: 3443,
      path: "/api/health",
      method: "GET",
      ca: caCert,
      rejectUnauthorized: true,
      servername: "localhost"
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          console.log(`[HTTPS Health Test] Status: ${res.statusCode}, Protocol: ${json.protocol}, HTTPS: ${json.https}`);
          if (res.statusCode === 200 && json.status === "ok" && json.https === true) {
            console.log("  PASS: Real HTTPS connection with Root CA validation verified.");
            resolve(true);
          } else {
            console.error("  FAIL: Health check response mismatch:", json);
            resolve(false);
          }
        } catch (e) {
          console.error("  FAIL: Failed to parse health JSON:", e, data);
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.error("  FAIL: HTTPS request error:", err);
      resolve(false);
    });

    req.end();
  });
}

async function testCookieFlagsAndAuth(): Promise<{ pass: boolean; token?: string }> {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      employee_id: "ADM-001",
      password: "countyrecords"
    });

    const options = {
      hostname: "127.0.0.1",
      port: 3443,
      path: "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      ca: caCert,
      rejectUnauthorized: true,
      servername: "localhost"
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const setCookie = res.headers["set-cookie"] || [];
        console.log(`[HTTPS Auth & Cookie Test] Status: ${res.statusCode}`);
        console.log(`[HTTPS Auth & Cookie Test] Set-Cookie:`, setCookie);

        const cookieStr = setCookie.join("; ");
        const hasHttpOnly = /httponly/i.test(cookieStr);
        const hasSecure = /secure/i.test(cookieStr);
        const hasSameSite = /samesite=lax/i.test(cookieStr);

        console.log(`  Cookie Flags: HttpOnly=${hasHttpOnly}, Secure=${hasSecure}, SameSite=Lax=${hasSameSite}`);

        try {
          const json = JSON.parse(data);
          console.log(`  Login Result: success=${json.success}, mustChangePassword=${json.mustChangePassword}`);

          if (hasHttpOnly && hasSecure && hasSameSite && json.success) {
            console.log("  PASS: Cookie security flags (HttpOnly, Secure, SameSite=Lax) verified.");
            resolve({ pass: true, token: json.token });
          } else {
            console.error("  FAIL: Cookie flags or login mismatch.");
            resolve({ pass: false });
          }
        } catch (e) {
          console.error("  FAIL: JSON parse error:", e);
          resolve({ pass: false });
        }
      });
    });

    req.on("error", (err) => {
      console.error("  FAIL: HTTPS login request error:", err);
      resolve({ pass: false });
    });

    req.write(payload);
    req.end();
  });
}

async function testPasswordRotation(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    // 1. First test rejection of short password
    const payload = JSON.stringify({
      currentPassword: "countyrecords",
      newPassword: "short"
    });

    const options = {
      hostname: "127.0.0.1",
      port: 3443,
      path: "/api/auth/change-password",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Authorization": `Bearer ${token}`
      },
      ca: caCert,
      rejectUnauthorized: true,
      servername: "localhost"
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const json = JSON.parse(data);
        console.log(`[Password Policy Test] Short password rejection status: ${res.statusCode}, error: ${json.error}`);
        if (res.statusCode === 400 && json.error.includes("12 characters")) {
          console.log("  PASS: Password policy validation (< 12 chars rejected) verified.");
          resolve(true);
        } else {
          console.error("  FAIL: Password policy check failed:", json);
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.error("  FAIL: Password rotation request error:", err);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

async function testStaticAssetsOverHttps(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: "127.0.0.1",
      port: 3443,
      path: "/",
      method: "GET",
      ca: caCert,
      rejectUnauthorized: true,
      servername: "localhost"
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        console.log(`[HTTPS Static Asset Test] Status: ${res.statusCode}, Content-Length: ${data.length}`);
        if (res.statusCode === 200 && data.includes("<title>AODS")) {
          console.log("  PASS: Frontend SPA index.html served cleanly over HTTPS.");
          resolve(true);
        } else {
          console.error("  FAIL: Frontend index.html content unexpected:", data.slice(0, 100));
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.error("  FAIL: Static asset HTTPS error:", err);
      resolve(false);
    });

    req.end();
  });
}

async function testProtectedResourcesBlocked(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: "127.0.0.1",
      port: 3443,
      path: "/server/data/adoption_records.db",
      method: "GET",
      ca: caCert,
      rejectUnauthorized: true,
      servername: "localhost"
    };

    const req = https.request(options, (res) => {
      console.log(`[Protected Resource Test] Status: ${res.statusCode}`);
      if (res.statusCode === 403) {
        console.log("  PASS: Database direct network access blocked with HTTP 403.");
        resolve(true);
      } else {
        console.error("  FAIL: Database path not blocked:", res.statusCode);
        resolve(false);
      }
    });

    req.on("error", (err) => {
      console.error("  FAIL: Protected resource request error:", err);
      resolve(false);
    });

    req.end();
  });
}

async function run() {
  console.log("Starting server in-process...");
  // Import server/index.ts to start servers
  await import("../server/index.ts");

  // Wait 1 second for listeners to bind
  await sleep(1500);

  console.log("==================================================================");
  console.log("  AODS LIVE HTTPS & SECURITY VERIFICATION SUITE");
  console.log("==================================================================");

  const t1 = await testHttpRedirect();
  const t2 = await testHttpsHealth();
  const t3 = await testCookieFlagsAndAuth();
  const t4 = t3.token ? await testPasswordRotation(t3.token) : false;
  const t5 = await testStaticAssetsOverHttps();
  const t6 = await testProtectedResourcesBlocked();

  console.log("==================================================================");
  if (t1 && t2 && t3.pass && t4 && t5 && t6) {
    console.log("SUCCESS: ALL 6 VERIFICATION CHECKS PASSED OVER LIVE HTTPS!");
    process.exit(0);
  } else {
    console.error("FAILURE: SOME CHECKS FAILED.");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
