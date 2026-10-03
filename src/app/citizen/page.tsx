"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import DynamicEmergencyMap from "@/components/map/DynamicEmergencyMap";
import { FirstAidModal } from "@/components/citizen/FirstAidModal";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { getDrivingRoute, formatEta, formatDistance, type RouteResult } from "@/lib/osrm";
import type { RequestStatus, EmergencyRequest, Hospital } from "@/types/database.types";
import {
  Siren,
  MapPin,
  Mic,
  MicOff,
  Navigation,
  PhoneCall,
  ShieldAlert,
  HeartPulse,
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  Info,
  Building2,
  Ambulance,
  Compass,
  WifiOff,
} from "lucide-react";

// Default coordinates: Chennai Central / Park Town
const CHENNAI_DEFAULT: [number, number] = [13.0827, 80.2707];

const SYMPTOM_CATEGORIES = [
  { id: "cardiac", label: "Cardiac / Chest Pain", icon: HeartPulse, severity: "critical" },
  { id: "trauma", label: "Severe Trauma / Accident", icon: Activity, severity: "critical" },
  { id: "stroke", label: "Stroke / Slurred Speech", icon: ShieldAlert, severity: "high" },
  { id: "respiratory", label: "Breathing Difficulty", icon: AlertTriangle, severity: "high" },
  { id: "burns", label: "Severe Burns", icon: FlameIcon, severity: "high" },
  { id: "other", label: "Other Emergency", icon: Info, severity: "medium" },
];

function FlameIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  );
}

// Status pipeline mapping to exact schema enums
const STATUS_STEPS: Array<{ key: RequestStatus; label: string; desc: string }> = [
  { key: "searching_driver", label: "Locating Paramedic", desc: "Broadcasting SOS to nearest units" },
  { key: "driver_assigned", label: "Paramedic Assigned", desc: "Awaiting driver confirmation" },
  { key: "driver_accepted", label: "Dispatched", desc: "Paramedic crew accepted assignment" },
  { key: "en_route_pickup", label: "En Route to You", desc: "Ambulance navigating to pickup point" },
  { key: "patient_picked_up", label: "Patient Onboard", desc: "Emergency care administered en route" },
  { key: "en_route_hospital", label: "Heading to ER", desc: "Transporting to designated trauma center" },
  { key: "reached_hospital", label: "Arrived at Hospital", desc: "Patient transferred to ER intake team" },
];

export default function CitizenPage() {
  // Geolocation & Form state
  const [coords, setCoords] = useState<[number, number]>(CHENNAI_DEFAULT);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState<boolean>(false);
  const [isSelectingOnMap, setIsSelectingOnMap] = useState<boolean>(false);
  const [address, setAddress] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("cardiac");
  const [symptomsText, setSymptomsText] = useState<string>("");

  // Voice speech recognition state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const recognitionRef = useRef<any>(null);

  // Connectivity & Realtime state
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(true);

  // Active Emergency State
  const [activeRequest, setActiveRequest] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cancelling, setCancelling] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [firstAidOpen, setFirstAidOpen] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // Ambulance tracking & route
  const [ambulancePos, setAmbulancePos] = useState<[number, number] | null>(null);
  const [ambulanceHeading, setAmbulanceHeading] = useState<number>(0);
  const [routeData, setRouteData] = useState<RouteResult | null>(null);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);

  // 1. Connectivity Event Listeners (Rule #7)
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 1b. 30-Second Driver Assignment Timeout Countdown (Phase 5)
  useEffect(() => {
    if (activeRequest?.status === "driver_assigned" && activeRequest?.driver_assignment_expires_at) {
      const updateCountdown = () => {
        const diff = Math.max(
          0,
          Math.ceil((new Date(activeRequest.driver_assignment_expires_at).getTime() - Date.now()) / 1000)
        );
        setCountdownSeconds(diff);
        if (diff <= 0) {
          // Poll /api/sos which server-side auto-reassigns expired dispatch
          fetch("/api/sos")
            .then((r) => r.json())
            .then((d) => {
              if (d.activeRequest) {
                setActiveRequest(d.activeRequest);
                if (d.activeRequest.ambulance) {
                  setAmbulancePos([d.activeRequest.ambulance.latitude, d.activeRequest.ambulance.longitude]);
                }
              }
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
  }, [activeRequest?.status, activeRequest?.driver_assignment_expires_at]);

  // 2. Geolocation Acquisition with Denied Fallback (Rule #7)
  const acquireLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords([pos.coords.latitude, pos.coords.longitude]);
        setAccuracy(Math.round(pos.coords.accuracy));
        setLocationDenied(false);
      },
      (err) => {
        console.warn("Geolocation warning:", err.message);
        setLocationDenied(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }, []);

  useEffect(() => {
    acquireLocation();
  }, [acquireLocation]);

  // 3. Web Speech API Initialization (Rule #4)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-IN"; // English (India) with Tamil accent support

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
        setIsRecording(false);
      };
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setSymptomsText((prev) => (prev ? `${prev}. ${transcript}` : transcript));
      };

      recognitionRef.current = recognition;
    }
  }, []);

  function toggleSpeech() {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("Speech start error:", err);
      }
    }
  }

  // 4. Fetch initial active request & hospitals
  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient();

      // Load hospitals for map pins
      const { data: hospData } = await supabase
        .from("hospitals")
        .select("id, name, address, phone, latitude, longitude, available_beds, is_active")
        .eq("is_active", true);

      if (hospData) {
        setHospitals(hospData as Hospital[]);
      }

      // Check for ongoing active SOS request
      try {
        const res = await fetch("/api/sos");
        const json = await res.json();
        if (json.activeRequest) {
          if (json.activeRequest.status === "escalated" || !json.activeRequest.assigned_ambulance_id) {
            json.activeRequest.ambulance = null;
            setActiveRequest(json.activeRequest);
            setAmbulancePos(null);
            setAmbulanceHeading(0);
            setRouteData(null);
            setCountdownSeconds(null);
          } else {
            setActiveRequest(json.activeRequest);
            if (json.activeRequest.ambulance) {
              setAmbulancePos([
                json.activeRequest.ambulance.latitude,
                json.activeRequest.ambulance.longitude,
              ]);
              setAmbulanceHeading(json.activeRequest.ambulance.heading || 0);
            }
          }
          setCoords([json.activeRequest.pickup_latitude, json.activeRequest.pickup_longitude]);
        }
      } catch (err) {
        console.error("Initial load error:", err);
      }
    }

    loadInitialData();
  }, []);

  // 5. OSRM Driving Route Calculation with Straight-Line Fallback (Rule #3)
  useEffect(() => {
    if (!activeRequest || !ambulancePos || activeRequest.status === "escalated") {
      setRouteData(null);
      return;
    }

    let isCancelled = false;

    async function fetchRoute() {
      const [patLat, patLng] = coords;
      const [ambLat, ambLng] = ambulancePos!;

      const route = await getDrivingRoute(ambLat, ambLng, patLat, patLng);
      if (!isCancelled) {
        setRouteData(route);
      }
    }

    fetchRoute();
    const routeInterval = setInterval(fetchRoute, 12000); // Refresh route every 12s

    return () => {
      isCancelled = true;
      clearInterval(routeInterval);
    };
  }, [activeRequest, ambulancePos, coords]);

  // 6. Supabase Realtime Subscription + Polling Fallback (Rule #7)
  useEffect(() => {
    if (!activeRequest?.id) return;

    const supabase = createClient();

    // Setup Realtime Channel
    const channel = supabase
      .channel(`emergency_request_${activeRequest.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "emergency_requests",
          filter: `id=eq.${activeRequest.id}`,
        },
        async (payload) => {
          const updated = payload.new as EmergencyRequest;

          if (updated.status === "escalated" || !updated.assigned_ambulance_id) {
            setAmbulancePos(null);
            setAmbulanceHeading(0);
            setRouteData(null);
            setCountdownSeconds(null);
            setActiveRequest((prev: any) => ({ ...prev, ...updated, ambulance: null }));
            return;
          }

          setActiveRequest((prev: any) => ({ ...prev, ...updated }));

          // If assigned ambulance changed or status reached completion
          if (
            updated.assigned_ambulance_id &&
            (!activeRequest?.ambulance || activeRequest.assigned_ambulance_id !== updated.assigned_ambulance_id)
          ) {
            const { data: amb } = await supabase
              .from("ambulances")
              .select("id, vehicle_number, type, status, latitude, longitude, heading, speed")
              .eq("id", updated.assigned_ambulance_id)
              .single();

            if (amb) {
              setAmbulancePos([amb.latitude, amb.longitude]);
              setAmbulanceHeading(amb.heading || 0);
              setActiveRequest((prev: any) => ({ ...prev, ...updated, ambulance: amb }));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ambulances",
        },
        (payload) => {
          const updatedAmb = payload.new as any;
          if (activeRequest?.status !== "escalated" && activeRequest?.assigned_ambulance_id === updatedAmb.id) {
            setAmbulancePos([updatedAmb.latitude, updatedAmb.longitude]);
            setAmbulanceHeading(updatedAmb.heading || 0);
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

    // Rule #7 Fallback: Polling every 5 seconds if Realtime is disconnected or as heartbeat
    const pollInterval = setInterval(async () => {
      try {
        const { data: refreshedReq } = await supabase
          .from("emergency_requests")
          .select(`
            *,
            ambulance:assigned_ambulance_id (
              id, vehicle_number, type, status, latitude, longitude, heading, speed
            )
          `)
          .eq("id", activeRequest.id)
          .single();

        if (refreshedReq) {
          if (refreshedReq.status === "escalated" || !refreshedReq.assigned_ambulance_id) {
            refreshedReq.ambulance = null;
            setAmbulancePos(null);
            setAmbulanceHeading(0);
            setRouteData(null);
            setCountdownSeconds(null);
            setActiveRequest((prev: any) => ({ ...prev, ...refreshedReq, ambulance: null }));
          } else {
            setActiveRequest((prev: any) => ({ ...prev, ...refreshedReq }));
            if (refreshedReq.ambulance) {
              setAmbulancePos([refreshedReq.ambulance.latitude, refreshedReq.ambulance.longitude]);
              setAmbulanceHeading(refreshedReq.ambulance.heading || 0);
            }
          }
        }
      } catch (err) {
        console.warn("Polling error:", err);
      }
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [activeRequest?.id, activeRequest?.assigned_ambulance_id, activeRequest?.status]);

  // 6b. Explicit Safeguard: Whenever activeRequest becomes 'escalated', immediately purge stale ambulance & route
  useEffect(() => {
    if (activeRequest?.status === "escalated") {
      setAmbulancePos(null);
      setAmbulanceHeading(0);
      setRouteData(null);
      setCountdownSeconds(null);
      if (activeRequest.ambulance) {
        setActiveRequest((prev: any) => (prev ? { ...prev, ambulance: null } : null));
      }
    }
  }, [activeRequest?.status]);

  // 7. Handle 1-Tap SOS Submission with Rate Limiting (Rule #5)
  async function handleDispatchSOS() {
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const selectedObj = SYMPTOM_CATEGORIES.find((c) => c.id === selectedCategory);

      const response = await fetch("/api/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: coords[0],
          longitude: coords[1],
          address: address.trim() || undefined,
          symptoms: symptomsText.trim() || undefined,
          category: selectedCategory,
          severity: selectedObj?.severity || "high",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to dispatch SOS. Please try again.");
      }

      if (data.request?.status === "escalated" || !data.request?.assigned_ambulance_id) {
        if (data.request) data.request.ambulance = null;
        setActiveRequest(data.request);
        setAmbulancePos(null);
        setAmbulanceHeading(0);
        setRouteData(null);
        setCountdownSeconds(null);
      } else {
        setActiveRequest(data.request);
        if (data.ambulance) {
          setAmbulancePos([data.ambulance.latitude, data.ambulance.longitude]);
          setAmbulanceHeading(data.ambulance.heading || 0);
          setActiveRequest((prev: any) => ({ ...prev, ambulance: data.ambulance }));
        }
      }
    } catch (err: any) {
      console.error("SOS Dispatch error:", err);
      setErrorMessage(err.message || "Emergency dispatch failed. Please dial 108 directly.");
    } finally {
      setSubmitting(false);
    }
  }

  // 8. Cancel Request Handler
  async function handleCancelRequest() {
    if (!activeRequest) return;
    const confirmCancel = window.confirm("Are you sure you want to cancel this emergency request?");
    if (!confirmCancel) return;

    setCancelling(true);
    try {
      const res = await fetch("/api/sos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: activeRequest.id,
          reason: "Cancelled by citizen",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to cancel");
      }

      setActiveRequest(null);
      setAmbulancePos(null);
      setRouteData(null);
    } catch (err: any) {
      alert(err.message || "Failed to cancel emergency request");
    } finally {
      setCancelling(false);
    }
  }

  // Compute status index for stepper
  const currentStatus: RequestStatus = activeRequest?.status || "searching_driver";
  const currentStepIndex = STATUS_STEPS.findIndex((s) => s.key === currentStatus);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Offline Warning Banner (Rule #7) */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs py-2 px-4 text-center font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span>You are currently offline. Immediate dispatches may be delayed. Dial 108 directly on your phone!</span>
        </div>
      )}

      {/* Realtime Disconnect Warning (Rule #7) */}
      {activeRequest && !realtimeConnected && isOnline && (
        <div className="bg-slate-900 border-b border-amber-500/30 text-amber-300 text-[11px] py-1 px-4 text-center flex items-center justify-center gap-2">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
          <span>Live connection fluctuating — automatically syncing status via backup heartbeat...</span>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md p-4 sticky top-0 z-30 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition">
          <Navigation className="w-3.5 h-3.5" /> Back to Home
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-full">
            <Siren className="w-3.5 h-3.5 animate-pulse" />
            <span>Citizen SOS Grid</span>
          </div>
          <LogoutButton variant="ghost" />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Map & Live Tracking                                         */}
        {/* ========================================================================= */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Map Header Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-500">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Chennai Emergency Spatial Map</span>
                  {activeRequest && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      LIVE TRACKING
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span>Lat: {coords[0].toFixed(4)}, Lng: {coords[1].toFixed(4)}</span>
                  {accuracy && (
                    <span className="text-slate-500 text-[10px]">
                      (±{accuracy}m GPS)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Location Relocate Controls */}
            {!activeRequest && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={acquireLocation}
                  className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5"
                  title="Refresh GPS"
                >
                  <Compass className="w-3.5 h-3.5 text-red-400" />
                  <span>GPS Lock</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsSelectingOnMap(!isSelectingOnMap)}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center justify-center gap-1.5 ${
                    isSelectingOnMap
                      ? "bg-amber-500/20 text-amber-300 border-amber-500"
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isSelectingOnMap ? "Done Picking" : "Pin on Map"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Geolocation Denied Banner (Rule #7) */}
          {locationDenied && !activeRequest && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold text-amber-200">Location Access Denied or Unavailable</p>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  We are using Chennai Central as your default location. You can click anywhere on the map or tap <strong>&apos;Pin on Map&apos;</strong> to specify your exact spot.
                </p>
              </div>
            </div>
          )}

          {/* Leaflet Dynamic Map (Rule #2) */}
          <div className="h-[400px] sm:h-[460px] w-full rounded-2xl overflow-hidden shadow-2xl relative">
            <DynamicEmergencyMap
              center={coords}
              zoom={13}
              patientLocation={coords}
              ambulanceLocation={activeRequest?.status === "escalated" ? null : ambulancePos}
              ambulanceHeading={activeRequest?.status === "escalated" ? 0 : ambulanceHeading}
              hospitals={hospitals}
              routeCoordinates={activeRequest?.status === "escalated" ? [] : (routeData?.coordinates || [])}
              isSelectingLocation={isSelectingOnMap}
              onLocationSelect={(lat, lng) => {
                setCoords([lat, lng]);
                setIsSelectingOnMap(false);
              }}
              className="w-full h-full"
            />
          </div>

          {/* Live ETA Card (Rule #3) - Hidden when escalated */}
          {activeRequest && activeRequest.status !== "escalated" && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    Estimated Time of Arrival
                  </div>
                  <div className="text-2xl font-black text-amber-400 tracking-tight">
                    {routeData ? formatEta(routeData.durationSeconds) : "Calculating ETA..."}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {routeData
                      ? `Distance: ${formatDistance(routeData.distanceMeters)} away`
                      : "Acquiring paramedic vehicle telemetry"}
                    {routeData?.isFallback && (
                      <span className="text-[10px] text-slate-500 ml-1.5">(Air distance estimate)</span>
                    )}
                  </div>
                </div>
              </div>

              {/* First-Aid Quick Launcher Button */}
              <button
                type="button"
                onClick={() => setFirstAidOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 font-semibold text-xs flex items-center gap-2 transition shadow-lg shadow-red-600/10"
              >
                <HeartPulse className="w-4 h-4 text-red-400 animate-pulse" />
                <span className="hidden sm:inline">First-Aid Guide</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: Emergency Dispatch & Active Status                          */}
        {/* ========================================================================= */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* STATE A: Pre-Dispatch (1-Tap SOS Form) */}
          {!activeRequest ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
              <div>
                <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <Siren className="w-5 h-5 text-red-500" />
                  <span>Request Emergency Ambulance</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  1-Tap instant dispatch connects directly to Chennai 108 fleet control.
                </p>
              </div>

              {/* Error Alert */}
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{errorMessage}</div>
                </div>
              )}

              {/* 1. Emergency Symptom Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  1. Select Emergency Type <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SYMPTOM_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const selected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${
                          selected
                            ? "bg-red-600/20 border-red-500 text-white shadow-md shadow-red-600/20"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            selected ? "bg-red-600 text-white" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-medium leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Voice Input / Text Symptoms (Rule #4) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    2. Describe Condition (Optional)
                  </label>
                  {speechSupported && (
                    <button
                      type="button"
                      onClick={toggleSpeech}
                      className={`text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition ${
                        isRecording
                          ? "bg-red-600 text-white border-red-500 animate-pulse"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      <span>{isRecording ? "Listening..." : "Voice Input"}</span>
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={symptomsText}
                  onChange={(e) => setSymptomsText(e.target.value)}
                  placeholder="e.g., Severe pain on left chest, sweating, difficulty speaking..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition resize-none"
                />
              </div>

              {/* 3. Address / Landmark Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  3. Nearby Landmark or Door No (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g., Near Anna Arch, Flat 3B, 2nd Cross Street"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition"
                />
              </div>

              {/* 4. The Giant 1-Tap SOS Button */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleDispatchSOS}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-lg tracking-wide uppercase shadow-2xl shadow-red-600/40 sos-glow-button flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span>Transmitting SOS...</span>
                    </>
                  ) : (
                    <>
                      <Siren className="w-6 h-6 animate-bounce" />
                      <span>DISPATCH EMERGENCY SOS</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-slate-500 mt-2">
                  Emergency rate limit: Max 3 SOS requests per 10 minutes.
                </p>
              </div>
            </div>
          ) : (
            /* STATE B: Active Dispatch Tracking Screen */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6">
              {/* Header */}
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-red-400 font-bold flex items-center gap-1.5">
                    {activeRequest.status === "escalated" && <AlertTriangle className="w-3.5 h-3.5 animate-pulse text-red-400" />}
                    <span>
                      Case #{activeRequest.id.substring(0, 8)} • {activeRequest.status === "escalated" ? "Escalated to Control Room" : "Active Dispatch"}
                    </span>
                  </span>
                  <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                    {activeRequest.status === "escalated" ? "Central Command Escalation" : "Ambulance Dispatch Active"}
                  </h2>
                </div>
                <a
                  href="tel:108"
                  className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-600/30 transition"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Call 108</span>
                </a>
              </div>

              {/* Escalation Alert OR Assigned Vehicle Card */}
              {activeRequest.status === "escalated" ? (
                <div className="p-5 rounded-2xl bg-gradient-to-b from-red-950/70 to-slate-900 border border-red-500/50 space-y-4 shadow-2xl shadow-red-950/40">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 text-red-400 animate-pulse shrink-0" />
                    <span>Central Command Escalation Active</span>
                  </div>

                  <p className="text-xs text-red-200/90 leading-relaxed">
                    All candidate emergency units in your vicinity are currently committed or busy. Your request has been automatically escalated to the Chennai 108 Central Command Center with maximum SLA priority. A dispatcher is manually overriding fleet allocation.
                  </p>

                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-red-900/40 text-xs text-slate-300 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-400 font-semibold">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Patient GPS Pin Logged</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Coordinates: ({coords[0].toFixed(4)}, {coords[1].toFixed(4)})
                    </p>
                    {activeRequest.pickup_address && (
                      <p className="text-[11px] text-slate-400">Address: {activeRequest.pickup_address}</p>
                    )}
                    <p className="text-[10px] text-amber-400/80 pt-1 italic">
                      Ambulance tracking and ETA paused until a unit is manually dispatched by the control center.
                    </p>
                  </div>

                  <div className="pt-1">
                    <a
                      href="tel:108"
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-xl shadow-red-600/30"
                    >
                      <PhoneCall className="w-4 h-4" /> Call 108 Emergency Control Directly
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                        <Ambulance className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">
                          {activeRequest.ambulance?.vehicle_number || "TN-01-EM-1081"}
                        </div>
                        <div className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">
                          {activeRequest.ambulance?.type || "ALS (Advanced Life Support)"}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                      Paramedic Unit
                    </span>
                  </div>

                  {activeRequest.ambulance?.driver && (
                    <div className="pt-2 border-t border-slate-900 text-xs flex items-center justify-between text-slate-400">
                      <span>Paramedic: {activeRequest.ambulance.driver.full_name || "Emergency Crew"}</span>
                      {activeRequest.ambulance.driver.phone && (
                        <a
                          href={`tel:${activeRequest.ambulance.driver.phone}`}
                          className="text-red-400 hover:underline"
                        >
                          {activeRequest.ambulance.driver.phone}
                        </a>
                      )}
                    </div>
                  )}

                  {/* 30-Sec Driver Assignment Countdown Badge (Phase 5) */}
                  {activeRequest.status === "driver_assigned" && countdownSeconds !== null && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
                      <span className="text-amber-300 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 animate-spin" /> Paramedic confirmation timer:
                      </span>
                      <span className="font-mono font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded">
                        {countdownSeconds}s
                      </span>
                    </div>
                  )}

                  {/* Reassignment indicator if previous units rejected/timed out */}
                  {Array.isArray(activeRequest.rejected_ambulance_ids) &&
                    activeRequest.rejected_ambulance_ids.length > 0 && (
                      <div className="text-[11px] text-slate-400 italic pt-1">
                        ⚡ Auto-reassigned from {activeRequest.rejected_ambulance_ids.length} previous candidate unit(s).
                      </div>
                    )}
                </div>
              )}

              {/* Status Pipeline Stepper (Rule #1) - Hidden when escalated */}
              {activeRequest.status !== "escalated" && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Dispatch Lifecycle Status
                  </div>
                  <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {STATUS_STEPS.map((step, idx) => {
                      const isDone = currentStepIndex > idx;
                      const isCurrent = currentStepIndex === idx;

                      return (
                        <div key={step.key} className="flex items-start gap-3 relative z-10">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition ${
                              isDone
                                ? "bg-emerald-600 text-white"
                                : isCurrent
                                ? "bg-amber-500 text-slate-950 ring-4 ring-amber-500/20 animate-pulse"
                                : "bg-slate-800 text-slate-500"
                            }`}
                          >
                            {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                          </div>
                          <div className="flex-1">
                            <div
                              className={`text-xs font-bold ${
                                isCurrent ? "text-amber-400" : isDone ? "text-white" : "text-slate-500"
                              }`}
                            >
                              {step.label}
                            </div>
                            <div className="text-[11px] text-slate-400">{step.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFirstAidOpen(true)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition flex items-center justify-center gap-2 border border-slate-700"
                >
                  <HeartPulse className="w-4 h-4 text-red-400" />
                  <span>First-Aid Guide</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  disabled={cancelling}
                  className="px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Cancel SOS"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* First Aid Guidance Modal (Rule #6) */}
      <FirstAidModal
        isOpen={firstAidOpen}
        onClose={() => setFirstAidOpen(false)}
        initialCategory={selectedCategory}
      />
    </div>
  );
}
