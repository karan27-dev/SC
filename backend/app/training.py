"""Background training manager — runs the pipeline in a thread and keeps a
live log the frontend polls to show what is happening behind the scenes."""
import threading
import time
from datetime import datetime, timezone

from .database import SessionLocal
from .ml import pipeline, predictor
from .models import Student, TrainingRun

_state = {"running": False, "progress": 0.0, "stage": "idle", "logs": [], "started_at": None,
          "finished_at": None, "error": None, "run_id": None}
_lock = threading.Lock()


def state() -> dict:
    with _lock:
        return {**_state, "logs": list(_state["logs"])}


def _log(stage: str, msg: str, pct: float):
    with _lock:
        _state["stage"] = stage
        _state["progress"] = round(pct, 1)
        _state["logs"].append({"t": round(time.time() - _state["_t0"], 2), "stage": stage, "message": msg,
                               "progress": round(pct, 1)})


def rescore_students(db) -> int:
    students = db.query(Student).all()
    for s in students:
        r = predictor.predict(s.features, with_details=False)
        s.predicted_grade, s.pass_probability = r["predicted_grade"], r["pass_probability"]
        s.risk, s.mode = r["risk"], r["mode"]
    db.commit()
    return len(students)


def _run(user_id):
    db = SessionLocal()
    run = TrainingRun(triggered_by=user_id, status="running")
    db.add(run)
    db.commit()
    with _lock:
        _state["run_id"] = run.id
    try:
        report = pipeline.run_pipeline(_log)
        predictor.load(force=True)
        n = rescore_students(db)
        _log("done", f"re-scored {n} students with the new models", 100)
        run.status = "succeeded"
        run.duration_ms = report["duration_ms"]
        run.early_auc = next(s for s in report["steps"] if s["key"] == "evaluate")["details"]["early"]["auc"]
        run.full_auc = next(s for s in report["steps"] if s["key"] == "evaluate")["details"]["full"]["auc"]
    except Exception as e:  # surface the failure in the UI instead of dying silently
        run.status = "failed"
        with _lock:
            _state["error"] = str(e)
        _log("error", f"training failed: {e}", _state["progress"])
    finally:
        db.commit()
        db.close()
        with _lock:
            _state["running"] = False
            _state["finished_at"] = datetime.now(timezone.utc).isoformat()


def start(user_id=None) -> bool:
    with _lock:
        if _state["running"]:
            return False
        _state.update(running=True, progress=0.0, stage="queued", logs=[], error=None,
                      started_at=datetime.now(timezone.utc).isoformat(), finished_at=None, _t0=time.time())
    threading.Thread(target=_run, args=(user_id,), daemon=True).start()
    return True
