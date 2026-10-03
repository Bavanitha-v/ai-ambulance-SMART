"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ambulance,
  Radio,
  BellRing,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Flame,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function DriverPage() {
  const [activeDispatches, setActiveDispatches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Poll for active dispatches
  const fetchDispatches = async () => {
    try {
      const res = await fetch("/api/dispatch/active");
      const data = await res.json();
      if (res.ok) {
        setActiveDispatches(data.requests || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatches();
    const interval = setInterval(fetchDispatches, 3000);
    return () => clearInterval(interval);
  }, []);

  // Accept Dispatch
  const handleAccept = async (requestId: string) => {
    setActionLoading(requestId);
    setMessage(null);
    try {
      const res = await fetch("/api/dispatch/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept dispatch");
      setMessage({ text: "Dispatch Accepted! Unit marked en route.", type: "success" });
      await fetchDispatches();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Reject Dispatch (Triggers server-side next-nearest reassignment)
  const handleReject = async (requestId: string) => {
    setActionLoading(requestId);
    setMessage(null);
    try {
      const res = await fetch("/api/dispatch/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: "reject",
          reason: "Driver unavailable / manual rejection",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject dispatch");
      setMessage({
        text: `Dispatch rejected. Server automatically reallocated to next-nearest unit: ${data.ambulance?.vehicle_number || data.status}`,
        type: "info",
      });
      await fetchDispatches();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  // Simulate 30-Sec Timeout (Triggers server-side timeout reassignment)
  const handleSimulateTimeout = async (requestId: string) => {
    setActionLoading(requestId);
    setMessage(null);
    try {
      const res = await fetch("/api/dispatch/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          action: "timeout",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to trigger timeout");
      setMessage({
        text: `30-Sec Timeout processed. Next nearest unit assigned: ${data.ambulance?.vehicle_number || data.status}`,
        type: "info",
      });
      await fetchDispatches();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Home
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-400">
            <Ambulance className="w-4 h-4" /> Paramedic Driver Console (Phase 5 Live Intake)
          </div>
          <LogoutButton variant="ghost" />
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Radio className="w-6 h-6 text-amber-400 animate-pulse" />
              <span>Incoming Emergency Dispatches</span>
            </h1>
            <p className="text-slate-400 text-xs mt-1">
              Test Phase 5 server-side nearest unit allocation, 30s timeout auto-rotation, and rejection blacklists.
            </p>
          </div>
          <button
            onClick={fetchDispatches}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs flex items-center gap-1.5 text-slate-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              message.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : message.type === "info"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}
          >
            {message.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {message.type === "info" && <Flame className="w-4 h-4 shrink-0 text-amber-400" />}
            {message.type === "error" && <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Active Dispatches List */}
        {activeDispatches.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-14 h-14 rounded-full bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
              <BellRing className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-300">No Pending Emergency Dispatches</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Open the <strong>Citizen Portal</strong> in another tab and tap &apos;DISPATCH EMERGENCY SOS&apos;. The nearest available Chennai ambulance will immediately appear here.
            </p>
            <Link
              href="/citizen"
              target="_blank"
              className="inline-block mt-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/20 transition"
            >
              Open Citizen SOS Portal →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {activeDispatches.map((req) => {
              const expiresAt = req.driver_assignment_expires_at
                ? new Date(req.driver_assignment_expires_at).getTime()
                : null;
              const isAwaiting = req.status === "driver_assigned";

              return (
                <div
                  key={req.id}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-xl relative overflow-hidden"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <Ambulance className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white">
                            {req.ambulance?.vehicle_number || "TN-01-EM-108X"}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-800 text-amber-400 border border-slate-700">
                            {req.ambulance?.type || "ALS"}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                              isAwaiting
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {req.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>{req.pickup_address || "Chennai GPS Pin"}</span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-500">
                            GPS: ({req.pickup_latitude.toFixed(4)}, {req.pickup_longitude.toFixed(4)})
                          </span>
                        </div>
                      </div>
                    </div>

                    {isAwaiting && expiresAt && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold">
                        <Clock className="w-4 h-4 animate-spin text-amber-400" />
                        <span>Expires: {new Date(expiresAt).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Symptoms & Severity */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 font-medium">Reported Emergency: </span>
                      <span className="text-slate-200 font-semibold">{req.symptoms || "Critical SOS"}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px] bg-red-500/20 text-red-300 border border-red-500/30">
                      Severity: {req.ai_severity || "High"}
                    </span>
                  </div>

                  {/* Rejection history note */}
                  {Array.isArray(req.rejected_ambulance_ids) && req.rejected_ambulance_ids.length > 0 && (
                    <div className="text-[11px] text-amber-400/90 italic flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5" />
                      <span>
                        Reassigned unit (Previous {req.rejected_ambulance_ids.length} unit(s) rejected or timed out)
                      </span>
                    </div>
                  )}

                  {/* Driver Response Action Buttons */}
                  {isAwaiting && (
                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => handleAccept(req.id)}
                        disabled={actionLoading === req.id}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Accept Dispatch</span>
                      </button>

                      <button
                        onClick={() => handleReject(req.id)}
                        disabled={actionLoading === req.id}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject & Reassign to Next Nearest</span>
                      </button>

                      <button
                        onClick={() => handleSimulateTimeout(req.id)}
                        disabled={actionLoading === req.id}
                        className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                        title="Simulate 30s timeout expiration"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Simulate 30s Timeout</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
