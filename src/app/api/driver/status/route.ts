import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverSession, verifyDriverAmbulanceAccess } from "@/lib/auth/driverAuth";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/driver/status - Toggle driver/ambulance online or offline status
export async function POST(request: NextRequest) {
  try {
    // 1. Verify driver authentication
    const auth = await getDriverSession(request);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const { ambulanceId, status } = await request.json();

    if (!ambulanceId || !["available", "offline"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid parameters. Required: ambulanceId, status ('available' | 'offline')" },
        { status: 400 }
      );
    }

    // 2. Verify driver is assigned to this ambulance
    const ambAuth = await verifyDriverAmbulanceAccess(auth.user, auth.isAdmin, ambulanceId);
    if (!ambAuth.authorized) {
      return NextResponse.json({ error: ambAuth.error }, { status: ambAuth.status || 403 });
    }

    const admin = createAdminClient();

    // Check if currently on an active trip (busy)
    const { data: currentAmb } = await admin
      .from("ambulances")
      .select("id, status")
      .eq("id", ambulanceId)
      .single();

    if (currentAmb?.status === "busy" && status === "offline") {
      return NextResponse.json(
        { error: "Cannot go offline while on an active emergency dispatch." },
        { status: 400 }
      );
    }

    const { data: updated, error } = await admin
      .from("ambulances")
      .update({
        status,
        driver_id: auth.user.id, // Explicitly lock this driver to the vehicle
        last_heartbeat: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ambulanceId)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json({ error: error?.message || "Failed to update ambulance status" }, { status: 500 });
    }

    return NextResponse.json({ success: true, ambulance: updated });
  } catch (err: any) {
    console.error("[API /api/driver/status] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
