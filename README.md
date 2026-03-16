# NexGen RAG Analyst

A lightweight, advanced multi-file Retrieval-Augmented Generation (RAG) chatbot web application.

## Features
- **Multi-File Indexing**: Upload PDFs or TXT files. The application splits the text into chunks and creates embeddings.
- **Cumulative Indexing**: You can upload more files at any time, and they will be added to the existing in-memory vector index instantly.
- **Simultaneous Retrieval**: Ask questions and the engine retrieves context across all indexed documents using high speed in-memory `numpy` vector operations.
- **Completely Free APIs**: Uses `sentence-transformers` locally for free, private embeddings, and `Pollinations AI` for completely free generation (no API keys needed!).
- **Premium UI**: Dark mode, glassmorphism, fluid animations, and a rich user experience displaying current file/chunk indexing statistics.

## Setup Instructions

1. **Install Dependencies**
   Open your terminal and run:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run the Server**
   ```bash
   uvicorn main:app --reload --port 8000
   ```

3. **Access the App**
   Open your browser and navigate to `http://localhost:8000`.

## Notes
- To keep the system exceptionally lightweight and completely cross-platform natively, it uses `numpy` for high-performance chunk searching instead of large C++ vector db libraries.
- The first time you start the app and upload a file, the system will download the `all-MiniLM-L6-v2` embedding model (around ~80 MB). This is a one-time process.
