import { getDriverSession, verifyDriverRequestAccess } from "@/lib/auth/driverAuth";
import {
  rejectAndReassignAmbulance,
  handleDispatchTimeout,
} from "@/lib/dispatch/serverDispatch";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/dispatch/reassign - Server-side driver rejection or timeout reassignment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requestId, reason, action = "reject" } = body;

    if (!requestId) {
      return NextResponse.json({ error: "Missing required requestId" }, { status: 400 });
    }

    if (action === "timeout") {
      const result = await handleDispatchTimeout(requestId);
      return NextResponse.json(result);
    } else {
      // 1. Verify driver authentication
      const auth = await getDriverSession(request);
      if (auth.error || !auth.user) {
        return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
      }

      // 2. CRITICAL REQUIREMENT: Verify driver identity matches assigned request
      const reqAuth = await verifyDriverRequestAccess(auth.user, auth.isAdmin, requestId);
      if (!reqAuth.authorized || !reqAuth.request) {
        return NextResponse.json({ error: reqAuth.error }, { status: reqAuth.status || 403 });
      }

      const result = await rejectAndReassignAmbulance(
        requestId,
        reason || "Driver rejected emergency dispatch",
        auth.user.id
      );
      return NextResponse.json(result);
    }
  } catch (err: any) {
    console.error("[API /api/dispatch/reassign] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to execute dispatch reassignment" },
      { status: 500 }
    );
  }
}
