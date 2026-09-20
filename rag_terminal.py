import os
import sys
from typing import List, Dict, Any
import ollama
import chromadb
from pypdf import PdfReader

# --- 1. FILE LOADING & CHUNKING ---

def load_document(file_path: str) -> str:
    """Reads a text file and returns its raw string content."""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def load_pdf_pages(file_path: str) -> List[Dict[str, Any]]:
    """Reads a PDF and returns a list of dictionaries containing page text and metadata."""
    reader = PdfReader(file_path)
    filename = os.path.basename(file_path)
    pages = []
    
    # Process each page individually to preserve page boundaries
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:  # Only append pages that actually contain text
            pages.append({
                "page_num": i + 1,  # 1-indexed for human readability (Page 1 instead of Page 0)
                "text": text.strip(),
                "source": filename
            })
    return pages

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100, source_filename: str = "") -> List[Dict[str, Any]]:
    """Splits plain text into overlapping chunks."""
    chunks = []
    start = 0
    text_length = len(text)
    chunk_id = 0
    
    while start < text_length:
        end = start + chunk_size
        chunk_text_content = text[start:end]
        
        chunk = {
            # Including filename in ID ensures uniqueness across multiple files
            "id": f"{source_filename}_chunk_{chunk_id}",
            "text": chunk_text_content,
            "metadata": {
                "source": source_filename,
                "start_char": start,
                "end_char": min(end, text_length)
            }
        }
        chunks.append(chunk)
        # Move our starting position forward. Subtracting overlap re-reads the last few sentences.
        start += (chunk_size - overlap)
        chunk_id += 1
        
    return chunks

def chunk_pages(pages: List[Dict[str, Any]], chunk_size: int = 500, overlap: int = 100) -> List[Dict[str, Any]]:
    """Chunks the text of each page individually, preserving page metadata."""
    chunks = []
    chunk_id = 0
    
    for page in pages:
        text = page["text"]
        start = 0
        text_length = len(text)
        source_filename = page["source"]
        page_num = page["page_num"]
        
        while start < text_length:
            end = start + chunk_size
            chunk_text_content = text[start:end]
            
            chunk = {
                # Format: filename_page_chunkID
                "id": f"{source_filename}_p{page_num}_{chunk_id}",
                "text": chunk_text_content,
                "metadata": {
                    "source": source_filename,
                    "page": page_num,
                    "start_char": start,
                    "end_char": min(end, text_length)
                }
            }
            chunks.append(chunk)
            start += (chunk_size - overlap)
            chunk_id += 1
            
    return chunks

def process_document(file_path: str, chunk_size: int = 500, overlap: int = 100) -> List[Dict[str, Any]]:
    """Loads a document (.txt or .pdf) and returns chunked data."""
    if file_path.endswith('.pdf'):
        pages = load_pdf_pages(file_path)
        return chunk_pages(pages, chunk_size, overlap)
    elif file_path.endswith('.txt'):
        raw_text = load_document(file_path)
        filename = os.path.basename(file_path)
        return chunk_text(raw_text, chunk_size, overlap, filename)
    else:
        print(f"Unsupported file format: {file_path}")
        return []


# --- 2. EMBEDDINGS & DB STORAGE ---

def verify_ollama_environment(model_name: str):
    """Verifies that Ollama is running and the required model is available."""
    try:
        models_response = ollama.list()
        
        # Handle different versions of the ollama python library
        if hasattr(models_response, 'models'):
            model_names = [m.model for m in models_response.models]
        else:
            model_names = [m.get('name', '') for m in models_response.get('models', [])]
            
        is_available = any(model_name in name for name in model_names)
        
        if not is_available:
            print(f"Error: Model '{model_name}' not found locally.")
            print(f"Please run this in a separate terminal: ollama pull {model_name}")
            sys.exit(1)
    except Exception as e:
        print(f"Error connecting to Ollama: {e}")
        sys.exit(1)

def generate_embedding(text: str, model_name: str = 'nomic-embed-text') -> List[float]:
    """Passes a single string of text to Ollama to generate an embedding vector."""
    response = ollama.embeddings(model=model_name, prompt=text)
    return response['embedding']

def embed_chunks(chunks: List[Dict[str, Any]], model_name: str = 'nomic-embed-text') -> List[Dict[str, Any]]:
    """Iterates through all chunks and generates their embeddings."""
    for chunk in chunks:
        vector = generate_embedding(chunk["text"], model_name)
        chunk["embedding"] = vector
    return chunks

def setup_chroma_db(db_path: str = "chroma_db", collection_name: str = "campus_policies"):
    """Initializes a persistent ChromaDB client and creates/gets a collection."""
    # Create a persistent client that saves data to the specified folder on disk
    client = chromadb.PersistentClient(path=db_path)
    
    # Get or create a collection (like a table in a relational DB)
    # hnsw:space defines the math used to calculate distance. We use 'cosine' similarity.
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"}
    )
    return collection

def store_chunks_in_chroma(collection, chunks: List[Dict[str, Any]]):
    """Stores chunks, their text, metadata, and embeddings into the ChromaDB collection."""
    # First, get all existing IDs so we don't insert duplicates
    existing_ids = collection.get()['ids']
    
    new_ids = []
    new_embeddings = []
    new_metadatas = []
    new_documents = []
    
    for chunk in chunks:
        if chunk["id"] not in existing_ids:
            new_ids.append(chunk["id"])
            new_embeddings.append(chunk["embedding"])
            new_metadatas.append(chunk["metadata"])
            new_documents.append(chunk["text"])
            
    if new_ids:
        # Add new chunks to the database
        collection.add(
            ids=new_ids,
            embeddings=new_embeddings,
            metadatas=new_metadatas,
            documents=new_documents
        )
        print(f"Added {len(new_ids)} new chunks to ChromaDB.")
    else:
        print("No new chunks to add. All chunks already exist in ChromaDB.")


# --- 3. RETRIEVAL & GENERATION ---

def retrieve_similar_chunks(collection, question: str, top_k: int = 5, model_name: str = 'nomic-embed-text'):
    """Takes a user question, generates its embedding, and searches ChromaDB for similar chunks."""
    # 1. Generate an embedding for the user's question using the EXACT SAME model
    question_embedding = generate_embedding(question, model_name)
    
    # 2. Query the ChromaDB collection using the question's embedding
    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=top_k
    )
    return results

def generate_answer(question: str, retrieved_docs: List[str], retrieved_metadatas: List[Dict[str, Any]], model_name: str = 'llama3.2'):
    """Constructs a strict prompt with context and streams the LLM response to the terminal."""
    # 1. Format the retrieved chunks so the LLM can cleanly read them
    context_str = ""
    for i, (doc, metadata) in enumerate(zip(retrieved_docs, retrieved_metadatas)):
        # Append page info if it exists (for PDFs)
        page_info = f", Page {metadata['page']}" if 'page' in metadata else ""
        context_str += f"[Source {i+1}: {metadata['source']}{page_info}]:\n{doc}\n\n"
        
    # 2. Construct the strict prompt
    prompt = f"""You are a strict and helpful Campus Knowledge Assistant.
Your job is to answer the user's question using ONLY the provided policy context below.

CRITICAL RULES:
1. If the provided context does not contain enough information to answer the question, you must explicitly state that the policy information provided does not contain the answer.
2. Do NOT invent rules, facts, or policies.
3. When you use information from the context, cite the source using [Source 1], [Source 2], etc.

CONTEXT:
{context_str}

USER QUESTION:
{question}
"""

    print("\nAssistant: ", end="", flush=True)
    try:
        # 3. Call Ollama with stream=True so the response prints word-by-word
        stream = ollama.chat(
            model=model_name,
            messages=[{'role': 'user', 'content': prompt}],
            stream=True
        )
        for chunk in stream:
            print(chunk['message']['content'], end='', flush=True)
        print("\n")
    except Exception as e:
        print(f"\n[Error generating response: {e}]\n")


if __name__ == "__main__":
    print("Initializing Campus Knowledge Assistant...")
    verify_ollama_environment('nomic-embed-text')
    verify_ollama_environment('llama3.2')
    
    print("--- 1. Loading & Chunking Documents ---")
    all_chunks = []
    
    # Process sample txt
    txt_path = os.path.join("data", "sample_policy.txt")
    if os.path.exists(txt_path):
        print(f"Loading {os.path.basename(txt_path)}...")
        all_chunks.extend(process_document(txt_path))
        
    # For testing, we only process ONE small PDF from the policies folder to avoid a massive embedding process
    pdf_test_path = os.path.join("data", "policies", "Attendance-Policy.pdf")
    if os.path.exists(pdf_test_path):
        print(f"Loading {os.path.basename(pdf_test_path)}...")
        pdf_chunks = process_document(pdf_test_path)
        all_chunks.extend(pdf_chunks)
        print(f"Extracted chunks from PDF.")
    else:
        print(f"Test PDF not found at {pdf_test_path}")

    print(f"Total chunks created: {len(all_chunks)}")
    
    print("\n--- 2. Generating Embeddings ---")
    print("This may take some time depending on your hardware...")
    
    # Optimization: We only embed chunks that don't already exist in DB
    collection = setup_chroma_db()
    existing_ids = collection.get()['ids']
    
    chunks_to_embed = [chunk for chunk in all_chunks if chunk['id'] not in existing_ids]
    if chunks_to_embed:
        print(f"Generating embeddings for {len(chunks_to_embed)} new chunks...")
        embed_chunks(chunks_to_embed, 'nomic-embed-text')
        print("--- 3. Setting Up ChromaDB ---")
        store_chunks_in_chroma(collection, chunks_to_embed)
    else:
        print("All chunks already embedded and stored in DB.")
        
    
    print("\n" + "="*60)
    print("Welcome to the Campus Knowledge Assistant (Terminal Prototype)!")
    print("Ask me anything about the loaded policies. Type 'exit' or 'quit' to stop.")
    print("="*60)
    
    while True:
        try:
            # Get user input
            user_input = input("\nYou: ").strip()
            
            # Handle exit commands
            if user_input.lower() in ['exit', 'quit']:
                print("Goodbye!")
                break
                
            # Handle empty input
            if not user_input:
                continue
                
            # RAG STEP 1: Retrieve relevant chunks from database
            results = retrieve_similar_chunks(collection, user_input, top_k=5)
            retrieved_documents = results['documents'][0]
            retrieved_metadatas = results['metadatas'][0]
            
            if not retrieved_documents:
                print("No relevant documents found in the database.")
                continue
                
            # RAG STEP 2: Generate the answer using the LLM
            generate_answer(user_input, retrieved_documents, retrieved_metadatas, model_name='llama3.2')
            
            # RAG STEP 3: Display the sources
            print("-" * 50)
            print("Sources Consulted:")
            for i, metadata in enumerate(retrieved_metadatas):
                page_info = f" (Page {metadata['page']})" if 'page' in metadata else ""
                print(f"[{i+1}] {metadata['source']}{page_info} (chars: {metadata['start_char']}-{metadata['end_char']})")
            print("-" * 50)
            
        except KeyboardInterrupt:
            # Handle Ctrl+C gracefully
            print("\nGoodbye!")
            break
        except Exception as e:
            # Handle unexpected errors without crashing the loop
            print(f"\n[Unexpected Error: {e}]\n")
