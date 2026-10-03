-- ==============================================================================
-- AI Emergency Smart Ambulance System (AI ResQ)
-- Migration: 20261003000002_drop_legacy_ambulance_search_overload.sql
-- Description: Safely drop legacy 3-parameter find_nearest_available_ambulance
--              overload to resolve PostgREST ambiguity (PGRST203).
-- ==============================================================================

-- 1. Drop the legacy 3-parameter signature
DROP FUNCTION IF EXISTS public.find_nearest_available_ambulance(
  double precision,
  double precision,
  double precision
);

-- 2. Ensure the unified 4-parameter function (with default exclude_ambulance_ids = '{}')
--    is the sole canonical PostGIS nearest ambulance search function.
CREATE OR REPLACE FUNCTION public.find_nearest_available_ambulance(
  lat double precision,
  lng double precision,
  radius_meters double precision DEFAULT 50000,
  exclude_ambulance_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  id uuid,
  vehicle_number text,
  driver_id uuid,
  type public.ambulance_type,
  status public.ambulance_status,
  latitude double precision,
  longitude double precision,
  heading double precision,
  speed double precision,
  distance_meters double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target_point extensions.geography;
BEGIN
  target_point := extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography;

  RETURN QUERY
  SELECT
    a.id,
    a.vehicle_number,
    a.driver_id,
    a.type,
    a.status,
    a.latitude,
    a.longitude,
    a.heading,
    a.speed,
    extensions.ST_Distance(a.location, target_point) AS distance_meters
  FROM public.ambulances a
  WHERE a.status = 'available'
    AND (exclude_ambulance_ids IS NULL OR cardinality(exclude_ambulance_ids) = 0 OR NOT (a.id = ANY(exclude_ambulance_ids)))
    AND extensions.ST_DWithin(a.location, target_point, radius_meters)
  ORDER BY distance_meters ASC
  LIMIT 10;
END;
$$;
