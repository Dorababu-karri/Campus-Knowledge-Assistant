# Campus Knowledge Assistant (Institutional Policy Intelligence)

An enterprise-grade, locally hosted **Retrieval-Augmented Generation (RAG)** platform designed for university campuses. Built with **React 19**, **TanStack Start**, **FastAPI**, **ChromaDB**, and local **Ollama** LLMs (`llama3.2` & `nomic-embed-text`).

Designed with a modern, glassmorphic UI aesthetic inspired by high-design open web standards, strictly grounded on official university policy documents with zero hallucinations.

---

## Key Capabilities & Milestones Completed

- **Milestones 1–3: Semantic Vector Retrieval & Grounding**
  - High-precision chunking (500 chars / 100 overlap) and 768-dimensional embeddings via `nomic-embed-text`.
  - ChromaDB cosine distance metric with strict filtering threshold (`MAX_DISTANCE = 0.42`) ensuring zero out-of-domain hallucinations.
  - Verifiable citations with source policy name, page number, and chunk ID.

- **Milestones 4–5: FastAPI RAG Engine & Security Hardening**
  - Secured `POST /query` and `POST /query/stream` endpoints guarded by internal shared secret (`X-Internal-Secret`).
  - Zero-hallucination guardrail: automatically rejects out-of-domain questions with polite, pre-defined refusal messages.

- **Milestones 6–7: Pre-Retrieval Role-Based Access Control (RBAC)**
  - Multi-tier access governance: `public`, `student`, `staff`, `admin`.
  - Department scoping (`academics`, `engineering`, `business`, `law`, `admissions`, `general`).
  - Enforced strictly *before* retrieval via ChromaDB `where` filters so unauthorized users never receive chunk embeddings.

- **Milestone 8: Multi-Turn Conversational History & Session Persistence**
  - SQLite (`campus.db`) persistence for users, sessions, threads (`conversations`), and messages with citations.
  - Multi-turn conversational reasoning: contextualizes short follow-up questions (e.g., *"What about postgraduate programs?"*) to resolve pronouns while preserving ground-truth guardrails.

- **Milestone 9: Admin Document Management Portal**
  - Gated route `/admin` strictly accessible to administrators.
  - Upload & Ingestion: Base64 PDF / text parsing, dynamic RBAC tagging, vector chunking, and immediate ChromaDB indexing.
  - Document deletion with cascading vector cleanup across collections.
  - Dynamic permission registry persisted in `data/document_permissions.json`.

- **Milestone 10: Real-Time Token Streaming via SSE (Server-Sent Events)**
  - `POST /query/stream` yielding tokens incrementally via `StreamingResponse(text/event-stream)`.
  - Protocol: emits `type: sources` verified citations first, followed by incremental `type: token` chunks, terminating with `type: done`.
  - Vite dev server middleware bridge (`/api/chat-stream`) connecting frontend `ReadableStream` directly to FastAPI.

- **Milestone 11: Security Audit Logging & User Answer Feedback**
  - Immutable `audit_logs` table tracking every query, user identity, role, department, citations count, status (`authorized`, `out_of_domain`, `denied`), and response latency (ms).
  - Thumbs-up / thumbs-down answer feedback buttons with optional user comments.
  - Executive Admin Dashboard: Real-time compliance rate, user satisfaction score, latency benchmarks, and breakdown distributions by role and department.

- **Milestone 12: Production Packaging & Containerization**
  - Multi-stage `Dockerfile.rag` (Python 3.11-slim) and `Dockerfile.web` (Node.js 22-alpine).
  - Complete `docker-compose.yml` orchestrating Ollama, FastAPI RAG backend, and TanStack Start with persistent volumes.
  - End-to-end master production verification suite (`verify_production.py`).

---

## Architecture Diagram

```
[ Browser / Client ] 
        │
        ▼ (HTTP / SSE / Session Cookie)
[ TanStack Start Web App ] (Port 3000)
   ├── SQLite: campus.db (Users, Sessions, Conversations, Audit, Feedback)
   └── Middleware: /api/chat-stream
        │
        ▼ (X-Internal-Secret: campus_rag_secret_2026)
[ FastAPI RAG Backend ] (Port 8000)
   ├── Pre-Retrieval RBAC Filter (Role + Department)
   ├── Cosine Distance Cutoff (MAX_DISTANCE = 0.42)
   └── Starlette SSE Streamer
        │
        ├──► [ ChromaDB Vector Store ] (Cosine Space, 768-D)
        └──► [ Ollama Engine ] (llama3.2 + nomic-embed-text, Port 11434)
```

---

## Quickstart (Local Development)

### 1. Start Ollama
Ensure Ollama is running and required models are pulled:
```bash
ollama serve
ollama pull llama3.2
ollama pull nomic-embed-text
```

### 2. Start FastAPI RAG Backend
```powershell
.\.venv\Scripts\Activate.ps1
uvicorn rag_api:app --host 127.0.0.1 --port 8000
```

### 3. Start TanStack Start Web Application
```powershell
cd web-app
npm install
npm run dev
```
Open **http://localhost:3000/** in your browser.

---

## Default Administrative Credentials

- **Email**: `admin@university.edu`
- **Password**: `AdminPass123!`
- **Role**: `admin`
- **Portal URL**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## Production Deployment (Docker Compose)

To launch the full production cluster:
```bash
docker compose up -d --build
```
This automatically initializes:
- `campus-ollama`: Ollama server with persistent model storage.
- `campus-rag-backend`: FastAPI vector intelligence engine with persistent ChromaDB volume.
- `campus-web-app`: TanStack Start production app with persistent SQLite storage.

---

## Automated Test Suites

| Suite | File | Coverage |
| :--- | :--- | :--- |
| **RBAC Security & Scoping** | `test_rbac.py` | 11 / 11 Passed (100%) |
| **Admin Document Portal** | `test_admin.py` | 7 / 7 Passed (100%) |
| **SSE Real-Time Streaming** | `test_streaming.py` | 5 / 5 Passed (100%) |
| **Audit Logs & Answer Feedback** | `web-app/test_milestone11.ts` | 15 / 15 Passed (100%) |
| **Master Production Verification**| `verify_production.py` | 12 / 12 Checks Passed (100%) |
