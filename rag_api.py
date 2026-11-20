import os
import base64
import json
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Header
from starlette.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

# Import the existing functionality and RBAC helpers
from rag_terminal import (
    setup_chroma_db,
    retrieve_similar_chunks,
    filter_chunks_by_distance,
    generate_answer,
    generate_answer_stream,
    verify_ollama_environment,
    build_access_filter,
    process_document,
    embed_chunks,
    store_chunks_in_chroma,
    DEFAULT_TOP_K,
    MAX_DISTANCE,
    NO_RELEVANT_INFO_MESSAGE
)
from document_permissions import (
    register_document_permissions,
    remove_document_permissions,
    load_all_permissions,
    get_document_permissions
)

app = FastAPI(title="Campus Knowledge API")

# Shared internal secret for service-to-service authentication
RAG_INTERNAL_SECRET = os.environ.get("RAG_INTERNAL_SECRET", "campus_rag_secret_2026")

# Initialize ChromaDB connection on startup
print("Initializing ChromaDB connection...")
collection = setup_chroma_db()

# Verify that our required models are available
verify_ollama_environment('nomic-embed-text')
verify_ollama_environment('llama3.2')

# Request and Response schemas
class ChatHistoryItem(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    question: str
    user_role: Optional[str] = "public"
    department: Optional[str] = "general"
    history: Optional[List[ChatHistoryItem]] = []

class SourceSnippet(BaseModel):
    document: str
    page: Optional[int] = None
    chunk_id: str
    text: str

class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceSnippet]

class DocumentInfo(BaseModel):
    document: str
    chunks_count: int
    access_level: str
    department: str
    pages_count: int

class DocumentListResponse(BaseModel):
    documents: List[DocumentInfo]
    total_chunks: int

class IngestDocumentRequest(BaseModel):
    filename: str
    content_base64: str
    access_level: str
    department: Optional[str] = "all"

class IngestDocumentResponse(BaseModel):
    success: bool
    filename: str
    chunks_indexed: int
    access_level: str
    department: str

class DeleteDocumentResponse(BaseModel):
    success: bool
    filename: str
    chunks_deleted: int


@app.get("/")
@app.get("/health")
async def health_check(x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")):
    if not x_internal_secret or x_internal_secret != RAG_INTERNAL_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Invalid or missing internal service secret."
        )
    return {
        "status": "healthy",
        "service": "Campus Knowledge Assistant RAG API",
        "version": "1.0.0",
        "total_chunks": collection.count()
    }


@app.post("/query", response_model=QueryResponse)
async def query_rag(
    request: QueryRequest,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    # Security: Verify service-to-service internal secret
    if not x_internal_secret or x_internal_secret != RAG_INTERNAL_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Invalid or missing internal service secret."
        )

    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
        
    # Validate and build access filter (fails closed on invalid roles)
    try:
        where_filter = build_access_filter(
            role=request.user_role or "public",
            department=request.department or "general"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    try:
        # Step 1: Contextualize retrieval query for follow-up questions if history exists
        search_query = request.question
        if request.history:
            last_user_turn = next((h.content for h in reversed(request.history) if h.role == "user"), None)
            if last_user_turn and len(request.question.split()) < 8:
                search_query = f"{last_user_turn} {request.question}"

        # Candidate Retrieval with pre-retrieval RBAC filter (top_k = 8)
        raw_results = retrieve_similar_chunks(
            collection,
            search_query,
            top_k=DEFAULT_TOP_K,
            where_filter=where_filter
        )
        
        # Step 2: Distance Threshold Filtering (<= 0.42)
        filtered_results = filter_chunks_by_distance(raw_results, max_distance=MAX_DISTANCE)
        retrieved_documents = filtered_results['documents'][0]
        retrieved_metadatas = filtered_results['metadatas'][0]
        retrieved_ids = filtered_results['ids'][0]
        
        # Case B: No relevant chunks meet the distance threshold
        if not retrieved_documents:
            return QueryResponse(
                answer=NO_RELEVANT_INFO_MESSAGE,
                sources=[]
            )
            
        # Case A: Relevant chunks exist -> Generate grounded answer with Llama 3.2
        formatted_history = (
            [{"role": h.role, "content": h.content} for h in request.history]
            if request.history
            else None
        )
        answer_text = generate_answer(
            question=request.question,
            retrieved_docs=retrieved_documents,
            retrieved_metadatas=retrieved_metadatas,
            model_name='llama3.2',
            stream_to_terminal=False,
            history=formatted_history
        )
        
        # Step 3: Format Accepted Sources
        sources = []
        for doc, meta, cid in zip(retrieved_documents, retrieved_metadatas, retrieved_ids):
            sources.append(SourceSnippet(
                document=meta.get("document", meta.get("source", "Unknown")),
                page=meta.get("page"),
                chunk_id=meta.get("chunk_id", cid),
                text=doc
            ))
            
        return QueryResponse(answer=answer_text, sources=sources)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query/stream")
async def query_rag_stream(
    request: QueryRequest,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    """
    Streams the grounded LLM response incrementally via Server-Sent Events (SSE).
    Emits source citations first, followed by tokens in real-time.
    """
    if not x_internal_secret or x_internal_secret != RAG_INTERNAL_SECRET:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Invalid or missing internal service secret."
        )

    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        where_filter = build_access_filter(
            role=request.user_role or "public",
            department=request.department or "general"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))

    try:
        # Step 1: Contextualize retrieval query for follow-up questions
        search_query = request.question
        if request.history:
            last_user_turn = next((h.content for h in reversed(request.history) if h.role == "user"), None)
            if last_user_turn and len(request.question.split()) < 8:
                search_query = f"{last_user_turn} {request.question}"

        # Candidate Retrieval with pre-retrieval RBAC filter (top_k = 8)
        raw_results = retrieve_similar_chunks(
            collection,
            search_query,
            top_k=DEFAULT_TOP_K,
            where_filter=where_filter
        )
        
        # Step 2: Distance Threshold Filtering (<= 0.42)
        filtered_results = filter_chunks_by_distance(raw_results, max_distance=MAX_DISTANCE)
        retrieved_documents = filtered_results['documents'][0]
        retrieved_metadatas = filtered_results['metadatas'][0]
        retrieved_ids = filtered_results['ids'][0]

        sources = []
        for doc, meta, cid in zip(retrieved_documents, retrieved_metadatas, retrieved_ids):
            sources.append({
                "document": meta.get("document", meta.get("source", "Unknown")),
                "page": meta.get("page"),
                "chunk_id": meta.get("chunk_id", cid),
                "text": doc
            })

        def event_stream():
            # 1. Send source citations immediately
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

            # Case B: No relevant chunks meet the distance threshold
            if not retrieved_documents:
                yield f"data: {json.dumps({'type': 'token', 'token': NO_RELEVANT_INFO_MESSAGE})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                return

            # Case A: Stream answer tokens from Llama 3.2
            formatted_history = (
                [{"role": h.role, "content": h.content} for h in request.history]
                if request.history
                else None
            )
            for token in generate_answer_stream(
                question=request.question,
                retrieved_docs=retrieved_documents,
                retrieved_metadatas=retrieved_metadatas,
                model_name='llama3.2',
                history=formatted_history
            ):
                yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Milestone 9: Admin Document Management Endpoints ---

@app.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    """Lists all indexed policy documents in ChromaDB with their permission metadata and chunk counts."""
    if not x_internal_secret or x_internal_secret != RAG_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid or missing internal secret.")

    try:
        data = collection.get(include=['metadatas'])
        metas = data.get('metadatas', []) or []
        
        doc_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "chunks_count": 0,
            "access_level": "unknown",
            "department": "all",
            "pages": set()
        })

        all_perms = load_all_permissions()

        for meta in metas:
            doc_name = meta.get("document") or meta.get("source") or "Unknown"
            doc_stats[doc_name]["chunks_count"] += 1
            doc_stats[doc_name]["access_level"] = meta.get("access_level") or all_perms.get(doc_name, {}).get("access_level", "student")
            doc_stats[doc_name]["department"] = meta.get("department") or all_perms.get(doc_name, {}).get("department", "all")
            if "page" in meta and meta["page"] is not None:
                doc_stats[doc_name]["pages"].add(meta["page"])

        result_docs = []
        for doc_name, stats in sorted(doc_stats.items()):
            result_docs.append(DocumentInfo(
                document=doc_name,
                chunks_count=stats["chunks_count"],
                access_level=stats["access_level"],
                department=stats["department"],
                pages_count=len(stats["pages"]) if stats["pages"] else 1
            ))

        return DocumentListResponse(
            documents=result_docs,
            total_chunks=len(metas)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan document collection: {e}")


@app.post("/documents/ingest", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    """
    Ingests and indexes a new policy document into ChromaDB.
    Decodes base64 file content, writes PDF to disk, registers permissions, chunks, embeds, and stores in ChromaDB.
    """
    if not x_internal_secret or x_internal_secret != RAG_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid or missing internal secret.")

    clean_filename = os.path.basename(request.filename.strip())
    if not clean_filename.lower().endswith(('.pdf', '.txt')):
        raise HTTPException(status_code=400, detail="Only .pdf or .txt files are supported for ingestion.")

    try:
        # 1. Register and persist document permission classification
        registered_perm = register_document_permissions(
            clean_filename,
            access_level=request.access_level,
            department=request.department or "all"
        )

        # 2. Decode and save file to data/policies/
        policies_dir = os.path.join("data", "policies")
        os.makedirs(policies_dir, exist_ok=True)
        file_path = os.path.join(policies_dir, clean_filename)

        file_bytes = base64.b64decode(request.content_base64)
        with open(file_path, "wb") as f:
            f.write(file_bytes)

        # 3. Process, chunk, embed, and store in ChromaDB
        chunks = process_document(file_path)
        if not chunks:
            raise ValueError(f"No text chunks could be extracted from {clean_filename}.")

        embedded_chunks = embed_chunks(chunks)
        store_chunks_in_chroma(collection, embedded_chunks)

        return IngestDocumentResponse(
            success=True,
            filename=clean_filename,
            chunks_indexed=len(chunks),
            access_level=registered_perm["access_level"],
            department=registered_perm["department"]
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to ingest document: {e}")


@app.delete("/documents/{filename}", response_model=DeleteDocumentResponse)
async def delete_document(
    filename: str,
    x_internal_secret: Optional[str] = Header(None, alias="X-Internal-Secret")
):
    """Deletes all chunks of a document from ChromaDB and unregisters its permissions."""
    if not x_internal_secret or x_internal_secret != RAG_INTERNAL_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid or missing internal secret.")

    clean_filename = os.path.basename(filename.strip())
    try:
        # 1. Find all chunks belonging to the document
        data = collection.get(where={"document": clean_filename})
        chunk_ids = data.get("ids", [])

        if chunk_ids:
            collection.delete(ids=chunk_ids)

        # 2. Unregister custom permissions if present
        remove_document_permissions(clean_filename)

        # 3. Remove physical file from data/policies if present
        file_path = os.path.join("data", "policies", clean_filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as fe:
                print(f"Notice: Could not delete physical file {file_path}: {fe}")

        return DeleteDocumentResponse(
            success=True,
            filename=clean_filename,
            chunks_deleted=len(chunk_ids)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document chunks: {e}")
