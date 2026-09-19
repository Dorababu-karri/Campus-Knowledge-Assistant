# Campus Knowledge Assistant - Terminal Prototype

This is the Milestone 1 prototype of the Campus Knowledge Assistant. It is a local terminal-based Retrieval-Augmented Generation (RAG) system built in pure Python.

## Prerequisites
- Python 3.10+
- [Ollama](https://ollama.com/) installed and running locally
- Ollama models pulled (e.g., `llama3.2` and `nomic-embed-text`)

## Setup Instructions (Windows)

1. **Activate the Virtual Environment**
   Open your terminal in this directory and run:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
   *(If you use Command Prompt instead of PowerShell, run: `.\.venv\Scripts\activate.bat`)*

2. **Install Dependencies**
   Once activated, install the required packages:
   ```powershell
   pip install -r requirements.txt
   ```

## Project Structure
- `.venv/`: The isolated Python virtual environment (ignored by git).
- `requirements.txt`: The list of exact Python packages needed to run this project.
- `data/`: The directory where we store raw documents. Currently contains `sample_policy.txt` for testing.
- `rag_terminal.py`: The main script (currently empty) where we will build the RAG pipeline.
- `.gitignore`: Tells Git which files and folders to ignore so we don't accidentally commit heavy databases or cache files.
