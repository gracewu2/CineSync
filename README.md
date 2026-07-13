# Cinesync — Film Location Intelligence

A domain-specific AI group chat system for film production location management. Production teams get instant, source-cited compliance answers about filming locations — covering TMZ zone status, FilmLA permits, noise ordinances, union rules, LAFD requirements, and crew logistics.

**Stack:** RAG (ChromaDB + 12 real PDFs) · GPT-4o mini (OpenAI) · FastAPI · React · PWA

---

## Quick Start (Local Demo)

### Prerequisites
- Python 3.10+
- Node.js 18+
- OpenAI API key

---

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Mac/Linux
# venv\Scripts\activate           # Windows

pip install -r requirements.txt
```

Create a `.env` file in `backend/`:
```
OPENAI_API_KEY=sk-...
```

**Seed the knowledge base (run once before first launch):**
```bash
python ingest_docs.py
```

You should see:
```
🎉 Ingestion Complete: 251 total chunks across 12 docs
✅ ChromaDB is ready at: ./chroma_db
```

Start the backend:
```bash
uvicorn main:app --reload --port 8000
```

You should see:
```
✅ ChromaDB loaded — 251 chunks ready
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Verify at: http://localhost:8000/health

---

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open: **http://localhost:3000**

---

## Demo Flow

1. **Open** http://localhost:3000 — the chat pre-loads with an active location scouting conversation including an AI-generated map of the Arts District
2. **Switch role** to "Producer" using the dropdown (top right)
3. **Ask:** *"I'm filming at Griffith Observatory on a Saturday with 80 crew members, including pyrotechnics. What do I need and what will it cost?"*
   - Watch it pull the Wednesday 10am permit deadline, $78 Special FX admin fee, and $44.50/hr monitor fee from actual FilmLA PDFs — and generate a live map of the location
4. **Switch role** to "Location Manager"
5. **Upload** a location photo (📎 button) and ask: *"Can we film here? Analyze for compliance."*
   - GPT-4o mini performs real visual analysis of the uploaded image
6. **Switch role** to "Director" and ask: *"What time is golden hour at Venice Beach this weekend?"*
7. **Click ☀️ SUN PATH** in the sidebar — enter any LA address to get golden hour windows, blue hour, and shooting window recommendations with an arc diagram
8. **Click 📍 TMZ LOOKUP** — compare Griffith Observatory (inside TMZ, no travel pay) vs Malibu (outside TMZ, ~$7,500–$12,000/day in per diem for 60 crew)
9. **On mobile** — tap the hamburger menu (☰) to access the sidebar; the app is installable as a PWA via Chrome's "Add to Home Screen"

---

## Architecture

```
User (React Frontend PWA, port 3000)
        │  HTTP POST /api/chat
        │  HTTP POST /api/tmz-lookup
        │  HTTP POST /api/sun-path
        ▼
FastAPI Backend (port 8000)
        │
        ├─ ChromaDB (Persistent, ./chroma_db)
        │   └─ Role-filtered semantic search (top-6 chunks)
        │       251 chunks · 12 official PDFs
        │       sentence-transformers/all-MiniLM-L6-v2 embeddings
        │       Metadata: doc_type · jurisdiction · role_relevance
        │       has_fees · has_tmz · has_deadline flags
        │
        ├─ OpenStreetMap Nominatim (geocoding, free, no API key)
        │   └─ Address → lat/lon for TMZ calc, map generation, sun path
        │
        ├─ OpenStreetMap Embed (live interactive maps in chat, free)
        │   └─ AI appends map iframe to responses when location detected
        │
        ├─ Astral library (sun position calculations, local)
        │   └─ Precise golden hour / blue hour for any location + date
        │
        └─ OpenAI API (GPT-4o mini)
                - Text: RAG context + role-tailored system prompt
                - Vision: real image analysis on uploaded location photos
                - Returns: structured compliance report with source citations
```

---

## Knowledge Base — Official Source Documents

The RAG system is built from **12 real authoritative documents** (251 chunks).
Ingested via `ingest_docs.py` into a persistent ChromaDB collection on disk.

| Document | Source | Chunks | Covers |
|----------|--------|--------|--------|
| 30-MILE-STUDIO-ZONE.pdf | California Film Commission | 3 | TMZ boundaries, secondary zone, center point |
| Area Requirements: City of Los Angeles | FilmLA | 13 | Permits, deadlines, insurance, LAFD/LAPD rules |
| Area Requirements: County of Los Angeles | FilmLA | 12 | County permit requirements, unincorporated areas |
| Common Fees, LA City | FilmLA | 4 | LAPD officers, LAFD, lane closures, monitor rates |
| Common Fees, LA County | FilmLA | 5 | County-specific fee schedule |
| FilmLA Basic Fees List | FilmLA | 2 | Base application fees, rider fees |
| Film Unit: LA Fire Department | LAFD | 8 | Fire safety officers, special effects, inspections |
| Noise Enforcement Team | LAPD | 5 | Noise ordinance rules, complaint procedures |
| DGA Basic Agreement 2020 — Section 13 | DGA | 61 | AD/UPM work hours, rest periods, overtime, distant location |
| DGA Basic Agreement 2020 — Travel (§4-104) | DGA | 2 | Director travel rules, 30-mile zone reporting |
| DGA Basic Agreement 2020 — Director Location (§9) | DGA | 4 | Distant location notice, flight allowance |
| 2024 IATSE Basic Agreement MOA | IATSE | 132 | Below-the-line crew wages, hours, per diem |

### Chunking Strategy
- Section-aware splitting on legal markers (e.g. `13-110`, `Section 4`) keeps legal clauses intact
- Target chunk size: ~1,800 characters with 200-character overlap
- Each chunk carries metadata: `doc_type`, `jurisdiction`, `topic_tags`, `role_relevance`, `has_fees`, `has_tmz`, `has_deadline`

### Role-Based Retrieval Filtering
Queries are pre-filtered by `doc_type` based on the active user role before semantic search:

| Role | Priority Doc Types |
|------|--------------------|
| Producer | permit_requirements, fee_schedule, union_rules |
| Location Manager | permit_requirements, fee_schedule, department_requirements, tmz_zone |
| Assistant Director | union_rules, permit_requirements, department_requirements |
| Director | tmz_zone, permit_requirements, union_rules |
| Production Designer | permit_requirements, department_requirements |

---

## Features Implemented

| React group chat UI 
| Multi-role switching (Director, Producer, Location Manager, AD, PD)
| Image upload + drag-and-drop 
| Real vision analysis on uploaded location photos (GPT-4o mini)
| FastAPI backend
| ChromaDB persistent knowledge base (251 chunks, 12 docs) 
| PDF ingestion pipeline
| Section-aware chunking with rich metadata 
| Role-filtered semantic RAG retrieval 
| Source-cited AI responses (per FilmLA / per DGA Section...) 
| Role-tailored system prompts per user role 
| Multi-turn conversation memory 
| TMZ zone lookup — GPS/address → zone status 
| Hybrid TMZ boundary (contractual lookup + geometric haversine)
| TMZ budget impact calculator (per diem, hotel, union premium) 
| Sun Path Analyzer — golden hour, blue hour, shooting windows
| Sun path arc diagram (SVG, interactive)
| AI-generated location maps in chat (OpenStreetMap embed iframes) 
| Location detection from natural language messages (regex) 
| Mobile-responsive layout
| PWA (Progressive Web App) — installable via Chrome 
| Service worker + web manifest 

---

## LLM Migration History

**Milestone 1:** Llama 3.1 8B (Q4_K_M) via llama.cpp — CPU-only on macOS 12, 30–60s per response, no vision support.

**Milestone 2+:** GPT-4o mini via OpenAI API — responses in under 3 seconds, real vision analysis on uploaded photos, cost negligible at class-project scale (< $2 total estimated).

All RAG logic, ChromaDB embeddings, and FastAPI architecture unchanged across the migration.

---
