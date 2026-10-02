# AI Emergency Smart Ambulance System (AI ResQ)

A production-grade, life-critical emergency medical dispatch MVP built with Next.js 15, TypeScript (strict), Tailwind CSS, Supabase (PostgreSQL + PostGIS + Realtime), Leaflet, and an AI clinical triage engine.

---

## Features Matrix

| Role | Core Capabilities |
|---|---|
| **Citizen** | 1-Tap SOS dispatch, geolocation lock, AI symptom tagger, live Leaflet ambulance tracking map with real-time ETA, medical first-aid tips. |
| **Driver (Paramedic)** | Online/offline availability toggle, 30s emergency alert countdown with audio ping, accept/reject auto-reassign, live GPS broadcaster, milestone status updater. |
| **Hospital ER** | Real-time incoming trauma alerts, AI severity classification (Critical, High, Medium, Low), ER & ICU bed availability updater. |
| **Admin Command** | City-wide fleet telemetry map, real-time SLA metrics (avg response time, active requests), manual dispatch override & escalation management. |

---

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack, React 19)
- **Language**: TypeScript (strict mode enabled)
- **Styling**: Tailwind CSS + `lucide-react`
- **Database & Auth**: [Supabase](https://supabase.com/) (PostgreSQL with PostGIS extension, Realtime subscriptions, Row-Level Security)
- **Maps**: Leaflet + OpenStreetMap (100% open-source, no paid API keys required)
- **AI Triage**: Server-side LLM endpoint with Zod schema validation & fail-safe fallback
- **Validation**: Zod
- **Testing**: Vitest & Playwright

---

## Getting Started

### 1. Prerequisites
- Node.js 18+ (tested on Node v24)
- npm or pnpm

### 2. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your Supabase project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# AI Triage Key (Gemini or OpenAI)
LLM_API_KEY=<your-api-key>
LLM_PROVIDER=gemini
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.
