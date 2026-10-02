import Link from "next/link";
import { ArrowLeft, Ambulance, Radio, BellRing } from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function DriverPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
            <Ambulance className="w-4 h-4" /> Paramedic Driver Console
          </div>
          <LogoutButton variant="ghost" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
        <div className="w-20 h-20 rounded-full bg-amber-600/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mb-6">
          <Ambulance className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-3">
          Driver Operations Dashboard
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          Real-time dispatch intake, audio alert countdown, and trip status progression will be activated in Phase 6.
        </p>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-left w-full text-xs space-y-2 mb-6">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <Radio className="w-4 h-4" /> Ready for Phase 6:
          </div>
          <p className="text-slate-400">• Online/Offline availability toggle</p>
          <p className="text-slate-400">• 30-Second audio ping & auto-reassignment countdown</p>
          <p className="text-slate-400">• Live GPS telemetry broadcaster to Supabase</p>
          <p className="text-slate-400">• Milestone buttons: Accepted → Picked Up → Reached Hospital</p>
        </div>

        <Link
          href="/"
          className="px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition"
        >
          Return to Portal Switcher
        </Link>
      </main>
    </div>
  );
}
