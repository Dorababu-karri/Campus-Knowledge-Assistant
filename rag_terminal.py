import os
import sys
from typing import List, Dict, Any
import ollama
import chromadb

def load_document(file_path: str) -> str:
    """Reads a text file and returns its raw string content."""
    with open(file_path, 'r', encoding='utf-8') as f:
        return f.read()

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100, source_filename: str = "") -> List[Dict[str, Any]]:
    """
    Splits text into chunks of strictly `chunk_size` characters, overlapping by `overlap` characters.
    """
    chunks = []
    start = 0
    text_length = len(text)
    chunk_id = 0
    
    while start < text_length:
        end = start + chunk_size
        chunk_text_content = text[start:end]
        
        chunk = {
            "id": f"{source_filename}_chunk_{chunk_id}",
            "text": chunk_text_content,
            "metadata": {
                "source": source_filename,
                "start_char": start,
                "end_char": min(end, text_length)
            }
        }
        chunks.append(chunk)
        start += (chunk_size - overlap)
        chunk_id += 1
        
    return chunks

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
        print("Please ensure the Ollama application is running on your machine.")
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
    client = chromadb.PersistentClient(path=db_path)
    collection = client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"}
    )
    return collection

def store_chunks_in_chroma(collection, chunks: List[Dict[str, Any]]):
    """Stores chunks, their text, metadata, and embeddings into the ChromaDB collection."""
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
        collection.add(
            ids=new_ids,
            embeddings=new_embeddings,
            metadatas=new_metadatas,
            documents=new_documents
        )
        print(f"Added {len(new_ids)} new chunks to ChromaDB.")
    else:
        print("No new chunks to add. All chunks already exist in ChromaDB.")

def retrieve_similar_chunks(collection, question: str, top_k: int = 3, model_name: str = 'nomic-embed-text'):
    """Takes a user question, generates its embedding, and searches ChromaDB for similar chunks."""
    question_embedding = generate_embedding(question, model_name)
    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=top_k
    )
    return results

def generate_answer(question: str, retrieved_docs: List[str], model_name: str = 'llama3.2'):
    """
    Constructs a strict prompt with context and streams the LLM response to the terminal.
    """
    # 1. Format the retrieved chunks so the LLM can cleanly read them
    context_str = ""
    for i, doc in enumerate(retrieved_docs):
        context_str += f"[Source {i+1}]:\n{doc}\n\n"
        
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
    # --- 1. PREPARATION ---
    print("Initializing Campus Knowledge Assistant...")
    verify_ollama_environment('nomic-embed-text')
    verify_ollama_environment('llama3.2')
    
    file_path = os.path.join("data", "sample_policy.txt")
    filename = os.path.basename(file_path)
    
    # Load and process the document
    raw_text = load_document(file_path)
    chunks = chunk_text(raw_text, chunk_size=500, overlap=100, source_filename=filename)
    chunks = embed_chunks(chunks, 'nomic-embed-text')
    
    # Store in database
    collection = setup_chroma_db()
    store_chunks_in_chroma(collection, chunks)
    
    # --- 2. TERMINAL CHAT LOOP ---
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
            generate_answer(user_input, retrieved_documents, model_name='llama3.2')
            
            # RAG STEP 3: Display the sources
            print("-" * 50)
            print("Sources Consulted:")
            for i, metadata in enumerate(retrieved_metadatas):
                print(f"[{i+1}] {metadata['source']} (characters: {metadata['start_char']}-{metadata['end_char']})")
            print("-" * 50)
            
        except KeyboardInterrupt:
            # Handle Ctrl+C gracefully
            print("\nGoodbye!")
            break
        except Exception as e:
            # Handle unexpected errors without crashing the loop
            print(f"\n[Unexpected Error: {e}]\n")
