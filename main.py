import os
# Configure HuggingFace Cache limit for read-only Serverless architectures (Vercel)
os.environ["HF_HOME"] = "/tmp"
os.environ["TRANSFORMERS_CACHE"] = "/tmp"

import io
import json
import logging
import requests
import certifi
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
import numpy as np
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import secrets
import hashlib
import jwt
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, Form, Request, Depends, HTTPException, status, Header, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PyPDF2 import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from pymongo.mongo_client import MongoClient
from pymongo.server_api import ServerApi

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

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb+srv://ravalmohit390_db_user:MOHIT567@cluster0.ybz53dp.mongodb.net/rag_database?retryWrites=true&w=majority")

# Initialize collections as None
chunks_collection = None
files_collection = None
users_collection = None

try:
    # Optimized for Serverless: shorter timeouts to fail fast rather than hang
    client = MongoClient(
        MONGO_URI, 
        server_api=ServerApi('1'), 
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000
    )
    db = client['rag_database']
    chunks_collection = db['document_chunks']
    files_collection = db['processed_files']
    users_collection = db['users']
    
    # Ensure unique index on email for fast lookups
    if users_collection is not None:
        try:
            users_collection.create_index("email", unique=True)
            logger.info("Successfully ensured unique index on email.")
        except Exception as idx_e:
            logger.warning(f"Could not create unique index (might already exist): {idx_e}")
    
    logger.info("MongoDB client initialized.")
except Exception as e:
    logger.error(f"Critical MongoDB Initialization Error: {e}")

# Global State for Document Indexing
# Each user will have their chunks loaded into memory on-demand or filtered.
# For simplicity with TF-IDF, we will fetch user-specific data during requests.

# ================= AUTH & EMAIL CONFIG =================
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 465
SENDER_EMAIL = os.getenv("SENDER_EMAIL") or "bharatlabs.in@gmail.com"
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD") or "ndtv uymm ykea qczo"
JWT_SECRET = os.getenv("JWT_SECRET") or "supersecret_rag_key_change_in_prod"
JWT_ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    salt = "fixed_salt_for_simplicity"
    return hashlib.sha256((password + salt).encode()).hexdigest()

def send_email(to_email: str, subject: str, body: str):
    if not SENDER_EMAIL or not SENDER_PASSWORD:
        logger.error("SMTP credentials missing. Email not sent.")
        return False
        
    try:
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        
        server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, timeout=7)
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)
        server.quit()
        logger.info(f"Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Email failure: {e}")
        return False

class AuthSignup(BaseModel):
    email: str
    password: str

class AuthVerify(BaseModel):
    email: str
    otp: str

class AuthLogin(BaseModel):
    email: str
    password: str

def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return email
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/auth/signup")
async def signup(user: AuthSignup, background_tasks: BackgroundTasks):
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database connection is unavailable. Please check your MONGO_URI.")

    try:
        existing_user = users_collection.find_one({"email": user.email})
        if existing_user:
            if existing_user.get("is_verified"):
                raise HTTPException(status_code=400, detail="Email already registered and verified.")
            # If not verified, we'll update the OTP and allow them to "re-signup"
            otp = str(secrets.randbelow(900000) + 100000)
            users_collection.update_one(
                {"email": user.email},
                {"$set": {
                    "password": hash_password(user.password),
                    "otp": otp,
                    "otp_expiry": datetime.utcnow() + timedelta(minutes=15)
                }}
            )
        else:
            otp = str(secrets.randbelow(900000) + 100000)
            users_collection.insert_one({
                "email": user.email,
                "password": hash_password(user.password),
                "is_verified": False,
                "otp": otp,
                "otp_expiry": datetime.utcnow() + timedelta(minutes=15)
            })
        
        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #1e293b;">
            <h2 style="color: #4f46e5;">Your Verification Code</h2>
            <p>Welcome to RAG Analyst! Please use the OTP below to verify your account:</p>
            <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 2rem; font-weight: bold; letter-spacing: 5px; color: #4f46e5; background: #f1f5f9; padding: 10px 25px; border-radius: 8px;">{otp}</span>
            </div>
            <p style="font-size: 0.9rem; color: #64748b;">This code is valid for 15 minutes.</p>
        </div>
        """
        background_tasks.add_task(send_email, user.email, "Your OTP Code", html_body)
            
        return {"message": "OTP sent to your email"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup Database Error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@app.post("/auth/verify")
async def verify(data: AuthVerify, background_tasks: BackgroundTasks):
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    user_db = users_collection.find_one({"email": data.email})
    if not user_db:
        raise HTTPException(status_code=404, detail="User not found")
    if user_db.get("is_verified"):
        return {"message": "Already verified"}
    if user_db.get("otp") != data.otp or user_db.get("otp_expiry") < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
        
    users_collection.update_one({"email": data.email}, {"$set": {"is_verified": True}, "$unset": {"otp": "", "otp_expiry": ""}})
    
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #1e293b;">
        <h2 style="color: #4f46e5;">Welcome to NexGen RAG Analyst!</h2>
        <p>Your account (<strong>{data.email}</strong>) has been successfully verified.</p>
        <p>You can now log in to the dashboard to upload documents and start chatting with our AI.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="font-size: 0.9rem; color: #64748b;">Thanks for joining us!</p>
    </div>
    """
    
    if SENDER_EMAIL and SENDER_PASSWORD:
        background_tasks.add_task(send_email, data.email, "Welcome to RAG Analyst!", html_body)
        
    return {"message": "Account verified successfully. You can now login."}

@app.post("/auth/login")
async def login(user: AuthLogin):
    if users_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    user_db = users_collection.find_one({"email": user.email})
    if not user_db or user_db["password"] != hash_password(user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user_db.get("is_verified"):
        raise HTTPException(status_code=403, detail="Account not verified. Please verify OTP first.")
        
    token = jwt.encode(
        {"sub": user.email, "exp": datetime.utcnow() + timedelta(days=7)},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM
    )
    return {"access_token": token}
# =======================================================

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
async def get_stats(user_email: str = Depends(get_current_user)):
    if files_collection is None or chunks_collection is None:
        return JSONResponse({"files": 0, "chunks": 0, "file_list": []})
    user_files = list(files_collection.find({"user_email": user_email}))
    user_chunks = list(chunks_collection.find({"user_email": user_email}))
    
    return JSONResponse({
        "files": len(user_files),
        "chunks": len(user_chunks),
        "file_list": [f['filename'] for f in user_files]
    })

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...), user_email: str = Depends(get_current_user)):
    if files_collection is None or chunks_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    new_chunks_count = 0
    new_files_count = 0
    
    # Get existing user files
    existing_files = set(f['filename'] for f in files_collection.find({"user_email": user_email}))

    for file in files:
        if file.filename in existing_files:
            continue
            
        content = await file.read()
        text = extract_text(content, file.filename)
        text = text.strip()
        
        if not text:
            continue
            
        chunks = split_text(text)
        if chunks:
            new_chunks_count += len(chunks)
            new_files_count += 1
            
            # Save to MongoDB
            try:
                files_collection.insert_one({"filename": file.filename, "user_email": user_email})
                chunk_docs = [{"filename": file.filename, "text": chunk, "user_email": user_email} for chunk in chunks]
                if chunk_docs:
                    chunks_collection.insert_many(chunk_docs)
            except Exception as e:
                logger.error(f"Failed to insert into MongoDB: {e}")
            
    return JSONResponse({
        "message": f"Successfully processed {new_files_count} new files.",
        "new_chunks": new_chunks_count
    })

@app.delete("/delete/{filename}")
async def delete_file(filename: str, user_email: str = Depends(get_current_user)):
    if files_collection is None or chunks_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    
    try:
        files_collection.delete_one({"filename": filename, "user_email": user_email})
        chunks_collection.delete_many({"filename": filename, "user_email": user_email})
        return JSONResponse({"message": f"Successfully deleted {filename}"})
    except Exception as e:
        logger.error(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail="Error deleting file.")

@app.post("/chat")
async def chat(question: str = Form(...), user_email: str = Depends(get_current_user)):
    if chunks_collection is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    user_chunks_docs = list(chunks_collection.find({"user_email": user_email}))
    user_chunks = [c['text'] for c in user_chunks_docs]

    if not user_chunks:
        return JSONResponse({"answer": "I have no documents indexed for your account. Please upload some files first."})
        
    try:
        # Dynamic TF-IDF build for the user's specific chunks
        user_vectorizer = TfidfVectorizer()
        user_tfidf_matrix = user_vectorizer.fit_transform(user_chunks)
        
        query_vec = user_vectorizer.transform([question])
        similarities = cosine_similarity(query_vec, user_tfidf_matrix).flatten()
        
        # Find top k matches
        k = min(5, len(user_chunks))
        top_k_indices = np.argsort(similarities)[::-1][:k]
        
        # Retrieve mapped context chunks
        context_chunks = [user_chunks[i] for i in top_k_indices]
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
