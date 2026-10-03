import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverSession, verifyDriverAmbulanceAccess, verifyDriverRequestAccess } from "@/lib/auth/driverAuth";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/driver/telemetry - Broadcast live GPS telemetry to Supabase
export async function POST(request: NextRequest) {
  try {
    // 1. Verify driver authentication
    const auth = await getDriverSession(request);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { ambulanceId, latitude, longitude, heading = 0, speed = 0, requestId } = await request.json();

    if (!ambulanceId || typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        { error: "Invalid telemetry payload. Required: ambulanceId, latitude, longitude" },
        { status: 400 }
      );
    }

    // 2. Verify driver is assigned to this ambulance
    const ambAuth = await verifyDriverAmbulanceAccess(auth.user, auth.isAdmin, ambulanceId);
    if (!ambAuth.authorized) {
      return NextResponse.json({ error: ambAuth.error }, { status: ambAuth.status || 403 });
    }

    // 3. If actively fulfilling a request, verify driver owns this request
    if (requestId) {
      const reqAuth = await verifyDriverRequestAccess(auth.user, auth.isAdmin, requestId);
      if (!reqAuth.authorized) {
        return NextResponse.json({ error: reqAuth.error }, { status: reqAuth.status || 403 });
      }
    }

    const admin = createAdminClient();
    const pointWkt = `POINT(${longitude} ${latitude})`;

    const { data: updatedAmbulance, error: updateErr } = await admin
      .from("ambulances")
      .update({
        latitude,
        longitude,
        location: pointWkt,
        heading,
        speed,
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ambulanceId)
      .select("id, vehicle_number, status, latitude, longitude, heading, speed")
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Optional: Log trip telemetry if actively fulfilling an emergency request
    if (requestId) {
      await admin.from("trip_events").insert({
        request_id: requestId,
        event_type: "ambulance_telemetry",
        latitude,
        longitude,
        location: pointWkt,
        actor_id: auth.user.id,
        metadata: {
          ambulance_id: ambulanceId,
          speed,
          heading,
          driver_id: auth.user.id,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ success: true, ambulance: updatedAmbulance });
  } catch (err: any) {
    console.error("[API /api/driver/telemetry] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
