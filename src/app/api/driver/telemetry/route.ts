import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/driver/telemetry - Broadcast live GPS telemetry to Supabase
export async function POST(request: NextRequest) {
  try {
    const { ambulanceId, latitude, longitude, heading = 0, speed = 0, requestId } = await request.json();

    if (!ambulanceId || typeof latitude !== "number" || typeof longitude !== "number") {
      return NextResponse.json(
        { error: "Invalid telemetry payload. Required: ambulanceId, latitude, longitude" },
        { status: 400 }
      );
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
        metadata: {
          ambulance_id: ambulanceId,
          speed,
          heading,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ success: true, ambulance: updatedAmbulance });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
