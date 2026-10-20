import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import training
from ..database import get_db
from ..ml.features import FEATURES, GROUPS
from ..ml.pipeline import ARTIFACT_DIR
from ..models import TrainingRun, User
from ..security import admin_user, current_user

router = APIRouter(prefix="/api/model", tags=["model"])


@router.get("/schema")
def schema():
    """Feature metadata that drives the frontend form (public, no auth)."""
    return {"groups": GROUPS, "features": FEATURES}


@router.get("/report")
def report(_: User = Depends(current_user)):
    path = ARTIFACT_DIR / "report.json"
    if not path.exists():
        raise HTTPException(404, "No training report yet")
    return json.loads(path.read_text())


@router.post("/retrain", status_code=202)
def retrain(user: User = Depends(admin_user)):
    if not training.start(user.id):
        raise HTTPException(409, "A training run is already in progress")
    return training.state()


@router.get("/status")
def status(_: User = Depends(current_user)):
    return training.state()


@router.get("/runs")
def runs(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.query(TrainingRun).order_by(TrainingRun.created_at.desc()).limit(20).all()
    return [{"id": r.id, "status": r.status, "duration_ms": r.duration_ms, "early_auc": r.early_auc,
             "full_auc": r.full_auc, "created_at": r.created_at} for r in rows]
