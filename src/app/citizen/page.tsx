import Link from "next/link";
import { ArrowLeft, Siren, AlertTriangle, ShieldCheck } from "lucide-react";

export default function CitizenPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold text-red-400">
          <Siren className="w-4 h-4" /> Citizen Emergency Mode
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto">
        <div className="w-20 h-20 rounded-full bg-red-600/20 border-2 border-red-500/40 flex items-center justify-center text-red-500 mb-6 animate-pulse">
          <Siren className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-3">
          AI Smart SOS Portal
        </h1>
        <p className="text-slate-400 text-sm mb-6">
          Citizen SOS trigger, symptom selection, and live Leaflet ambulance tracking will be activated in Phase 4.
        </p>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-left w-full text-xs space-y-2 mb-6">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <AlertTriangle className="w-4 h-4" /> Ready for Phase 4:
          </div>
          <p className="text-slate-400">
            • 1-Tap Geolocation acquisition with accuracy indicator
          </p>
          <p className="text-slate-400">
            • Quick symptom tagger (Cardiac, Trauma, Stroke, Respiratory)
          </p>
          <p className="text-slate-400">
            • Live map with assigned paramedic vehicle position & real-time ETA
          </p>
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
