"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Ambulance,
  Radio,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  RefreshCw,
  AlertTriangle,
  Flame,
  Power,
  Navigation,
  Building2,
  PhoneCall,
  WifiOff,
  Crosshair,
  TrendingUp,
  Volume2,
  VolumeX,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { createClient } from "@/lib/supabase/client";
import { getDrivingRoute, formatEta, formatDistance, type RouteResult } from "@/lib/osrm";
import type { Ambulance as AmbulanceType, EmergencyRequest, Hospital } from "@/types/database.types";

// Dynamic import of Leaflet map (client-side only)
const DynamicEmergencyMap = dynamic(() => import("@/components/map/EmergencyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[300px] bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-slate-500 gap-2 border border-slate-800">
      <RefreshCw className="w-6 h-6 animate-spin text-amber-500" />
      <span className="text-xs font-medium">Initializing Tactical Navigation Map...</span>
    </div>
  ),
});

// Sound ping generator via Web Audio API (no external asset dependency)
function playEmergencyChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio context may be restricted by browser gesture policy
  }
}

export default function DriverDashboardPage() {
  // Driver Identity State
  const [driverUser, setDriverUser] = useState<{
    id: string;
    email?: string;
    full_name?: string;
    role?: string;
  } | null>(null);

  // Fleet & Selected Vehicle State
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>([]);
  const [selectedAmbulanceId, setSelectedAmbulanceId] = useState<string>("");
  const [currentAmbulance, setCurrentAmbulance] = useState<AmbulanceType | null>(null);

  // Online / Offline State
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [togglingStatus, setTogglingStatus] = useState<boolean>(false);

  // Active Trip & Incoming Dispatch State
  const [activeRequest, setActiveRequest] = useState<any | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // GPS Telemetry & Navigation State
  const [driverPos, setDriverPos] = useState<[number, number]>([13.0827, 80.275]); // Chennai default
  const [driverHeading, setDriverHeading] = useState<number>(15);
  const [driverSpeed, setDriverSpeed] = useState<number>(0);
  const [gpsDenied, setGpsDenied] = useState<boolean>(false);
  const [gpsWatchId, setGpsWatchId] = useState<number | null>(null);
  const [lastTelemetryPush, setLastTelemetryPush] = useState<string>("");

  // Network & Realtime Health State
  const [networkOnline, setNetworkOnline] = useState<boolean>(true);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Route & Destination State
  const [routeData, setRouteData] = useState<RouteResult | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  // 1. Fetch Fleet & Hospitals
  const loadFleetData = useCallback(async () => {
    try {
      const [resVehicles, resHosp] = await Promise.all([
        fetch("/api/driver/vehicle"),
        createClient().from("hospitals").select("*").eq("is_active", true),
      ]);

      if (resVehicles.status === 401) {
        window.location.href = "/auth/login?redirect=/driver";
        return;
      }

      const data = await resVehicles.json();
      if (resVehicles.ok && Array.isArray(data.ambulances)) {
        if (data.user) {
          setDriverUser(data.user);
        }

        setAmbulances(data.ambulances);

        // Pick ambulance: prefer one already assigned to this driver, or stored ID, or TN-01-EM-1084
        const userAssigned = data.ambulances.find((a: AmbulanceType) => a.driver_id === data.user?.id);
        const storedId = localStorage.getItem("selected_driver_ambulance");
        const match =
          userAssigned ||
          data.ambulances.find((a: AmbulanceType) => a.id === storedId) ||
          data.ambulances.find((a: AmbulanceType) => a.vehicle_number === "TN-01-EM-1084") ||
          data.ambulances[0];

        if (match) {
          setSelectedAmbulanceId(match.id);
          setCurrentAmbulance(match);
          setIsOnline(match.status !== "offline");
          setDriverPos([match.latitude, match.longitude]);
          setDriverHeading(match.heading || 0);

          // Check if this vehicle has an active emergency request assigned to this driver
          const linkedRequest = data.activeRequests?.find(
            (r: any) =>
              r.assigned_ambulance_id === match.id ||
              (data.user && r.assigned_driver_id === data.user.id)
          );
          setActiveRequest(linkedRequest || null);
        }
      }

      if (resHosp.data) {
        setHospitals(resHosp.data as Hospital[]);
      }
    } catch (err) {
      console.error("[Driver] Load error:", err);
    }
  }, []);

  useEffect(() => {
    loadFleetData();
  }, [loadFleetData]);

  // 2. Connectivity Listeners (Rule #7)
  useEffect(() => {
    setNetworkOnline(navigator.onLine);
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 3. Vehicle Switcher Handler
  const handleSelectAmbulance = (ambId: string) => {
    setSelectedAmbulanceId(ambId);
    localStorage.setItem("selected_driver_ambulance", ambId);
    const amb = ambulances.find((a) => a.id === ambId);
    if (amb) {
      setCurrentAmbulance(amb);
      setIsOnline(amb.status !== "offline");
      setDriverPos([amb.latitude, amb.longitude]);
      setDriverHeading(amb.heading || 0);
    }
    // Re-sync active request for this new vehicle
    fetch("/api/driver/vehicle")
      .then((r) => r.json())
      .then((d) => {
        if (d.activeRequests) {
          const linked = d.activeRequests.find(
            (r: any) =>
              r.assigned_ambulance_id === ambId ||
              (driverUser && r.assigned_driver_id === driverUser.id)
          );
          setActiveRequest(linked || null);
        }
      });
  };

  // 4. Online / Offline Toggle
  const handleToggleOnline = async () => {
    if (!currentAmbulance) return;
    if (activeRequest && ["driver_accepted", "en_route_pickup", "patient_picked_up", "en_route_hospital"].includes(activeRequest.status)) {
      alert("Cannot go offline while on an active emergency dispatch!");
      return;
    }

    setTogglingStatus(true);
    const nextStatus = isOnline ? "offline" : "available";

    try {
      const res = await fetch("/api/driver/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ambulanceId: currentAmbulance.id,
          status: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update availability");

      setIsOnline(nextStatus === "available");
      setCurrentAmbulance(data.ambulance);
      setMessage({
        text: nextStatus === "available" ? "Unit is now ONLINE and ready for dispatch." : "Unit marked OFFLINE.",
        type: nextStatus === "available" ? "success" : "info",
      });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setTogglingStatus(false);
    }
  };

  // 5. Live GPS Telemetry Push Every 5 Seconds (While Online or On Trip)
  const pushTelemetry = useCallback(
    async (lat: number, lng: number, heading: number = 0, speed: number = 0) => {
      if (!currentAmbulance) return;

      try {
        const res = await fetch("/api/driver/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ambulanceId: currentAmbulance.id,
            latitude: lat,
            longitude: lng,
            heading,
            speed,
            requestId: activeRequest?.id || undefined,
          }),
        });

        if (res.ok) {
          setLastTelemetryPush(new Date().toLocaleTimeString());
        }
      } catch (err) {
        console.warn("[Driver Telemetry] Push failed:", err);
      }
    },
    [currentAmbulance, activeRequest?.id]
  );

  // Setup GPS Watcher & 5-Second Broadcaster Interval
  useEffect(() => {
    if (!isOnline && !activeRequest) return;

    // Physical Geolocation Watch
    if (navigator.geolocation) {
      const wid = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const heading = pos.coords.heading || 0;
          const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0; // km/h

          setDriverPos([lat, lng]);
          setDriverHeading(heading);
          setDriverSpeed(speed);
          setGpsDenied(false);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setGpsDenied(true);
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
      setGpsWatchId(wid);
    } else {
      setGpsDenied(true);
    }

    // 5-Second Periodic Database Broadcaster
    const telemetryInterval = setInterval(() => {
      pushTelemetry(driverPos[0], driverPos[1], driverHeading, driverSpeed);
    }, 5000);

    return () => {
      if (gpsWatchId !== null) navigator.geolocation?.clearWatch(gpsWatchId);
      clearInterval(telemetryInterval);
    };
  }, [isOnline, activeRequest, pushTelemetry, driverPos, driverHeading, driverSpeed]);

  // 6. Supabase Realtime Subscription for Active Vehicle Dispatch
  useEffect(() => {
    if (!selectedAmbulanceId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`driver_channel_${selectedAmbulanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "emergency_requests",
        },
        (payload) => {
          const req = payload.new as any;
          if (
            req.assigned_ambulance_id === selectedAmbulanceId &&
            (!req.assigned_driver_id || !driverUser || req.assigned_driver_id === driverUser.id)
          ) {
            setActiveRequest(req);
            if (soundEnabled) playEmergencyChime();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "emergency_requests",
        },
        (payload) => {
          const req = payload.new as any;
          if (req.assigned_ambulance_id === selectedAmbulanceId) {
            // Verify assigned to this driver or vehicle
            if (!req.assigned_driver_id || !driverUser || req.assigned_driver_id === driverUser.id || driverUser.role === "admin") {
              if (req.status === "cancelled" || req.status === "completed") {
                setActiveRequest(null);
              } else {
                setActiveRequest((prev: any) => ({ ...prev, ...req }));
                if (req.status === "driver_assigned" && soundEnabled) playEmergencyChime();
              }
            }
          } else if (activeRequest?.id === req.id && req.assigned_ambulance_id !== selectedAmbulanceId) {
            // Reassigned to another vehicle
            setActiveRequest(null);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
        } else if (status === "TIMED_OUT" || status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeConnected(false);
        }
      });

    // Fallback heartbeat polling every 5s
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/driver/vehicle");
        if (res.ok) {
          const data = await res.json();
          if (data.activeRequests) {
            const matched = data.activeRequests.find(
              (r: any) =>
                r.assigned_ambulance_id === selectedAmbulanceId ||
                (driverUser && r.assigned_driver_id === driverUser.id)
            );
            setActiveRequest(matched || null);
          }
        }
      } catch (e) {
        console.warn("[Driver Poll] Error:", e);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [selectedAmbulanceId, activeRequest?.id, soundEnabled, driverUser]);

  // 7. 30-Second Driver Confirmation Countdown Timer
  useEffect(() => {
    if (activeRequest?.status === "driver_assigned" && activeRequest?.driver_assignment_expires_at) {
      const updateCountdown = () => {
        const diff = Math.max(
          0,
          Math.ceil((new Date(activeRequest.driver_assignment_expires_at).getTime() - Date.now()) / 1000)
        );
        setCountdownSeconds(diff);

        // Auto-trigger timeout reassignment when countdown reaches zero
        if (diff <= 0) {
          fetch("/api/dispatch/reassign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: activeRequest.id,
              action: "timeout",
            }),
          })
            .then(() => {
              setActiveRequest(null);
              setMessage({
                text: "30-second response window expired. Dispatch automatically reallocated to next unit.",
                type: "info",
              });
            })
            .catch(console.error);
        }
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdownSeconds(null);
    }
  }, [activeRequest?.id, activeRequest?.status, activeRequest?.driver_assignment_expires_at]);

  // 8. OSRM Route Calculation (Ambulance -> Patient OR Ambulance -> Hospital)
  useEffect(() => {
    if (!activeRequest) {
      setRouteData(null);
      return;
    }

    let isSubscribed = true;

    async function calculateNavigationRoute() {
      const [ambLat, ambLng] = driverPos;
      let targetLat: number;
      let targetLng: number;

      // Stage 1: En route to patient
      if (["driver_assigned", "driver_accepted", "en_route_pickup"].includes(activeRequest.status)) {
        targetLat = activeRequest.pickup_latitude;
        targetLng = activeRequest.pickup_longitude;
      }
      // Stage 2: Patient onboard -> Navigate to Hospital
      else {
        const destHospital =
          hospitals.find((h) => h.id === activeRequest.destination_hospital_id) || hospitals[0];
        targetLat = destHospital ? destHospital.latitude : 13.0805; // Rajiv Gandhi GH default
        targetLng = destHospital ? destHospital.longitude : 80.2787;
      }

      const route = await getDrivingRoute(ambLat, ambLng, targetLat, targetLng);
      if (isSubscribed) {
        setRouteData(route);
      }
    }

    calculateNavigationRoute();
    const interval = setInterval(calculateNavigationRoute, 10000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [activeRequest, driverPos, hospitals]);

  // 9. Dispatch Action Handlers (Accept / Reject)
  const handleAcceptDispatch = async () => {
    if (!activeRequest) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/dispatch/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: activeRequest.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to accept dispatch");

      setActiveRequest(data.request);
      setMessage({
        text: "Emergency dispatch confirmed! Turn-by-turn navigation active.",
        type: "success",
      });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectDispatch = async () => {
    if (!activeRequest) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/dispatch/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: activeRequest.id,
          action: "reject",
          reason: "Driver declined from console",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject dispatch");

      setActiveRequest(null);
      setMessage({
        text: "Dispatch rejected. Emergency immediately reallocated to next nearest candidate unit.",
        type: "info",
      });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  // 10. Milestone Progression Handlers: Picked Up -> Reached Hospital -> Completed
  const handleMilestoneAction = async (milestone: "picked_up" | "reached_hospital" | "completed") => {
    if (!activeRequest) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/driver/trip-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: activeRequest.id,
          action: milestone,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update trip milestone");

      if (milestone === "completed") {
        setActiveRequest(null);
        setRouteData(null);
        setMessage({
          text: "Trip completed! Patient safely transferred. Ambulance is back on Standby.",
          type: "success",
        });
      } else {
        setActiveRequest(data.request);
        setMessage({
          text:
            milestone === "picked_up"
              ? "Patient onboard! Hospital route navigation activated."
              : "Arrived at Hospital ER! Handover in progress.",
          type: "success",
        });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  // 11. Simulated Movement Helper (For Testing on Desktops / Laptops without physical GPS)
  const handleSimulateMovement = () => {
    if (!activeRequest) return;

    let destLat = activeRequest.pickup_latitude;
    let destLng = activeRequest.pickup_longitude;

    if (["patient_picked_up", "reached_hospital"].includes(activeRequest.status)) {
      const h = hospitals.find((item) => item.id === activeRequest.destination_hospital_id) || hospitals[0];
      if (h) {
        destLat = h.latitude;
        destLng = h.longitude;
      }
    }

    // Advance 25% closer to destination
    const newLat = driverPos[0] + (destLat - driverPos[0]) * 0.25;
    const newLng = driverPos[1] + (destLng - driverPos[1]) * 0.25;

    setDriverPos([newLat, newLng]);
    setDriverSpeed(45);
    pushTelemetry(newLat, newLng, driverHeading, 45);
    setMessage({
      text: "Simulated GPS telemetry advanced along route.",
      type: "info",
    });
  };

  const isAwaitingConfirmation = activeRequest?.status === "driver_assigned";
  const isOnActiveTrip =
    activeRequest &&
    ["driver_accepted", "en_route_pickup", "patient_picked_up", "en_route_hospital", "reached_hospital"].includes(
      activeRequest.status
    );

  const destinationHospital = hospitals.find((h) => h.id === activeRequest?.destination_hospital_id) || hospitals[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* ========================================================================= */}
      {/* 1. TOP SYSTEM HEALTH & CONNECTION BAR                                     */}
      {/* ========================================================================= */}
      {!networkOnline && (
        <div className="bg-amber-600 text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 animate-bounce" />
          <span>Device is offline! Telemetry will queue until connection is restored.</span>
        </div>
      )}

      {networkOnline && !realtimeConnected && (
        <div className="bg-slate-900 border-b border-amber-500/30 text-amber-300 text-[11px] py-1 px-4 text-center flex items-center justify-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
          <span>Realtime fluctuating — telemetry syncing via 5s background heartbeat...</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MOBILE-FIRST TOPBAR                                                    */}
      {/* ========================================================================= */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            title="Return to Portal"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold border border-amber-500/30">
              <Ambulance className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-tight leading-tight">
                Paramedic Console
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                {currentAmbulance?.vehicle_number || "TN-01-EM-1081"}
              </p>
            </div>
          </div>
        </div>

        {/* Right Action Controls: Driver Badge, Vehicle Selector & Online Hero Toggle */}
        <div className="flex items-center gap-2">
          {/* Driver identity indicator */}
          {driverUser && (
            <div className="hidden md:flex flex-col text-right pr-2 border-r border-slate-800">
              <span className="text-[11px] font-bold text-white flex items-center justify-end gap-1">
                <UserCheck className="w-3 h-3 text-emerald-400" />
                {driverUser.full_name || driverUser.email?.split("@")[0]}
              </span>
              <span className="text-[9px] text-amber-400 font-mono uppercase tracking-wider">
                {driverUser.role === "admin" ? "CENTRAL ADMIN" : "PARAMEDIC"}
              </span>
            </div>
          )}

          {/* Audio Chime Mute Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition"
            title={soundEnabled ? "Mute Emergency Chime" : "Enable Emergency Chime"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Vehicle Switcher Dropdown */}
          <select
            value={selectedAmbulanceId}
            onChange={(e) => handleSelectAmbulance(e.target.value)}
            disabled={Boolean(isOnActiveTrip)}
            className="bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-500 transition disabled:opacity-50"
          >
            {ambulances.map((amb) => {
              const isOtherDriver = amb.driver_id && driverUser && amb.driver_id !== driverUser.id;
              return (
                <option
                  key={amb.id}
                  value={amb.id}
                  disabled={Boolean(isOtherDriver && driverUser?.role !== "admin")}
                >
                  {amb.vehicle_number} ({amb.type.toUpperCase()})
                  {amb.driver_id === driverUser?.id ? " ★ My Vehicle" : isOtherDriver ? " [Assigned]" : ""}
                </option>
              );
            })}
          </select>

          {/* Online / Offline Pill Button */}
          <button
            onClick={handleToggleOnline}
            disabled={togglingStatus}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
              isOnline
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"
                : "bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700"
            }`}
          >
            <Power className={`w-3.5 h-3.5 ${isOnline ? "text-white" : "text-slate-500"}`} />
            <span>{isOnline ? "ONLINE" : "OFFLINE"}</span>
          </button>

          <LogoutButton variant="ghost" />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 3. MAIN DASHBOARD CONTENT (MOBILE-FIRST GRID)                             */}
      {/* ========================================================================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ======================================================================= */}
        {/* LEFT COLUMN: Map & Tactical Telemetry (lg:col-span-7)                   */}
        {/* ======================================================================= */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Notification / Status Message */}
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
              <span className="flex-1">{message.text}</span>
            </div>
          )}

          {/* GPS Denied Fallback Banner */}
          {gpsDenied && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Device GPS denied or unavailable. Using vehicle station base coordinates.</span>
              </div>
              {isOnActiveTrip && (
                <button
                  onClick={handleSimulateMovement}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold transition ml-2"
                >
                  Step GPS Forward
                </button>
              )}
            </div>
          )}

          {/* Tactical Navigation Map Card */}
          <div className="h-[360px] sm:h-[440px] w-full rounded-2xl overflow-hidden shadow-2xl relative border border-slate-800">
            <DynamicEmergencyMap
              center={driverPos}
              zoom={14}
              patientLocation={
                activeRequest && ["driver_assigned", "driver_accepted", "en_route_pickup"].includes(activeRequest.status)
                  ? [activeRequest.pickup_latitude, activeRequest.pickup_longitude]
                  : null
              }
              ambulanceLocation={driverPos}
              ambulanceHeading={driverHeading}
              hospitals={hospitals}
              routeCoordinates={routeData?.coordinates || []}
              className="w-full h-full"
            />

            {/* Floating Navigation Controls on Map */}
            <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
              <button
                onClick={() => setDriverPos([...driverPos])}
                className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-amber-400 shadow-xl backdrop-blur-md transition"
                title="Recenter on Ambulance"
              >
                <Crosshair className="w-4 h-4" />
              </button>

              {isOnActiveTrip && (
                <button
                  onClick={handleSimulateMovement}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xl transition flex items-center gap-1.5"
                  title="Simulate driving progress toward destination"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Drive Ahead</span>
                </button>
              )}
            </div>

            {/* Live Navigation Route Overlay Pill */}
            {routeData && (
              <div className="absolute bottom-3 left-3 right-3 z-[1000] p-3 rounded-xl bg-slate-950/90 border border-slate-800/80 backdrop-blur-md flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                    <Navigation className="w-4 h-4 animate-pulse" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      {["driver_assigned", "driver_accepted", "en_route_pickup"].includes(activeRequest?.status)
                        ? "En Route to Patient"
                        : "En Route to Hospital ER"}
                    </div>
                    <div className="text-sm font-black text-amber-400">
                      {formatEta(routeData.durationSeconds)} ({formatDistance(routeData.distanceMeters)})
                    </div>
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-400 font-mono">
                  Speed: <span className="text-white font-bold">{driverSpeed} km/h</span>
                </div>
              </div>
            )}
          </div>

          {/* Telemetry Status Strip */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between text-xs gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-600"}`} />
              <span className="text-slate-300 font-medium">
                GPS Broadcaster:{" "}
                <strong className={isOnline ? "text-emerald-400" : "text-slate-500"}>
                  {isOnline ? "5s Sync Active" : "Suspended (Offline)"}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-3 text-slate-400 text-[11px] font-mono">
              <span>GPS: ({driverPos[0].toFixed(4)}, {driverPos[1].toFixed(4)})</span>
              <span>Last Sent: {lastTelemetryPush || "Standby"}</span>
            </div>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* RIGHT COLUMN: Dispatch Cards, Countdown & Milestones (lg:col-span-5)    */}
        {/* ======================================================================= */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* STATE A: Incoming Emergency Dispatch (30-Sec Countdown Ring) */}
          {isAwaitingConfirmation && activeRequest && (
            <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-b from-amber-950/80 to-slate-900 border-2 border-amber-500 space-y-5 shadow-2xl shadow-amber-500/20">
              {/* Header with Circular Countdown */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-black text-[10px] uppercase tracking-wider">
                    Emergency Alert
                  </span>
                  <h2 className="text-xl font-black text-white tracking-tight mt-1 flex items-center gap-2">
                    <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
                    <span>Incoming Dispatch Call</span>
                  </h2>
                </div>

                {/* 30s Countdown Ring */}
                {countdownSeconds !== null && (
                  <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-500 flex flex-col items-center justify-center font-mono">
                    <span className="text-lg font-black text-amber-400 leading-none">
                      {countdownSeconds}
                    </span>
                    <span className="text-[8px] uppercase tracking-wider text-amber-300/80 font-bold">
                      sec
                    </span>
                  </div>
                )}
              </div>

              {/* Patient Emergency Details */}
              <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Reported Emergency
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
                    Severity: {activeRequest.ai_severity || "High"}
                  </span>
                </div>

                <div className="text-sm font-bold text-white leading-relaxed">
                  {activeRequest.symptoms || "Emergency SOS Triggered"}
                </div>

                <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-white">
                      {activeRequest.pickup_address || "Chennai Central Location"}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      GPS: ({activeRequest.pickup_latitude.toFixed(4)}, {activeRequest.pickup_longitude.toFixed(4)})
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Accept / Reject */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleAcceptDispatch}
                  disabled={actionLoading}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm tracking-wide uppercase shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Accept Dispatch</span>
                </button>

                <button
                  type="button"
                  onClick={handleRejectDispatch}
                  disabled={actionLoading}
                  className="flex-1 py-3.5 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-300 font-black text-sm tracking-wide uppercase flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  <span>Decline / Pass</span>
                </button>
              </div>

              <p className="text-[11px] text-center text-slate-400">
                If unacknowledged within 30 seconds, this case automatically reassigns to the next-nearest available unit.
              </p>
            </div>
          )}

          {/* STATE B: Active Emergency Trip Lifecycle & Milestones */}
          {isOnActiveTrip && activeRequest && (
            <div className="p-5 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Active Trip #{activeRequest.id.substring(0, 8)}
                  </span>
                  <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                    {["driver_accepted", "en_route_pickup"].includes(activeRequest.status) &&
                      "Stage 1: En Route to Patient"}
                    {["patient_picked_up", "en_route_hospital"].includes(activeRequest.status) &&
                      "Stage 2: Transporting to ER"}
                    {activeRequest.status === "reached_hospital" && "Stage 3: Arrived at Trauma Bay"}
                  </h2>
                </div>

                <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30">
                  {activeRequest.status.replace(/_/g, " ")}
                </span>
              </div>

              {/* Patient / Destination Context Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Chief Complaint:</span>
                  <span className="text-red-400 font-bold uppercase">{activeRequest.ai_severity || "High Priority"}</span>
                </div>
                <p className="text-xs font-semibold text-white">{activeRequest.symptoms || "Critical SOS"}</p>

                {/* Patient / Hospital Coordinates */}
                <div className="pt-2 border-t border-slate-900 space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-white">Pickup Location: </span>
                      <span className="text-slate-400">{activeRequest.pickup_address || "Chennai Central"}</span>
                    </div>
                  </div>

                  {["patient_picked_up", "reached_hospital"].includes(activeRequest.status) && destinationHospital && (
                    <div className="flex items-start gap-2 text-slate-300 pt-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-white">Designated ER: </span>
                        <span className="text-blue-300 font-medium">{destinationHospital.name}</span>
                        <div className="text-[10px] text-slate-500">
                          Available Beds: {destinationHospital.available_beds} | Contact: {destinationHospital.phone}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sequential Milestone Actions */}
              <div className="space-y-3 pt-2">
                {/* Milestone 1: Confirm Patient Picked Up */}
                {["driver_accepted", "en_route_pickup"].includes(activeRequest.status) && (
                  <button
                    type="button"
                    onClick={() => handleMilestoneAction("picked_up")}
                    disabled={actionLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm tracking-wide uppercase shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Confirm Patient Picked Up →</span>
                  </button>
                )}

                {/* Milestone 2: Arrived at Hospital */}
                {["patient_picked_up", "en_route_hospital"].includes(activeRequest.status) && (
                  <button
                    type="button"
                    onClick={() => handleMilestoneAction("reached_hospital")}
                    disabled={actionLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-black text-sm tracking-wide uppercase shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <Building2 className="w-5 h-5" />
                    <span>Confirm Arrived at Hospital ER →</span>
                  </button>
                )}

                {/* Milestone 3: Complete Trip & Return to Standby */}
                {activeRequest.status === "reached_hospital" && (
                  <button
                    type="button"
                    onClick={() => handleMilestoneAction("completed")}
                    disabled={actionLoading}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm tracking-wide uppercase shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Complete Trip & Return to Fleet Standby</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STATE C: Fleet Standby Mode (Online, Awaiting Call) */}
          {!activeRequest && isOnline && (
            <div className="p-8 text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mx-auto flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
                <Radio className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Standby: Ready for Dispatch</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Ambulance <strong>{currentAmbulance?.vehicle_number}</strong> is active on the Chennai emergency grid. Live GPS is broadcasting every 5 seconds.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/citizen"
                  target="_blank"
                  className="inline-block px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-bold border border-slate-700 transition"
                >
                  Trigger Test SOS from Citizen App →
                </Link>
              </div>
            </div>
          )}

          {/* STATE D: Offline Mode */}
          {!activeRequest && !isOnline && (
            <div className="p-8 text-center rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500">
                <Power className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-300">Unit is Currently Offline</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Toggle your status to <strong>ONLINE</strong> in the top bar to start receiving emergency dispatches and broadcasting GPS telemetry.
                </p>
              </div>

              <button
                onClick={handleToggleOnline}
                disabled={togglingStatus}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition"
              >
                Go Online Now
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
