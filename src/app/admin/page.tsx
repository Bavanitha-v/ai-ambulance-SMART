import Link from "next/link";
import { ArrowLeft, ShieldCheck, Map, BarChart3, AlertOctagon } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
          <ShieldCheck className="w-4 h-4" /> Admin Command Center
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
        <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500/40 flex items-center justify-center text-blue-400 mb-6">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-3">
          Emergency Command Center
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          City-wide fleet map, SLA analytics, and manual escalation controls will be activated in Phase 8.
        </p>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-left w-full text-xs space-y-2 mb-6">
          <div className="flex items-center gap-2 text-blue-400 font-semibold">
            <BarChart3 className="w-4 h-4" /> Ready for Phase 8:
          </div>
          <p className="text-slate-400">• Full city-scale interactive Leaflet fleet map</p>
          <p className="text-slate-400">• Real-time SLA response metrics (Average dispatch time)</p>
          <p className="text-slate-400">• Manual driver override & unassigned emergency escalation</p>
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
