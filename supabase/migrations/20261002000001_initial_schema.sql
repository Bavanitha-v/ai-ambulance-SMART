-- ==============================================================================
-- AI Emergency Smart Ambulance System (AI ResQ)
-- Migration: 20261002000001_initial_schema.sql
-- Description: Core Schema, PostGIS, Profiles, Hospitals, Ambulances,
--              Emergency Requests, Trip Events, RLS Policies & Nearest Ambulance RPC
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Grant permissions for geography types in extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- 2. Custom Enumeration Types
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('citizen', 'driver', 'hospital', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ambulance_type AS ENUM ('bls', 'als', 'cardiac', 'neonatal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ambulance_status AS ENUM ('available', 'busy', 'offline', 'maintenance');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.triage_severity AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM (
    'pending_triage',
    'searching_driver',
    'driver_assigned',
    'driver_accepted',
    'en_route_pickup',
    'patient_picked_up',
    'en_route_hospital',
    'reached_hospital',
    'completed',
    'cancelled',
    'escalated'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'citizen',
  full_name text NOT NULL DEFAULT '',
  phone text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Hospitals Table
CREATE TABLE IF NOT EXISTS public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  phone text NOT NULL,
  location extensions.geography(Point, 4326) NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  total_beds integer NOT NULL DEFAULT 50,
  available_beds integer NOT NULL DEFAULT 20,
  icu_available integer NOT NULL DEFAULT 5,
  specialties text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  managed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Ambulances Table
CREATE TABLE IF NOT EXISTS public.ambulances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_number text NOT NULL UNIQUE,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type public.ambulance_type NOT NULL DEFAULT 'als',
  status public.ambulance_status NOT NULL DEFAULT 'available',
  location extensions.geography(Point, 4326) NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  heading double precision NOT NULL DEFAULT 0.0,
  speed double precision NOT NULL DEFAULT 0.0,
  last_heartbeat timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Emergency Requests Table
CREATE TABLE IF NOT EXISTS public.emergency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  pickup_location extensions.geography(Point, 4326) NOT NULL,
  pickup_latitude double precision NOT NULL,
  pickup_longitude double precision NOT NULL,
  pickup_address text,
  symptoms text,
  ai_severity public.triage_severity NOT NULL DEFAULT 'medium',
  ai_triage_result jsonb,
  status public.request_status NOT NULL DEFAULT 'pending_triage',
  assigned_ambulance_id uuid REFERENCES public.ambulances(id) ON DELETE SET NULL,
  assigned_driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  destination_hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  driver_assignment_expires_at timestamptz,
  rejected_driver_ids uuid[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Trip Events Audit Log Table
CREATE TABLE IF NOT EXISTS public.trip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  location extensions.geography(Point, 4326),
  latitude double precision,
  longitude double precision,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. GIST Spatial Indexes & Performance Indexes
CREATE INDEX IF NOT EXISTS idx_hospitals_location 
  ON public.hospitals USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_ambulances_location 
  ON public.ambulances USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_ambulances_status 
  ON public.ambulances(status);

CREATE INDEX IF NOT EXISTS idx_ambulances_driver 
  ON public.ambulances(driver_id);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_location 
  ON public.emergency_requests USING GIST (pickup_location);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_status 
  ON public.emergency_requests(status);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_citizen 
  ON public.emergency_requests(citizen_id);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_driver 
  ON public.emergency_requests(assigned_driver_id);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_ambulance 
  ON public.emergency_requests(assigned_ambulance_id);

CREATE INDEX IF NOT EXISTS idx_emergency_requests_hospital 
  ON public.emergency_requests(destination_hospital_id);

CREATE INDEX IF NOT EXISTS idx_trip_events_request 
  ON public.trip_events(request_id);

CREATE INDEX IF NOT EXISTS idx_trip_events_created_at 
  ON public.trip_events(created_at DESC);

-- 9. Automatic Point/Lat-Lng Synchronization Triggers
CREATE OR REPLACE FUNCTION public.sync_hospital_geo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::extensions.geography;
  ELSIF NEW.location IS NOT NULL THEN
    NEW.longitude := extensions.ST_X(NEW.location::extensions.geometry);
    NEW.latitude := extensions.ST_Y(NEW.location::extensions.geometry);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hospital_geo ON public.hospitals;
CREATE TRIGGER trg_sync_hospital_geo
  BEFORE INSERT OR UPDATE ON public.hospitals
  FOR EACH ROW EXECUTE FUNCTION public.sync_hospital_geo();

CREATE OR REPLACE FUNCTION public.sync_ambulance_geo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::extensions.geography;
  ELSIF NEW.location IS NOT NULL THEN
    NEW.longitude := extensions.ST_X(NEW.location::extensions.geometry);
    NEW.latitude := extensions.ST_Y(NEW.location::extensions.geometry);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ambulance_geo ON public.ambulances;
CREATE TRIGGER trg_sync_ambulance_geo
  BEFORE INSERT OR UPDATE ON public.ambulances
  FOR EACH ROW EXECUTE FUNCTION public.sync_ambulance_geo();

CREATE OR REPLACE FUNCTION public.sync_emergency_request_geo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pickup_latitude IS NOT NULL AND NEW.pickup_longitude IS NOT NULL THEN
    NEW.pickup_location := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.pickup_longitude, NEW.pickup_latitude), 4326)::extensions.geography;
  ELSIF NEW.pickup_location IS NOT NULL THEN
    NEW.pickup_longitude := extensions.ST_X(NEW.pickup_location::extensions.geometry);
    NEW.pickup_latitude := extensions.ST_Y(NEW.pickup_location::extensions.geometry);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_emergency_request_geo ON public.emergency_requests;
CREATE TRIGGER trg_sync_emergency_request_geo
  BEFORE INSERT OR UPDATE ON public.emergency_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_emergency_request_geo();

-- 10. Spatial Search Function: find_nearest_available_ambulance
CREATE OR REPLACE FUNCTION public.find_nearest_available_ambulance(
  lat double precision,
  lng double precision,
  radius_meters double precision DEFAULT 50000
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
    AND extensions.ST_DWithin(a.location, target_point, radius_meters)
  ORDER BY distance_meters ASC
  LIMIT 10;
END;
$$;

-- 11. Auth Signup Hook: Trigger to automatically create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_val public.user_role;
  meta_role text;
BEGIN
  meta_role := new.raw_user_meta_data->>'role';

  IF meta_role IN ('citizen', 'driver', 'hospital', 'admin') THEN
    user_role_val := meta_role::public.user_role;
  ELSE
    user_role_val := 'citizen'::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, role, full_name, phone)
  VALUES (
    new.id,
    user_role_val,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(COALESCE(new.email, 'User'), '@', 1)),
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    updated_at = now();

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper function to inspect current user's role safely in RLS policies
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 12. Enable Row-Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambulances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;

-- 13. RLS Policies

-- PROFILES Policies
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id OR public.current_user_role() = 'admin')
  WITH CHECK (auth.uid() = id OR public.current_user_role() = 'admin');

-- HOSPITALS Policies
DROP POLICY IF EXISTS "Hospitals are viewable by everyone" ON public.hospitals;
CREATE POLICY "Hospitals are viewable by everyone"
  ON public.hospitals FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Admins and managers can update hospital info" ON public.hospitals;
CREATE POLICY "Admins and managers can update hospital info"
  ON public.hospitals FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin' OR managed_by = auth.uid())
  WITH CHECK (public.current_user_role() = 'admin' OR managed_by = auth.uid());

DROP POLICY IF EXISTS "Admins can insert hospitals" ON public.hospitals;
CREATE POLICY "Admins can insert hospitals"
  ON public.hospitals FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- AMBULANCES Policies
DROP POLICY IF EXISTS "Ambulances are viewable by all authenticated users" ON public.ambulances;
CREATE POLICY "Ambulances are viewable by all authenticated users"
  ON public.ambulances FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Drivers can update their assigned ambulance telemetry" ON public.ambulances;
CREATE POLICY "Drivers can update their assigned ambulance telemetry"
  ON public.ambulances FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid() OR public.current_user_role() = 'admin')
  WITH CHECK (driver_id = auth.uid() OR public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "Admins can insert ambulances" ON public.ambulances;
CREATE POLICY "Admins can insert ambulances"
  ON public.ambulances FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- EMERGENCY REQUESTS Policies
DROP POLICY IF EXISTS "Citizens can view their requests and staff can view active" ON public.emergency_requests;
CREATE POLICY "Citizens can view their requests and staff can view active"
  ON public.emergency_requests FOR SELECT
  TO authenticated
  USING (
    citizen_id = auth.uid()
    OR assigned_driver_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'hospital', 'driver')
  );

DROP POLICY IF EXISTS "Anyone can create emergency requests" ON public.emergency_requests;
CREATE POLICY "Anyone can create emergency requests"
  ON public.emergency_requests FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Assigned stakeholders can update request status" ON public.emergency_requests;
CREATE POLICY "Assigned stakeholders can update request status"
  ON public.emergency_requests FOR UPDATE
  TO authenticated
  USING (
    citizen_id = auth.uid()
    OR assigned_driver_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'driver', 'hospital')
  )
  WITH CHECK (
    citizen_id = auth.uid()
    OR assigned_driver_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'driver', 'hospital')
  );

-- TRIP EVENTS Policies
DROP POLICY IF EXISTS "Trip events are viewable by participants and staff" ON public.trip_events;
CREATE POLICY "Trip events are viewable by participants and staff"
  ON public.trip_events FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'hospital', 'driver')
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.emergency_requests er
      WHERE er.id = trip_events.request_id
        AND er.citizen_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Trip events can be logged by authenticated users" ON public.trip_events;
CREATE POLICY "Trip events can be logged by authenticated users"
  ON public.trip_events FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 14. Realtime Replication Configuration
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ambulances;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_requests;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitals;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_events;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
