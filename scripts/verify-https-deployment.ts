import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const CA_PATH = path.resolve(process.cwd(), "server/certs/aods-ca.crt");
const caCert = fs.readFileSync(CA_PATH);

async function testHttpRedirect(): Promise<boolean> {
  return new Promise((resolve) => {
    http.get("http://localhost:3001/api/health", (res) => {
      console.log(`[HTTP Redirect Test] Status: ${res.statusCode}`);
      console.log(`[HTTP Redirect Test] Location Header: ${res.headers.location}`);
      if (res.statusCode === 301 && res.headers.location?.startsWith("https://")) {
        console.log("  PASS: HTTP 301 Redirect to HTTPS verified.");
        resolve(true);
      } else {
        console.error("  FAIL: Unexpected status or location:", res.statusCode, res.headers.location);
        resolve(false);
      }
    }).on("error", (err) => {
      console.error("  FAIL: HTTP request error:", err);
      resolve(false);
    });
  });
}

async function testHttpsHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port: 3443,
      path: "/api/health",
      method: "GET",
      ca: caCert,
      rejectUnauthorized: true
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          console.log(`[HTTPS Health Test] Status: ${res.statusCode}, Protocol: ${json.protocol}, HTTPS: ${json.https}`);
          console.log(`[HTTPS Health Test] TLS Cipher: ${(res.socket as any).getCipher()?.name}`);
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

async function testCookieFlagsAndAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      employee_id: "ADM-001",
      password: "countyrecords"
    });

    const options = {
      hostname: "localhost",
      port: 3443,
      path: "/api/auth/login",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      ca: caCert,
      rejectUnauthorized: true
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
            resolve(true);
          } else {
            console.error("  FAIL: Cookie flags or login mismatch.");
            resolve(false);
          }
        } catch (e) {
          console.error("  FAIL: JSON parse error:", e);
          resolve(false);
        }
      });
    });

    req.on("error", (err) => {
      console.error("  FAIL: HTTPS login request error:", err);
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

async function testStaticAssetsOverHttps(): Promise<boolean> {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port: 3443,
      path: "/",
      method: "GET",
      ca: caCert,
      rejectUnauthorized: true
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

async function run() {
  console.log("==================================================================");
  console.log("  AODS HTTPS & DEPLOYMENT VERIFICATION TEST SUITE");
  console.log("==================================================================");

  const t1 = await testHttpRedirect();
  const t2 = await testHttpsHealth();
  const t3 = await testCookieFlagsAndAuth();
  const t4 = await testStaticAssetsOverHttps();

  console.log("==================================================================");
  if (t1 && t2 && t3 && t4) {
    console.log("ALL HTTPS VERIFICATION CHECKS PASSED!");
  } else {
    console.error("SOME CHECKS FAILED.");
    process.exit(1);
  }
}

run();

