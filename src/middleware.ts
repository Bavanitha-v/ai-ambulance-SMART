import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/citizen/:path*",
    "/driver/:path*",
    "/hospital/:path*",
    "/admin/:path*",
    "/auth/login",
    "/auth/signup",
  ],
};
