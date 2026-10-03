"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchEmergencyRequest,
  rejectAndReassignAmbulance,
  handleDispatchTimeout,
  processExpiredDispatches,
  type DispatchResult,
} from "@/lib/dispatch/serverDispatch";
import type { TriageSeverity } from "@/types/database.types";

export interface SOSInputPayload {
  latitude: number;
  longitude: number;
  address?: string;
  symptoms?: string;
  category?: string;
  severity?: TriageSeverity;
}

/**
 * Server Action: Create SOS Emergency Request and Trigger Server-Side Dispatch
 * Strictly runs server-side with user auth verification, rate limiting, PostGIS nearest matching,
 * atomic row-locking, and trip audit logging.
 */
export async function createAndDispatchSOSAction(
  payload: SOSInputPayload
): Promise<{ success: boolean; request?: any; dispatch?: DispatchResult; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        error: "Authentication required to trigger emergency dispatch.",
      };
    }

    const { latitude, longitude, address, symptoms, category = "general", severity = "high" } = payload;

    if (!latitude || !longitude) {
      return { success: false, error: "GPS coordinates (latitude, longitude) are required." };
    }

    const admin = createAdminClient();

    // 1. Enforce Rate Limiting (max 3 requests per 10 minutes per citizen)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
      .from("emergency_requests")
      .select("id", { count: "exact", head: true })
      .eq("citizen_id", user.id)
      .gte("created_at", tenMinutesAgo);

    if (!countErr && count !== null && count >= 3) {
      return {
        success: false,
        error: "Rate limit exceeded (3 requests per 10 min). Contact 108 Emergency Control directly.",
      };
    }

    // 2. Insert Emergency Request in 'searching_driver' state
    const pointWkt = `POINT(${longitude} ${latitude})`;
    const { data: newRequest, error: insertError } = await admin
      .from("emergency_requests")
      .insert({
        citizen_id: user.id,
        pickup_latitude: latitude,
        pickup_longitude: longitude,
        pickup_location: pointWkt,
        pickup_address: address || "GPS Location",
        symptoms: symptoms ? `[${category.toUpperCase()}] ${symptoms}` : `[${category.toUpperCase()}] Emergency SOS`,
        ai_severity: severity,
        status: "searching_driver",
      })
      .select()
      .single();

    if (insertError || !newRequest) {
      return {
        success: false,
        error: insertError?.message || "Failed to create emergency request.",
      };
    }

    // 3. Log initial audit event in trip_events
    await admin.from("trip_events").insert({
      request_id: newRequest.id,
      event_type: "sos_created",
      actor_id: user.id,
      latitude,
      longitude,
      metadata: {
        category,
        severity,
        address,
      },
    });

    // 4. Trigger Atomic Server-Side Dispatch
    const dispatch = await dispatchEmergencyRequest(newRequest.id, user.id);

    // 5. Fetch updated request record
    const { data: updatedRequest } = await admin
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
        )
      `)
      .eq("id", newRequest.id)
      .single();

    return {
      success: true,
      request: updatedRequest || newRequest,
      dispatch,
    };
  } catch (err: any) {
    console.error("[Action createAndDispatchSOSAction] Error:", err);
    return { success: false, error: err.message || "Internal server error during dispatch." };
  }
}

/**
 * Server Action: Driver rejects emergency assignment.
 * Immediately frees previous unit, blacklists it for this request, and reassigns to the next nearest.
 */
export async function rejectDispatchAction(
  requestId: string,
  reason: string = "Driver rejected emergency dispatch"
): Promise<{ success: boolean; dispatch?: DispatchResult; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dispatch = await rejectAndReassignAmbulance(requestId, reason, user?.id || null);
    return { success: true, dispatch };
  } catch (err: any) {
    console.error("[Action rejectDispatchAction] Error:", err);
    return { success: false, error: err.message || "Failed to reject dispatch." };
  }
}

/**
 * Server Action: Check if 30s countdown expired, and trigger next-nearest reassignment if timed out.
 */
export async function checkTimeoutAction(
  requestId: string
): Promise<{ success: boolean; timedOut: boolean; dispatch?: DispatchResult; error?: string }> {
  try {
    const result = await handleDispatchTimeout(requestId);
    return {
      success: true,
      timedOut: result.timedOut,
      dispatch: result,
    };
  } catch (err: any) {
    console.error("[Action checkTimeoutAction] Error:", err);
    return { success: false, timedOut: false, error: err.message };
  }
}

/**
 * Server Action: Fleet-wide sweep of all expired driver assignments
 */
export async function sweepExpiredDispatchesAction(): Promise<{ processedCount: number }> {
  return processExpiredDispatches();
}
