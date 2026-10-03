import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/driver/status - Toggle driver/ambulance online or offline status
export async function POST(request: NextRequest) {
  try {
    const { ambulanceId, status } = await request.json();

    if (!ambulanceId || !["available", "offline"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid parameters. Required: ambulanceId, status ('available' | 'offline')" },
        { status: 400 }
      );
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
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
