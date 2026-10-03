import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/driver/trip-status - Transition emergency trip milestones
export async function POST(request: NextRequest) {
  try {
    const { requestId, action, hospitalId } = await request.json();

    if (!requestId || !["picked_up", "reached_hospital", "completed"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid parameters. Required: requestId, action ('picked_up' | 'reached_hospital' | 'completed')" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Fetch active request
    const { data: currentReq, error: fetchErr } = await admin
      .from("emergency_requests")
      .select("*, ambulance:assigned_ambulance_id (*)")
      .eq("id", requestId)
      .single();

    if (fetchErr || !currentReq) {
      return NextResponse.json({ error: "Emergency request not found" }, { status: 404 });
    }

    let nextStatus: string = currentReq.status;
    let eventType: string = "";
    let destinationHospitalId = currentReq.destination_hospital_id || hospitalId;

    if (action === "picked_up") {
      nextStatus = "patient_picked_up";
      eventType = "patient_picked_up";

      // If no destination hospital assigned yet, default to Rajiv Gandhi GH or nearest available
      if (!destinationHospitalId) {
        const { data: defaultHosp } = await admin
          .from("hospitals")
          .select("id")
          .eq("is_active", true)
          .limit(1)
          .single();

        if (defaultHosp) {
          destinationHospitalId = defaultHosp.id;
        }
      }
    } else if (action === "reached_hospital") {
      nextStatus = "reached_hospital";
      eventType = "reached_hospital";
    } else if (action === "completed") {
      nextStatus = "completed";
      eventType = "trip_completed";

      // Free ambulance back to 'available'
      if (currentReq.assigned_ambulance_id) {
        await admin
          .from("ambulances")
          .update({
            status: "available",
            updated_at: new Date().toISOString(),
          })
          .eq("id", currentReq.assigned_ambulance_id);
      }
    }

    // Update emergency request
    const updatePayload: Record<string, any> = {
      status: nextStatus,
      destination_hospital_id: destinationHospitalId,
      updated_at: new Date().toISOString(),
    };

    const { data: updatedReq, error: updateErr } = await admin
      .from("emergency_requests")
      .update(updatePayload)
      .eq("id", requestId)
      .select(`
        *,
        ambulance:assigned_ambulance_id (*),
        hospital:destination_hospital_id (*),
        citizen:citizen_id (*)
      `)
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Audit log trip event
    await admin.from("trip_events").insert({
      request_id: requestId,
      event_type: eventType,
      latitude: currentReq.ambulance?.latitude || currentReq.pickup_latitude,
      longitude: currentReq.ambulance?.longitude || currentReq.pickup_longitude,
      metadata: {
        action,
        previous_status: currentReq.status,
        new_status: nextStatus,
        destination_hospital_id: destinationHospitalId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, request: updatedReq });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
