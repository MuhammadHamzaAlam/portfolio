# HRZ — AI Innovation City (Phase 1, milestone 1)

Interactive 3D city portfolio for Muhammad Hamza Alam, plus a small FastAPI backend for two features:
a real contact-form email (Resend) and the HRZ AI Portfolio Assistant (Gemini résumé RAG chatbot).
No microphone, camera, AR or voice features.

## Setup: one `.env` file

All configuration lives in **`hrz-city/.env`** (an empty template is included; `.env.example` documents it).
Fill in two values:

```env
GEMINI_API_KEY=your-gemini-key          # https://aistudio.google.com/apikey
RESEND_API_KEY=re_your-resend-key       # https://resend.com/api-keys
```

Everything else is pre-filled (models `gemini-3.1-flash-lite` + `gemini-embedding-2`, recipient
`muhammadhamzaalam2@gmail.com`, sender `HRZ Portfolio <onboarding@resend.dev>`).

**Important (Resend):** the shared sender `onboarding@resend.dev` can only deliver to the email address
your Resend account was created with. Sign up to Resend with **muhammadhamzaalam2@gmail.com**, or verify
your own domain in Resend and set `EMAIL_FROM_ADDRESS` to an address on it. The visitor's email is used only
as `Reply-To`, never as the sender.

## Run it (development)

Requires Node.js 18+ and Python 3.10+.

```bash
# 1. frontend dependencies
npm install

# 2. backend dependencies
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip install -r requirements.txt

# 3. build the résumé index (needs GEMINI_API_KEY; re-run whenever the résumé changes)
.venv/bin/python -m app.cli index

# 4. start the API (port 8000)
.venv/bin/uvicorn app.main:app --port 8000

# 5. in a second terminal, from hrz-city/: start the site (port 5173, proxies /api to 8000)
npm run dev
```

Open http://localhost:5173. Check backend readiness at http://localhost:8000/api/health.

## Run it (production, single process)

```bash
npm run build                                   # creates dist/
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

FastAPI then serves both the site and the API on port 8000. Behind a reverse proxy set `TRUST_PROXY=1`
and add your domain to `ALLOWED_ORIGINS`.

## Backend features

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Readiness: email/Gemini configured, index loaded/stale — never shows secrets |
| `POST /api/contact` | Validates, anti-spam (honeypot, minimum fill time, link limit, header-injection guard), 3 msgs/10 min per IP, 32 KB body limit, sends via Resend with `Reply-To` = visitor |
| `POST /api/chat` | Résumé RAG: embeds the question (+ previous question for follow-ups), cosine top-5 over the local index, Gemini answers only from those excerpts with `[S#]` citations; 20 req/min per IP |

**Résumé index:** `backend/data/resume.pdf` → section-aware chunks (profile, education, each job, each
project, skills, certifications; page + section metadata; real links from the PDF) → `gemini-embedding-2`
(768-dim) → `backend/data/resume_index.json`. The phone number is excluded from the chatbot by default
(`RAG_INCLUDE_PHONE=1` to include it).

**Update the résumé:** replace `backend/data/resume.pdf`, then run `python -m app.cli index`.
Other commands: `python -m app.cli chunks` (preview chunks, no API calls), `python -m app.cli models`
(list models your key can use), `python -m app.cli ask "Who is Hamza?"` (test from the terminal).

**Tests:** `cd backend && .venv/bin/python -m pytest` (22 tests: chunking on the real PDF, retrieval,
contact validation/spam/rate limits/size limit/provider failures, chat grounding, history, errors).

## Stack

React 18, Three.js 0.170, React Three Fiber, GSAP, postprocessing (restrained bloom). Backend: FastAPI, google-genai, Resend (HTTP API), pypdf, NumPy. Fonts are
bundled locally (Instrument Serif, Manrope, IBM Plex Mono).

## Where things are

| Path | Contents |
|---|---|
| `src/data/registry.ts` | Destination registry and route graph: single source of truth for buildings, roads, map and routes |
| `src/data/content.ts` | Verified résumé and credential content (nothing invented) |
| `src/world/site.ts` | Ground, road network (generated from the route graph), Plaza, pools, pylons, trees, lamps, gateway, skyline |
| `src/world/monument.ts` | Intelligence Monument: core, three rings, five arms aimed at real buildings, node graph, state machine |
| `src/world/buildings.ts` | The six building exteriors, built from the reference images |
| `src/world/aion.ts` | AION controller on the supplied GLB: clips, route walking, head/neck attention, reveal shader |
| `src/world/runtime.ts` | Scene, lights, camera modes (intro, Plaza, guided, direct travel, arrival, explore, map), picking, collision |
| `src/ui/` | HUD, tour rail, intro and identity, Monument labels, map panel, journey bar, AION panel, content views |
| `public/models/aion.glb` | Owner-supplied AION model (meshopt-compressed) |

## AION asset audit

The GLB has 104 joints, including Neck, Head, FaceGlyph and the cape bones, and these clips:
Idle, Walk, Stop, TurnLeft90, LookAround, Greet, Point, Explain, Present, and Speak (which only
scales the FaceGlyph). Walk's forward drift is removed in code, so AION moves along the route
instead. Speak is used only as a silent "presenting" indicator, never as lip-sync. The open-arm
stance in Idle is how the asset's own clip is authored.

## Status

| Feature | Status |
|---|---|
| Gateway, cinematic entry, skip intro, Plaza reveal | Implemented and tested |
| Intelligence Monument: geometry, states, hover and select, five domains, labels tied to the 3D parts | Implemented and tested |
| AION: load, reveal effect, rim light, greeting, pointing, head attention | Implemented and tested (screenshots) |
| Guided mode: AION walks the street graph, camera follows, arrives, doors open | Implemented and tested |
| Direct travel along the street network | Implemented and tested |
| Map mode (site model of the real geometry, route preview, Guide / Travel) | Implemented and tested |
| Explore mode: WASD, mouse look, building collision | Implemented and tested on desktop. Touch joystick implemented but not yet tested on a device |
| Six building exteriors with animated doors and corrected signage | Implemented and tested |
| Contact form → backend → Resend email | Implemented and tested with a mocked Resend API; **not yet tested against real Resend (no key provided)** |
| HRZ AI Portfolio Assistant (Gemini résumé RAG) | Implemented and tested with mocked Gemini; **not yet tested against live Gemini (no valid key provided)** |
| Content view without 3D, résumé view | Implemented and tested |
| Quality levels and reduced motion | Implemented but not yet tested |
| Building interiors and project exhibits (TerraTrace, Library, VoxAI, NexoRa, Data Center, Pavilion and certification gallery) | Not implemented. Next build stages. The "Enter building" button is disabled and labelled |
| Mobile screenshots and real-GPU frame-rate measurement | Not yet done. The build container only has software rendering |

## Licences and brands

All architecture, the Monument and all textures are original and generated procedurally in code.
The fonts are under the SIL Open Font License (via Fontsource). No company logos are included.
Credential providers appear only as plain-text names.
