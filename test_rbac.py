"""
Milestone 7.2 Dedicated Security and Functional Test Suite
Verifies Role-Based Access Control (RBAC), Departmental Filtering, and Service Security.
"""

import os
import sys
from fastapi.testclient import TestClient

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from rag_terminal import (
    setup_chroma_db,
    retrieve_similar_chunks,
    filter_chunks_by_distance,
    build_access_filter,
    DEFAULT_TOP_K,
    MAX_DISTANCE
)
from document_permissions import get_document_permissions
from rag_api import app, RAG_INTERNAL_SECRET

def run_rbac_test_suite():
    print("=" * 75)
    print("MILESTONE 7.2: RBAC AND DEPARTMENT ACCESS CONTROL TEST SUITE")
    print("=" * 75)

    collection = setup_chroma_db()
    client = TestClient(app)
    passed = 0
    total = 11

    exam_question = "What are the question paper setting and evaluation guidelines for faculty?"
    attendance_question = "What is the minimum attendance requirement?"
    refund_question = "What is the refund policy?"

    # ------------------------------------------------------------------
    # Case 1: Public user cannot retrieve the staff examination manual
    # ------------------------------------------------------------------
    print("\n[Case 1] Testing Public User Access Restrictions...")
    try:
        w_pub = build_access_filter("public")
        res = retrieve_similar_chunks(collection, exam_question, top_k=DEFAULT_TOP_K, where_filter=w_pub)
        docs = [m.get("document") for m in res["metadatas"][0]]
        if "13.-Examination-Evaluation-Manual-2022-23.pdf" not in docs:
            print("  -> PASS: Public query blocked staff examination manual at vector retrieval level.")
            passed += 1
        else:
            print("  -> FAIL: Staff document leaked to public user!")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 2: Student can retrieve public and student documents
    # ------------------------------------------------------------------
    print("\n[Case 2] Testing Student Access to Public and Student Documents...")
    try:
        w_stu = build_access_filter("student")
        res = retrieve_similar_chunks(collection, attendance_question, top_k=DEFAULT_TOP_K, where_filter=w_stu)
        docs = set(m.get("document") for m in res["metadatas"][0])
        levels = set(m.get("access_level") for m in res["metadatas"][0])
        if "Attendance-Policy.pdf" in docs and levels.issubset({"public", "student"}):
            print(f"  -> PASS: Student retrieved authorized public/student documents: {docs}")
            passed += 1
        else:
            print(f"  -> FAIL: Student retrieval failed or included unauthorized levels: {levels}")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 3: Student cannot retrieve staff-only documents
    # ------------------------------------------------------------------
    print("\n[Case 3] Testing Student Access Blocking on Staff-Only Documents...")
    try:
        w_stu = build_access_filter("student")
        res = retrieve_similar_chunks(collection, exam_question, top_k=DEFAULT_TOP_K, where_filter=w_stu)
        docs = [m.get("document") for m in res["metadatas"][0]]
        if "13.-Examination-Evaluation-Manual-2022-23.pdf" not in docs:
            print("  -> PASS: Student query strictly blocked staff-only examination manual.")
            passed += 1
        else:
            print("  -> FAIL: Staff document leaked to student user!")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 4: Academics staff can retrieve the examination manual
    # ------------------------------------------------------------------
    print("\n[Case 4] Testing Academics Staff Access to Examination Manual...")
    try:
        w_acad = build_access_filter("staff", department="academics")
        res = retrieve_similar_chunks(collection, exam_question, top_k=DEFAULT_TOP_K, where_filter=w_acad)
        docs = [m.get("document") for m in res["metadatas"][0]]
        if "13.-Examination-Evaluation-Manual-2022-23.pdf" in docs:
            print("  -> PASS: Academics staff successfully retrieved examination manual.")
            passed += 1
        else:
            print(f"  -> FAIL: Academics staff could not retrieve examination manual. Docs found: {docs}")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 5: Admissions staff cannot retrieve the examination manual
    # ------------------------------------------------------------------
    print("\n[Case 5] Testing Department Scoping (Admissions Staff blocked from Academics manual)...")
    try:
        w_adm = build_access_filter("staff", department="admissions")
        res = retrieve_similar_chunks(collection, exam_question, top_k=DEFAULT_TOP_K, where_filter=w_adm)
        docs = [m.get("document") for m in res["metadatas"][0]]
        if "13.-Examination-Evaluation-Manual-2022-23.pdf" not in docs:
            print("  -> PASS: Admissions staff query strictly blocked from Academics staff document.")
            passed += 1
        else:
            print("  -> FAIL: Department isolation broken! Admissions staff accessed Academics document.")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 6: Admin can retrieve all documents without restriction
    # ------------------------------------------------------------------
    print("\n[Case 6] Testing Admin Unrestricted Retrieval...")
    try:
        w_admin = build_access_filter("admin")
        if w_admin is None:
            res = retrieve_similar_chunks(collection, exam_question, top_k=DEFAULT_TOP_K, where_filter=w_admin)
            docs = [m.get("document") for m in res["metadatas"][0]]
            if "13.-Examination-Evaluation-Manual-2022-23.pdf" in docs:
                print("  -> PASS: Admin query operates with where=None, retrieving across all documents.")
                passed += 1
            else:
                print(f"  -> FAIL: Admin failed to retrieve examination manual.")
        else:
            print("  -> FAIL: Admin filter should be None for unrestricted access.")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 7: Direct FastAPI request without internal secret receives 403
    # ------------------------------------------------------------------
    print("\n[Case 7] Testing Direct FastAPI Request Without Secret (Expect 403)...")
    try:
        resp = client.post("/query", json={"question": attendance_question})
        if resp.status_code == 403:
            print(f"  -> PASS: Unauthenticated request rejected with HTTP 403: {resp.json()['detail']}")
            passed += 1
        else:
            print(f"  -> FAIL: Expected 403, got status {resp.status_code}")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 8: Invalid internal secret receives 403
    # ------------------------------------------------------------------
    print("\n[Case 8] Testing Request With Invalid Internal Secret (Expect 403)...")
    try:
        resp = client.post(
            "/query",
            headers={"X-Internal-Secret": "invalid_spoofed_secret_999"},
            json={"question": attendance_question}
        )
        if resp.status_code == 403:
            print(f"  -> PASS: Spoofed secret rejected with HTTP 403: {resp.json()['detail']}")
            passed += 1
        else:
            print(f"  -> FAIL: Expected 403, got status {resp.status_code}")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 9: Browser-supplied admin role cannot override SQLite session role
    # ------------------------------------------------------------------
    print("\n[Case 9] Testing Validation of Input Roles & Fails Closed...")
    try:
        # Invalid role sent to API must fail closed with 400
        resp = client.post(
            "/query",
            headers={"X-Internal-Secret": RAG_INTERNAL_SECRET},
            json={"question": attendance_question, "user_role": "malicious_hacker_role"}
        )
        if resp.status_code == 400:
            print(f"  -> PASS: Malformed/invalid role rejected immediately by FastAPI (Fails closed): {resp.json()['detail']}")
            passed += 1
        else:
            print(f"  -> FAIL: Malformed role did not fail closed! Status: {resp.status_code}")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Case 10: Unknown document classification fails safely
    # ------------------------------------------------------------------
    print("\n[Case 10] Testing Unknown Document Classification Safety...")
    try:
        get_document_permissions("unauthorized_random_document.pdf")
        print("  -> FAIL: Unknown document received silent permissions!")
    except ValueError as ve:
        print(f"  -> PASS: Unknown document safely rejected: {ve}")
        passed += 1
    except Exception as e:
        print(f"  -> FAIL with unexpected error: {e}")

    # ------------------------------------------------------------------
    # Case 11: Existing citations and distance filtering continue working
    # ------------------------------------------------------------------
    print("\n[Case 11] Testing Citation and Distance Filtering Continuity...")
    try:
        resp = client.post(
            "/query",
            headers={"X-Internal-Secret": RAG_INTERNAL_SECRET},
            json={"question": refund_question, "user_role": "student", "department": "engineering"}
        )
        if resp.status_code == 200:
            data = resp.json()
            sources = data.get("sources", [])
            answer = data.get("answer", "")
            # Verify distances are pruned (only refund policy chunks returned)
            source_docs = [s["document"] for s in sources]
            if len(sources) > 0 and all("refund" in d.lower() for d in source_docs) and len(answer) > 50:
                print(f"  -> PASS: Grounded answer generated with {len(sources)} filtered citations.")
                print(f"     Cited Documents: {source_docs}")
                passed += 1
            else:
                print(f"  -> FAIL: Sources or answer incomplete: {source_docs}")
        else:
            print(f"  -> FAIL: API query failed with status {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"  -> FAIL with error: {e}")

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 75)
    print(f"TEST SUMMARY: {passed} / {total} RBAC SECURITY TESTS PASSED")
    print("=" * 75)

    if passed == total:
        print("ALL 11 RBAC AND AUTHORIZATION TESTS PASSED PERFECTLY!\n")
    else:
        sys.exit(1)

if __name__ == "__main__":
    run_rbac_test_suite()

