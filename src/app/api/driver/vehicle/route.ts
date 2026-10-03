import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// GET /api/driver/vehicle - Fetch all ambulances with active assignment data
export async function GET() {
  try {
    const admin = createAdminClient();

    // Fetch all ambulances
    const { data: ambulances, error } = await admin
      .from("ambulances")
      .select(`
        *,
        driver:driver_id (
          id,
          full_name,
          phone
        )
      `)
      .order("vehicle_number", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch active emergency requests that are not completed/cancelled
    const { data: activeRequests } = await admin
      .from("emergency_requests")
      .select(`
        *,
        hospital:destination_hospital_id (*),
        citizen:citizen_id (*)
      `)
      .not("status", "in", '("completed","cancelled")');

    return NextResponse.json({
      ambulances: ambulances || [],
      activeRequests: activeRequests || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
