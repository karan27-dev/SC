import io

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..ml import predictor
from ..ml.features import FEATURES
from ..models import Prediction, Student, User
from ..schemas import StudentDetail, StudentIn, StudentOut
from ..security import current_user

router = APIRouter(prefix="/api/students", tags=["students"])


def _next_code(db) -> str:
    last = db.query(Student).order_by(Student.id.desc()).first()
    return f"STU-{(last.id if last else 0) + 1:04d}"


def _score(features):
    try:
        return predictor.predict(features, with_details=False)
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


def _create(db, user, name, features, actual=None, source="manual") -> Student:
    r = _score(features)
    s = Student(code=_next_code(db), name=name, subject=r["input"]["subject"], features=r["input"],
                actual_grade=actual, predicted_grade=r["predicted_grade"], pass_probability=r["pass_probability"],
                risk=r["risk"], mode=r["mode"], source=source, created_by=user.id)
    db.add(s)
    db.flush()
    db.add(Prediction(student_id=s.id, user_id=user.id, mode=r["mode"], predicted_grade=r["predicted_grade"],
                      pass_probability=r["pass_probability"], risk=r["risk"], payload={"source": source}))
    return s


@router.get("")
def list_students(q: str = "", risk: str | None = None, subject: str | None = None,
                  sort: str = "risk", page: int = Query(1, ge=1), size: int = Query(25, ge=1, le=200),
                  db: Session = Depends(get_db), _: User = Depends(current_user)):
    query = db.query(Student)
    if q:
        query = query.filter(or_(Student.name.ilike(f"%{q}%"), Student.code.ilike(f"%{q}%")))
    if risk:
        query = query.filter(Student.risk == risk)
    if subject:
        query = query.filter(Student.subject == subject)
    order = {
        "risk": Student.pass_probability.asc(),
        "grade": Student.predicted_grade.desc(),
        "name": Student.name.asc(),
        "recent": Student.created_at.desc(),
    }.get(sort, Student.pass_probability.asc())
    total = query.count()
    items = query.order_by(order).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size,
            "items": [StudentOut.model_validate(s).model_dump() for s in items]}


@router.post("", response_model=StudentDetail, status_code=201)
def create_student(body: StudentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = _create(db, user, body.name, body.features, body.actual_grade)
    db.commit()
    return s


@router.post("/upload")
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    """CSV with the UCI column names (comma or semicolon separated). Optional `name` and `G3` columns."""
    raw = (await file.read()).decode("utf-8-sig")
    try:
        df = pd.read_csv(io.StringIO(raw), sep=None, engine="python")
    except Exception as e:
        raise HTTPException(400, f"Could not parse CSV: {e}")
    missing = [c for c in FEATURES if c not in df.columns and FEATURES[c].get("default") is None
               and not FEATURES[c].get("optional")]
    if missing:
        raise HTTPException(400, f"Missing columns: {', '.join(missing)}")
    created = []
    for i, row in enumerate(df.to_dict("records")):
        row = {k: (None if pd.isna(v) else v) for k, v in row.items()}
        name = row.pop("name", None) or f"Imported student {i + 1}"
        actual = row.pop("G3", None)
        try:
            created.append(_create(db, user, name, row, actual, source="upload"))
        except HTTPException as e:
            db.rollback()
            raise HTTPException(400, f"Row {i + 2}: {e.detail}")
    db.commit()
    return {"created": len(created), "high_risk": sum(s.risk == "high" for s in created)}


@router.get("/{sid}")
def get_student(sid: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    s = db.get(Student, sid)
    if not s:
        raise HTTPException(404, "Student not found")
    live = predictor.predict(s.features)
    history = [{"id": p.id, "mode": p.mode, "predicted_grade": p.predicted_grade,
                "pass_probability": p.pass_probability, "risk": p.risk, "created_at": p.created_at}
               for p in sorted(s.predictions, key=lambda p: p.created_at)]
    return {"student": StudentDetail.model_validate(s).model_dump(), "prediction": live, "history": history}


@router.patch("/{sid}", response_model=StudentDetail)
def update_student(sid: int, body: StudentIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    s = db.get(Student, sid)
    if not s:
        raise HTTPException(404, "Student not found")
    r = _score({**s.features, **body.features})
    s.name, s.features, s.subject = body.name, r["input"], r["input"]["subject"]
    if body.actual_grade is not None:
        s.actual_grade = body.actual_grade
    s.predicted_grade, s.pass_probability, s.risk, s.mode = (r["predicted_grade"], r["pass_probability"],
                                                              r["risk"], r["mode"])
    db.add(Prediction(student_id=s.id, user_id=user.id, mode=r["mode"], predicted_grade=r["predicted_grade"],
                      pass_probability=r["pass_probability"], risk=r["risk"], payload={"source": "update"}))
    db.commit()
    return s


@router.delete("/{sid}", status_code=204)
def delete_student(sid: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    s = db.get(Student, sid)
    if not s:
        raise HTTPException(404, "Student not found")
    db.delete(s)
    db.commit()
