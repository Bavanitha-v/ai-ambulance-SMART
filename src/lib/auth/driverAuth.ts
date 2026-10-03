import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";
import type { Profile } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

export interface DriverAuthResult {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  isDriver: boolean;
  error?: string;
  status?: number;
}

/**
 * Authenticates the caller of a driver API route.
 * Checks session cookies first, then Authorization Bearer JWT.
 * Verifies that the user exists and has a 'driver' or 'admin' role in public.profiles.
 */
export async function getDriverSession(request: NextRequest): Promise<DriverAuthResult> {
  const admin = createAdminClient();
  let user: User | null = null;

  // 1. Try Next.js server cookie session
  try {
    const supabase = await createClient();
    const {
      data: { user: cookieUser },
    } = await supabase.auth.getUser();
    if (cookieUser) {
      user = cookieUser;
    }
  } catch (cookieErr) {
    // Cookie reading might fail or be empty in non-browser client
  }

  // 2. If no cookie user, inspect Authorization: Bearer <token>
  if (!user) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      const token = authHeader.substring(7).trim();
      if (token) {
        const {
          data: { user: tokenUser },
          error: tokenErr,
        } = await admin.auth.getUser(token);
        if (tokenUser && !tokenErr) {
          user = tokenUser;
        }
      }
    }
  }

  // 3. Reject unauthenticated requests
  if (!user) {
    return {
      user: null,
      profile: null,
      isAdmin: false,
      isDriver: false,
      error: "Authentication required. Please sign in as a registered driver.",
      status: 401,
    };
  }

  // 4. Check user profile and role
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // If profile doesn't exist yet, check user_metadata or fallback
  const userRole = profile?.role || user.user_metadata?.role || "citizen";

  const isAdmin = userRole === "admin";
  const isDriver = userRole === "driver" || isAdmin;

  if (!isDriver) {
    return {
      user,
      profile: profile || null,
      isAdmin: false,
      isDriver: false,
      error: "Access denied. Only registered paramedic drivers or admins can perform this action.",
      status: 403,
    };
  }

  return {
    user,
    profile: profile || null,
    isAdmin,
    isDriver: true,
  };
}

/**
 * Verifies that a logged-in driver has authorization to view or act on a specific emergency request.
 * Drivers can ONLY see and act on requests assigned to their driver ID or their assigned ambulance.
 */
export async function verifyDriverRequestAccess(
  user: User,
  isAdmin: boolean,
  requestId: string
) {
  const admin = createAdminClient();

  const { data: request, error } = await admin
    .from("emergency_requests")
    .select(`
      *,
      ambulance:assigned_ambulance_id (*)
    `)
    .eq("id", requestId)
    .single();

  if (error || !request) {
    return {
      request: null,
      authorized: false,
      error: "Emergency request not found.",
      status: 404,
    };
  }

  if (isAdmin) {
    return { request, authorized: true };
  }

  // Check if assigned directly to driver's user ID
  if (request.assigned_driver_id === user.id) {
    return { request, authorized: true };
  }

  // Check if assigned to driver's ambulance
  if (request.ambulance && request.ambulance.driver_id === user.id) {
    return { request, authorized: true };
  }

  return {
    request: null,
    authorized: false,
    error: "Forbidden: You can only view or act on emergency requests assigned to you.",
    status: 403,
  };
}

/**
 * Verifies that a logged-in driver has authorization to control an ambulance (status, telemetry).
 * Prevents driver A from controlling driver B's vehicle.
 */
export async function verifyDriverAmbulanceAccess(
  user: User,
  isAdmin: boolean,
  ambulanceId: string
) {
  const admin = createAdminClient();

  const { data: ambulance, error } = await admin
    .from("ambulances")
    .select("*")
    .eq("id", ambulanceId)
    .single();

  if (error || !ambulance) {
    return {
      ambulance: null,
      authorized: false,
      error: "Ambulance not found.",
      status: 404,
    };
  }

  if (isAdmin) {
    return { ambulance, authorized: true };
  }

  // Driver matches assigned driver
  if (ambulance.driver_id === user.id) {
    return { ambulance, authorized: true };
  }

  // If vehicle has no driver assigned yet, claim it for this driver
  if (!ambulance.driver_id) {
    await admin
      .from("ambulances")
      .update({ driver_id: user.id, updated_at: new Date().toISOString() })
      .eq("id", ambulanceId);

    ambulance.driver_id = user.id;
    return { ambulance, authorized: true };
  }

  return {
    ambulance: null,
    authorized: false,
    error: `Forbidden: Ambulance ${ambulance.vehicle_number} is currently assigned to another driver.`,
    status: 403,
  };
}
