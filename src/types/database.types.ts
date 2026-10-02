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
  total_beds: number;
  available_beds: number;
  icu_available: number;
  specialties: string[];
  is_active: boolean;
  managed_by?: string | null;
  created_at: string;
}

export interface Ambulance {
  id: string;
  vehicle_number: string;
  driver_id: string;
  type: AmbulanceType;
  status: AmbulanceStatus;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  last_heartbeat: string | null;
  created_at: string;
  driver?: Profile;
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
  created_at: string;
  updated_at: string;
  // Joins
  ambulance?: Ambulance;
  hospital?: Hospital;
  citizen?: Profile;
  driver?: Profile;
}

export interface TripEvent {
  id: string;
  request_id: string;
  event_type: string;
  actor_id?: string | null;
  metadata?: Record<string, unknown>;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}
