"""
CineSync RAG Ingestion Script
Extracts, chunks, and seeds all film production compliance docs into ChromaDB.

Usage:
    python ingest_docs.py

Requires:
    pip install chromadb pypdf pdfplumber sentence-transformers
"""

import os
import re
import json
import pdfplumber
import chromadb
from chromadb.utils import embedding_functions

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
DATA_DIR = "./data"
CHROMA_PATH = "./chroma_db"
COLLECTION_NAME = "cinesync_knowledge"

# Using sentence-transformers locally (no API cost)
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Target chunk size in characters (~400-600 tokens)
CHUNK_SIZE = 1800
CHUNK_OVERLAP = 200

# ─────────────────────────────────────────────
# DOCUMENT REGISTRY
# Each entry defines how a PDF is categorized and tagged.
# role_relevance: which chat roles most need this doc
# topic_tags: what the chunk is about (for metadata filtering)
# ─────────────────────────────────────────────
DOC_REGISTRY = {
    "30-MILE-STUDIO-ZONE.pdf": {
        "source": "California Film Commission",
        "doc_type": "tmz_zone",
        "jurisdiction": "los_angeles",
        "topic_tags": ["tmz", "studio_zone", "30_mile_zone", "secondary_zone", "location_compliance"],
        "role_relevance": ["producer", "location_manager", "ad"],
        "description": "30-Mile Studio Zone (TMZ) definition, boundaries, and secondary zone expansion",
    },
    "Area Requirements_ City of Los Angeles - FilmLA.pdf": {
        "source": "FilmLA",
        "doc_type": "permit_requirements",
        "jurisdiction": "city_of_los_angeles",
        "topic_tags": ["permits", "filmla", "insurance", "lafd", "lapd", "filming_hours",
                       "noise_ordinance", "community_notification", "location_compliance"],
        "role_relevance": ["producer", "location_manager", "ad"],
        "description": "FilmLA permit requirements, deadlines, insurance, LAFD/LAPD rules for City of LA",
    },
    "Area Requirements_ County of Los Angeles - FilmLA.pdf": {
        "source": "FilmLA",
        "doc_type": "permit_requirements",
        "jurisdiction": "county_of_los_angeles",
        "topic_tags": ["permits", "filmla", "insurance", "filming_hours", "location_compliance"],
        "role_relevance": ["producer", "location_manager", "ad"],
        "description": "FilmLA permit requirements for LA County (unincorporated areas)",
    },
    "Common Fees, LA City - FilmLA.pdf": {
        "source": "FilmLA",
        "doc_type": "fee_schedule",
        "jurisdiction": "city_of_los_angeles",
        "topic_tags": ["fees", "permit_cost", "lapd", "lafd", "parking", "budget"],
        "role_relevance": ["producer", "location_manager"],
        "description": "Common filming fees for City of LA: LAPD officers, LAFD, lane closures, monitors",
    },
    "Common Fees, LA County - FilmLA.pdf": {
        "source": "FilmLA",
        "doc_type": "fee_schedule",
        "jurisdiction": "county_of_los_angeles",
        "topic_tags": ["fees", "permit_cost", "budget"],
        "role_relevance": ["producer", "location_manager"],
        "description": "Common filming fees for LA County (unincorporated areas)",
    },
    "FilmLA Basic Fees List - FilmLA.pdf": {
        "source": "FilmLA",
        "doc_type": "fee_schedule",
        "jurisdiction": "los_angeles",
        "topic_tags": ["fees", "permit_cost", "application_fee", "budget", "filmla_fees"],
        "role_relevance": ["producer", "location_manager"],
        "description": "FilmLA base permit application fees, rider fees, monitor fees",
    },
    "Film Unit _ Los Angeles Fire Department.pdf": {
        "source": "LAFD",
        "doc_type": "department_requirements",
        "jurisdiction": "city_of_los_angeles",
        "topic_tags": ["lafd", "fire_safety", "fire_officer", "special_effects", "pyrotechnics",
                       "location_compliance", "permits"],
        "role_relevance": ["producer", "location_manager", "ad"],
        "description": "LAFD Film Unit requirements: fire safety officers, special effects permits, inspections",
    },
    "Noise Enforcement Team - LAPD Online.pdf": {
        "source": "LAPD",
        "doc_type": "department_requirements",
        "jurisdiction": "city_of_los_angeles",
        "topic_tags": ["noise", "noise_ordinance", "lapd", "filming_hours", "location_compliance"],
        "role_relevance": ["producer", "location_manager", "ad"],
        "description": "LAPD Noise Enforcement Team rules and contact info for filming noise complaints",
    },
    "DGA-BasicAgreement_section13.pdf": {
        "source": "DGA Basic Agreement 2020",
        "doc_type": "union_rules",
        "jurisdiction": "national",
        "topic_tags": ["dga", "union", "ad", "upm", "work_hours", "rest_period", "overtime",
                       "distant_location", "per_diem", "crew_costs"],
        "role_relevance": ["producer", "ad"],
        "description": "DGA Section 13: AD/UPM working conditions, extended workday, rest periods, distant location",
    },
    "DGA-BasicAgreement_Travel.pdf": {
        "source": "DGA Basic Agreement 2020",
        "doc_type": "union_rules",
        "jurisdiction": "national",
        "topic_tags": ["dga", "union", "travel", "distant_location", "tmz", "crew_costs"],
        "role_relevance": ["producer", "ad"],
        "description": "DGA Section 4-104: Director travel rules, 30-mile zone reporting requirements",
    },
    "DGA-BasicAgreement_Director_Location.pdf": {
        "source": "DGA Basic Agreement 2020",
        "doc_type": "union_rules",
        "jurisdiction": "national",
        "topic_tags": ["dga", "union", "director", "location", "insurance", "helicopter", "distant_location"],
        "role_relevance": ["producer", "director", "ad"],
        "description": "DGA Section 9: Director special conditions, distant location notice, flight allowance",
    },
    "2024-IATSE-Basic-Agreement-MOA-FINAL.pdf": {
        "source": "IATSE Basic Agreement 2024",
        "doc_type": "union_rules",
        "jurisdiction": "national",
        "topic_tags": ["iatse", "union", "crew", "wages", "work_hours", "distant_location",
                       "per_diem", "crew_costs", "below_the_line"],
        "role_relevance": ["producer", "ad"],
        "description": "IATSE 2024 MOA: crew wages, hours, distant location, per diem for below-the-line crew",
    },
}

# ─────────────────────────────────────────────
# TEXT EXTRACTION
# ─────────────────────────────────────────────
def extract_text(pdf_path: str) -> str:
    """Extract full text from a PDF using pdfplumber."""
    text_parts = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n\n".join(text_parts)


# ─────────────────────────────────────────────
# CHUNKING
# ─────────────────────────────────────────────
def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """
    Smart chunking strategy:
    1. First split on legal section headers (e.g. "13-110", "Section", numbered items)
    2. Then enforce max chunk size with overlap
    """
    # Try to split on DGA section markers first
    section_pattern = r'(?=\n(?:\d{1,2}-\d{3,4}|Section \d|SECTION \d|ARTICLE \d)[\s\w])'
    sections = re.split(section_pattern, text)

    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue

        if len(section) <= chunk_size:
            chunks.append(section)
        else:
            # Further split long sections by paragraph
            paragraphs = re.split(r'\n{2,}', section)
            current = ""
            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue
                if len(current) + len(para) + 2 <= chunk_size:
                    current = (current + "\n\n" + para).strip()
                else:
                    if current:
                        chunks.append(current)
                    # If single paragraph is too long, split by sentence
                    if len(para) > chunk_size:
                        sentences = re.split(r'(?<=[.!?])\s+', para)
                        current = ""
                        for sent in sentences:
                            if len(current) + len(sent) + 1 <= chunk_size:
                                current = (current + " " + sent).strip()
                            else:
                                if current:
                                    # Add overlap from end of previous chunk
                                    chunks.append(current)
                                    overlap_text = current[-overlap:] if len(current) > overlap else current
                                    current = overlap_text + " " + sent
                                else:
                                    current = sent
                        if current:
                            current = para
                    else:
                        current = para
            if current:
                chunks.append(current)

    return [c for c in chunks if len(c.strip()) > 100]  # Filter trivially short chunks


# ─────────────────────────────────────────────
# METADATA BUILDER
# ─────────────────────────────────────────────
def build_metadata(chunk: str, doc_key: str, chunk_idx: int, registry_entry: dict) -> dict:
    """Build rich metadata for each chunk to enable filtered retrieval."""

    # Detect specific section references in the chunk
    sections_found = re.findall(r'\d{1,2}-\d{3,4}', chunk)

    # Detect dollar amounts (fee-related chunks)
    has_fees = bool(re.search(r'\$[\d,]+', chunk))

    # Detect hour/time references (scheduling/compliance)
    has_hours = bool(re.search(r'\d+\s*(?:hour|a\.m\.|p\.m\.|AM|PM)', chunk, re.IGNORECASE))

    # Detect TMZ-specific content
    has_tmz = bool(re.search(r'30.mile|studio zone|TMZ|secondary zone', chunk, re.IGNORECASE))

    # Detect permit deadlines
    has_deadline = bool(re.search(r'deadline|business day|submit|application', chunk, re.IGNORECASE))

    return {
        "doc_key": doc_key,
        "chunk_idx": chunk_idx,
        "source": registry_entry["source"],
        "doc_type": registry_entry["doc_type"],
        "jurisdiction": registry_entry["jurisdiction"],
        "topic_tags": json.dumps(registry_entry["topic_tags"]),  # ChromaDB requires str/int/float
        "role_relevance": json.dumps(registry_entry["role_relevance"]),
        "description": registry_entry["description"],
        "sections_found": json.dumps(sections_found),
        "has_fees": has_fees,
        "has_hours": has_hours,
        "has_tmz": has_tmz,
        "has_deadline": has_deadline,
        "char_count": len(chunk),
    }


# ─────────────────────────────────────────────
# MAIN INGESTION
# ─────────────────────────────────────────────
def main():
    print("🎬 CineSync RAG Ingestion Starting...\n")

    # Initialize ChromaDB
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    # Use local sentence-transformers embedding (no API key needed)
    # every chunk gets converted to an embedding vector 
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBEDDING_MODEL
    )

    # Delete existing collection if re-running
    try:
        client.delete_collection(COLLECTION_NAME)
        print(f"♻️  Deleted existing collection '{COLLECTION_NAME}'")
    except Exception:
        pass

    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"} # chromaDB measures cosine sim between query vector and every stored chunk vector 
    )
    print(f"✅ Created collection '{COLLECTION_NAME}'\n")

    total_chunks = 0
    doc_stats = []

    for filename, registry_entry in DOC_REGISTRY.items():
        pdf_path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(pdf_path):
            print(f"⚠️  MISSING: {filename}")
            continue

        print(f"📄 Processing: {filename}")

        # Extract text
        text = extract_text(pdf_path)
        if not text.strip():
            print(f"   ❌ No text extracted (may be scanned image PDF)")
            continue

        # Chunk
        doc_key = filename.replace(".pdf", "").replace(" ", "_").replace("_-_", "_")
        chunks = chunk_text(text)

        print(f"   → {len(chunks)} chunks extracted")

        # Build IDs, documents, metadatas
        ids = [f"{doc_key}__chunk_{i}" for i in range(len(chunks))]
        metadatas = [build_metadata(chunk, doc_key, i, registry_entry) for i, chunk in enumerate(chunks)]

        # Batch upsert to ChromaDB (max 100 at a time)
        batch_size = 50
        for start in range(0, len(chunks), batch_size):
            end = min(start + batch_size, len(chunks))
            # chromaDB auto runs each chunk through sentence transformer model, which converts each chunk into a list of 384 numbers (vector)
            collection.add(
                ids=ids[start:end],
                documents=chunks[start:end],
                metadatas=metadatas[start:end],
            )

        doc_stats.append({"file": filename, "chunks": len(chunks)})
        total_chunks += len(chunks)
        print(f"   ✅ Ingested {len(chunks)} chunks\n")

    # Summary
    print("=" * 55)
    print(f"🎉 Ingestion Complete: {total_chunks} total chunks across {len(doc_stats)} docs")
    print("=" * 55)
    for stat in doc_stats:
        print(f"   {stat['chunks']:>4} chunks  {stat['file']}")

    # Quick sanity test query
    print("\n🔍 Sanity test: querying 'TMZ distant location per diem'...")
    # question query also gets converted to a vector 
    results = collection.query(
        query_texts=["TMZ distant location per diem crew costs"],
        n_results=3,
        include=["documents", "metadatas", "distances"]
    )
    for i, (doc, meta, dist) in enumerate(zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0]
    )):
        print(f"\n  Result {i+1} (distance: {dist:.4f})") # lower distance = more similar 
        print(f"  Source: {meta['source']} | Type: {meta['doc_type']}")
        print(f"  Preview: {doc[:150]}...")

    print("\n✅ ChromaDB is ready at:", CHROMA_PATH)


if __name__ == "__main__":
    main()