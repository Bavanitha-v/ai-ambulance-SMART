import { createAdminClient } from "@/lib/supabase/admin";
import { getDriverSession } from "@/lib/auth/driverAuth";
import { NextResponse, type NextRequest } from "next/server";

// GET /api/driver/vehicle - Fetch ambulances and active emergency requests for the logged-in driver
export async function GET(request: NextRequest) {
  try {
    // 1. Verify logged-in driver's identity
    const auth = await getDriverSession(request);
    if (auth.error || !auth.user) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const admin = createAdminClient();

    // 2. Fetch fleet ambulances
    const { data: ambulances, error: ambError } = await admin
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

    if (ambError) {
      return NextResponse.json({ error: ambError.message }, { status: 500 });
    }

    // Identify which ambulance is assigned to this driver
    const driverAmbulance = ambulances?.find((a) => a.driver_id === auth.user!.id);

    // 3. Fetch active emergency requests
    // CRITICAL REQUIREMENT: A driver can ONLY see requests assigned to them
    let requestQuery = admin
      .from("emergency_requests")
      .select(`
        *,
        hospital:destination_hospital_id (*),
        citizen:citizen_id (*)
      `)
      .not("status", "in", '("completed","cancelled")');

    if (!auth.isAdmin) {
      if (driverAmbulance) {
        requestQuery = requestQuery.or(
          `assigned_driver_id.eq.${auth.user.id},assigned_ambulance_id.eq.${driverAmbulance.id}`
        );
      } else {
        requestQuery = requestQuery.eq("assigned_driver_id", auth.user.id);
      }
    }

    const { data: activeRequests, error: reqError } = await requestQuery;

    if (reqError) {
      return NextResponse.json({ error: reqError.message }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        full_name: auth.profile?.full_name || auth.user.user_metadata?.full_name || "Paramedic Driver",
        role: auth.profile?.role || "driver",
      },
      driverAmbulanceId: driverAmbulance?.id || null,
      ambulances: ambulances || [],
      activeRequests: activeRequests || [],
    });
  } catch (err: any) {
    console.error("[API /api/driver/vehicle] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
