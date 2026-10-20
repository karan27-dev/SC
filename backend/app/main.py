from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import Base, SessionLocal, engine
from .routers import analytics, auth, model, predict, students
from .seed import ensure_model, seed


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(engine)
    ensure_model()
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(
    title="Student Performance Predictor API",
    version="1.0.0",
    description="Early-warning system for student outcomes, built on the UCI Student Performance dataset.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, students.router, predict.router, model.router, analytics.router):
    app.include_router(r)


@app.get("/api/health", tags=["meta"])
def health():
    from .ml import predictor
    b = predictor.load()
    return {"status": "ok", "model_loaded": b is not None, "trained_at": b["trained_at"] if b else None}
