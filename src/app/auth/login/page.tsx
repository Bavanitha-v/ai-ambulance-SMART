"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database.types";
import {
  Siren,
  Ambulance,
  Building2,
  Lock,
  Mail,
  User,
  Phone,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ArrowRight,
  Info,
} from "lucide-react";

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const redirectTarget = searchParams.get("redirect") || "";
  const authError = searchParams.get("error");

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"citizen" | "driver" | "hospital">("citizen");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authError === "unauthorized_admin") {
      setErrorMessage("Access denied: You do not have Central Command Admin privileges.");
    } else if (authError === "unauthorized_driver") {
      setErrorMessage("Access denied: This portal is restricted to registered Paramedic Drivers.");
    } else if (authError === "unauthorized_hospital") {
      setErrorMessage("Access denied: This portal is restricted to Hospital ER Staff.");
    }
  }, [authError]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        // Query the profile role
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .maybeSingle();

        const userRole = (profile?.role || data.user.user_metadata?.role || "citizen") as UserRole;

        // Redirect to requested URL or user's role dashboard
        if (redirectTarget && redirectTarget.startsWith("/")) {
          router.push(redirectTarget);
        } else {
          router.push(`/${userRole}`);
        }
        router.refresh();
      }
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.message?.includes("Invalid login credentials")) {
        setErrorMessage("Invalid email or password. Please verify your credentials or create a new account.");
      } else if (err.message?.includes("Email not confirmed")) {
        setErrorMessage("Your email has not been verified yet. Check your inbox or disable 'Confirm email' in Supabase Auth settings.");
      } else {
        setErrorMessage(err.message || "Failed to sign in. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email || !password || !fullName) {
      setErrorMessage("Please fill in your name, email, and password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    try {
      setLoading(true);

      // Call server signup endpoint (which auto-verifies email and bypasses rate limits)
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          role,
        }),
      });

      const resJson = await res.json();

      if (!res.ok) {
        throw new Error(resJson.error || "Failed to create account");
      }

      setSuccessMessage("Account created successfully! Logging you in...");

      // Automatically sign in with the newly created account
      const supabase = createClient();
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        throw loginError;
      }

      setTimeout(() => {
        if (redirectTarget && redirectTarget.startsWith("/")) {
          router.push(redirectTarget);
        } else {
          router.push(`/${role}`);
        }
        router.refresh();
      }, 600);
    } catch (err: any) {
      console.error("Signup error:", err);
      if (err.message?.includes("already exists") || err.message?.includes("already been registered")) {
        setErrorMessage("An account with this email address already exists. Please switch to Sign In.");
      } else {
        setErrorMessage(err.message || "Failed to create account. Please check your details.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative">
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <div className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
          <Siren className="w-3 h-3 animate-pulse" />
          <span>Secure Auth</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-black text-white tracking-tight">
          {mode === "login" ? "Sign In to AI ResQ" : "Create EMS Account"}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          {mode === "login"
            ? "Enter your credentials to access your dispatch dashboard"
            : "Select your role to connect to the smart emergency grid"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-6">
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
            mode === "login"
              ? "bg-slate-800 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
            mode === "signup"
              ? "bg-slate-800 text-white shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{successMessage}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
        {mode === "signup" && (
          <>
            {/* Full Name */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Full Name <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Rajesh / Paramedic Kumar"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Phone Number (Optional)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Select Your Role <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* Citizen */}
                <button
                  type="button"
                  onClick={() => setRole("citizen")}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col items-start ${
                    role === "citizen"
                      ? "bg-red-500/10 border-red-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <Siren className={`w-4 h-4 mb-1.5 ${role === "citizen" ? "text-red-400" : "text-slate-500"}`} />
                  <span className="text-xs font-bold block">Citizen</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">SOS & Tracking</span>
                </button>

                {/* Driver */}
                <button
                  type="button"
                  onClick={() => setRole("driver")}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col items-start ${
                    role === "driver"
                      ? "bg-amber-500/10 border-amber-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <Ambulance className={`w-4 h-4 mb-1.5 ${role === "driver" ? "text-amber-400" : "text-slate-500"}`} />
                  <span className="text-xs font-bold block">Driver</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">Paramedic Crew</span>
                </button>

                {/* Hospital */}
                <button
                  type="button"
                  onClick={() => setRole("hospital")}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col items-start ${
                    role === "hospital"
                      ? "bg-emerald-500/10 border-emerald-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <Building2 className={`w-4 h-4 mb-1.5 ${role === "hospital" ? "text-emerald-400" : "text-slate-500"}`} />
                  <span className="text-xs font-bold block">Hospital</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 leading-tight">ER & Bed Unit</span>
                </button>
              </div>

              {/* Admin Note */}
              <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-slate-500 leading-tight">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
                <span>
                  Admin Command role cannot be self-registered. It is assigned via the database.
                </span>
              </div>
            </div>
          </>
        )}

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Email Address <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Password <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-sm transition shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{mode === "login" ? "Signing In..." : "Creating Account..."}</span>
            </>
          ) : (
            <>
              <span>{mode === "login" ? "Sign In with Email" : "Complete Registration"}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer Info */}
      <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
        <p className="text-xs text-slate-500">
          Protected by Supabase Row-Level Security & Encrypted Auth
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
          </div>
        }
      >
        <AuthForm />
      </Suspense>
    </div>
  );
}
