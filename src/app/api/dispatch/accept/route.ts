import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverSession, verifyDriverRequestAccess } from "@/lib/auth/driverAuth";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/dispatch/accept - Driver accepts emergency dispatch
export async function POST(request: NextRequest) {
  try {
    // 1. Verify driver authentication
    const auth = await getDriverSession(request);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { requestId } = await request.json();

    if (!requestId) {
      return NextResponse.json({ error: "Missing required requestId" }, { status: 400 });
    }

    // 2. CRITICAL REQUIREMENT: Verify driver identity matches assigned request
    const reqAuth = await verifyDriverRequestAccess(auth.user, auth.isAdmin, requestId);
    if (!reqAuth.authorized || !reqAuth.request) {
      return NextResponse.json({ error: reqAuth.error }, { status: reqAuth.status || 403 });
    }

    const admin = createAdminClient();

    const { data: updatedRequest, error } = await admin
      .from("emergency_requests")
      .update({
        status: "driver_accepted",
        assigned_driver_id: auth.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "driver_assigned")
      .select(`
        *,
        ambulance:assigned_ambulance_id (*)
      `)
      .single();

    if (error || !updatedRequest) {
      return NextResponse.json(
        { error: error?.message || "Failed to accept dispatch. Request may have expired or already been reassigned." },
        { status: 400 }
      );
    }

    // Audit log acceptance
    await admin.from("trip_events").insert({
      request_id: requestId,
      event_type: "driver_accepted",
      actor_id: auth.user.id,
      metadata: {
        ambulance_id: updatedRequest.assigned_ambulance_id,
        vehicle_number: updatedRequest.ambulance?.vehicle_number,
        driver_id: auth.user.id,
        accepted_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (err: any) {
    console.error("[API /api/dispatch/accept] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
