-- ==============================================================================
-- AI Emergency Smart Ambulance System (AI ResQ)
-- Migration: 20261002000002_seed_chennai_data.sql
-- Description: Seed Data for Major Chennai Hospitals and Smart Ambulances
-- ==============================================================================

-- 1. Seed Chennai Hospitals
INSERT INTO public.hospitals (
  name,
  address,
  phone,
  latitude,
  longitude,
  location,
  total_beds,
  available_beds,
  icu_available,
  specialties,
  is_active
) VALUES
(
  'Rajiv Gandhi Govt General Hospital (RGGGH)',
  'EVR Periyar Salai, Park Town, Chennai, Tamil Nadu 600003',
  '+91 44 2530 5000',
  13.0805,
  80.2787,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2787, 13.0805), 4326)::extensions.geography,
  150,
  42,
  12,
  ARRAY['Trauma Care', 'Cardiology', 'Neurology', 'Burns Unit', 'Emergency Resuscitation'],
  true
),
(
  'Apollo Hospitals Main Center',
  '21 Greams Lane, Off Greams Road, Thousand Lights, Chennai, Tamil Nadu 600006',
  '+91 44 2829 0200',
  13.0573,
  80.2508,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2508, 13.0573), 4326)::extensions.geography,
  120,
  28,
  8,
  ARRAY['Interventional Cardiology', 'Neurotrauma', 'Organ Transplant', 'Critical Care'],
  true
),
(
  'MIOT International Hospital',
  '4/112 Mount Poonamallee Road, Manapakkam, Chennai, Tamil Nadu 600089',
  '+91 44 4200 2288',
  13.0182,
  80.1856,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.1856, 13.0182), 4326)::extensions.geography,
  95,
  31,
  9,
  ARRAY['Polytrauma', 'Orthopaedic Surgery', 'Cardiac Emergency', 'Spine Injury'],
  true
),
(
  'Fortis Malar Hospital',
  'No. 52, 1st Main Road, Gandhi Nagar, Adyar, Chennai, Tamil Nadu 600020',
  '+91 44 4289 2222',
  13.0067,
  80.2570,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2570, 13.0067), 4326)::extensions.geography,
  80,
  19,
  6,
  ARRAY['Pediatric Cardiology', 'Advanced Cardiac Life Support', 'Vascular Trauma'],
  true
),
(
  'Tamil Nadu Govt Multi Super Speciality Hospital',
  'Omandurar Government Estate, Anna Salai, Triplicane, Chennai, Tamil Nadu 600002',
  '+91 44 2566 6000',
  13.0694,
  80.2736,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2736, 13.0694), 4326)::extensions.geography,
  110,
  35,
  11,
  ARRAY['Acute Stroke Center', 'Cardiothoracic', 'Nephrology Trauma', 'Medical ICU'],
  true
),
(
  'SIMS Hospital Vadapalani',
  'No. 1 Jawaharlal Nehru Salai, Vadapalani, Chennai, Tamil Nadu 600026',
  '+91 44 2000 2001',
  13.0518,
  80.2114,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2114, 13.0518), 4326)::extensions.geography,
  90,
  24,
  7,
  ARRAY['Comprehensive Emergency', 'Cardiac Resuscitation', 'Neuro ICU'],
  true
)
ON CONFLICT DO NOTHING;

-- 2. Seed Chennai Smart Fleet Ambulances
INSERT INTO public.ambulances (
  vehicle_number,
  type,
  status,
  latitude,
  longitude,
  location,
  heading,
  speed,
  last_heartbeat
) VALUES
(
  'TN-01-EM-1081',
  'als',
  'available',
  13.0850,
  80.2100,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2100, 13.0850), 4326)::extensions.geography,
  45.0,
  0.0,
  now()
),
(
  'TN-01-EM-1082',
  'cardiac',
  'available',
  13.0418,
  80.2341,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2341, 13.0418), 4326)::extensions.geography,
  120.0,
  0.0,
  now()
),
(
  'TN-01-EM-1083',
  'bls',
  'available',
  13.0067,
  80.2206,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2206, 13.0067), 4326)::extensions.geography,
  270.0,
  0.0,
  now()
),
(
  'TN-01-EM-1084',
  'als',
  'available',
  13.0827,
  80.2750,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2750, 13.0827), 4326)::extensions.geography,
  15.0,
  0.0,
  now()
),
(
  'TN-01-EM-1085',
  'neonatal',
  'available',
  12.9815,
  80.2180,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.2180, 12.9815), 4326)::extensions.geography,
  180.0,
  0.0,
  now()
),
(
  'TN-01-EM-1086',
  'bls',
  'busy',
  13.0382,
  80.1565,
  extensions.ST_SetSRID(extensions.ST_MakePoint(80.1565, 13.0382), 4326)::extensions.geography,
  90.0,
  35.5,
  now()
)
ON CONFLICT (vehicle_number) DO UPDATE
SET
  status = EXCLUDED.status,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  location = EXCLUDED.location,
  last_heartbeat = now();
