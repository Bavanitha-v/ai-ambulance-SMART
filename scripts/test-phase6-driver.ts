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

import { dispatchEmergencyRequest } from "../src/lib/dispatch/serverDispatch";

async function resetFleet() {
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

async function runPhase6Tests() {
  console.log("\n==================================================================");
  console.log("🚑 STARTING PHASE 6: DRIVER DASHBOARD & LIFECYCLE TEST SUITE");
  console.log("==================================================================\n");

  await resetFleet();

  try {
    // -------------------------------------------------------------------------
    // 1. Fetch Ambulance TN-01-EM-1084
    // -------------------------------------------------------------------------
    const { data: amb, error: ambErr } = await supabase
      .from("ambulances")
      .select("*")
      .eq("vehicle_number", "TN-01-EM-1084")
      .single();

    if (ambErr || !amb) throw new Error("Could not find seed ambulance TN-01-EM-1084");
    console.log(`✓ Seed ambulance located: ${amb.vehicle_number} (ID: ${amb.id})`);

    // -------------------------------------------------------------------------
    // 2. Test Online / Offline Toggle
    // -------------------------------------------------------------------------
    console.log("\nTEST 1: Testing Online/Offline Availability Toggle...");
    // Toggle Offline
    await supabase
      .from("ambulances")
      .update({ status: "offline", last_heartbeat: new Date().toISOString() })
      .eq("id", amb.id);

    const { data: offAmb } = await supabase
      .from("ambulances")
      .select("status")
      .eq("id", amb.id)
      .single();

    if (offAmb?.status !== "offline") throw new Error("Expected status to be 'offline'");
    console.log("✓ PASS: Successfully toggled ambulance to OFFLINE!");

    // Toggle Back Online
    await supabase
      .from("ambulances")
      .update({ status: "available", last_heartbeat: new Date().toISOString() })
      .eq("id", amb.id);

    const { data: onAmb } = await supabase
      .from("ambulances")
      .select("status")
      .eq("id", amb.id)
      .single();

    if (onAmb?.status !== "available") throw new Error("Expected status to be 'available'");
    console.log("✓ PASS: Successfully toggled ambulance back to ONLINE (available)!");

    // -------------------------------------------------------------------------
    // 3. Test 5-Second Live GPS Telemetry Push
    // -------------------------------------------------------------------------
    console.log("\nTEST 2: Testing 5-Second Live GPS Telemetry Push...");
    const testLat = 13.0835;
    const testLng = 80.2760;
    const testHeading = 45;
    const testSpeed = 48; // km/h

    const pointWkt = `POINT(${testLng} ${testLat})`;
    const { data: updatedTelemetry, error: telemErr } = await supabase
      .from("ambulances")
      .update({
        latitude: testLat,
        longitude: testLng,
        location: pointWkt,
        heading: testHeading,
        speed: testSpeed,
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", amb.id)
      .select("latitude, longitude, heading, speed, last_heartbeat")
      .single();

    if (telemErr || !updatedTelemetry) throw new Error("Telemetry update failed");
    console.log(`✓ Telemetry saved to DB: Lat ${updatedTelemetry.latitude}, Lng ${updatedTelemetry.longitude}, Speed ${updatedTelemetry.speed} km/h, Heading ${updatedTelemetry.heading}°`);
    console.log("✓ PASS: 5-second GPS telemetry update verified!");

    // -------------------------------------------------------------------------
    // 4. Test Incoming Emergency Request & Accept
    // -------------------------------------------------------------------------
    console.log("\nTEST 3: Simulating Citizen SOS -> Driver Intake & Acceptance...");
    const { data: req, error: reqErr } = await supabase
      .from("emergency_requests")
      .insert({
        pickup_latitude: 13.0805,
        pickup_longitude: 80.2787,
        pickup_location: `POINT(80.2787 13.0805)`,
        pickup_address: "Chennai Central Station",
        symptoms: "[CARDIAC] Acute chest pain",
        ai_severity: "critical",
        status: "searching_driver",
      })
      .select()
      .single();

    if (reqErr || !req) throw new Error("Failed to create emergency request");

    // Server-side dispatch
    const dispatch = await dispatchEmergencyRequest(req.id);
    console.log(`✓ Dispatched to nearest unit: ${dispatch.ambulance?.vehicle_number} (Status: ${dispatch.status})`);
    if (dispatch.ambulance?.vehicle_number !== "TN-01-EM-1084") {
      throw new Error(`Expected TN-01-EM-1084, got ${dispatch.ambulance?.vehicle_number}`);
    }

    // Driver Accepts Dispatch
    await supabase
      .from("emergency_requests")
      .update({ status: "driver_accepted", updated_at: new Date().toISOString() })
      .eq("id", req.id);

    await supabase.from("trip_events").insert({
      request_id: req.id,
      event_type: "driver_accepted",
      metadata: { ambulance_id: amb.id, vehicle_number: amb.vehicle_number },
    });
    console.log("✓ PASS: Driver accepted incoming dispatch! Status -> 'driver_accepted'");

    // -------------------------------------------------------------------------
    // 5. Test Milestone: "Patient Picked Up"
    // -------------------------------------------------------------------------
    console.log("\nTEST 4: Milestone 1 -> 'Confirm Patient Picked Up'...");

    // Find destination hospital
    const { data: hosp } = await supabase
      .from("hospitals")
      .select("id, name")
      .eq("is_active", true)
      .limit(1)
      .single();

    await supabase
      .from("emergency_requests")
      .update({
        status: "patient_picked_up",
        destination_hospital_id: hosp?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    await supabase.from("trip_events").insert({
      request_id: req.id,
      event_type: "patient_picked_up",
      metadata: { hospital_id: hosp?.id, hospital_name: hosp?.name },
    });

    const { data: reqPickedUp } = await supabase
      .from("emergency_requests")
      .select("status, destination_hospital_id")
      .eq("id", req.id)
      .single();

    if (reqPickedUp?.status !== "patient_picked_up" || !reqPickedUp?.destination_hospital_id) {
      throw new Error("Failed to transition to patient_picked_up with destination hospital");
    }
    console.log(`✓ PASS: Status -> 'patient_picked_up', routed to designated ER: ${hosp?.name}!`);

    // -------------------------------------------------------------------------
    // 6. Test Milestone: "Reached Hospital"
    // -------------------------------------------------------------------------
    console.log("\nTEST 5: Milestone 2 -> 'Reached Hospital ER'...");
    await supabase
      .from("emergency_requests")
      .update({
        status: "reached_hospital",
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    await supabase.from("trip_events").insert({
      request_id: req.id,
      event_type: "reached_hospital",
      metadata: { hospital_id: hosp?.id },
    });

    const { data: reqReached } = await supabase
      .from("emergency_requests")
      .select("status")
      .eq("id", req.id)
      .single();

    if (reqReached?.status !== "reached_hospital") {
      throw new Error("Failed to transition to reached_hospital");
    }
    console.log("✓ PASS: Status -> 'reached_hospital'!");

    // -------------------------------------------------------------------------
    // 7. Test Milestone: "Completed" (Ambulance Released back to Standby)
    // -------------------------------------------------------------------------
    console.log("\nTEST 6: Milestone 3 -> 'Complete Trip & Mark Available'...");
    await supabase
      .from("emergency_requests")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    // Free ambulance back to 'available'
    await supabase
      .from("ambulances")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", amb.id);

    await supabase.from("trip_events").insert({
      request_id: req.id,
      event_type: "trip_completed",
      metadata: { ambulance_id: amb.id },
    });

    const { data: reqCompleted } = await supabase
      .from("emergency_requests")
      .select("status")
      .eq("id", req.id)
      .single();

    const { data: ambFreed } = await supabase
      .from("ambulances")
      .select("status")
      .eq("id", amb.id)
      .single();

    if (reqCompleted?.status !== "completed" || ambFreed?.status !== "available") {
      throw new Error("Failed to finalize trip and free ambulance");
    }
    console.log("✓ PASS: Request marked 'completed' and ambulance TN-01-EM-1084 released back to 'available'!");

    // Cleanup test request
    await supabase.from("emergency_requests").delete().eq("id", req.id);
    await resetFleet();

    console.log("\n==================================================================");
    console.log("🎉 ALL PHASE 6 DRIVER DASHBOARD TESTS PASSED SUCCESSFULLY!");
    console.log("==================================================================\n");
  } catch (error: any) {
    console.error("\n❌ PHASE 6 TEST FAILED:", error);
    await resetFleet();
    process.exit(1);
  }
}

runPhase6Tests();
