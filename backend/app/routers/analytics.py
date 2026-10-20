from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..ml import predictor
from ..ml.features import GROUP_LABELS, SUBJECT_GROUP, SUBJECT_LABELS, SUBJECTS, grade_band
from ..models import Prediction, Student, User
from ..security import current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

RISK_FACTORS = [
    ("Past failures", lambda f: f["failures"] > 0),
    ("High absences (>10)", lambda f: f["absences"] > 10),
    ("Low study time (<2h)", lambda f: f["studytime"] == 1),
    ("Heavy weekend drinking", lambda f: f["Walc"] >= 4),
    ("No higher-ed plans", lambda f: f["higher"] == "no"),
    ("Goes out a lot", lambda f: f["goout"] >= 4),
    ("No internet at home", lambda f: f["internet"] == "no"),
]


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
    students = db.query(Student).all()
    n = len(students) or 1
    risk = Counter(s.risk for s in students)
    bands = Counter(grade_band(s.predicted_grade) for s in students if s.predicted_grade is not None)

    # honest accuracy on students whose real grade is known
    known = [s for s in students if s.actual_grade is not None and s.pass_probability is not None]
    correct = sum((s.pass_probability >= 0.5) == (s.actual_grade >= 10) for s in known)
    caught = [s for s in known if s.actual_grade < 10]

    def prevalence(group):
        g = [s for s in students if s.risk in group]
        return [{"factor": name, "share": round(sum(fn(s.features) for s in g) / (len(g) or 1), 3)}
                for name, fn in RISK_FACTORS]

    by_subject = []
    for subj, label in zip(SUBJECTS, SUBJECT_LABELS):
        g = [s for s in students if s.subject == subj]
        k = len(g) or 1
        by_subject.append({
            "subject": subj, "label": label, "group": GROUP_LABELS[SUBJECT_GROUP[subj]], "count": len(g),
            "avg_predicted": round(sum(s.predicted_grade for s in g) / k, 2),
            "avg_pass_probability": round(sum(s.pass_probability for s in g) / k, 3),
            "high_risk": sum(s.risk == "high" for s in g),
            "at_risk": sum(s.risk in ("high", "medium") for s in g),
        })

    watchlist = sorted(students, key=lambda s: s.pass_probability or 1)[:8]
    recent = db.query(Prediction).order_by(Prediction.created_at.desc()).limit(6).all()
    bundle = predictor.load()
    return {
        "totals": {
            "students": len(students),
            "high_risk": risk.get("high", 0),
            "medium_risk": risk.get("medium", 0),
            "low_risk": risk.get("low", 0),
            "avg_predicted_grade": round(sum(s.predicted_grade or 0 for s in students) / n, 2),
            "avg_pass_probability": round(sum(s.pass_probability or 0 for s in students) / n, 3),
            "predictions_made": db.query(Prediction).count(),
        },
        "validation": {
            "known_outcomes": len(known),
            "verdict_accuracy": round(correct / (len(known) or 1), 3),
            "fails_flagged": sum(s.risk in ("high", "medium") for s in caught),
            "fails_total": len(caught),
        },
        "risk_distribution": [{"risk": k, "count": risk.get(k, 0)} for k in ("low", "medium", "high")],
        "grade_bands": [{"band": b, "count": bands.get(b, 0)} for b in "ABCDF"],
        "risk_factor_prevalence": {"at_risk": prevalence({"high", "medium"}), "low_risk": prevalence({"low"})},
        "by_subject": by_subject,
        "scatter": [{"id": s.id, "name": s.name, "predicted": s.predicted_grade, "actual": s.actual_grade,
                     "risk": s.risk} for s in known],
        "watchlist": [{"id": s.id, "code": s.code, "name": s.name, "subject": s.subject,
                       "pass_probability": s.pass_probability, "predicted_grade": s.predicted_grade,
                       "risk": s.risk} for s in watchlist],
        "recent_predictions": [{"id": p.id, "student": p.student.name if p.student else "Ad-hoc prediction",
                                "risk": p.risk, "pass_probability": p.pass_probability,
                                "created_at": p.created_at} for p in recent],
        "model_trained_at": bundle["trained_at"] if bundle else None,
    }
