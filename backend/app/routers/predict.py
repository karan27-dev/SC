from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..ml import predictor
from ..models import Prediction, Student, User
from ..schemas import PredictIn
from ..security import current_user

router = APIRouter(prefix="/api/predict", tags=["prediction"])


@router.post("")
def predict(body: PredictIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        r = predictor.predict(body.features)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, f"Invalid feature value: {e}")
    if body.save:
        if body.student_id is not None and not db.get(Student, body.student_id):
            raise HTTPException(404, "Student not found")
        db.add(Prediction(student_id=body.student_id, user_id=user.id, mode=r["mode"],
                          predicted_grade=r["predicted_grade"], pass_probability=r["pass_probability"],
                          risk=r["risk"], payload={"input": r["input"]}))
        db.commit()
    return r


@router.post("/simulate")
def simulate(body: PredictIn, _: User = Depends(current_user)):
    """What-if scoring: same as /predict but never persisted and without explanation (fast)."""
    try:
        return predictor.predict(body.features, with_details=False)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, f"Invalid feature value: {e}")


@router.get("/history")
def history(limit: int = 20, db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = (db.query(Prediction).filter(Prediction.user_id == user.id)
            .order_by(Prediction.created_at.desc()).limit(limit).all())
    return [{"id": p.id, "student_id": p.student_id, "student": p.student.name if p.student else None,
             "mode": p.mode, "predicted_grade": p.predicted_grade, "pass_probability": p.pass_probability,
             "risk": p.risk, "created_at": p.created_at} for p in rows]
