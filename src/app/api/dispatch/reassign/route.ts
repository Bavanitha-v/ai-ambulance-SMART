import { createClient } from "@/lib/supabase/server";
import {
  rejectAndReassignAmbulance,
  handleDispatchTimeout,
} from "@/lib/dispatch/serverDispatch";
import { NextResponse, type NextRequest } from "next/server";

// POST /api/dispatch/reassign - Server-side driver rejection or timeout reassignment
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const { requestId, reason, action = "reject" } = body;

    if (!requestId) {
      return NextResponse.json({ error: "Missing required requestId" }, { status: 400 });
    }

    if (action === "timeout") {
      const result = await handleDispatchTimeout(requestId);
      return NextResponse.json(result);
    } else {
      const result = await rejectAndReassignAmbulance(
        requestId,
        reason || "Driver rejected emergency dispatch",
        user?.id || null
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
