"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";
import type EmergencyMap from "./EmergencyMap";

// Dynamic import with ssr: false to prevent window is undefined errors in Next.js
const DynamicMap = dynamic(() => import("./EmergencyMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[350px] rounded-2xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-500">
      <Loader2 className="w-8 h-8 animate-spin text-red-500 mb-2" />
      <span className="text-xs font-medium text-slate-400">Loading Chennai Emergency Map...</span>
      <span className="text-[11px] text-slate-600 mt-1">OpenStreetMap & PostGIS Telemetry</span>
    </div>
  ),
});

export default function DynamicEmergencyMap(props: ComponentProps<typeof EmergencyMap>) {
  return <DynamicMap {...props} />;
}
