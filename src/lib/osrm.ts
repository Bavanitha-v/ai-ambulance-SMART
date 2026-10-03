export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng] array for Leaflet polyline
  distanceMeters: number;
  durationSeconds: number;
  isFallback: boolean;
}

// Calculate Haversine distance in meters between two [lat, lng] points
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Format seconds into human readable ETA (e.g. "6 mins" or "1 min")
export function formatEta(durationSeconds: number): string {
  if (durationSeconds <= 60) {
    return "Less than 1 min";
  }
  const minutes = Math.round(durationSeconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours} hr ${remainingMins} min`;
  }
  return `${minutes} mins`;
}

// Format meters into km or m
export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

// Fetch driving route from OSRM public API with straight-line fallback
export async function getDrivingRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<RouteResult> {
  // Straight line fallback generator
  const getFallbackRoute = (): RouteResult => {
    const distanceMeters = calculateHaversineDistance(startLat, startLng, endLat, endLng);
    // Assume average emergency response speed of 38 km/h (~10.5 m/s) in city traffic
    const estimatedSeconds = Math.max(60, Math.round(distanceMeters / 10.5) + 60);
    return {
      coordinates: [
        [startLat, startLng],
        [endLat, endLng],
      ],
      distanceMeters,
      durationSeconds: estimatedSeconds,
      isFallback: true,
    };
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // OSRM coordinates are formatted as {longitude},{latitude}
    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return getFallbackRoute();
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      return getFallbackRoute();
    }

    const route = data.routes[0];
    // OSRM GeoJSON coordinates are [lng, lat] -> convert to Leaflet [lat, lng]
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
    );

    return {
      coordinates,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      isFallback: false,
    };
  } catch (error) {
    // Graceful fallback on network timeout, cors, or offline
    return getFallbackRoute();
  }
}
