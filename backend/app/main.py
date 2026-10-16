import os

from dotenv import load_dotenv
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.client_contacts import router as client_contacts_router
from app.api.companies import router as companies_router
from app.api.exports import router as exports_router
from app.api.forms import router as forms_router
from app.api.responses import router as responses_router
from app.core.database import get_db

load_dotenv()

app = FastAPI(title="Customer Feedback Platform")

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(client_contacts_router)
app.include_router(forms_router)
app.include_router(responses_router)
app.include_router(analytics_router)
app.include_router(exports_router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/test-db")
def test_db(db: Session = Depends(get_db)):
    return {"message": "DB connected successfully"}
