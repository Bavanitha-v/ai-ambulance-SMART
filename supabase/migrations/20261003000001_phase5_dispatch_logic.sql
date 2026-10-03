-- ==============================================================================
-- AI Emergency Smart Ambulance System (AI ResQ)
-- Migration: 20261003000001_phase5_dispatch_logic.sql
-- Description: Phase 5 Dispatch Logic
--              - Nearest PostGIS search with exclusion filtering
--              - Atomic dispatch with row locking (FOR UPDATE SKIP LOCKED)
--              - Driver rejection & 30-sec timeout reassignment
--              - Escalation & Admin Notifications when fleet exhausted
-- ==============================================================================

-- 1. Schema Updates: Add rejected_ambulance_ids to emergency_requests if not exists
DO $$ BEGIN
  ALTER TABLE public.emergency_requests 
  ADD COLUMN IF NOT EXISTS rejected_ambulance_ids uuid[] DEFAULT '{}';
EXCEPTION
  WHEN duplicate_column THEN null;
END $$;

-- Index to optimize timeout sweeper and status lookups
CREATE INDEX IF NOT EXISTS idx_emergency_requests_timeout_check
  ON public.emergency_requests (status, driver_assignment_expires_at)
  WHERE status = 'driver_assigned';

-- 2. Admin Notifications Table
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES public.emergency_requests(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'escalation',
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'critical',
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON public.admin_notifications (is_read, created_at DESC);

-- Enable RLS on admin_notifications
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and staff can view admin notifications" ON public.admin_notifications;
CREATE POLICY "Admins and staff can view admin notifications"
  ON public.admin_notifications FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin', 'hospital'));

DROP POLICY IF EXISTS "Admins can update notifications" ON public.admin_notifications;
CREATE POLICY "Admins can update notifications"
  ON public.admin_notifications FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "System can insert notifications" ON public.admin_notifications;
CREATE POLICY "System can insert notifications"
  ON public.admin_notifications FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Add admin_notifications to Realtime Publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Enhanced Spatial Search Function with Exclusion Filter
-- Drop the legacy 3-parameter overload to prevent PostgREST PGRST203 ambiguity
DROP FUNCTION IF EXISTS public.find_nearest_available_ambulance(
  double precision,
  double precision,
  double precision
);

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

-- 4. Atomic Dispatch Function with Row-Locking (FOR UPDATE SKIP LOCKED)
-- Prevents race conditions: two concurrent requests can never get the same ambulance
CREATE OR REPLACE FUNCTION public.dispatch_emergency_request(
  p_request_id uuid,
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_request record;
  v_ambulance record;
  v_expires_at timestamptz;
  v_excluded_ids uuid[];
BEGIN
  -- A. Lock the emergency request row
  SELECT * INTO v_request
  FROM public.emergency_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Emergency request not found');
  END IF;

  IF v_request.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request already finalized', 'status', v_request.status);
  END IF;

  v_excluded_ids := COALESCE(v_request.rejected_ambulance_ids, ARRAY[]::uuid[]);

  -- B. Atomically lock and pick the nearest available ambulance (excluding previously rejected/failed units)
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
    extensions.ST_Distance(a.location, v_request.pickup_location) AS distance_meters
  INTO v_ambulance
  FROM public.ambulances a
  WHERE a.status = 'available'
    AND (v_excluded_ids IS NULL OR cardinality(v_excluded_ids) = 0 OR NOT (a.id = ANY(v_excluded_ids)))
    AND extensions.ST_DWithin(a.location, v_request.pickup_location, 50000)
  ORDER BY distance_meters ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  -- C. Handle Assignment or Escalation
  IF FOUND THEN
    v_expires_at := now() + interval '30 seconds';

    -- 1. Mark chosen ambulance as busy
    UPDATE public.ambulances
    SET status = 'busy',
        updated_at = now()
    WHERE id = v_ambulance.id;

    -- 2. Assign to emergency request
    UPDATE public.emergency_requests
    SET assigned_ambulance_id = v_ambulance.id,
        assigned_driver_id = v_ambulance.driver_id,
        status = 'driver_assigned',
        driver_assignment_expires_at = v_expires_at,
        updated_at = now()
    WHERE id = p_request_id;

    -- 3. Audit log in trip_events
    INSERT INTO public.trip_events (
      request_id,
      event_type,
      actor_id,
      latitude,
      longitude,
      location,
      metadata
    ) VALUES (
      p_request_id,
      'driver_assigned',
      COALESCE(p_actor_id, v_ambulance.driver_id),
      v_ambulance.latitude,
      v_ambulance.longitude,
      extensions.ST_SetSRID(extensions.ST_MakePoint(v_ambulance.longitude, v_ambulance.latitude), 4326)::extensions.geography,
      jsonb_build_object(
        'ambulance_id', v_ambulance.id,
        'vehicle_number', v_ambulance.vehicle_number,
        'type', v_ambulance.type,
        'distance_meters', round(v_ambulance.distance_meters::numeric, 1),
        'expires_at', v_expires_at,
        'previous_rejections', cardinality(v_excluded_ids)
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'status', 'driver_assigned',
      'assigned_ambulance_id', v_ambulance.id,
      'vehicle_number', v_ambulance.vehicle_number,
      'ambulance_type', v_ambulance.type,
      'distance_meters', round(v_ambulance.distance_meters::numeric, 1),
      'driver_id', v_ambulance.driver_id,
      'expires_at', v_expires_at
    );
  ELSE
    -- No available ambulance within radius or all candidate units rejected
    UPDATE public.emergency_requests
    SET status = 'escalated',
        assigned_ambulance_id = NULL,
        assigned_driver_id = NULL,
        driver_assignment_expires_at = NULL,
        updated_at = now()
    WHERE id = p_request_id;

    -- Audit log escalation
    INSERT INTO public.trip_events (
      request_id,
      event_type,
      actor_id,
      metadata
    ) VALUES (
      p_request_id,
      'dispatch_escalated',
      p_actor_id,
      jsonb_build_object(
        'reason', 'no_available_ambulances',
        'rejected_count', cardinality(v_excluded_ids),
        'escalated_to', 'admin_command_center'
      )
    );

    -- Insert high-priority admin notification
    INSERT INTO public.admin_notifications (
      request_id,
      type,
      title,
      message,
      severity,
      metadata
    ) VALUES (
      p_request_id,
      'escalation',
      'EMERGENCY ESCALATION: No Ambulances Available',
      'Emergency request ' || p_request_id || ' could not be fulfilled by any available ambulance. All units within 50km are busy or rejected. Manual intervention required.',
      'critical',
      jsonb_build_object(
        'request_id', p_request_id,
        'severity', v_request.ai_severity,
        'pickup_latitude', v_request.pickup_latitude,
        'pickup_longitude', v_request.pickup_longitude,
        'rejected_ambulance_ids', v_excluded_ids,
        'timestamp', now()
      )
    );

    RETURN jsonb_build_object(
      'success', false,
      'status', 'escalated',
      'message', 'No available ambulances found. Request escalated to Admin Command Center.',
      'rejected_count', cardinality(v_excluded_ids)
    );
  END IF;
END;
$$;

-- 5. Atomic Rejection & Immediate Next-Nearest Reassignment
CREATE OR REPLACE FUNCTION public.reject_and_reassign_ambulance(
  p_request_id uuid,
  p_reason text DEFAULT 'Driver rejected dispatch',
  p_actor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_request record;
  v_old_ambulance_id uuid;
  v_old_driver_id uuid;
  v_rejected_ambs uuid[];
  v_rejected_drivers uuid[];
BEGIN
  -- Lock request row
  SELECT * INTO v_request
  FROM public.emergency_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Emergency request not found');
  END IF;

  v_old_ambulance_id := v_request.assigned_ambulance_id;
  v_old_driver_id := v_request.assigned_driver_id;
  v_rejected_ambs := COALESCE(v_request.rejected_ambulance_ids, ARRAY[]::uuid[]);
  v_rejected_drivers := COALESCE(v_request.rejected_driver_ids, ARRAY[]::uuid[]);

  -- Release previously assigned ambulance back to 'available'
  IF v_old_ambulance_id IS NOT NULL THEN
    UPDATE public.ambulances
    SET status = 'available',
        updated_at = now()
    WHERE id = v_old_ambulance_id;

    IF NOT (v_old_ambulance_id = ANY(v_rejected_ambs)) THEN
      v_rejected_ambs := array_append(v_rejected_ambs, v_old_ambulance_id);
    END IF;
  END IF;

  IF v_old_driver_id IS NOT NULL AND NOT (v_old_driver_id = ANY(v_rejected_drivers)) THEN
    v_rejected_drivers := array_append(v_rejected_drivers, v_old_driver_id);
  END IF;

  -- Update request tracking
  UPDATE public.emergency_requests
  SET rejected_ambulance_ids = v_rejected_ambs,
      rejected_driver_ids = v_rejected_drivers,
      assigned_ambulance_id = NULL,
      assigned_driver_id = NULL,
      driver_assignment_expires_at = NULL,
      status = 'searching_driver',
      updated_at = now()
  WHERE id = p_request_id;

  -- Log rejection event
  INSERT INTO public.trip_events (
    request_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    p_request_id,
    'driver_rejected',
    p_actor_id,
    jsonb_build_object(
      'ambulance_id', v_old_ambulance_id,
      'reason', p_reason,
      'rejected_ambulance_ids', v_rejected_ambs
    )
  );

  -- Atomically dispatch to the next nearest unit
  RETURN public.dispatch_emergency_request(p_request_id, p_actor_id);
END;
$$;

-- 6. Atomic Timeout Handler (30 seconds exceeded)
CREATE OR REPLACE FUNCTION public.handle_dispatch_timeout(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_request record;
  v_old_ambulance_id uuid;
  v_rejected_ambs uuid[];
BEGIN
  -- Lock request
  SELECT * INTO v_request
  FROM public.emergency_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Emergency request not found');
  END IF;

  -- Check if actively awaiting driver and deadline expired
  IF v_request.status != 'driver_assigned' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Request is not awaiting driver assignment', 'status', v_request.status);
  END IF;

  IF v_request.driver_assignment_expires_at > now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Assignment has not expired yet',
      'seconds_remaining', EXTRACT(EPOCH FROM (v_request.driver_assignment_expires_at - now()))
    );
  END IF;

  v_old_ambulance_id := v_request.assigned_ambulance_id;
  v_rejected_ambs := COALESCE(v_request.rejected_ambulance_ids, ARRAY[]::uuid[]);

  -- Release ambulance back to fleet
  IF v_old_ambulance_id IS NOT NULL THEN
    UPDATE public.ambulances
    SET status = 'available',
        updated_at = now()
    WHERE id = v_old_ambulance_id;

    IF NOT (v_old_ambulance_id = ANY(v_rejected_ambs)) THEN
      v_rejected_ambs := array_append(v_rejected_ambs, v_old_ambulance_id);
    END IF;
  END IF;

  -- Update tracking
  UPDATE public.emergency_requests
  SET rejected_ambulance_ids = v_rejected_ambs,
      assigned_ambulance_id = NULL,
      assigned_driver_id = NULL,
      driver_assignment_expires_at = NULL,
      status = 'searching_driver',
      updated_at = now()
  WHERE id = p_request_id;

  -- Audit log timeout
  INSERT INTO public.trip_events (
    request_id,
    event_type,
    metadata
  ) VALUES (
    p_request_id,
    'driver_timeout',
    jsonb_build_object(
      'ambulance_id', v_old_ambulance_id,
      'reason', '30-second driver response timeout exceeded',
      'rejected_ambulance_ids', v_rejected_ambs
    )
  );

  -- Reassign to next nearest
  RETURN public.dispatch_emergency_request(p_request_id);
END;
$$;

-- 7. Batch Timeout Sweeper
CREATE OR REPLACE FUNCTION public.process_expired_dispatches()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM public.emergency_requests
    WHERE status = 'driver_assigned'
      AND driver_assignment_expires_at <= now()
  LOOP
    PERFORM public.handle_dispatch_timeout(r.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('processed_count', v_count);
END;
$$;
