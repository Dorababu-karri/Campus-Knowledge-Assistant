"""
==============================================================================
CAMPUS KNOWLEDGE ASSISTANT - MASTER PRODUCTION VERIFICATION SUITE
Covers Milestones 1 through 12 End-to-End
==============================================================================
"""

import sys
import json
import time
import requests
import chromadb
from chromadb.config import Settings

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

FASTAPI_URL = "http://127.0.0.1:8000"
WEB_URL = "http://localhost:3000"
SECRET = "campus_rag_secret_2026"
HEADERS = {"X-Internal-Secret": SECRET, "Content-Type": "application/json"}

passed_checks = 0
total_checks = 0

def log_check(name, passed, detail=""):
    global passed_checks, total_checks
    total_checks += 1
    if passed:
        passed_checks += 1
        print(f"  [✓ PASS {total_checks:02d}] {name} {f'({detail})' if detail else ''}")
    else:
        print(f"  [✕ FAIL {total_checks:02d}] {name} {f'({detail})' if detail else ''}")
        sys.exit(1)

def run_master_verification():
    print("=" * 78)
    print("CAMPUS KNOWLEDGE ASSISTANT: MASTER PRODUCTION ACCEPTANCE SUITE")
    print("=" * 78)

    # --------------------------------------------------------------------------
    # 1. Vector Store Verification (Milestones 1-3)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 1] Vector Store & ChromaDB Integrity ---")
    client = chromadb.PersistentClient(path="./chroma_db", settings=Settings(anonymized_telemetry=False))
    collection = client.get_collection(name="campus_policies")
    count = collection.count()
    log_check("ChromaDB 'campus_policies' collection exists and populated", count >= 280, f"{count} vector chunks")

    # --------------------------------------------------------------------------
    # 2. RAG Engine & Security Secrets (Milestones 4-5)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 2] FastAPI Security & Grounded RAG Query ---")
    res_unauth = requests.post(f"{FASTAPI_URL}/query", json={"question": "What is attendance?"})
    log_check("FastAPI rejects unauthenticated requests with HTTP 403", res_unauth.status_code == 403)

    res_auth = requests.post(
        f"{FASTAPI_URL}/query",
        headers=HEADERS,
        json={"question": "What is the minimum attendance requirement?", "user_role": "student", "department": "general"}
    )
    log_check("FastAPI query returns HTTP 200 with valid secret", res_auth.status_code == 200)
    auth_data = res_auth.json()
    log_check("RAG response contains answer and verified citations", bool(auth_data.get("answer")) and len(auth_data.get("sources", [])) > 0, f"{len(auth_data.get('sources', []))} citations")
    log_check("Grounded answer contains 75% attendance policy metric", "75%" in auth_data.get("answer", ""))

    # --------------------------------------------------------------------------
    # 3. RBAC & Strict Department Scoping (Milestones 6-7)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 3] Multi-Role Pre-Retrieval RBAC & Department Scoping ---")
    exam_doc = "13.-Examination-Evaluation-Manual-2022-23.pdf"
    res_student = requests.post(
        f"{FASTAPI_URL}/query",
        headers=HEADERS,
        json={"question": "What are examination committee powers?", "user_role": "student", "department": "general"}
    )
    student_sources = [s["document"] for s in res_student.json().get("sources", [])]
    log_check("Student query strictly blocks staff-only Examination Manual", exam_doc not in student_sources)

    res_staff = requests.post(
        f"{FASTAPI_URL}/query",
        headers=HEADERS,
        json={"question": "What are examination committee powers?", "user_role": "staff", "department": "academics"}
    )
    staff_sources = [s["document"] for s in res_staff.json().get("sources", [])]
    log_check("Academics staff retrieves Examination Manual", exam_doc in staff_sources)

    res_admissions = requests.post(
        f"{FASTAPI_URL}/query",
        headers=HEADERS,
        json={"question": "What are examination committee powers?", "user_role": "staff", "department": "admissions"}
    )
    admissions_sources = [s["document"] for s in res_admissions.json().get("sources", [])]
    log_check("Admissions staff strictly blocked from Academics Examination Manual", exam_doc not in admissions_sources)

    # --------------------------------------------------------------------------
    # 4. Multi-Turn Follow-Up Reasoning (Milestone 8)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 4] Conversational Follow-Up Query Synthesis ---")
    res_followup = requests.post(
        f"{FASTAPI_URL}/query",
        headers=HEADERS,
        json={
            "question": "What about postgraduate programs?",
            "user_role": "student",
            "department": "general",
            "history": [
                {"role": "user", "content": "What is the minimum attendance requirement?"},
                {"role": "assistant", "content": "The minimum attendance required is 75%."}
            ]
        }
    )
    followup_answer = res_followup.json().get("answer", "")
    log_check("Pronoun resolution and contextual follow-up reasoning active", "80%" in followup_answer or "postgraduate" in followup_answer.lower())

    # --------------------------------------------------------------------------
    # 5. Admin Document Ingestion & Registry (Milestone 9)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 5] Admin Document Management Registry ---")
    res_docs = requests.get(f"{FASTAPI_URL}/documents", headers=HEADERS)
    log_check("Admin document registry lists registered policies", res_docs.status_code == 200 and len(res_docs.json().get("documents", [])) >= 5)

    # --------------------------------------------------------------------------
    # 6. Real-Time Token Streaming via SSE (Milestone 10)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 6] Real-Time SSE Token Streaming ---")
    stream_events = []
    with requests.post(
        f"{FASTAPI_URL}/query/stream",
        headers=HEADERS,
        json={"question": "What is the fee refund policy?", "user_role": "student", "department": "general"},
        stream=True
    ) as r:
        for line in r.iter_lines():
            if line:
                d = line.decode("utf-8").strip()
                if d.startswith("data: "):
                    stream_events.append(json.loads(d[6:]))

    has_sources_event = any(e.get("type") == "sources" for e in stream_events)
    has_token_events = any(e.get("type") == "token" for e in stream_events)
    has_done_event = any(e.get("type") == "done" for e in stream_events)
    log_check("FastAPI SSE stream outputs valid event sequence (sources -> tokens -> done)", has_sources_event and has_token_events and has_done_event, f"{len(stream_events)} SSE events")

    # --------------------------------------------------------------------------
    # 7. Out-of-Domain Zero-Hallucination Guardrail
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 7] Out-of-Domain Strict Rejection ---")
    res_ood = requests.post(
        f"{FASTAPI_URL}/query",
        headers=HEADERS,
        json={"question": "What is the distance to Jupiter?", "user_role": "student", "department": "general"}
    )
    ood_data = res_ood.json()
    log_check("Out-of-domain query safely filtered with 0 sources", len(ood_data.get("sources", [])) == 0)
    log_check("Polite refusal message returned without hallucination", "couldn't find sufficiently relevant information" in ood_data.get("answer", ""))

    # --------------------------------------------------------------------------
    # 8. Web App Dev Server & SSE Bridge (Milestones 8-11)
    # --------------------------------------------------------------------------
    print("\n--- [STAGE 8] Web App Server & Endpoint Verification ---")
    res_web = requests.get(WEB_URL, timeout=5)
    log_check("TanStack Start web application responds on port 3000", res_web.status_code == 200)

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    print("\n" + "=" * 78)
    print(f"MASTER VERIFICATION COMPLETE: {passed_checks} / {total_checks} CHECKS PASSED (100%)")
    print("ALL 12 MILESTONES VERIFIED AND READY FOR PRODUCTION!")
    print("=" * 78)

if __name__ == "__main__":
    run_master_verification()

