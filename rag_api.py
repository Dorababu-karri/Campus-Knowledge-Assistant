from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional

# Import the existing functionality
from rag_terminal import (
    setup_chroma_db,
    retrieve_similar_chunks,
    generate_answer,
    verify_ollama_environment
)

app = FastAPI(title="Campus Knowledge API")

# Initialize ChromaDB connection on startup
print("Initializing ChromaDB connection...")
collection = setup_chroma_db()

# Verify that our required models are available
verify_ollama_environment('nomic-embed-text')
verify_ollama_environment('llama3.2')

# Request and Response schemas
class QueryRequest(BaseModel):
    question: str

class SourceSnippet(BaseModel):
    document: str
    page: Optional[int] = None
    chunk_id: str
    text: str

class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceSnippet]

@app.post("/query", response_model=QueryResponse)
async def query_rag(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
        
    try:
        # Step 1: Retrieval (using existing function)
        results = retrieve_similar_chunks(collection, request.question, top_k=5)
        retrieved_documents = results['documents'][0]
        retrieved_metadatas = results['metadatas'][0]
        retrieved_ids = results['ids'][0]
        
        if not retrieved_documents:
            return QueryResponse(
                answer="I'm sorry, I couldn't find any relevant policy information to answer your question.",
                sources=[]
            )
            
        # Step 2: Generation (using existing function with stream disabled)
        answer_text = generate_answer(
            question=request.question,
            retrieved_docs=retrieved_documents,
            retrieved_metadatas=retrieved_metadatas,
            model_name='llama3.2',
            stream_to_terminal=False
        )
        
        # Step 3: Format Sources
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
