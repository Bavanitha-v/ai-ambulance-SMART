import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/dispatch/active - Fetch active dispatches awaiting driver confirmation or en route
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: requests, error } = await admin
      .from("emergency_requests")
      .select(`
        *,
        ambulance:assigned_ambulance_id (*),
        hospital:destination_hospital_id (*)
      `)
      .in("status", ["driver_assigned", "driver_accepted", "en_route_pickup", "patient_picked_up"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ requests: requests || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
