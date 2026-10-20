import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]

SECRET_KEY = os.getenv("SPP_SECRET_KEY", "change-me-in-production-0b6f1c2e9a")
ALGORITHM = "HS256"
TOKEN_TTL_MINUTES = int(os.getenv("SPP_TOKEN_TTL", "720"))
DATABASE_URL = os.getenv("SPP_DATABASE_URL", f"sqlite:///{BASE_DIR / 'spp.db'}")
CORS_ORIGINS = os.getenv("SPP_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5180").split(",")

DEMO_EMAIL = "admin@spp.edu"
DEMO_PASSWORD = "admin123"
