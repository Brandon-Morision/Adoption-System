/**
 * County Adoption Records System (AODS)
 * Multi-User Concurrent Workstation Simulation Test
 * 
 * Simulates multiple county office workstations simultaneously performing reads,
 * writes, concurrent edits, conflict handling, and session authentication.
 */

const BASE_URL = process.env.TEST_URL || "http://127.0.0.1:3001/api";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loginUser(employeeId: string, pass: string): Promise<{ token: string; user: any }> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employee_id: employeeId, password: pass })
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${employeeId}: status ${res.status}`);
  }
  return res.json();
}

async function runMultiUserSimulation() {
  console.log("=====================================================================");
  console.log("  AODS MULTI-USER WORKSTATION SIMULATION & CONCURRENCY TEST        ");
  console.log("=====================================================================");
  console.log(`Connecting to server API at: ${BASE_URL}\n`);

  // 1. Session Isolation: Authenticate 3 separate county officers
  console.log("[Test 1/6] Authenticating 3 Independent Workstation Sessions...");
  const session1 = await loginUser("ADM-001", "countyrecords"); // Jane Mwangi (Admin)
  const session2 = await loginUser("EMP-014", "countyrecords"); // Peter Kamau (Employee)
  const session3 = await loginUser("EMP-022", "countyrecords"); // Ruth Njeri (Employee)

  assert(session1.token !== session2.token, "Tokens must be unique");
  assert(session2.token !== session3.token, "Tokens must be unique");

  // Verify identity isolation
  const me1 = await (await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${session1.token}` } })).json();
  const me2 = await (await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${session2.token}` } })).json();
  const me3 = await (await fetch(`${BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${session3.token}` } })).json();

  assert(me1.user.name === "Jane Mwangi" && me1.user.role === "Administrator", "Session 1 mismatch");
  assert(me2.user.name === "Peter Kamau" && me2.user.role === "Employee", "Session 2 mismatch");
  assert(me3.user.name === "Ruth Njeri" && me3.user.role === "Employee", "Session 3 mismatch");
  console.log("  [PASS] 3 distinct sessions active; user identities & RBAC roles isolated.");

  // 2. High-Concurrency Simultaneous Record Reads
  console.log("\n[Test 2/6] Firing 25 Concurrent Record Search & Retrieval Requests...");
  const readPromises = [];
  for (let i = 0; i < 25; i++) {
    const token = [session1.token, session2.token, session3.token][i % 3];
    readPromises.push(
      fetch(`${BASE_URL}/records?q=Kamau`, { headers: { Authorization: `Bearer ${token}` } })
    );
  }
  const readResponses = await Promise.all(readPromises);
  const allReadsOk = readResponses.every(r => r.status === 200);
  assert(allReadsOk, "All concurrent reads must return 200 OK");
  console.log("  [PASS] All 25 concurrent read requests resolved in parallel with 200 OK.");

  // 3. Simultaneous Record Creation
  console.log("\n[Test 3/6] Simulating 3 Officers Simultaneously Submitting New Records...");
  const createPromises = [
    fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session1.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Concurrent Child Alpha",
        dob: "2020-03-10",
        sex: "Female",
        adopters: "Samuel & Naomi Mwangi",
        adoption: "2024-08-25",
        court: "High Court",
        entered: "2024-09-01",
        officer: session1.user.name
      })
    }),
    fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session2.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Concurrent Child Beta",
        dob: "2019-11-20",
        sex: "Male",
        adopters: "Daniel & Grace Ouma",
        adoption: "2024-08-26",
        court: "Children's Court",
        entered: "2024-09-01",
        officer: session2.user.name
      })
    }),
    fetch(`${BASE_URL}/records`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session3.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Concurrent Child Gamma",
        dob: "2021-07-04",
        sex: "Female",
        adopters: "Lucas & Esther Kiprop",
        adoption: "2024-08-27",
        court: "High Court",
        entered: "2024-09-01",
        officer: session3.user.name
      })
    })
  ];

  const createResults = await Promise.all(createPromises);
  const createdData = await Promise.all(createResults.map(r => r.json()));
  if (!createResults.every(r => r.status === 201)) {
    console.error("Creation Errors:", createdData);
  }
  assert(createResults.every(r => r.status === 201), "All concurrent creations must return 201 Created");

  const entryNos = createdData.map(d => d.record.no);
  const uniqueNos = new Set(entryNos);
  assert(uniqueNos.size === 3, "Entry numbers must be unique with zero collisions");
  console.log(`  [PASS] 3 records created concurrently: #${entryNos.join(", #")} (No ID collisions)`);

  // 4. Concurrent Record Editing & Optimistic Concurrency Control (OCC)
  const targetRecordNo = entryNos[0];
  console.log(`\n[Test 4/6] Simulating Concurrent Conflicting Edits on Record #${targetRecordNo}...`);

  // Both Officer 2 and Officer 3 hold version 1
  const updateReq1 = fetch(`${BASE_URL}/records/${targetRecordNo}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${session2.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Concurrent Child Alpha - Edited by Officer 2",
      version: 1
    })
  });

  const updateReq2 = fetch(`${BASE_URL}/records/${targetRecordNo}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${session3.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Concurrent Child Alpha - Conflicting Edit by Officer 3",
      version: 1 // Stale version!
    })
  });

  const [resA, resB] = await Promise.all([updateReq1, updateReq2]);
  const statuses = [resA.status, resB.status];
  assert(statuses.includes(200), "One update must succeed with 200 OK");
  assert(statuses.includes(409), "Conflicting stale update must be rejected with 409 Conflict");
  console.log(`  [PASS] Conflict caught: Statuses [${resA.status}, ${resB.status}] (OCC prevented silent overwrite).`);

  // 5. Conflict Resolution Workflow
  console.log("\n[Test 5/6] Verifying Workstation Conflict Recovery Workflow...");
  // The rejected officer re-fetches the record (now v2) and submits
  const refreshed = await (await fetch(`${BASE_URL}/records/${targetRecordNo}`, {
    headers: { Authorization: `Bearer ${session3.token}` }
  })).json();

  assert(refreshed.record.version === 2, "Refreshed record must have version 2");
  const resResolved = await fetch(`${BASE_URL}/records/${targetRecordNo}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${session3.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Concurrent Child Alpha - Resolved by Officer 3",
      version: refreshed.record.version
    })
  });
  assert(resResolved.status === 200, "Resolved update with current version must succeed");
  const resolvedData = await resResolved.json();
  assert(resolvedData.record.version === 3, "Version must advance to 3");
  console.log(`  [PASS] Officer resolved conflict by refreshing to v2; updated successfully to v3.`);

  // 6. Direct Database Access Protection
  console.log("\n[Test 6/6] Verifying Raw Database Files Are Inaccessible Over Network...");
  const rawDbReq = await fetch(`${BASE_URL.replace('/api', '')}/server/data/adoption_records.db`);
  assert(rawDbReq.status === 404 || rawDbReq.status === 403, `Raw DB access must be blocked (got ${rawDbReq.status})`);
  console.log(`  [PASS] Direct HTTP access to SQLite database file rejected (${rawDbReq.status}).`);

  // 7. Audit Log Integrity Check
  console.log("\n[Audit Trail] Verifying Cryptographic Hash Chain Integrity...");
  const auditRes = await (await fetch(`${BASE_URL}/activity/verify`, {
    headers: { Authorization: `Bearer ${session1.token}` }
  })).json();
  const integrity = auditRes.auditIntegrity || auditRes;
  assert(integrity.valid === true, "Audit trail hash chain must be 100% valid");
  console.log(`  [PASS] Cryptographic audit chain verified unbroken across ${integrity.totalChecked} events.`);

  console.log("\n=====================================================================");
  console.log("  [SUCCESS] MULTI-USER CONCURRENCY & INTEGRITY TESTS PASSED 100%    ");
  console.log("=====================================================================\n");
}

runMultiUserSimulation().catch(err => {
  console.error("\n[FAIL] Multi-user simulation failed:", err.message);
  process.exit(1);
});
