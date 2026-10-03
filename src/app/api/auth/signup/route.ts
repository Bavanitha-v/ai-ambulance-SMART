import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

const SignupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(1, "Full name is required"),
  phone: z.string().optional().nullable(),
  role: z.enum(["citizen", "driver", "hospital"]), // Admin strictly disallowed from public signup
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = SignupSchema.safeParse(body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join(", ");
      return NextResponse.json({ error: issues }, { status: 400 });
    }

    const { email, password, fullName, phone, role } = parsed.data;
    const adminClient = createAdminClient();

    // Create user using admin API with email_confirm: true
    // This avoids hitting the Supabase email rate limit and enables instant login!
    const { data, error } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName.trim(),
        phone: phone?.trim() || null,
        role: role,
      },
    });

    if (error) {
      if (
        error.message.includes("already been registered") ||
        error.message.includes("already exists")
      ) {
        return NextResponse.json(
          { error: "An account with this email address already exists. Please switch to Sign In." },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      user: data.user,
      message: "Account created and verified successfully.",
    });
  } catch (err: any) {
    console.error("Signup API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create account" },
      { status: 500 }
    );
  }
}
