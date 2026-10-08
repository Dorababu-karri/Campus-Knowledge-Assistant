import json
from rag_terminal import setup_chroma_db, retrieve_similar_chunks, generate_answer

def run_test(question):
    print(f"\n{'='*50}")
    print(f"QUESTION: {question}")
    collection = setup_chroma_db()
    results = retrieve_similar_chunks(collection, question, top_k=5)
    
    docs = results['documents'][0]
    metas = results['metadatas'][0]
    
    print("\nRETRIEVED CHUNKS:")
    for i, meta in enumerate(metas):
        print(f"- {meta.get('document')} (Page {meta.get('page')}) [Chunk: {meta.get('chunk_id')}]")
        
    print("\nGENERATED ANSWER:")
    ans = generate_answer(question, docs, metas, stream_to_terminal=False)
    print(ans)

if __name__ == "__main__":
    tests = [
        "What is the minimum attendance requirement for UG programs?",
        "What happens if a student is caught plagiarizing?",
        "Are students allowed to use mobile phones during examinations?",
        "What is the capital of Japan?"
    ]
    for t in tests:
        run_test(t)
