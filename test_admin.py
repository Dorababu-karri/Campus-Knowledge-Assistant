"""
Dedicated Automated Test Suite for Milestone 9:
Admin Document Management & Ingestion Portal
"""

import sys
import os
import base64
import unittest
from fastapi.testclient import TestClient

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from rag_api import app, RAG_INTERNAL_SECRET, collection
from document_permissions import get_document_permissions, load_all_permissions

class TestAdminDocumentManagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.valid_header = {"X-Internal-Secret": RAG_INTERNAL_SECRET}
        cls.test_doc_name = "test_lab_safety_bylaw.txt"
        cls.test_doc_content = (
            "Lab Safety Manual 2026: All engineering laboratory staff and researchers must wear "
            "fire-retardant safety goggles and closed-toe footwear before operating the laser cutter. "
            "Failure to report chemical spills within 15 minutes incurs mandatory disciplinary review."
        )

    def tearDown(self):
        # Clean up test document if still present in ChromaDB
        data = collection.get(where={"document": self.test_doc_name})
        if data.get("ids"):
            collection.delete(ids=data["ids"])

    def test_01_get_documents_unauthorized(self):
        """Direct GET /documents without secret must return 403 Forbidden."""
        res = self.client.get("/documents")
        self.assertEqual(res.status_code, 403)
        print("  -> PASS [01]: Unauthenticated GET /documents returns 403 Forbidden")

    def test_02_get_documents_invalid_secret(self):
        """GET /documents with forged secret must return 403 Forbidden."""
        res = self.client.get("/documents", headers={"X-Internal-Secret": "forged_secret_xyz"})
        self.assertEqual(res.status_code, 403)
        print("  -> PASS [02]: Forged secret on GET /documents returns 403 Forbidden")

    def test_03_get_documents_success(self):
        """GET /documents with valid secret returns list of indexed documents and total chunks."""
        res = self.client.get("/documents", headers=self.valid_header)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("documents", data)
        self.assertIn("total_chunks", data)
        self.assertGreater(data["total_chunks"], 0)
        self.assertGreater(len(data["documents"]), 0)
        print(f"  -> PASS [03]: Successfully listed {len(data['documents'])} documents ({data['total_chunks']} chunks)")

    def test_04_ingest_document_unauthorized(self):
        """POST /documents/ingest without secret must return 403."""
        payload = {
            "filename": self.test_doc_name,
            "content_base64": base64.b64encode(self.test_doc_content.encode("utf-8")).decode("utf-8"),
            "access_level": "staff",
            "department": "engineering"
        }
        res = self.client.post("/documents/ingest", json=payload)
        self.assertEqual(res.status_code, 403)
        print("  -> PASS [04]: Unauthenticated POST /documents/ingest returns 403 Forbidden")

    def test_05_ingest_document_success(self):
        """POST /documents/ingest properly chunks, embeds, and indexes document into ChromaDB."""
        payload = {
            "filename": self.test_doc_name,
            "content_base64": base64.b64encode(self.test_doc_content.encode("utf-8")).decode("utf-8"),
            "access_level": "staff",
            "department": "engineering"
        }
        res = self.client.post("/documents/ingest", headers=self.valid_header, json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["filename"], self.test_doc_name)
        self.assertGreater(data["chunks_indexed"], 0)
        self.assertEqual(data["access_level"], "staff")
        self.assertEqual(data["department"], "engineering")

        # Verify permissions are dynamically recorded
        perms = get_document_permissions(self.test_doc_name)
        self.assertEqual(perms["access_level"], "staff")
        self.assertEqual(perms["department"], "engineering")
        print(f"  -> PASS [05]: Ingested and indexed '{self.test_doc_name}' ({data['chunks_indexed']} chunks)")

    def test_06_rbac_enforcement_on_newly_ingested_document(self):
        """Verifies that pre-retrieval RBAC filters apply immediately to newly ingested documents."""
        # 1. Ingest as staff/engineering
        payload = {
            "filename": self.test_doc_name,
            "content_base64": base64.b64encode(self.test_doc_content.encode("utf-8")).decode("utf-8"),
            "access_level": "staff",
            "department": "engineering"
        }
        self.client.post("/documents/ingest", headers=self.valid_header, json=payload)

        # 2. Student query should NOT retrieve it
        query_student = {
            "question": "What kind of safety goggles are required for the laser cutter?",
            "user_role": "student",
            "department": "engineering"
        }
        res_student = self.client.post("/query", headers=self.valid_header, json=query_student)
        student_docs = [s["document"] for s in res_student.json()["sources"]]
        self.assertNotIn(self.test_doc_name, student_docs)

        # 3. Staff from engineering SHOULD retrieve it
        query_staff = {
            "question": "What kind of safety goggles are required for the laser cutter?",
            "user_role": "staff",
            "department": "engineering"
        }
        res_staff = self.client.post("/query", headers=self.valid_header, json=query_staff)
        staff_docs = [s["document"] for s in res_staff.json()["sources"]]
        self.assertIn(self.test_doc_name, staff_docs)
        print("  -> PASS [06]: Pre-retrieval RBAC strictly enforces access on newly ingested document")

    def test_07_delete_document(self):
        """DELETE /documents/{filename} deletes document chunks from ChromaDB."""
        # 1. Ingest first
        payload = {
            "filename": self.test_doc_name,
            "content_base64": base64.b64encode(self.test_doc_content.encode("utf-8")).decode("utf-8"),
            "access_level": "staff",
            "department": "engineering"
        }
        self.client.post("/documents/ingest", headers=self.valid_header, json=payload)

        # 2. Delete document
        res_delete = self.client.delete(f"/documents/{self.test_doc_name}", headers=self.valid_header)
        self.assertEqual(res_delete.status_code, 200)
        data = res_delete.json()
        self.assertTrue(data["success"])
        self.assertGreater(data["chunks_deleted"], 0)

        # 3. Verify 0 chunks remain in ChromaDB
        check_data = collection.get(where={"document": self.test_doc_name})
        self.assertEqual(len(check_data.get("ids", [])), 0)
        print(f"  -> PASS [07]: Successfully deleted '{self.test_doc_name}' ({data['chunks_deleted']} chunks removed)")


if __name__ == "__main__":
    print("=" * 70)
    print("MILESTONE 9: ADMIN DOCUMENT MANAGEMENT TEST SUITE")
    print("=" * 70)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestAdminDocumentManagement)
    runner = unittest.TextTestRunner(verbosity=0)
    result = runner.run(suite)
    print("=" * 70)
    if result.wasSuccessful():
        print(f"TEST SUMMARY: {result.testsRun} / {result.testsRun} TESTS PASSED (100%)")
        print("ALL MILESTONE 9 ADMIN PORTAL TESTS PASSED PERFECTLY!\n")
        sys.exit(0)
    else:
        print(f"TEST SUMMARY: {len(result.failures)} failures, {len(result.errors)} errors")
        sys.exit(1)

