import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { TriageSeverity } from "@/types/database.types";

const SosRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional().nullable(),
  symptoms: z.string().optional().nullable(),
  category: z.string().optional().default("general"),
  severity: z.enum(["critical", "high", "medium", "low"]).optional().default("high"),
});

// GET /api/sos - Retrieve active emergency request for the current citizen
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ activeRequest: null }, { status: 200 });
    }

    const { data: activeRequest, error } = await supabase
      .from("emergency_requests")
      .select(`
        *,
        ambulance:assigned_ambulance_id (
          id,
          vehicle_number,
          type,
          status,
          latitude,
          longitude,
          heading,
          speed,
          driver:driver_id (
            id,
            full_name,
            phone
          )
        ),
        hospital:destination_hospital_id (
          id,
          name,
          address,
          phone,
          latitude,
          longitude,
          available_beds
        )
      `)
      .eq("citizen_id", user.id)
      .not("status", "in", '("completed","cancelled")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching active request:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activeRequest });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

// POST /api/sos - Create new Emergency Request with strict 3 per 10min rate limiting
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required. Please sign in to trigger SOS dispatch." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = SosRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid SOS payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { latitude, longitude, address, symptoms, category, severity } = parsed.data;

    // RULE #5: Rate Limit SOS Creation (max 3 per 10 minutes per user)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabase
      .from("emergency_requests")
      .select("id", { count: "exact", head: true })
      .eq("citizen_id", user.id)
      .gte("created_at", tenMinutesAgo);

    if (countError) {
      console.error("Rate limit check error:", countError);
    } else if (count !== null && count >= 3) {
      return NextResponse.json(
        {
          error:
            "Rate limit exceeded: You have submitted 3 emergency requests in the last 10 minutes. Please track your active dispatch or contact the 108 Emergency Control Center directly.",
        },
        { status: 429 }
      );
    }

    // Step 1: Create Emergency Request with initial status 'searching_driver'
    const { data: newRequest, error: insertError } = await supabase
      .from("emergency_requests")
      .insert({
        citizen_id: user.id,
        pickup_latitude: latitude,
        pickup_longitude: longitude,
        pickup_address: address || "GPS Pin Location",
        symptoms: symptoms ? `[${category.toUpperCase()}] ${symptoms}` : `[${category.toUpperCase()}] Emergency SOS`,
        ai_severity: severity as TriageSeverity,
        status: "searching_driver",
      })
      .select()
      .single();

    if (insertError || !newRequest) {
      console.error("SOS insert error:", insertError);
      return NextResponse.json(
        { error: insertError?.message || "Failed to create emergency request" },
        { status: 500 }
      );
    }

    // Step 2: Auto-match with nearest available ambulance via PostGIS RPC
    let assignedAmbulance: any = null;
    try {
      const { data: nearestList, error: rpcError } = await supabase.rpc(
        "find_nearest_available_ambulance",
        {
          lat: latitude,
          lng: longitude,
          radius_meters: 50000, // 50km radius
        }
      );

      if (!rpcError && nearestList && nearestList.length > 0) {
        assignedAmbulance = nearestList[0];

        // Update request to 'driver_assigned' and set expiry
        const expiresAt = new Date(Date.now() + 45 * 1000).toISOString();

        await supabase
          .from("emergency_requests")
          .update({
            assigned_ambulance_id: assignedAmbulance.id,
            assigned_driver_id: assignedAmbulance.driver_id,
            status: "driver_assigned",
            driver_assignment_expires_at: expiresAt,
          })
          .eq("id", newRequest.id);

        newRequest.assigned_ambulance_id = assignedAmbulance.id;
        newRequest.status = "driver_assigned";
      }
    } catch (rpcErr) {
      console.warn("Nearest ambulance lookup warning:", rpcErr);
    }

    // Step 3: Log audit event to trip_events
    await supabase.from("trip_events").insert({
      request_id: newRequest.id,
      event_type: "sos_created",
      actor_id: user.id,
      latitude,
      longitude,
      metadata: {
        category,
        assigned_ambulance_id: assignedAmbulance?.id || null,
        assigned_vehicle: assignedAmbulance?.vehicle_number || null,
        distance_meters: assignedAmbulance?.distance_meters || null,
      },
    });

    return NextResponse.json({
      request: newRequest,
      ambulance: assignedAmbulance,
    });
  } catch (err: any) {
    console.error("Unhandled SOS API error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/sos - Cancel emergency request
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { requestId, reason } = await request.json();

    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("emergency_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("citizen_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Log trip event
    await supabase.from("trip_events").insert({
      request_id: requestId,
      event_type: "sos_cancelled",
      actor_id: user.id,
      metadata: { reason: reason || "User cancelled" },
    });

    return NextResponse.json({ success: true, request: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
