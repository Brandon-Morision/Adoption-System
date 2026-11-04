import { db } from "../server/db.ts";

const BASE_URL = process.env.TEST_URL || "http://localhost:3001/api";

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err.message });
    console.error(`[FAIL] ${name}:`, err.message);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log("=================================================");
  console.log("COUNTY ADOPTION RECORDS SYSTEM - VERIFICATION SUITE");
  console.log("=================================================\n");

  let adminToken = "";
  let employeeToken = "";

  // 1. Health check
  await test("1. Health Endpoint returns operational status & security metadata", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert(res.ok, `Expected status 200, got ${res.status}`);
    const data = await res.json();
    assert(data.status === "ok", "Expected status ok");
    assert(data.security?.auth.includes("PBKDF2"), "Expected PBKDF2 in security info");
  });

  // 2. Authentication: Invalid login
  await test("2. Rejects invalid password with 401 Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: "ADM-001", password: "wrongpassword" })
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    const data = await res.json();
    assert(!data.success && data.error.includes("Invalid password"), "Expected invalid password error");
  });

  await test("3. Rejects invalid employee ID with 401 Unauthorized", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: "NON-EXISTENT", password: "countyrecords" })
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    const data = await res.json();
    assert(!data.success, "Expected failure for unknown employee ID");
  });

  await test("4. Rejects inactive employee account with 403 Forbidden", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: "EMP-031", password: "countyrecords" })
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const data = await res.json();
    assert(data.error.includes("inactive"), "Expected inactive account message");
  });

  // 3. Authentication: Valid Administrator login
  await test("5. Authenticates Administrator and returns secure cryptographic token", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: "ADM-001", password: "countyrecords" })
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, "Expected success: true");
    assert(typeof data.token === "string" && data.token.length >= 64, "Expected 64-character hex session token");
    assert(data.user.role === "Administrator", "Expected Administrator role");
    adminToken = data.token;
  });

  // 4. Authentication: Valid Employee login
  await test("6. Authenticates Employee user", async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: "EMP-014", password: "countyrecords" })
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.user.role === "Employee", "Expected Employee role");
    employeeToken = data.token;
  });

  // 5. Protected Endpoint verification: Unauthorized calls
  await test("7. Protected /api/records rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${BASE_URL}/records`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test("8. Protected /api/reports/kpis rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${BASE_URL}/reports/kpis`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test("9. Protected /api/auth/me rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${BASE_URL}/auth/me`);
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  // 6. Role-Based Access Control (RBAC) tests
  await test("10. Employee is denied access to /api/users with 403 Forbidden", async () => {
    const res = await fetch(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
    const data = await res.json();
    assert(data.error.includes("Administrator privileges are required"), "Expected RBAC permission error");
  });

  await test("11. Employee is denied creating a new user with 403 Forbidden", async () => {
    const res = await fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${employeeToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Test Hacker",
        employee_id: "EMP-999",
        role: "Administrator",
        password: "password123"
      })
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test("12. Administrator has access to /api/users (200 OK)", async () => {
    const res = await fetch(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.users) && data.users.length >= 4, "Expected array of users");
  });

  // 7. Input Validation tests
  await test("13. Rejects invalid adoption record input with missing name (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "",
        dob: "2020-01-01",
        sex: "Female",
        adopters: "Parent One and Two"
      })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.error.includes("Child full name is required"), "Expected validation error on child name");
  });

  await test("14. Rejects invalid sex value (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Valid Child",
        dob: "2020-01-01",
        sex: "UnknownSex",
        adopters: "Parent One and Two"
      })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // 8. CRUD Operations & Database Integrity
  let createdEntryNo = "";
  await test("15. Creates new adoption record with atomic auto entry number generation", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Mercy Chepngetich Koech",
        dob: "2021-04-18",
        country: "Kenya",
        sex: "Female",
        adopters: "Joseph and Faith Koech",
        adopters_address: "P.O. Box 770, Kericho",
        adopters_occupation: "Agricultural Specialist and Teacher",
        adoption: "2024-09-10",
        court: "High Court",
        entered: "2024-09-12",
        officer: "Jane Mwangi"
      })
    });
    assert(res.status === 201, `Expected 201 Created, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, "Expected success: true");
    assert(data.record && data.record.no, "Expected record with entry number");
    createdEntryNo = data.record.no;
    console.log(`    -> Generated Entry No: #${createdEntryNo}`);
  });

  await test("16. Rejects duplicate entry number registration (400 Bad Request)", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        no: createdEntryNo, // Duplicate
        name: "Duplicate Attempt",
        dob: "2020-01-01",
        country: "Kenya",
        sex: "Male",
        adopters: "Duplicate Parent",
        adoption: "2024-01-01",
        court: "Children’s Court"
      })
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.error.includes("already exists"), "Expected duplicate entry error message");
  });

  await test("17. Reads created record by entry number (/api/records/:no)", async () => {
    const res = await fetch(`${BASE_URL}/records/${createdEntryNo}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.record.name === "Mercy Chepngetich Koech", "Expected matching child name");
  });

  await test("18. Updates existing adoption record (/api/records/:no)", async () => {
    const res = await fetch(`${BASE_URL}/records/${createdEntryNo}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        adopters_occupation: "Senior Agricultural Specialist and Principal"
      })
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.record.adopters_occupation.includes("Senior"), "Expected updated occupation");
  });

  await test("19. Archives adoption record (/api/records/:no/archive)", async () => {
    const res = await fetch(`${BASE_URL}/records/${createdEntryNo}/archive`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
  });

  // 9. Tamper-Evident Cryptographic Audit Trail
  await test("20. Cryptographically verifies tamper-evident audit hash chain", async () => {
    const res = await fetch(`${BASE_URL}/activity/verify`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.auditIntegrity.valid === true, "Audit hash chain must be 100% valid");
    assert(data.auditIntegrity.totalChecked > 0, "Expected checked entries count > 0");
    console.log(`    -> Verified unbroken chain across ${data.auditIntegrity.totalChecked} audit entries`);
  });

  await test("21. Enforces audit immutability: rejects DELETE /api/activity with 405 Method Not Allowed", async () => {
    const res = await fetch(`${BASE_URL}/activity/1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 405, `Expected 405 Method Not Allowed, got ${res.status}`);
  });

  // 10. Database Backup & Restoration
  let createdBackupFile = "";
  await test("22. Creates integrity-verified SQLite database backup with SHA-256 companion", async () => {
    const res = await fetch(`${BASE_URL}/backup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    const data = await res.json();
    assert(data.backup && data.backup.filename, "Expected backup filename");
    assert(data.backup.integrity === "ok", "Expected SQLite PRAGMA integrity ok");
    assert(typeof data.backup.checksum === "string" && data.backup.checksum.length === 64, "Expected SHA-256 checksum");
    createdBackupFile = data.backup.filename;
    console.log(`    -> Created backup: ${createdBackupFile} (SHA-256: ${data.backup.checksum.slice(0, 16)}...)`);
  });

  await test("23. Lists available backups for Administrator", async () => {
    const res = await fetch(`${BASE_URL}/backup`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.backups) && data.backups.length >= 1, "Expected backup list");
  });

  await test("24. Employee is denied access to create backups with 403 Forbidden", async () => {
    const res = await fetch(`${BASE_URL}/backup`, {
      method: "POST",
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  // 11. Security Headers & CORS
  await test("25. Verifies HTTP security headers (nosniff, SAMEORIGIN, HSTS)", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert(res.headers.get("x-content-type-options") === "nosniff", "Expected nosniff header");
    assert(res.headers.get("x-frame-options") === "SAMEORIGIN", "Expected SAMEORIGIN header");
    assert(res.headers.get("strict-transport-security")?.includes("max-age"), "Expected HSTS header");
  });

  // 12. Logout & Token Invalidation
  await test("26. Logs out employee and invalidates session token", async () => {
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert(logoutRes.ok, `Expected 200 on logout, got ${logoutRes.status}`);

    // Verify token is now rejected
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    assert(meRes.status === 401, `Expected 401 after logout, got ${meRes.status}`);
  });

  // 13. Multi-User LAN Concurrency Control (OCC)
  let testRecordNo = "";
  await test("27. Multi-User OCC: Detects conflicting concurrent record edits and returns 409 Conflict", async () => {
    // Create record with version 1
    const createRes = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "OCC Concurrency Test Child",
        dob: "2021-05-15",
        sex: "Female",
        adopters: "James & Mercy Mwangi",
        adopters_address: "P.O. Box 777, Nairobi",
        adopters_occupation: "Civil Servants",
        adoption: "2024-09-01",
        court: "High Court",
        entered: "2024-09-02",
        officer: "Jane Mwangi",
        designation: "Registrar, County Adoption Office",
        signature: "J. Mwangi"
      })
    });
    assert(createRes.status === 201, `Expected 201, got ${createRes.status}`);
    const created = await createRes.json();
    testRecordNo = created.record.no;
    const initialVersion = created.record.version || 1;
    assert(initialVersion === 1, `Expected initial version 1, got ${initialVersion}`);

    // Workstation A updates record with version 1 -> advances version to 2
    const updateResA = await fetch(`${BASE_URL}/records/${testRecordNo}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "OCC Child Updated by Workstation A",
        version: initialVersion
      })
    });
    assert(updateResA.ok, `Expected 200, got ${updateResA.status}`);
    const updatedA = await updateResA.json();
    assert(updatedA.record.version === 2, `Expected version 2 after Workstation A update, got ${updatedA.record.version}`);

    // Workstation B simultaneously attempts update with stale version 1 -> should fail with 409 Conflict
    const updateResB = await fetch(`${BASE_URL}/records/${testRecordNo}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "OCC Child Overwrite by Workstation B (Stale)",
        version: initialVersion // Stale version 1!
      })
    });
    assert(updateResB.status === 409, `Expected 409 Conflict, got ${updateResB.status}`);
    const conflictData = await updateResB.json();
    assert(conflictData.error.includes("Concurrency Conflict"), "Expected concurrency conflict error message");
    assert(conflictData.currentRecord.version === 2, "Expected currentRecord in response with version 2");
  });

  await test("28. Multi-User OCC: Successfully updates after refreshing to latest version (v2 -> v3)", async () => {
    // Workstation B refreshes to v2 and resubmits
    const updateResBResolved = await fetch(`${BASE_URL}/records/${testRecordNo}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "OCC Child Updated by Workstation B (Resolved)",
        version: 2
      })
    });
    assert(updateResBResolved.ok, `Expected 200, got ${updateResBResolved.status}`);
    const resolvedData = await updateResBResolved.json();
    assert(resolvedData.record.version === 3, `Expected version 3 after resolution, got ${resolvedData.record.version}`);
  });

  // 14. HttpOnly Cookie & Anti-CSRF Verification
  let cookieHeader = "";
  await test("29. Login sets HttpOnly and SameSite session cookie", async () => {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: "ADM-001", password: "countyrecords" })
    });
    assert(loginRes.ok, `Expected 200, got ${loginRes.status}`);
    const rawSetCookie = loginRes.headers.get("set-cookie") || "";
    assert(rawSetCookie.includes("aods_session="), "Expected aods_session cookie in set-cookie");
    assert(rawSetCookie.toLowerCase().includes("httponly"), "Expected HttpOnly flag in cookie");
    assert(rawSetCookie.toLowerCase().includes("samesite=lax"), "Expected SameSite=Lax flag in cookie");

    // Extract cookie value for subsequent test
    const match = rawSetCookie.match(/aods_session=([^;]+)/);
    assert(!!match, "Expected token match in cookie");
    cookieHeader = `aods_session=${match![1]}`;
  });

  await test("30. Authenticates browser requests using HttpOnly cookie without Bearer header", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      headers: {
        Cookie: cookieHeader
      }
    });
    assert(res.ok, `Expected 200 via cookie auth, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.records), "Expected records array via cookie auth");
  });

  await test("31. Rejects cookie-authenticated mutating request without Anti-CSRF header (403 Forbidden)", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json"
        // Intentionally omit X-Requested-With: AODS
      },
      body: JSON.stringify({
        name: "CSRF Malicious Attempt",
        dob: "2020-01-01",
        sex: "Female",
        adopters: "Attacker"
      })
    });
    assert(res.status === 403, `Expected 403 Forbidden for missing CSRF header, got ${res.status}`);
    const data = await res.json();
    assert(data.error.includes("CSRF"), "Expected CSRF error message");
  });

  await test("32. Accepts cookie-authenticated mutating request with Anti-CSRF header (201 Created)", async () => {
    const res = await fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        "X-Requested-With": "AODS",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Legitimate Child via Cookie & Anti-CSRF",
        dob: "2020-01-01",
        sex: "Male",
        adopters: "Verified Adopter Parents",
        adopters_address: "P.O. Box 101, Nairobi",
        adopters_occupation: "Engineers",
        adoption: "2024-09-10",
        court: "High Court",
        entered: "2024-09-11",
        officer: "Jane Mwangi",
        designation: "Registrar, County Adoption Office",
        signature: "J. Mwangi"
      })
    });
    assert(res.status === 201, `Expected 201 Created with valid CSRF header, got ${res.status}`);
  });

  // 15. Brute Force & Rate Limiting
  await test("33. Login rate limiter triggers 429 Too Many Requests after 5 failed attempts", async () => {
    const targetEmpId = "TEST-RATELIMIT";
    // Fire 5 bad login attempts
    for (let i = 0; i < 5; i++) {
      await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: targetEmpId, password: "badpassword" })
      });
    }

    // 6th attempt must be rejected with 429
    const blockedRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id: targetEmpId, password: "badpassword" })
    });
    assert(blockedRes.status === 429, `Expected 429 Too Many Requests, got ${blockedRes.status}`);
    const data = await blockedRes.json();
    assert(data.error.includes("Too many failed login attempts"), "Expected rate limit lockout message");

    // Clean up test failed attempts so subsequent tests/scripts from 127.0.0.1 aren't rate limited
    db.prepare("DELETE FROM login_attempts WHERE employee_id = ?").run(targetEmpId);
  });

  // 16. Production Static Web Serving & SPA Navigation
  await test("34. Production Express server serves compiled frontend index.html and SPA client routes", async () => {
    const rootBase = BASE_URL.replace("/api", "");
    const rootRes = await fetch(`${rootBase}/`);
    assert(rootRes.ok, `Expected 200 on root path, got ${rootRes.status}`);
    const htmlText = await rootRes.text();
    assert(htmlText.includes("County Adoption Records") || htmlText.includes("<div id=\"root\">"), "Expected frontend HTML shell");

    // SPA deep link route
    const spaRes = await fetch(`${rootBase}/records`);
    assert(spaRes.ok, `Expected 200 on SPA route /records, got ${spaRes.status}`);
    const spaText = await spaRes.text();
    assert(spaText.includes("<div id=\"root\">"), "Expected SPA fallback to serve index.html");
  });

  console.log("\n=================================================");
  const passedCount = results.filter(r => r.passed).length;
  console.log(`TEST RESULTS: ${passedCount}/${results.length} PASSED`);
  console.log("=================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

