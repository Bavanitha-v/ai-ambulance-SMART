import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { UserRole } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isCitizenRoute = pathname.startsWith("/citizen");
  const isDriverRoute = pathname.startsWith("/driver");
  const isHospitalRoute = pathname.startsWith("/hospital");
  const isAdminRoute = pathname.startsWith("/admin");
  const isAuthRoute = pathname.startsWith("/auth/login") || pathname.startsWith("/auth/signup");

  const isProtectedRoute = isCitizenRoute || isDriverRoute || isHospitalRoute || isAdminRoute;

  // Unauthenticated user attempting to access protected route
  if (isProtectedRoute && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated, determine their role
  if (user) {
    let userRole: UserRole = "citizen";

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role) {
      userRole = profile.role as UserRole;
    } else if (user.user_metadata?.role) {
      userRole = user.user_metadata.role as UserRole;
    }

    // Authenticated user trying to access /auth/login or /auth/signup
    if (isAuthRoute) {
      const redirectParam = request.nextUrl.searchParams.get("redirect");
      if (redirectParam && redirectParam.startsWith("/")) {
        return NextResponse.redirect(new URL(redirectParam, request.url));
      }
      return NextResponse.redirect(new URL(`/${userRole}`, request.url));
    }

    // Role-based route enforcement
    if (isAdminRoute && userRole !== "admin") {
      const redirectUrl = new URL(`/${userRole}`, request.url);
      redirectUrl.searchParams.set("error", "unauthorized_admin");
      return NextResponse.redirect(redirectUrl);
    }

    if (isDriverRoute && userRole !== "driver" && userRole !== "admin") {
      const redirectUrl = new URL(`/${userRole}`, request.url);
      redirectUrl.searchParams.set("error", "unauthorized_driver");
      return NextResponse.redirect(redirectUrl);
    }

    if (isHospitalRoute && userRole !== "hospital" && userRole !== "admin") {
      const redirectUrl = new URL(`/${userRole}`, request.url);
      redirectUrl.searchParams.set("error", "unauthorized_hospital");
      return NextResponse.redirect(redirectUrl);
    }

    if (isCitizenRoute && userRole !== "citizen" && userRole !== "admin") {
      const redirectUrl = new URL(`/${userRole}`, request.url);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}
