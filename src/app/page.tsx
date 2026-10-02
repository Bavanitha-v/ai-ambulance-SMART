import Link from "next/link";
import {
  Siren,
  Ambulance,
  Building2,
  ShieldAlert,
  Activity,
  MapPin,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Stethoscope,
  Radio,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col justify-between">
      {/* Top Emergency System Alert Bar */}
      <div className="bg-red-950/80 border-b border-red-800/50 px-4 py-2 text-xs text-red-200 flex items-center justify-between">
        <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="font-semibold uppercase tracking-wider text-[11px]">
            Live Emergency Response Network
          </span>
          <span className="text-red-400 hidden sm:inline">|</span>
          <span className="text-slate-300 hidden sm:inline">
            Active Grid: Chennai Metro & Suburbs (Apollo, Rajiv Gandhi GH, MIOT, Fortis)
          </span>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
            <Radio className="w-3 h-3 animate-pulse" /> DISPATCH ONLINE
          </span>
        </div>
      </div>

      {/* Main Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/20">
              <Siren className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-tight flex items-center gap-1.5">
                AI ResQ <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">PILOT MVP</span>
              </span>
              <p className="text-[11px] text-slate-400 -mt-0.5">Smart Emergency Ambulance Dispatch</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700/60 hover:bg-slate-800 transition"
            >
              Sign In
            </Link>
            <Link
              href="/citizen"
              className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3.5 py-1.5 rounded-lg shadow-md shadow-red-600/30 flex items-center gap-1.5 transition"
            >
              <Siren className="w-3.5 h-3.5" /> Quick SOS
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex-1 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Zero-Delay Spatial PostGIS Dispatch + AI Symptom Triage
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight sm:leading-none mb-4">
            Seconds Save Lives.{" "}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-rose-300 to-amber-300">
              One Tap to Care.
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Autonomous emergency pipeline: Instant GPS lock, automated AI clinical triage, 
            sub-second PostGIS nearest ambulance routing, and real-time hospital ER pre-alerts.
          </p>
        </div>

        {/* SOS Primary Quick Trigger Banner */}
        <div className="relative rounded-2xl overflow-hidden p-6 sm:p-8 bg-gradient-to-b from-red-950/40 via-slate-900/90 to-slate-900 border border-red-900/40 shadow-2xl mb-12">
          <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 blur-3xl -z-10 rounded-full"></div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-left">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 uppercase tracking-widest">
                <ShieldAlert className="w-4 h-4 text-red-500" /> Immediate Medical Emergency?
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Launch Live Citizen SOS Mode
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
                Automatically fetches high-precision browser coordinates, initiates emergency triage, 
                and signals the nearest active paramedic crew.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <Link
                href="/citizen"
                className="sos-glow-button w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:from-red-500 hover:to-rose-600 text-white font-extrabold text-base rounded-xl flex items-center justify-center gap-3 transition-all"
              >
                <Siren className="w-5 h-5 animate-bounce" />
                PRESS FOR SOS DISPATCH
              </Link>
            </div>
          </div>
        </div>

        {/* Role Portal Selector Cards */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Role-Based Operational Consoles (MVP Pilot Demo)
            </h2>
            <span className="text-xs text-slate-500">Select any role to test workflow</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Citizen Portal */}
            <Link
              href="/citizen"
              className="group p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-red-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base group-hover:text-red-400 transition">
                  1. Citizen SOS
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  One-tap distress call, symptom tagger, live Leaflet ambulance tracking & real-time ETA.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-red-400 font-medium">
                <span>Enter SOS View</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>

            {/* 2. Driver Portal */}
            <Link
              href="/driver"
              className="group p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                  <Ambulance className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base group-hover:text-amber-400 transition">
                  2. Paramedic / Driver
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Online/offline toggle, 30s emergency alert countdown, turn-by-turn steps & live GPS telemetry.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-amber-400 font-medium">
                <span>Driver Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>

            {/* 3. Hospital Console */}
            <Link
              href="/hospital"
              className="group p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base group-hover:text-emerald-400 transition">
                  3. Hospital ER
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Realtime incoming trauma queue, AI clinical severity badge, triage tips & bed/ICU management.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span>Hospital Console</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>

            {/* 4. Admin Command Center */}
            <Link
              href="/admin"
              className="group p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/90 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-white text-base group-hover:text-blue-400 transition">
                  4. Admin Command
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  City-wide fleet map, SLA analytics (avg dispatch time), manual override & escalation center.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-blue-400 font-medium">
                <span>Command Center</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
              </div>
            </Link>
          </div>
        </div>

        {/* System Performance & Architecture Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-xl bg-slate-900/40 border border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Avg Assignment SLA</p>
              <p className="text-base font-bold text-white font-mono">&lt; 30 Seconds</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Spatial Routing</p>
              <p className="text-base font-bold text-white font-mono">PostGIS GIST</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Stethoscope className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Triage Intelligence</p>
              <p className="text-base font-bold text-white font-mono">Fail-Safe AI</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Realtime Transport</p>
              <p className="text-base font-bold text-white font-mono">Supabase WSS</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer & Disclaimer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-4 sm:px-6 py-4 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p>© 2026 AI ResQ Emergency Smart Ambulance System. Built for Hospital & EMS Operators.</p>
          <div className="p-1 px-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-amber-400/90 font-medium">
            Medical Disclaimer: AI suggestions provide triage guidance and do NOT replace professional medical diagnosis.
          </div>
        </div>
      </footer>
    </div>
  );
}
