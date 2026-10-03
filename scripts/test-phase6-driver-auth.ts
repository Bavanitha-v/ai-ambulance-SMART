import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  console.error("Missing environment variables in .env.local");
  process.exit(1);
}

const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BASE_URL = "http://localhost:3000";

async function getOrCreateDriver(email: string, fullName: string) {
  // Check if user already exists
  const { data: usersData } = await adminSupabase.auth.admin.listUsers();
  let user = usersData?.users.find((u) => u.email === email);

  if (!user) {
    const { data: newUser, error: createErr } = await adminSupabase.auth.admin.createUser({
      email,
      password: "DriverSecurePass123!",
      email_confirm: true,
      user_metadata: { role: "driver", full_name: fullName },
    });
    if (createErr || !newUser.user) {
      throw new Error(`Failed to create driver ${email}: ${createErr?.message}`);
    }
    user = newUser.user;
  }

  // Ensure profile exists and has role 'driver'
  await adminSupabase.from("profiles").upsert({
    id: user.id,
    role: "driver",
    full_name: fullName,
    phone: "+91 98765 43210",
    updated_at: new Date().toISOString(),
  });

  // Log in using anon client to get session JWT
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
    email,
    password: "DriverSecurePass123!",
  });

  if (loginErr || !sessionData.session) {
    throw new Error(`Failed to login as driver ${email}: ${loginErr?.message}`);
  }

  return {
    user,
    token: sessionData.session.access_token,
  };
}

async function runDriverAuthTests() {
  console.log("\n==================================================================");
  console.log("🔒 PHASE 6: DRIVER IDENTITY & AUTHORIZATION TEST SUITE");
  console.log("==================================================================\n");

  try {
    // -------------------------------------------------------------------------
    // 1. Setup 2 Distinct Drivers: Driver Alpha & Driver Beta
    // -------------------------------------------------------------------------
    console.log("1. Setting up Test Paramedic Drivers...");
    const driverAlpha = await getOrCreateDriver("driver.alpha@resq.tamilnadu.gov.in", "Driver Alpha (ALS)");
    const driverBeta = await getOrCreateDriver("driver.beta@resq.tamilnadu.gov.in", "Driver Beta (BLS)");
    console.log(`✓ Driver Alpha created & authenticated (ID: ${driverAlpha.user.id})`);
    console.log(`✓ Driver Beta created & authenticated (ID: ${driverBeta.user.id})`);

    // Assign vehicles
    const { data: amb1081 } = await adminSupabase
      .from("ambulances")
      .select("*")
      .eq("vehicle_number", "TN-01-EM-1081")
      .single();

    const { data: amb1084 } = await adminSupabase
      .from("ambulances")
      .select("*")
      .eq("vehicle_number", "TN-01-EM-1084")
      .single();

    if (!amb1081 || !amb1084) throw new Error("Seed ambulances not found");

    await adminSupabase.from("ambulances").update({ driver_id: driverAlpha.user.id, status: "available" }).eq("id", amb1081.id);
    await adminSupabase.from("ambulances").update({ driver_id: driverBeta.user.id, status: "available" }).eq("id", amb1084.id);
    console.log("✓ TN-01-EM-1081 bound to Driver Alpha");
    console.log("✓ TN-01-EM-1084 bound to Driver Beta");

    // -------------------------------------------------------------------------
    // 2. Test Unauthenticated API Call Protection
    // -------------------------------------------------------------------------
    console.log("\nTEST 1: Verifying Unauthenticated Access is Blocked (401)...");
    const unauthRes = await fetch(`${BASE_URL}/api/driver/vehicle`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated call, got ${unauthRes.status}`);
    }
    console.log("✓ PASS: /api/driver/vehicle strictly rejects unauthenticated requests with 401 Unauthorized.");

    // -------------------------------------------------------------------------
    // 3. Create Emergency Request Assigned to Driver Alpha
    // -------------------------------------------------------------------------
    console.log("\nTEST 2: Creating Emergency Request Assigned Exclusively to Driver Alpha...");
    const { data: reqAlpha, error: reqErr } = await adminSupabase
      .from("emergency_requests")
      .insert({
        pickup_latitude: 13.0827,
        pickup_longitude: 80.2707,
        pickup_location: "POINT(80.2707 13.0827)",
        pickup_address: "Central Station, Chennai",
        symptoms: "Acute Chest Pain - Alpha Assignment",
        ai_severity: "critical",
        status: "driver_assigned",
        assigned_ambulance_id: amb1081.id,
        assigned_driver_id: driverAlpha.user.id,
        driver_assignment_expires_at: new Date(Date.now() + 30000).toISOString(),
      })
      .select()
      .single();

    if (reqErr || !reqAlpha) throw new Error(`Failed to create test request: ${reqErr?.message}`);
    console.log(`✓ Emergency request created (ID: ${reqAlpha.id}) for Driver Alpha.`);

    // -------------------------------------------------------------------------
    // 4. Verify Driver Beta CANNOT See Driver Alpha's Request
    // -------------------------------------------------------------------------
    console.log("\nTEST 3: Verifying Driver Beta CANNOT See Driver Alpha's Emergency Request...");
    const betaVehicleRes = await fetch(`${BASE_URL}/api/driver/vehicle`, {
      headers: { Authorization: `Bearer ${driverBeta.token}` },
    });
    const betaData = await betaVehicleRes.json();
    const hasAlphaReq = betaData.activeRequests?.some((r: any) => r.id === reqAlpha.id);

    if (hasAlphaReq) {
      throw new Error("SECURITY FAILURE: Driver Beta was able to see Driver Alpha's emergency request!");
    }
    console.log("✓ PASS: Driver Beta cannot see Driver Alpha's emergency request in activeRequests.");

    // -------------------------------------------------------------------------
    // 5. Verify Driver Alpha CAN See Their Own Request
    // -------------------------------------------------------------------------
    console.log("\nTEST 4: Verifying Driver Alpha CAN See Their Own Assigned Request...");
    const alphaVehicleRes = await fetch(`${BASE_URL}/api/driver/vehicle`, {
      headers: { Authorization: `Bearer ${driverAlpha.token}` },
    });
    const alphaData = await alphaVehicleRes.json();
    const alphaHasReq = alphaData.activeRequests?.some((r: any) => r.id === reqAlpha.id);

    if (!alphaHasReq) {
      throw new Error("Driver Alpha could not see their own assigned request!");
    }
    console.log("✓ PASS: Driver Alpha successfully sees their assigned emergency request.");

    // -------------------------------------------------------------------------
    // 6. Verify Driver Beta CANNOT Accept Driver Alpha's Request (403)
    // -------------------------------------------------------------------------
    console.log("\nTEST 5: Verifying Driver Beta CANNOT Accept Driver Alpha's Request (403 Forbidden)...");
    const betaAcceptRes = await fetch(`${BASE_URL}/api/dispatch/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverBeta.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id }),
    });

    if (betaAcceptRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, but received ${betaAcceptRes.status}`);
    }
    console.log("✓ PASS: Driver Beta is forbidden from accepting Driver Alpha's emergency dispatch (403 Forbidden).");

    // -------------------------------------------------------------------------
    // 7. Verify Driver Beta CANNOT Reject Driver Alpha's Request (403)
    // -------------------------------------------------------------------------
    console.log("\nTEST 6: Verifying Driver Beta CANNOT Reject Driver Alpha's Request (403 Forbidden)...");
    const betaRejectRes = await fetch(`${BASE_URL}/api/dispatch/reassign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverBeta.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id, action: "reject" }),
    });

    if (betaRejectRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden, but received ${betaRejectRes.status}`);
    }
    console.log("✓ PASS: Driver Beta is forbidden from rejecting Driver Alpha's emergency dispatch (403 Forbidden).");

    // -------------------------------------------------------------------------
    // 8. Verify Driver Beta CANNOT Push Telemetry for Driver Alpha's Vehicle (403)
    // -------------------------------------------------------------------------
    console.log("\nTEST 7: Verifying Driver Beta CANNOT Push Telemetry for Driver Alpha's Vehicle (403)...");
    const betaTelemRes = await fetch(`${BASE_URL}/api/driver/telemetry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverBeta.token}`,
      },
      body: JSON.stringify({
        ambulanceId: amb1081.id,
        latitude: 13.085,
        longitude: 80.21,
      }),
    });

    if (betaTelemRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for unauthorized telemetry push, got ${betaTelemRes.status}`);
    }
    console.log("✓ PASS: Driver Beta cannot broadcast telemetry for Driver Alpha's vehicle (403 Forbidden).");

    // -------------------------------------------------------------------------
    // 9. Verify Driver Alpha CAN Accept Their Own Request (200)
    // -------------------------------------------------------------------------
    console.log("\nTEST 8: Verifying Driver Alpha CAN Accept Their Assigned Request (200 OK)...");
    const alphaAcceptRes = await fetch(`${BASE_URL}/api/dispatch/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverAlpha.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id }),
    });

    if (alphaAcceptRes.status !== 200) {
      const errBody = await alphaAcceptRes.json();
      throw new Error(`Failed to accept request: ${JSON.stringify(errBody)}`);
    }
    console.log("✓ PASS: Driver Alpha successfully accepted their assigned dispatch!");

    // -------------------------------------------------------------------------
    // 10. Verify Driver Beta CANNOT Advance Trip Milestones on Driver Alpha's Request (403)
    // -------------------------------------------------------------------------
    console.log("\nTEST 9: Verifying Driver Beta CANNOT Advance Milestones on Driver Alpha's Trip (403)...");
    const betaTripRes = await fetch(`${BASE_URL}/api/driver/trip-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverBeta.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id, action: "picked_up" }),
    });

    if (betaTripRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for unauthorized milestone update, got ${betaTripRes.status}`);
    }
    console.log("✓ PASS: Driver Beta cannot advance milestones on Driver Alpha's trip (403 Forbidden).");

    // -------------------------------------------------------------------------
    // 11. Driver Alpha Advances Trip Lifecycle: Picked Up -> Hospital -> Completed
    // -------------------------------------------------------------------------
    console.log("\nTEST 10: Driver Alpha Completes Full Trip Lifecycle...");

    // Milestone A: Picked Up
    const resPickup = await fetch(`${BASE_URL}/api/driver/trip-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverAlpha.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id, action: "picked_up" }),
    });
    if (!resPickup.ok) throw new Error("Driver Alpha failed to mark picked_up");
    console.log("  → Milestone 1: Patient Picked Up confirmed (200 OK)");

    // Milestone B: Reached Hospital
    const resHospital = await fetch(`${BASE_URL}/api/driver/trip-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverAlpha.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id, action: "reached_hospital" }),
    });
    if (!resHospital.ok) throw new Error("Driver Alpha failed to mark reached_hospital");
    console.log("  → Milestone 2: Arrived at Hospital ER confirmed (200 OK)");

    // Milestone C: Completed
    const resComplete = await fetch(`${BASE_URL}/api/driver/trip-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${driverAlpha.token}`,
      },
      body: JSON.stringify({ requestId: reqAlpha.id, action: "completed" }),
    });
    if (!resComplete.ok) throw new Error("Driver Alpha failed to complete trip");
    console.log("  → Milestone 3: Completed trip confirmed (200 OK)");

    // Verify Ambulance Freed
    const { data: finalAmb } = await adminSupabase
      .from("ambulances")
      .select("status")
      .eq("id", amb1081.id)
      .single();

    if (finalAmb?.status !== "available") {
      throw new Error(`Expected ambulance to be 'available', got '${finalAmb?.status}'`);
    }
    console.log("✓ PASS: Ambulance TN-01-EM-1081 is automatically released back to 'available'!");

    // Clean up test request
    await adminSupabase.from("emergency_requests").delete().eq("id", reqAlpha.id);

    console.log("\n==================================================================");
    console.log("🎉 ALL DRIVER AUTHENTICATION & ISOLATION TESTS PASSED PERFECTLY!");
    console.log("==================================================================\n");
  } catch (err) {
    console.error("\n❌ TEST SUITE FAILED:", err);
    process.exit(1);
  }
}

runDriverAuthTests();
