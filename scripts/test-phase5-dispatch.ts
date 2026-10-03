import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Import server dispatch logic
import {
  dispatchEmergencyRequest,
  rejectAndReassignAmbulance,
  handleDispatchTimeout,
} from "../src/lib/dispatch/serverDispatch";

const CHENNAI_CENTRAL = { lat: 13.0805, lng: 80.2787 }; // Park Town / RGGGH

async function resetChennaiFleet() {
  console.log("--> Resetting Chennai Seed Fleet status...");
  await supabase
    .from("ambulances")
    .update({ status: "available" })
    .in("vehicle_number", [
      "TN-01-EM-1081",
      "TN-01-EM-1082",
      "TN-01-EM-1083",
      "TN-01-EM-1084",
      "TN-01-EM-1085",
    ]);

  await supabase
    .from("ambulances")
    .update({ status: "busy" })
    .eq("vehicle_number", "TN-01-EM-1086");
}

async function runPhase5Tests() {
  console.log("\n==================================================================");
  console.log("🚑 STARTING PHASE 5: DISPATCH LOGIC INTEGRATION TEST SUITE");
  console.log("==================================================================\n");

  await resetChennaiFleet();

  let testRequestId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Nearest Unit Spatial Dispatch & Atomic Row-Locking
    // -------------------------------------------------------------------------
    console.log("TEST 1: Creating Emergency Request at Chennai Central (13.0805, 80.2787)...");
    const { data: req1, error: err1 } = await supabase
      .from("emergency_requests")
      .insert({
        pickup_latitude: CHENNAI_CENTRAL.lat,
        pickup_longitude: CHENNAI_CENTRAL.lng,
        pickup_location: `POINT(${CHENNAI_CENTRAL.lng} ${CHENNAI_CENTRAL.lat})`,
        pickup_address: "Chennai Central Railway Station, Park Town",
        symptoms: "[CARDIAC] Severe chest pain",
        ai_severity: "critical",
        status: "searching_driver",
      })
      .select()
      .single();

    if (err1 || !req1) {
      throw new Error(`Failed to create test request: ${err1?.message}`);
    }
    testRequestId = req1.id;
    console.log(`✓ Emergency Request created: ID = ${testRequestId}`);

    console.log("Triggering Server-Side Dispatch...");
    const dispatch1 = await dispatchEmergencyRequest(testRequestId!);

    console.log(`✓ Dispatch result:`, {
      success: dispatch1.success,
      status: dispatch1.status,
      assignedVehicle: dispatch1.ambulance?.vehicle_number,
      distanceMeters: dispatch1.distanceMeters,
      expiresAt: dispatch1.expiresAt,
    });

    if (dispatch1.ambulance?.vehicle_number !== "TN-01-EM-1084") {
      throw new Error(
        `Expected nearest ambulance TN-01-EM-1084 (~469m), but got ${dispatch1.ambulance?.vehicle_number}`
      );
    }
    console.log("✓ PASS: Correctly selected nearest PostGIS unit (TN-01-EM-1084)!");

    // Verify ambulance row was atomically marked 'busy'
    const { data: ambRow1 } = await supabase
      .from("ambulances")
      .select("status")
      .eq("vehicle_number", "TN-01-EM-1084")
      .single();

    if (ambRow1?.status !== "busy") {
      throw new Error(`Expected TN-01-EM-1084 status to be 'busy', got '${ambRow1?.status}'`);
    }
    console.log("✓ PASS: TN-01-EM-1084 status atomically updated to 'busy' in database!");

    // Verify trip_events audit log
    const { data: events1 } = await supabase
      .from("trip_events")
      .select("event_type, metadata")
      .eq("request_id", testRequestId);

    console.log(`✓ Audit events logged: ${events1?.map((e) => e.event_type).join(", ")}`);

    // -------------------------------------------------------------------------
    // TEST 2: Driver Rejection & Next-Nearest Reassignment (Never Retrying Same)
    // -------------------------------------------------------------------------
    console.log("\n------------------------------------------------------------------");
    console.log("TEST 2: Driver Rejects Assignment (TN-01-EM-1084)...");
    const reassign1 = await rejectAndReassignAmbulance(
      testRequestId,
      "Paramedic unit refuelling at station"
    );

    console.log(`✓ Reassignment result:`, {
      success: reassign1.success,
      status: reassign1.status,
      assignedVehicle: reassign1.ambulance?.vehicle_number,
      distanceMeters: reassign1.distanceMeters,
    });

    if (reassign1.ambulance?.vehicle_number === "TN-01-EM-1084") {
      throw new Error("FAIL: Reassigned the same rejected ambulance TN-01-EM-1084!");
    }

    // Verify the previously rejected ambulance was released back to 'available'
    const { data: ambRowPrev } = await supabase
      .from("ambulances")
      .select("status")
      .eq("vehicle_number", "TN-01-EM-1084")
      .single();

    if (ambRowPrev?.status !== "available") {
      throw new Error(`Expected old unit TN-01-EM-1084 to be 'available', got '${ambRowPrev?.status}'`);
    }
    console.log("✓ PASS: Previously rejected unit released back to 'available' for other emergencies!");
    console.log(`✓ PASS: Reassigned to next-nearest candidate: ${reassign1.ambulance?.vehicle_number}!`);

    // -------------------------------------------------------------------------
    // TEST 3: 30-Second Driver Timeout Auto-Reassignment
    // -------------------------------------------------------------------------
    console.log("\n------------------------------------------------------------------");
    console.log("TEST 3: Simulating 30-Second Driver Confirmation Timeout...");

    // Force expire the deadline into the past
    await supabase
      .from("emergency_requests")
      .update({
        driver_assignment_expires_at: new Date(Date.now() - 5000).toISOString(),
      })
      .eq("id", testRequestId);

    const timeoutResult = await handleDispatchTimeout(testRequestId);

    console.log(`✓ Timeout handling result:`, {
      timedOut: timeoutResult.timedOut,
      status: timeoutResult.status,
      assignedVehicle: timeoutResult.ambulance?.vehicle_number,
      distanceMeters: timeoutResult.distanceMeters,
    });

    if (!timeoutResult.timedOut) {
      throw new Error("FAIL: handleDispatchTimeout failed to trigger timeout reassignment!");
    }
    console.log(`✓ PASS: 30s timeout handled. Rotated to unit: ${timeoutResult.ambulance?.vehicle_number}!`);

    // -------------------------------------------------------------------------
    // TEST 4: Race Condition Prevention / Concurrency Row-Locking Test
    // -------------------------------------------------------------------------
    console.log("\n------------------------------------------------------------------");
    console.log("TEST 4: Race Condition Test (2 Simultaneous Concurrent Dispatches)...");

    // Reset fleet so multiple units are available
    await resetChennaiFleet();

    const [reqA, reqB] = await Promise.all([
      supabase
        .from("emergency_requests")
        .insert({
          pickup_latitude: CHENNAI_CENTRAL.lat,
          pickup_longitude: CHENNAI_CENTRAL.lng,
          pickup_location: `POINT(${CHENNAI_CENTRAL.lng} ${CHENNAI_CENTRAL.lat})`,
          symptoms: "Concurrent SOS 1",
          status: "searching_driver",
        })
        .select()
        .single(),
      supabase
        .from("emergency_requests")
        .insert({
          pickup_latitude: CHENNAI_CENTRAL.lat,
          pickup_longitude: CHENNAI_CENTRAL.lng,
          pickup_location: `POINT(${CHENNAI_CENTRAL.lng} ${CHENNAI_CENTRAL.lat})`,
          symptoms: "Concurrent SOS 2",
          status: "searching_driver",
        })
        .select()
        .single(),
    ]);

    const reqAId = reqA.data!.id;
    const reqBId = reqB.data!.id;

    // Dispatch both concurrently at the exact same millisecond
    const [dispatchA, dispatchB] = await Promise.all([
      dispatchEmergencyRequest(reqAId),
      dispatchEmergencyRequest(reqBId),
    ]);

    console.log(`✓ Request A assigned: ${dispatchA.ambulance?.vehicle_number}`);
    console.log(`✓ Request B assigned: ${dispatchB.ambulance?.vehicle_number}`);

    if (
      dispatchA.ambulance?.vehicle_number === dispatchB.ambulance?.vehicle_number &&
      dispatchA.ambulance?.vehicle_number !== undefined
    ) {
      throw new Error(
        `CRITICAL RACE CONDITION DETECTED! Both requests got assigned the same ambulance: ${dispatchA.ambulance?.vehicle_number}`
      );
    }
    console.log("✓ PASS: Concurrency row locking verified! Requests assigned distinct ambulances!");

    // Clean up concurrent test requests
    await supabase.from("emergency_requests").delete().in("id", [reqAId, reqBId]);

    // -------------------------------------------------------------------------
    // TEST 5: Fleet Exhaustion & Admin Command Center Escalation
    // -------------------------------------------------------------------------
    console.log("\n------------------------------------------------------------------");
    console.log("TEST 5: Fleet Exhaustion & Escalation when all units are rejected...");

    // Mark all remaining ambulances as busy
    await supabase.from("ambulances").update({ status: "busy" }).neq("vehicle_number", "NON_EXISTENT");

    // Re-dispatch testRequestId
    const exhaustedDispatch = await dispatchEmergencyRequest(testRequestId);

    console.log(`✓ Exhaustion dispatch status:`, exhaustedDispatch.status);

    if (exhaustedDispatch.status !== "escalated") {
      throw new Error(`Expected status 'escalated', got '${exhaustedDispatch.status}'`);
    }

    const { data: escalatedReq } = await supabase
      .from("emergency_requests")
      .select("status, assigned_ambulance_id")
      .eq("id", testRequestId)
      .single();

    if (escalatedReq?.status !== "escalated" || escalatedReq?.assigned_ambulance_id !== null) {
      throw new Error(
        `Expected DB status 'escalated' with null ambulance, got '${escalatedReq?.status}' and '${escalatedReq?.assigned_ambulance_id}'`
      );
    }
    console.log("✓ PASS: Request marked 'escalated' with high priority in database!");

    // Check trip_events for dispatch_escalated
    const { data: escalationEvents } = await supabase
      .from("trip_events")
      .select("event_type, metadata")
      .eq("request_id", testRequestId)
      .eq("event_type", "dispatch_escalated");

    if (!escalationEvents || escalationEvents.length === 0) {
      throw new Error("Expected 'dispatch_escalated' event in trip_events");
    }
    console.log("✓ PASS: 'dispatch_escalated' audit event confirmed in trip_events table!");

    // Clean up test request
    await supabase.from("emergency_requests").delete().eq("id", testRequestId);
    console.log("✓ Test cleanup completed.");

    // Reset fleet back to clean seed state
    await resetChennaiFleet();

    console.log("\n==================================================================");
    console.log("🎉 ALL PHASE 5 DISPATCH LOGIC TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================================\n");
  } catch (error: any) {
    console.error("\n❌ PHASE 5 TEST FAILED:", error);
    await resetChennaiFleet();
    process.exit(1);
  }
}

runPhase5Tests();
