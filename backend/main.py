from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import chromadb
from chromadb.utils import embedding_functions
from llm_client import call_llm, call_llm_with_history, call_llm_with_image
import math
import urllib.request
import urllib.parse
import json
import re
from datetime import date, timedelta
from astral import LocationInfo
from astral.sun import sun

app = FastAPI(title="Cinesync Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── ChromaDB Setup ───────────────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path="./chroma_db")

embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

collection = chroma_client.get_or_create_collection(
    name="cinesync_knowledge",
    embedding_function=embedding_fn,
    metadata={"hnsw:space": "cosine"},
)

# ─── TMZ Constants ────────────────────────────────────────────────────────────
TMZ_CENTER_LAT = 34.0803
TMZ_CENTER_LON = -118.3603
TMZ_RADIUS_MILES = 30.0

KNOWN_OUTSIDE_TMZ = {
    'malibu', 'long beach', 'anaheim', 'santa ana', 'irvine', 'orange',
    'ventura', 'oxnard', 'thousand oaks', 'simi valley', 'moorpark',
    'lancaster', 'palmdale', 'santa clarita', 'valencia',
    'san bernardino', 'riverside', 'ontario', 'rancho cucamonga',
    'fontana', 'moreno valley', 'corona', 'pomona',
    'san diego', 'bakersfield', 'santa barbara', 'palm springs',
    'victorville', 'hesperia', 'apple valley', 'big bear',
    'lake arrowhead', 'catalina', 'avalon',
}

KNOWN_INSIDE_TMZ = {
    'los angeles', 'santa monica', 'burbank', 'pasadena', 'culver city',
    'hollywood', 'west hollywood', 'glendale', 'arcadia', 'torrance',
    'el segundo', 'manhattan beach', 'hermosa beach', 'redondo beach',
    'inglewood', 'hawthorne', 'gardena', 'compton', 'downey', 'whittier',
    'van nuys', 'north hollywood', 'sherman oaks', 'encino', 'chatsworth',
    'northridge', 'san fernando', 'studio city', 'silver lake', 'echo park',
    'el monte', 'monrovia', 'azusa', 'covina', 'west covina',
    'alhambra', 'san gabriel', 'temple city', 'rosemead', 'baldwin park',
    'beverly hills', 'bel air', 'brentwood', 'pacific palisades',
    'koreatown', 'downtown', 'arts district', 'boyle heights',
    'agua dulce', 'castaic', 'leo carrillo', 'piru',
}


def haversine_miles(lat1, lon1, lat2, lon2) -> float:
    R = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def check_tmz_status(resolved_address: str, distance_miles: float) -> bool:
    addr_lower = resolved_address.lower()
    for city in KNOWN_OUTSIDE_TMZ:
        if city in addr_lower:
            return False
    for city in KNOWN_INSIDE_TMZ:
        if city in addr_lower:
            return True
    return distance_miles <= TMZ_RADIUS_MILES


def geocode_address(address: str):
    params = urllib.parse.urlencode({'q': address, 'format': 'json', 'limit': 1})
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Cinesync/1.0 (class project)'})
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read())
        if data:
            return float(data[0]['lat']), float(data[0]['lon']), data[0].get('display_name', address)
    return None, None, None


# ─── Static Map ───────────────────────────────────────────────────────────────
def get_static_map_url(lat: float, lon: float) -> str:
    """OpenStreetMap embed URL — free, no API key, highly reliable."""
    margin = 0.012
    bbox = f"{lon-margin},{lat-margin},{lon+margin},{lat+margin}"
    return (
        f"https://www.openstreetmap.org/export/embed.html"
        f"?bbox={bbox}&layer=mapnik&marker={lat},{lon}"
    )


def extract_location_from_message(message: str) -> Optional[str]:
    """
    Detect a specific named location in the user's message.
    Returns the location string if found, None otherwise.
    """
    # Stop words that indicate the location name has ended
    stop = r'(?:\s+(?:this|next|for|on|with|what|we|our|to|from|about|during|weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|[,?!]|$)'

    patterns = [
        # "filming at Griffith Observatory", "shoot at Venice Beach"
        rf'(?:filming?\s+(?:at|in)|shoot(?:ing)?\s+(?:at|in)|scout(?:ing)?\s+(?:at|in))\s+([A-Z][A-Za-z0-9\s\'\-]{{2,40}}?){stop}',
        # "at Griffith Observatory"
        rf'(?:^|\s)(?:at|in)\s+([A-Z][A-Za-z0-9\s\'\-]{{2,40}}?(?:Observatory|Park|Beach|Boulevard|District|Studios?|Airport|Museum|Hills?|Canyon|Harbor|Pier|Plaza|Stadium|Center|Centre)){stop}',
        # Any title-case location with a known LA landmark suffix
        rf'([A-Z][A-Za-z0-9\s\'\-]{{2,40}}?(?:Observatory|Park|Beach|District|Studios?|Airport|Museum|Hills?|Harbor|Pier|Plaza|Stadium)){stop}',
    ]

    for pattern in patterns:
        match = re.search(pattern, message)
        if match:
            location = match.group(1).strip()
            if len(location) > 4:
                return location
    return None


# ─── RAG Query ────────────────────────────────────────────────────────────────
ROLE_DOC_FILTERS = {
    "Producer":               ["permit_requirements", "fee_schedule", "union_rules"],
    "Location Manager":       ["permit_requirements", "fee_schedule", "department_requirements", "tmz_zone"],
    "Assistant Director (AD)":["union_rules", "permit_requirements", "department_requirements"],
    "Director":               ["tmz_zone", "permit_requirements", "union_rules"],
    "Production Designer":    ["permit_requirements", "department_requirements"],
}


def query_knowledge_base(query: str, user_role: str = "Location Manager", n_results: int = 6) -> List[str]:
    doc_types = ROLE_DOC_FILTERS.get(user_role)
    if doc_types:
        try:
            results = collection.query(
                query_texts=[query],
                n_results=n_results,
                where={"doc_type": {"$in": doc_types}},
                include=["documents", "metadatas", "distances"],
            )
            docs = results["documents"][0] if results["documents"] else []
            if len(docs) >= 3:
                return docs
        except Exception:
            pass
    results = collection.query(
        query_texts=[query],
        n_results=n_results,
        include=["documents", "metadatas", "distances"],
    )
    return results["documents"][0] if results["documents"] else []


# ─── Models ───────────────────────────────────────────────────────────────────
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    user_role: str = "Location Manager"
    image_base64: Optional[str] = None
    image_media_type: Optional[str] = "image/jpeg"
    conversation_history: Optional[List[Message]] = []


class ChatResponse(BaseModel):
    response: str
    rag_sources_used: int


class TmzLookupRequest(BaseModel):
    address: str
    crew_size: Optional[int] = 50


class TmzLookupResponse(BaseModel):
    address: str
    resolved_address: str
    latitude: float
    longitude: float
    distance_miles: float
    inside_tmz: bool
    status_label: str
    miles_from_boundary: float
    budget_impact: str
    union_implications: str


class SunPathRequest(BaseModel):
    address: str
    shoot_date: Optional[str] = None


class SunPathResponse(BaseModel):
    address: str
    resolved_address: str
    latitude: float
    longitude: float
    shoot_date: str
    dawn: str
    sunrise: str
    golden_hour_morning_start: str
    golden_hour_morning_end: str
    solar_noon: str
    golden_hour_evening_start: str
    golden_hour_evening_end: str
    sunset: str
    dusk: str
    total_daylight_hours: float
    shooting_windows: List[dict]


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    count = collection.count()
    if count == 0:
        print("⚠️  WARNING: ChromaDB collection is empty.")
        print("   Run: python ingest_docs.py")
        print("   Then restart the server.")
    else:
        print(f"✅ ChromaDB loaded — {count} chunks ready")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "knowledge_chunks": collection.count(),
    }


@app.post("/api/tmz-lookup", response_model=TmzLookupResponse)
async def tmz_lookup(req: TmzLookupRequest):
    try:
        lat, lon, resolved = geocode_address(req.address)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Geocoding failed: {str(e)}")
    if lat is None:
        raise HTTPException(status_code=404, detail=f"Could not find location: {req.address}")

    distance = haversine_miles(TMZ_CENTER_LAT, TMZ_CENTER_LON, lat, lon)
    inside = check_tmz_status(resolved, distance)
    miles_from_boundary = round(TMZ_RADIUS_MILES - distance, 2)
    crew = req.crew_size or 50

    if inside:
        budget_impact = "No travel allowances required. Crew works under standard local rates."
        union_implications = (
            f"No location premium triggered. No per diem required. "
            f"Estimated crew cost savings vs. outside TMZ: "
            f"${crew * 150:,}–${crew * 200:,}/week."
        )
    else:
        daily_low = crew * 125
        daily_high = crew * 200
        budget_impact = (
            f"OUTSIDE TMZ triggers full travel pay. "
            f"Per diem: ${daily_low:,}–${daily_high:,}/day for {crew} crew. "
            f"Weekly additional cost: ${daily_low*5:,}–${daily_high*5:,}. "
            f"Hotel accommodations required on top of per diem."
        )
        union_implications = (
            f"DGA/IATSE location premium: $50/crew member/day = ${crew * 50:,}/day. "
            f"AD must notify Director of location status 48 hrs in advance. "
            f"Per DGA 9-105: 24-hour Guild notice required before departure to distant location."
        )

    return TmzLookupResponse(
        address=req.address,
        resolved_address=resolved,
        latitude=round(lat, 6),
        longitude=round(lon, 6),
        distance_miles=round(distance, 2),
        inside_tmz=inside,
        status_label="INSIDE TMZ" if inside else "OUTSIDE TMZ",
        miles_from_boundary=abs(miles_from_boundary),
        budget_impact=budget_impact,
        union_implications=union_implications,
    )


@app.post("/api/sun-path", response_model=SunPathResponse)
async def sun_path(req: SunPathRequest):
    try:
        lat, lon, resolved = geocode_address(req.address)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Geocoding failed: {str(e)}")
    if lat is None:
        raise HTTPException(status_code=404, detail=f"Could not find location: {req.address}")

    try:
        shoot_date = date.fromisoformat(req.shoot_date) if req.shoot_date else date.today()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    loc = LocationInfo(
        name=resolved[:40],
        region="CA",
        timezone="America/Los_Angeles",
        latitude=lat,
        longitude=lon,
    )
    s = sun(loc.observer, date=shoot_date, tzinfo=loc.timezone)

    gh_morning_start = s["sunrise"] - timedelta(minutes=30)
    gh_morning_end   = s["sunrise"] + timedelta(hours=1)
    gh_evening_start = s["sunset"]  - timedelta(hours=1)
    gh_evening_end   = s["sunset"]  + timedelta(minutes=30)
    fmt = lambda dt: dt.strftime("%I:%M %p")
    daylight = (s["sunset"] - s["sunrise"]).seconds / 3600

    return SunPathResponse(
        address=req.address,
        resolved_address=resolved,
        latitude=round(lat, 6),
        longitude=round(lon, 6),
        shoot_date=shoot_date.isoformat(),
        dawn=fmt(s["dawn"]),
        sunrise=fmt(s["sunrise"]),
        golden_hour_morning_start=fmt(gh_morning_start),
        golden_hour_morning_end=fmt(gh_morning_end),
        solar_noon=fmt(s["noon"]),
        golden_hour_evening_start=fmt(gh_evening_start),
        golden_hour_evening_end=fmt(gh_evening_end),
        sunset=fmt(s["sunset"]),
        dusk=fmt(s["dusk"]),
        total_daylight_hours=round(daylight, 1),
        shooting_windows=[
            {
                "label": "Morning Golden Hour",
                "start": fmt(gh_morning_start),
                "end": fmt(gh_morning_end),
                "direction": "East-facing",
                "notes": "Warm low-angle light. Best for east-facing exteriors.",
                "type": "golden",
            },
            {
                "label": "Midday",
                "start": fmt(s["sunrise"]),
                "end": fmt(s["noon"]),
                "direction": "Any facing",
                "notes": "Consistent diffused light on overcast days. Harsh direct sun midday.",
                "type": "neutral",
            },
            {
                "label": "Evening Golden Hour",
                "start": fmt(gh_evening_start),
                "end": fmt(gh_evening_end),
                "direction": "West-facing",
                "notes": "Peak cinematic light. 30–40 min magic hour window.",
                "type": "golden",
            },
            {
                "label": "Blue Hour",
                "start": fmt(s["sunset"]),
                "end": fmt(s["dusk"]),
                "direction": "Any facing",
                "notes": "Cool blue ambient light. Great for moody urban scenes. ~20 min window.",
                "type": "blue",
            },
        ],
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    # 1. RAG: retrieve relevant PDF chunks, role-filtered
    context_docs = query_knowledge_base(req.message, user_role=req.user_role)
    context = "\n\n---\n\n".join(context_docs)

    # 2. Role-tailored instruction
    role_focus = {
        "Director": "Focus on creative feasibility: lighting, aesthetic, and scene potential.",
        "Producer": "Emphasize budget impact, permit costs, TMZ status, and timeline risks.",
        "Location Manager": "Provide detailed permit requirements, lead times, ordinances, logistics.",
        "Production Designer": "Focus on visual constraints, modification possibilities, restoration.",
        "Assistant Director (AD)": "Emphasize scheduling, crew call times, turnaround rules, safety.",
    }
    role_instruction = role_focus.get(req.user_role, "Provide a balanced overview.")

    system_prompt = f"""You are CinesyncAI, the AI compliance expert embedded in a film production group chat. You are an authority on LA film permits, TMZ rules, union agreements (DGA, IATSE), and location logistics.

RETRIEVED KNOWLEDGE (from official FilmLA, DGA, IATSE, LAFD, LAPD documents):
{context}

Answer using ONLY information grounded in the above knowledge. If the retrieved context does not cover the question, say so clearly rather than guessing.

RESPONSE FORMAT — use only relevant sections:
📍 LOCATION STATUS — TMZ zone, jurisdiction
⏱️ PERMIT REQUIREMENTS — category, lead time, cost
💰 BUDGET IMPACT — cost estimates, union implications  
⚠️ FLAGS & RISKS — compliance issues, noise, logistics
🎬 CREATIVE NOTES — light, aesthetic, scene potential
🚛 LOGISTICS — parking, truck access, basecamp

Be specific with numbers and cite the source document when possible (e.g. "Per FilmLA City requirements..." or "Per DGA Section 13-116...").

CURRENT USER ROLE: {req.user_role}
{role_instruction}"""

    history = [{"role": m.role, "content": m.content} for m in (req.conversation_history or [])]

    try:
        if req.image_base64:
            reply = call_llm_with_image(
                system_prompt=system_prompt,
                user_message=req.message,
                messages=history,
                image_base64=req.image_base64,
                mime_type=req.image_media_type or "image/jpeg",
            )
        elif history:
            reply = call_llm_with_history(
                system_prompt=system_prompt,
                messages=[*history, {"role": "user", "content": req.message}],
            )
        else:
            reply = call_llm(
                system_prompt=system_prompt,
                user_message=req.message,
            )

        # ── Append a static map image if we can detect a named location ──────
        location_name = extract_location_from_message(req.message)
        if location_name:
            try:
                search_query = f"{location_name}, Los Angeles, CA"
                lat, lon, resolved = geocode_address(search_query)
                if lat and lon:
                    map_url = get_static_map_url(lat, lon)
                    short_name = resolved.split(',')[0].strip()
                    reply += f"\n\n![Map — {short_name}]({map_url})"
            except Exception:
                pass  # Silently skip — map is bonus content, never break chat

        return ChatResponse(response=reply, rag_sources_used=len(context_docs))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))