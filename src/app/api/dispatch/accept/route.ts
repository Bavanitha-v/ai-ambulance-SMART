import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/dispatch/accept - Driver accepts emergency dispatch
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { requestId } = await request.json();

    if (!requestId) {
      return NextResponse.json({ error: "Missing required requestId" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: updatedRequest, error } = await admin
      .from("emergency_requests")
      .update({
        status: "driver_accepted",
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
      actor_id: user?.id || null,
      metadata: {
        ambulance_id: updatedRequest.assigned_ambulance_id,
        vehicle_number: updatedRequest.ambulance?.vehicle_number,
        accepted_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
