"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

export interface MapMarkerData {
  id: string;
  type: "patient" | "ambulance" | "hospital";
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  heading?: number;
}

interface EmergencyMapProps {
  center: [number, number];
  zoom?: number;
  patientLocation?: [number, number] | null;
  ambulanceLocation?: [number, number] | null;
  ambulanceHeading?: number;
  hospitals?: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    available_beds: number;
  }>;
  routeCoordinates?: [number, number][];
  isSelectingLocation?: boolean;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
}

export default function EmergencyMap({
  center,
  zoom = 13,
  patientLocation,
  ambulanceLocation,
  ambulanceHeading = 0,
  hospitals = [],
  routeCoordinates = [],
  isSelectingLocation = false,
  onLocationSelect,
  className = "w-full h-full min-h-[350px]",
}: EmergencyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: false,
      });

      // Add OpenStreetMap tiles with dark theme styling
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "dark-map-tiles",
      }).addTo(map);

      // Attribution
      L.control
        .attribution({
          position: "bottomright",
          prefix: '<span class="text-[10px] text-slate-500">© OpenStreetMap contributors | OSRM</span>',
        })
        .addTo(map);

      // Add Zoom Control at bottom right
      L.control
        .zoom({
          position: "bottomright",
        })
        .addTo(map);

      // Layer groups for markers and routes
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle click-to-select location
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    function handleMapClick(e: L.LeafletMouseEvent) {
      if (isSelectingLocation && onLocationSelect) {
        onLocationSelect(e.latlng.lat, e.latlng.lng);
      }
    }

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isSelectingLocation, onLocationSelect]);

  // Update center and markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Clear previous markers
    markersLayer.clearLayers();

    // 1. Patient SOS Marker
    if (patientLocation) {
      const patientIcon = L.divIcon({
        className: "patient-marker-wrapper",
        html: `
          <div class="relative flex items-center justify-center w-10 h-10 -ml-5 -mt-5">
            <span class="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping"></span>
            <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-red-600 border-2 border-white shadow-xl shadow-red-500/50 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const patientMarker = L.marker(patientLocation, { icon: patientIcon });
      patientMarker.bindPopup(`
        <div class="p-1">
          <div class="font-bold text-red-400 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse"></span>
            Your Emergency Location
          </div>
          <div class="text-[11px] text-slate-300 mt-1">Ambulance dispatched to this point</div>
        </div>
      `);
      markersLayer.addLayer(patientMarker);
    }

    // 2. Paramedic Ambulance Marker
    if (ambulanceLocation) {
      const ambulanceIcon = L.divIcon({
        className: "ambulance-marker-wrapper",
        html: `
          <div class="relative flex items-center justify-center w-12 h-12 -ml-6 -mt-6">
            <span class="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-40 animate-pulse"></span>
            <div class="relative flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 border-2 border-amber-400 shadow-xl shadow-amber-500/40 text-amber-400 transform" style="transform: rotate(${ambulanceHeading}deg)">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 10H6"/>
                <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
                <path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.507l-1.516-2.527A1 1 0 0 0 16.452 8H14v10"/>
                <circle cx="17" cy="18" r="2"/>
                <circle cx="7" cy="18" r="2"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24],
      });

      const ambulanceMarker = L.marker(ambulanceLocation, { icon: ambulanceIcon });
      ambulanceMarker.bindPopup(`
        <div class="p-1">
          <div class="font-bold text-amber-400 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
            Assigned Paramedic Ambulance
          </div>
          <div class="text-[11px] text-slate-300 mt-1">Live GPS tracking active</div>
        </div>
      `);
      markersLayer.addLayer(ambulanceMarker);
    }

    // 3. Hospital Markers
    hospitals.forEach((hospital) => {
      const hospitalIcon = L.divIcon({
        className: "hospital-marker-wrapper",
        html: `
          <div class="flex items-center justify-center w-7 h-7 -ml-3.5 -mt-3.5 rounded-lg bg-emerald-950 border border-emerald-500/60 shadow-md text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 6v12"/>
              <path d="M6 12h12"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const hospitalMarker = L.marker([hospital.latitude, hospital.longitude], {
        icon: hospitalIcon,
      });

      hospitalMarker.bindPopup(`
        <div class="p-1 max-w-[200px]">
          <div class="font-bold text-white text-xs">${hospital.name}</div>
          <div class="text-[10px] text-emerald-400 font-medium mt-1">
            🟢 ${hospital.available_beds} ER Beds Available
          </div>
        </div>
      `);
      markersLayer.addLayer(hospitalMarker);
    });

    // 4. Update Route Polyline
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    if (routeCoordinates && routeCoordinates.length > 0) {
      const polyline = L.polyline(routeCoordinates, {
        color: "#f59e0b", // Amber/Gold emergency route line
        weight: 5,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
        dashArray: "1, 10",
      }).addTo(map);

      // Add glowing underlay for the route
      const underlay = L.polyline(routeCoordinates, {
        color: "#ef4444",
        weight: 8,
        opacity: 0.3,
      }).addTo(map);

      routePolylineRef.current = polyline;

      // Fit bounds to show entire route with padding
      const bounds = L.latLngBounds(routeCoordinates);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (patientLocation && ambulanceLocation) {
      const bounds = L.latLngBounds([patientLocation, ambulanceLocation]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    } else if (patientLocation) {
      map.setView(patientLocation, 14);
    } else {
      map.setView(center, zoom);
    }
  }, [patientLocation, ambulanceLocation, ambulanceHeading, hospitals, routeCoordinates, center, zoom]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800 ${className}`}>
      <div ref={mapContainerRef} className="w-full h-full min-h-[350px] z-0" />
      {isSelectingLocation && (
        <div className="absolute top-3 left-3 z-10 bg-slate-900/90 backdrop-blur-md border border-amber-500/40 px-3 py-1.5 rounded-lg text-xs text-amber-300 font-medium shadow-lg flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
          Click on map to adjust pickup location
        </div>
      )}
    </div>
  );
}
