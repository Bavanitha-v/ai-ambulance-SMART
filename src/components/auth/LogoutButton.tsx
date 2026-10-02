"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogOut, Loader2 } from "lucide-react";

interface LogoutButtonProps {
  className?: string;
  variant?: "ghost" | "solid" | "compact";
  label?: string;
}

export function LogoutButton({
  className = "",
  variant = "ghost",
  label = "Sign Out",
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    try {
      setLoading(true);
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/auth/login");
      router.refresh();
    } catch (err) {
      console.error("Sign out error:", err);
      // Fallback redirect
      window.location.href = "/auth/login";
    } finally {
      setLoading(false);
    }
  }

  const baseStyles =
    "inline-flex items-center gap-1.5 transition text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed";

  let variantStyles = "text-slate-400 hover:text-white hover:bg-slate-800/80 px-2.5 py-1.5 border border-slate-700/50";
  if (variant === "solid") {
    variantStyles = "bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30 px-3 py-1.5";
  } else if (variant === "compact") {
    variantStyles = "text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-md";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={`${baseStyles} ${variantStyles} ${className}`}
      title="Sign out of system"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <LogOut className="w-3.5 h-3.5" />
      )}
      {variant !== "compact" && (
        <span>{loading ? "Signing out..." : label}</span>
      )}
    </button>
  );
}
