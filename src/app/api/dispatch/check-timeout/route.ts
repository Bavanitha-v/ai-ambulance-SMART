import {
  handleDispatchTimeout,
  processExpiredDispatches,
} from "@/lib/dispatch/serverDispatch";
import { NextResponse, type NextRequest } from "next/server";

// GET or POST /api/dispatch/check-timeout
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get("requestId");

  try {
    if (requestId) {
      const result = await handleDispatchTimeout(requestId);
      return NextResponse.json(result);
    } else {
      const result = await processExpiredDispatches();
      return NextResponse.json(result);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    let requestId: string | null = null;
    try {
      const body = await request.json();
      requestId = body.requestId || null;
    } catch {
      // No JSON body provided
    }

    if (requestId) {
      const result = await handleDispatchTimeout(requestId);
      return NextResponse.json(result);
    } else {
      const result = await processExpiredDispatches();
      return NextResponse.json(result);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
