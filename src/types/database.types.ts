export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "citizen" | "driver" | "hospital" | "admin";

export type RequestStatus =
  | "pending_triage"
  | "searching_driver"
  | "driver_assigned"
  | "driver_accepted"
  | "en_route_pickup"
  | "patient_picked_up"
  | "en_route_hospital"
  | "reached_hospital"
  | "completed"
  | "cancelled"
  | "escalated";

export type TriageSeverity = "critical" | "high" | "medium" | "low";

export type AmbulanceStatus = "available" | "busy" | "offline" | "maintenance";

export type AmbulanceType = "bls" | "als" | "cardiac" | "neonatal";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Hospital {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  location?: unknown;
  total_beds: number;
  available_beds: number;
  icu_available: number;
  specialties: string[];
  is_active: boolean;
  managed_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ambulance {
  id: string;
  vehicle_number: string;
  driver_id?: string | null;
  type: AmbulanceType;
  status: AmbulanceStatus;
  latitude: number;
  longitude: number;
  location?: unknown;
  heading: number;
  speed: number;
  last_heartbeat?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  driver?: Profile | null;
}

export interface AiTriageResult {
  severity: TriageSeverity;
  primary_condition: string;
  recommended_specialty: string;
  first_aid_instructions: string[];
  vital_cautions: string[];
  confidence_score: number;
  reasoning: string;
  is_fallback?: boolean;
}

export interface EmergencyRequest {
  id: string;
  citizen_id?: string | null;
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_location?: unknown;
  pickup_address?: string | null;
  symptoms?: string | null;
  ai_severity: TriageSeverity;
  ai_triage_result?: AiTriageResult | null;
  status: RequestStatus;
  assigned_ambulance_id?: string | null;
  assigned_driver_id?: string | null;
  destination_hospital_id?: string | null;
  driver_assignment_expires_at?: string | null;
  rejected_driver_ids?: string[];
  rejected_ambulance_ids?: string[];
  created_at: string;
  updated_at: string;
  // Joins
  ambulance?: Ambulance | null;
  hospital?: Hospital | null;
  citizen?: Profile | null;
  driver?: Profile | null;
}

export interface AdminNotification {
  id: string;
  request_id?: string | null;
  type: string;
  title: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  is_read: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface TripEvent {
  id: string;
  request_id: string;
  event_type: string;
  actor_id?: string | null;
  metadata?: Record<string, unknown> | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: unknown;
  created_at: string;
}

export interface NearestAmbulanceResult {
  id: string;
  vehicle_number: string;
  driver_id: string | null;
  type: AmbulanceType;
  status: AmbulanceStatus;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  distance_meters: number;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: {
          id: string;
          role?: UserRole;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      hospitals: {
        Row: Hospital;
        Insert: {
          id?: string;
          name: string;
          address: string;
          phone: string;
          latitude: number;
          longitude: number;
          location?: unknown;
          total_beds?: number;
          available_beds?: number;
          icu_available?: number;
          specialties?: string[];
          is_active?: boolean;
          managed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          phone?: string;
          latitude?: number;
          longitude?: number;
          location?: unknown;
          total_beds?: number;
          available_beds?: number;
          icu_available?: number;
          specialties?: string[];
          is_active?: boolean;
          managed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ambulances: {
        Row: Ambulance;
        Insert: {
          id?: string;
          vehicle_number: string;
          driver_id?: string | null;
          type?: AmbulanceType;
          status?: AmbulanceStatus;
          latitude: number;
          longitude: number;
          location?: unknown;
          heading?: number;
          speed?: number;
          last_heartbeat?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vehicle_number?: string;
          driver_id?: string | null;
          type?: AmbulanceType;
          status?: AmbulanceStatus;
          latitude?: number;
          longitude?: number;
          location?: unknown;
          heading?: number;
          speed?: number;
          last_heartbeat?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      emergency_requests: {
        Row: EmergencyRequest;
        Insert: {
          id?: string;
          citizen_id?: string | null;
          pickup_latitude: number;
          pickup_longitude: number;
          pickup_location?: unknown;
          pickup_address?: string | null;
          symptoms?: string | null;
          ai_severity?: TriageSeverity;
          ai_triage_result?: AiTriageResult | null;
          status?: RequestStatus;
          assigned_ambulance_id?: string | null;
          assigned_driver_id?: string | null;
          destination_hospital_id?: string | null;
          driver_assignment_expires_at?: string | null;
          rejected_driver_ids?: string[];
          rejected_ambulance_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          citizen_id?: string | null;
          pickup_latitude?: number;
          pickup_longitude?: number;
          pickup_location?: unknown;
          pickup_address?: string | null;
          symptoms?: string | null;
          ai_severity?: TriageSeverity;
          ai_triage_result?: AiTriageResult | null;
          status?: RequestStatus;
          assigned_ambulance_id?: string | null;
          assigned_driver_id?: string | null;
          destination_hospital_id?: string | null;
          driver_assignment_expires_at?: string | null;
          rejected_driver_ids?: string[];
          rejected_ambulance_ids?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
      admin_notifications: {
        Row: AdminNotification;
        Insert: {
          id?: string;
          request_id?: string | null;
          type?: string;
          title: string;
          message: string;
          severity?: "critical" | "high" | "medium" | "low";
          is_read?: boolean;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string | null;
          type?: string;
          title?: string;
          message?: string;
          severity?: "critical" | "high" | "medium" | "low";
          is_read?: boolean;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
      trip_events: {
        Row: TripEvent;
        Insert: {
          id?: string;
          request_id: string;
          event_type: string;
          actor_id?: string | null;
          metadata?: Record<string, unknown> | null;
          latitude?: number | null;
          longitude?: number | null;
          location?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          event_type?: string;
          actor_id?: string | null;
          metadata?: Record<string, unknown> | null;
          latitude?: number | null;
          longitude?: number | null;
          location?: unknown;
          created_at?: string;
        };
      };
    };
    Functions: {
      find_nearest_available_ambulance: {
        Args: {
          lat: number;
          lng: number;
          radius_meters?: number;
          exclude_ambulance_ids?: string[];
        };
        Returns: NearestAmbulanceResult[];
      };
      dispatch_emergency_request: {
        Args: {
          p_request_id: string;
          p_actor_id?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      reject_and_reassign_ambulance: {
        Args: {
          p_request_id: string;
          p_reason?: string;
          p_actor_id?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      handle_dispatch_timeout: {
        Args: {
          p_request_id: string;
        };
        Returns: Record<string, unknown>;
      };
      process_expired_dispatches: {
        Args: Record<PropertyKey, never>;
        Returns: Record<string, unknown>;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole;
      };
    };
  };
}
