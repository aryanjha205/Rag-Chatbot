import os
# Configure HuggingFace Cache limit for read-only Serverless architectures (Vercel)
os.environ["HF_HOME"] = "/tmp"
os.environ["TRANSFORMERS_CACHE"] = "/tmp"

import io
import json
import logging
import requests
import numpy as np
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Advanced Multi-File RAG Chatbot")

# Paths for static and templates
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Global State for Document Indexing
# We use an in-memory approach for lightweight execution.
document_chunks = []
processed_files = set()
total_uploaded_files = 0

logger.info("Initializing vectorizer")
vectorizer = TfidfVectorizer()
tfidf_matrix = None

def split_text(text: str, chunk_size: int = 800, overlap: int = 150) -> List[str]:
    """Splits text into chunks of specified size with overlap."""
    chunks = []
    start = 0
    text_len = len(text)
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
    return chunks

def extract_text(file_content: bytes, filename: str) -> str:
    """Extracts text from PDF or raw text files."""
    text = ""
    if filename.lower().endswith('.pdf'):
        try:
            pdf = PdfReader(io.BytesIO(file_content))
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        except Exception as e:
            logger.error(f"Error reading PDF {filename}: {e}")
    else:
        try:
            text = file_content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                text = file_content.decode('latin-1')
            except Exception as e:
                logger.error(f"Error reading text file {filename}: {e}")
    return text

def calculate_similarity(query: str):
    """Computes cosine similarity between query and the document chunks."""
    if not document_chunks or tfidf_matrix is None:
        return []
    
    query_vec = vectorizer.transform([query])
    similarities = cosine_similarity(query_vec, tfidf_matrix).flatten()
    return similarities

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/sw.js")
async def serve_sw():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"))

@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.json"))

@app.get("/stats")
async def get_stats():
    global total_uploaded_files, document_chunks, processed_files
    return JSONResponse({
        "files": total_uploaded_files,
        "chunks": len(document_chunks),
        "file_list": list(processed_files)
    })

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    global document_chunks, processed_files, total_uploaded_files, tfidf_matrix, vectorizer
    
    new_chunks_count = 0
    new_files_count = 0
    
    for file in files:
        if file.filename in processed_files:
            continue
            
        content = await file.read()
        text = extract_text(content, file.filename)
        text = text.strip()
        
        if not text:
            continue
            
        chunks = split_text(text)
        if chunks:
            document_chunks.extend(chunks)
            processed_files.add(file.filename)
            new_chunks_count += len(chunks)
            new_files_count += 1
            total_uploaded_files += 1
            
    # Recreate the TF-IDF matrix for all chunks to update vocabulary
    if document_chunks:
        tfidf_matrix = vectorizer.fit_transform(document_chunks)

    return JSONResponse({
        "message": f"Successfully processed {new_files_count} new files.",
        "new_chunks": new_chunks_count,
        "total_files": total_uploaded_files,
        "total_chunks": len(document_chunks)
    })

@app.post("/chat")
async def chat(question: str = Form(...)):
    global document_chunks, tfidf_matrix
    
    if tfidf_matrix is None or len(document_chunks) == 0:
        return JSONResponse({"answer": "I have no documents indexed. Please upload some files first."})
        
    try:
        similarities = calculate_similarity(question)
        
        # Find top k matches
        k = min(5, len(document_chunks))
        top_k_indices = np.argsort(similarities)[::-1][:k]
        
        # Retrieve mapped context chunks
        context_chunks = [document_chunks[i] for i in top_k_indices]
        context_text = "\n\n".join(context_chunks)
        
        # We need to explicitly order the AI to output exactly one paragraph without bullets.
        system_prompt = (
            "You are an advanced AI assistant strictly tied to a document retrieval system. "
            "Your task is to answer the user's question based strictly on the provided context. "
            "CRITICAL RULES: \n"
            "1. You MUST return your ENTIRE final answer as exactly ONE SINGLE continuous paragraph.\n"
            "2. DO NOT use line breaks, bullet points, numbers, lists, or headings of any kind. EVER. No markdown at all.\n"
            "3. If the answer cannot be found in the context, clearly say 'I cannot answer this based on the provided documents.' in a single sentence.\n"
            "4. Keep the text flowing seamlessly."
        )
        prompt = f"Context available from uploaded documents:\n{context_text}\n\nQuestion asked by user: {question}"
        
        # Call completely free text API (Pollinations AI)
        response = requests.post(
            "https://text.pollinations.ai/",
            json={
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            },
            timeout=30
        )
        
        if response.status_code == 200:
            raw_answer = response.text
            # Force cleanup any accidental line breaks or markdown that it still might generate
            clean_answer = " ".join(raw_answer.replace('*', '').replace('-', ' ').replace('#', ' ').splitlines())
            # Replace multiple spaces
            clean_answer = " ".join(clean_answer.split())
            return JSONResponse({"answer": clean_answer})
        else:
            return JSONResponse({"answer": "Sorry, there was an issue communicating with the AI generation endpoint."}, status_code=500)
            
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return JSONResponse({"answer": f"An internal error occurred: {str(e)}"}, status_code=500)
