import { createAdminClient } from "@/lib/supabase/admin";
import type { NearestAmbulanceResult, Ambulance } from "@/types/database.types";

export interface DispatchResult {
  success: boolean;
  status: "driver_assigned" | "escalated" | "completed" | "cancelled" | "searching_driver";
  ambulance?: Ambulance | NearestAmbulanceResult | null;
  distanceMeters?: number | null;
  expiresAt?: string | null;
  message?: string;
  error?: string;
  previousRejectionsCount?: number;
}

/**
 * Server-Side Emergency Dispatch Engine (Phase 5)
 * 
 * Guarantees:
 * - PostGIS spatial nearest-search (find_nearest_available_ambulance)
 * - Atomic concurrency control (prevents race conditions so 2 requests never get the same ambulance)
 * - 30-second driver response expiration
 * - Never retries rejected or timed-out ambulances for the same request
 * - Automatic escalation to Admin Command Center when all candidate units are exhausted
 * - All operations run strictly on the server via Supabase Service Role client
 */
export async function dispatchEmergencyRequest(
  requestId: string,
  actorId?: string | null
): Promise<DispatchResult> {
  const supabase = createAdminClient();

  // 1. Try PostgreSQL RPC if migration is applied
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "dispatch_emergency_request" as any,
      {
        p_request_id: requestId,
        p_actor_id: actorId || null,
      }
    );

    if (!rpcError && rpcData && typeof rpcData === "object") {
      const res = rpcData as any;
      if (res.success && res.assigned_ambulance_id) {
        const { data: amb } = await supabase
          .from("ambulances")
          .select("*")
          .eq("id", res.assigned_ambulance_id)
          .maybeSingle();

        return {
          success: true,
          status: "driver_assigned",
          ambulance: amb || null,
          distanceMeters: res.distance_meters,
          expiresAt: res.expires_at,
          previousRejectionsCount: res.previous_rejections || 0,
        };
      } else if (res.status === "escalated") {
        return {
          success: false,
          status: "escalated",
          message: res.message || "All units busy. Escalated to Admin.",
          previousRejectionsCount: res.rejected_count || 0,
        };
      }
    }
  } catch {
    // Fall back to server-side engine below
  }

  // 2. Server-Side Fallback Engine with Atomic Concurrency Control
  const { data: request, error: reqError } = await supabase
    .from("emergency_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (reqError || !request) {
    return {
      success: false,
      status: "searching_driver",
      error: reqError?.message || "Emergency request not found",
    };
  }

  if (request.status === "completed" || request.status === "cancelled") {
    return {
      success: false,
      status: request.status,
      message: `Request is already ${request.status}`,
    };
  }

  // Collect all rejected/timed-out ambulance IDs for this request
  const excludedAmbulanceIds = new Set<string>();
  if (Array.isArray(request.rejected_ambulance_ids)) {
    request.rejected_ambulance_ids.forEach((id: string) => excludedAmbulanceIds.add(id));
  }

  // Also query historical trip_events to catch any past rejections or timeouts
  const { data: pastEvents } = await supabase
    .from("trip_events")
    .select("metadata, event_type")
    .eq("request_id", requestId)
    .in("event_type", ["driver_rejected", "driver_timeout"]);

  if (pastEvents) {
    for (const ev of pastEvents) {
      const meta = ev.metadata as any;
      if (meta?.ambulance_id) {
        excludedAmbulanceIds.add(meta.ambulance_id);
      }
    }
  }

  // PostGIS Spatial Search for Nearest Available Ambulances (50km radius)
  const { data: candidateUnits, error: geoError } = await supabase.rpc(
    "find_nearest_available_ambulance",
    {
      lat: request.pickup_latitude,
      lng: request.pickup_longitude,
      radius_meters: 50000,
      exclude_ambulance_ids: Array.from(excludedAmbulanceIds),
    }
  );

  if (geoError) {
    console.error("[Dispatch] PostGIS spatial query failed:", geoError);
  }

  // Filter out any units currently rejected or not available
  const availableCandidates: NearestAmbulanceResult[] = (candidateUnits || []).filter(
    (amb: NearestAmbulanceResult) =>
      amb.status === "available" && !excludedAmbulanceIds.has(amb.id)
  );

  let assignedAmbulance: Ambulance | null = null;
  let chosenDistance: number | null = null;

  // Atomic Row Locking via Compare-and-Swap:
  // We atomically update status to 'busy' WHERE status = 'available'.
  // If another concurrent dispatch already took this unit, 0 rows update and we continue to the next nearest.
  for (const candidate of availableCandidates) {
    const { data: lockedUnit, error: lockErr } = await supabase
      .from("ambulances")
      .update({
        status: "busy",
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id)
      .eq("status", "available")
      .select("*")
      .maybeSingle();

    if (!lockErr && lockedUnit) {
      assignedAmbulance = lockedUnit;
      chosenDistance = candidate.distance_meters;
      break; // Successfully locked nearest available ambulance!
    }
  }

  // Handle Successful Assignment
  if (assignedAmbulance) {
    const expiresAt = new Date(Date.now() + 30 * 1000).toISOString(); // Strict 30-sec driver countdown

    const updatePayload: Record<string, any> = {
      assigned_ambulance_id: assignedAmbulance.id,
      assigned_driver_id: assignedAmbulance.driver_id,
      status: "driver_assigned",
      driver_assignment_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    // If rejected_ambulance_ids exists on the table, update it
    if ("rejected_ambulance_ids" in request) {
      updatePayload.rejected_ambulance_ids = Array.from(excludedAmbulanceIds);
    }

    await supabase
      .from("emergency_requests")
      .update(updatePayload)
      .eq("id", requestId);

    // Audit log in trip_events
    await supabase.from("trip_events").insert({
      request_id: requestId,
      event_type: "driver_assigned",
      actor_id: actorId || assignedAmbulance.driver_id,
      latitude: assignedAmbulance.latitude,
      longitude: assignedAmbulance.longitude,
      metadata: {
        ambulance_id: assignedAmbulance.id,
        vehicle_number: assignedAmbulance.vehicle_number,
        distance_meters: chosenDistance ? Math.round(chosenDistance) : null,
        expires_at: expiresAt,
        previous_rejections_count: excludedAmbulanceIds.size,
      },
    });

    return {
      success: true,
      status: "driver_assigned",
      ambulance: assignedAmbulance,
      distanceMeters: chosenDistance ? Math.round(chosenDistance) : null,
      expiresAt,
      previousRejectionsCount: excludedAmbulanceIds.size,
    };
  }

  // Handle Fleet Exhaustion: No available ambulance or all within 50km rejected/busy
  const escalationPayload: Record<string, any> = {
    status: "escalated",
    assigned_ambulance_id: null,
    assigned_driver_id: null,
    driver_assignment_expires_at: null,
    updated_at: new Date().toISOString(),
  };

  if ("rejected_ambulance_ids" in request) {
    escalationPayload.rejected_ambulance_ids = Array.from(excludedAmbulanceIds);
  }

  await supabase
    .from("emergency_requests")
    .update(escalationPayload)
    .eq("id", requestId);

  // Audit log escalation event
  await supabase.from("trip_events").insert({
    request_id: requestId,
    event_type: "dispatch_escalated",
    actor_id: actorId || null,
    metadata: {
      reason: "no_available_ambulances",
      rejected_count: excludedAmbulanceIds.size,
      escalated_to: "admin_command_center",
    },
  });

  // Notify Admin Command Center
  try {
    await supabase.from("admin_notifications").insert({
      request_id: requestId,
      type: "escalation",
      title: "EMERGENCY ESCALATION: No Ambulances Available",
      message: `Emergency request ${requestId} at GPS (${request.pickup_latitude}, ${request.pickup_longitude}) escalated. All candidate ambulances are busy or rejected. Manual override required.`,
      severity: "critical",
      metadata: {
        request_id: requestId,
        severity: request.ai_severity,
        rejected_count: excludedAmbulanceIds.size,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // If admin_notifications table is not yet migrated, log to console
    console.warn(`[Dispatch] Escalation alert generated for request ${requestId}`);
  }

  return {
    success: false,
    status: "escalated",
    message: "No available ambulances found within response range. Request escalated to Admin Command Center.",
    previousRejectionsCount: excludedAmbulanceIds.size,
  };
}

/**
 * Handle Driver Rejection & Reassign to Next-Nearest (Never Retries Same Ambulance)
 */
export async function rejectAndReassignAmbulance(
  requestId: string,
  reason: string = "Driver rejected emergency dispatch",
  actorId?: string | null
): Promise<DispatchResult> {
  const supabase = createAdminClient();

  // Try DB RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "reject_and_reassign_ambulance" as any,
      {
        p_request_id: requestId,
        p_reason: reason,
        p_actor_id: actorId || null,
      }
    );

    if (!rpcError && rpcData && typeof rpcData === "object") {
      const res = rpcData as any;
      if (res.success && res.assigned_ambulance_id) {
        const { data: amb } = await supabase
          .from("ambulances")
          .select("*")
          .eq("id", res.assigned_ambulance_id)
          .maybeSingle();

        return {
          success: true,
          status: "driver_assigned",
          ambulance: amb || null,
          distanceMeters: res.distance_meters,
          expiresAt: res.expires_at,
          previousRejectionsCount: res.previous_rejections || 1,
        };
      } else if (res.status === "escalated") {
        return {
          success: false,
          status: "escalated",
          message: res.message,
        };
      }
    }
  } catch {
    // Fall back to server-side engine
  }

  // Server-side Rejection Handling
  const { data: request } = await supabase
    .from("emergency_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!request) {
    return {
      success: false,
      status: "searching_driver",
      error: "Request not found",
    };
  }

  const oldAmbulanceId = request.assigned_ambulance_id;

  // Release the old ambulance back to 'available'
  if (oldAmbulanceId) {
    await supabase
      .from("ambulances")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", oldAmbulanceId);
  }

  // Audit log rejection in trip_events
  await supabase.from("trip_events").insert({
    request_id: requestId,
    event_type: "driver_rejected",
    actor_id: actorId || request.assigned_driver_id || null,
    metadata: {
      ambulance_id: oldAmbulanceId,
      reason,
      timestamp: new Date().toISOString(),
    },
  });

  // Update rejected_ambulance_ids array if column exists
  const rejected = new Set<string>(request.rejected_ambulance_ids || []);
  if (oldAmbulanceId) rejected.add(oldAmbulanceId);

  const updatePayload: Record<string, any> = {
    assigned_ambulance_id: null,
    assigned_driver_id: null,
    driver_assignment_expires_at: null,
    status: "searching_driver",
    updated_at: new Date().toISOString(),
  };

  if ("rejected_ambulance_ids" in request) {
    updatePayload.rejected_ambulance_ids = Array.from(rejected);
  }

  await supabase
    .from("emergency_requests")
    .update(updatePayload)
    .eq("id", requestId);

  // Trigger immediate server-side reassignment to next nearest
  return dispatchEmergencyRequest(requestId, actorId);
}

/**
 * Handle 30-Second Driver Assignment Timeout
 */
export async function handleDispatchTimeout(
  requestId: string
): Promise<DispatchResult & { timedOut: boolean }> {
  const supabase = createAdminClient();

  // Try DB RPC first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "handle_dispatch_timeout" as any,
      { p_request_id: requestId }
    );

    if (!rpcError && rpcData && typeof rpcData === "object") {
      const res = rpcData as any;
      if (res.message === "Assignment has not expired yet") {
        return {
          success: false,
          status: "driver_assigned",
          timedOut: false,
          message: res.message,
        };
      }
      if (res.success && res.assigned_ambulance_id) {
        const { data: amb } = await supabase
          .from("ambulances")
          .select("*")
          .eq("id", res.assigned_ambulance_id)
          .maybeSingle();

        return {
          success: true,
          status: "driver_assigned",
          ambulance: amb || null,
          distanceMeters: res.distance_meters,
          expiresAt: res.expires_at,
          timedOut: true,
        };
      } else if (res.status === "escalated") {
        return {
          success: false,
          status: "escalated",
          timedOut: true,
          message: res.message,
        };
      }
    }
  } catch {
    // Fall back to server-side engine
  }

  const { data: request } = await supabase
    .from("emergency_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (!request) {
    return {
      success: false,
      status: "searching_driver",
      timedOut: false,
      error: "Request not found",
    };
  }

  if (request.status !== "driver_assigned") {
    return {
      success: false,
      status: request.status,
      timedOut: false,
      message: `Request status is ${request.status}, not awaiting assignment`,
    };
  }

  if (
    request.driver_assignment_expires_at &&
    new Date(request.driver_assignment_expires_at) > new Date()
  ) {
    return {
      success: false,
      status: "driver_assigned",
      timedOut: false,
      message: "Assignment deadline has not elapsed yet",
    };
  }

  const oldAmbulanceId = request.assigned_ambulance_id;

  // Release ambulance back to fleet
  if (oldAmbulanceId) {
    await supabase
      .from("ambulances")
      .update({ status: "available", updated_at: new Date().toISOString() })
      .eq("id", oldAmbulanceId);
  }

  // Audit log timeout in trip_events
  await supabase.from("trip_events").insert({
    request_id: requestId,
    event_type: "driver_timeout",
    metadata: {
      ambulance_id: oldAmbulanceId,
      reason: "30-second driver response countdown expired",
      timestamp: new Date().toISOString(),
    },
  });

  // Record rejection
  const rejected = new Set<string>(request.rejected_ambulance_ids || []);
  if (oldAmbulanceId) rejected.add(oldAmbulanceId);

  const updatePayload: Record<string, any> = {
    assigned_ambulance_id: null,
    assigned_driver_id: null,
    driver_assignment_expires_at: null,
    status: "searching_driver",
    updated_at: new Date().toISOString(),
  };

  if ("rejected_ambulance_ids" in request) {
    updatePayload.rejected_ambulance_ids = Array.from(rejected);
  }

  await supabase
    .from("emergency_requests")
    .update(updatePayload)
    .eq("id", requestId);

  // Reassign to next nearest
  const newDispatch = await dispatchEmergencyRequest(requestId);
  return {
    ...newDispatch,
    timedOut: true,
  };
}

/**
 * Sweep and reassign all expired driver assignments across the fleet
 */
export async function processExpiredDispatches(): Promise<{ processedCount: number }> {
  const supabase = createAdminClient();

  const nowIso = new Date().toISOString();
  const { data: expiredRequests } = await supabase
    .from("emergency_requests")
    .select("id")
    .eq("status", "driver_assigned")
    .lte("driver_assignment_expires_at", nowIso);

  let processedCount = 0;
  if (expiredRequests && expiredRequests.length > 0) {
    for (const req of expiredRequests) {
      await handleDispatchTimeout(req.id);
      processedCount++;
    }
  }

  return { processedCount };
}
