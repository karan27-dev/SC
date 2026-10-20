"""Inference, explanation and intervention planning.

explain():   baseline-substitution attribution — each feature is swapped for the
             population baseline (median / mode) and the change in pass
             probability is recorded. Positive = the student's value helps.
interventions(): counterfactual search over *actionable* features only
             (study time, absences, going out, alcohol, support...). Each
             candidate change is re-scored by the model, so the uplift shown
             to the teacher is what the model actually predicts.
"""
from __future__ import annotations

import threading
from pathlib import Path

import joblib
import pandas as pd

from .features import (
    BINARY_COLS, FEATURES, GRADE_COLS, GROUP_LABELS, SUBJECT_ALIASES, SUBJECT_GROUP, SUBJECTS,
    grade_band, risk_tier,
)
from .pipeline import ARTIFACT_DIR, feature_columns

_lock = threading.Lock()
_bundle: dict | None = None


def load(force: bool = False) -> dict | None:
    global _bundle
    with _lock:
        if _bundle is None or force:
            path = Path(ARTIFACT_DIR) / "models.joblib"
            _bundle = joblib.load(path) if path.exists() else None
        return _bundle


def normalise(raw: dict) -> dict:
    """Fill defaults and coerce types so any partial payload is scorable."""
    if "gender" in raw and "sex" not in raw:  # accept the friendlier column name
        raw = {**raw, "sex": raw["gender"]}
    out = {}
    for key, meta in FEATURES.items():
        v = raw.get(key, meta.get("default"))
        if key in BINARY_COLS:
            v = "yes" if v in (True, 1, "yes", "true", "1") else "no"
        elif meta["type"] == "range" and v is not None and v != "":
            v = float(v) if key in GRADE_COLS else int(v)
        elif v == "":
            v = None
        out[key] = v
    subj = str(out["subject"]).strip().lower()
    subj = SUBJECT_ALIASES.get(subj, subj)
    if subj not in SUBJECTS:
        raise ValueError(f"unknown subject '{out['subject']}' (expected one of {', '.join(SUBJECTS)})")
    out["subject"] = subj
    out["sex"] = {"female": "F", "f": "F", "male": "M", "m": "M"}.get(str(out["sex"]).strip().lower(), out["sex"])
    if out["sex"] not in ("F", "M"):
        raise ValueError(f"unknown gender '{out['sex']}' (expected Female or Male)")
    return out


def _mode_for(x: dict) -> str:
    return "full" if all(x.get(g) is not None for g in GRADE_COLS) else "early"


def _score(bundle, mode, rows: list[dict]):
    cols = feature_columns(mode)
    df = pd.DataFrame(rows)[cols]
    p_fail = bundle[mode]["classifier"].predict_proba(df)[:, 1]
    grade = bundle[mode]["regressor"].predict(df).clip(0, 20)
    return p_fail, grade


def explain(bundle, mode, x: dict, p_pass: float) -> list[dict]:
    cols = feature_columns(mode)
    base = bundle["baseline"]
    variants, keys = [], []
    for c in cols:
        if x[c] == base[c]:
            continue
        if c == "subject" and SUBJECT_GROUP[x[c]] == SUBJECT_GROUP[base[c]]:
            continue  # same group → identical to the model
        variants.append({**x, c: base[c]})
        keys.append(c)
    if not variants:
        return []
    p_fail_v, grade_v = _score(bundle, mode, variants)
    _, grade_x = _score(bundle, mode, [x])
    contribs = []
    for c, pf, gv in zip(keys, p_fail_v, grade_v):
        impact = p_pass - (1 - float(pf))
        contribs.append({
            "feature": c, "label": FEATURES[c]["label"], "group": FEATURES[c]["group"],
            "value": x[c], "baseline": base[c],
            "impact": round(impact, 4),
            "grade_impact": round(float(grade_x[0] - gv), 3),
        })
    contribs.sort(key=lambda r: abs(r["impact"]), reverse=True)
    return contribs


# candidate changes per actionable feature: (description, transform)
def _candidates(x: dict):
    c = []
    if x["studytime"] < 4:
        c.append(("studytime", x["studytime"] + 1,
                  f"Increase weekly study time to {FEATURES['studytime']['scale'][x['studytime']]}",
                  "Structured study plan with a weekly check-in"))
    if x["absences"] > 2:
        target = max(0, x["absences"] // 2)
        c.append(("absences", target, f"Cut absences from {x['absences']} to {target}",
                  "Attendance contract and parent notification on each absence"))
    if x["goout"] > 2:
        c.append(("goout", x["goout"] - 1, "Reduce going out by one level",
                  "Mentoring conversation about balancing social time"))
    if x["Dalc"] > 1 or x["Walc"] > 2:
        c.append(("_alcohol", None, "Lower alcohol consumption",
                  "Refer to school counsellor / wellbeing programme"))
    if x["schoolsup"] == "no":
        c.append(("schoolsup", "yes", "Enrol in extra school support",
                  "Assign to the school's tutoring programme"))
    if x["famsup"] == "no":
        c.append(("famsup", "yes", "Engage family educational support",
                  "Parent-teacher meeting with a home study plan"))
    if x["higher"] == "no":
        c.append(("higher", "yes", "Build motivation for higher education",
                  "Career guidance session / university visit"))
    if x["internet"] == "no":
        c.append(("internet", "yes", "Provide internet access",
                  "Library / device-loan programme"))
    if x["paid"] == "no":
        c.append(("paid", "yes", "Add extra classes in the subject",
                  "Subsidised extra classes"))
    return c


def interventions(bundle, mode, x: dict, p_pass: float, grade: float) -> list[dict]:
    cands = _candidates(x)
    if not cands:
        return []
    variants = []
    for feat, val, *_ in cands:
        if feat == "_alcohol":
            variants.append({**x, "Dalc": 1, "Walc": min(x["Walc"], 2)})
        else:
            variants.append({**x, feat: val})
    p_fail_v, grade_v = _score(bundle, mode, variants)
    out = []
    for (feat, _val, action, programme), pf, g in zip(cands, p_fail_v, grade_v):
        uplift = (1 - float(pf)) - p_pass
        out.append({
            "feature": feat.lstrip("_"), "action": action, "programme": programme,
            "pass_uplift": round(uplift, 4), "grade_uplift": round(float(g) - grade, 2),
            "new_pass_probability": round(1 - float(pf), 4),
        })
    out.sort(key=lambda r: r["pass_uplift"], reverse=True)
    # combined plan: greedily stack interventions, keeping each one only if the
    # model says it still helps on top of the ones already chosen (the models
    # are non-additive, so a naive "apply everything" can backfire)
    lookup = {c[2]: c for c in cands}
    combo, best_p, best_g, chosen = dict(x), p_pass, grade, []
    for r in out:
        if r["pass_uplift"] <= 0:
            continue
        feat, val, *_ = lookup[r["action"]]
        trial = {**combo, **({"Dalc": 1, "Walc": min(x["Walc"], 2)} if feat == "_alcohol" else {feat: val})}
        pf, g = _score(bundle, mode, [trial])
        if 1 - float(pf[0]) > best_p:
            combo, best_p, best_g = trial, 1 - float(pf[0]), float(g[0])
            chosen.append(r["action"])
    if len(chosen) > 1:
        out.insert(0, {
            "feature": "plan", "action": f"Combined plan ({len(chosen)} actions)",
            "programme": " + ".join(chosen),
            "pass_uplift": round(best_p - p_pass, 4), "grade_uplift": round(best_g - grade, 2),
            "new_pass_probability": round(best_p, 4), "combined": True, "steps": chosen,
        })
    return out


def predict(raw: dict, with_details: bool = True) -> dict:
    bundle = load()
    if bundle is None:
        raise RuntimeError("Model not trained yet")
    x = normalise(raw)
    mode = _mode_for(x)
    p_fail, grade = _score(bundle, mode, [x])
    p_fail, grade = float(p_fail[0]), float(grade[0])
    p_pass = 1 - p_fail
    result = {
        "mode": mode,
        "pass_probability": round(p_pass, 4),
        "fail_probability": round(p_fail, 4),
        "predicted_grade": round(grade, 2),
        "grade_band": grade_band(grade),
        "risk": risk_tier(p_fail),
        "verdict": "pass" if p_pass >= 0.5 else "fail",
        "subject_group": GROUP_LABELS[SUBJECT_GROUP[x["subject"]]],
        "model": {
            "classifier": type(bundle[mode]["classifier"].named_steps["model"]).__name__,
            "regressor": type(bundle[mode]["regressor"].named_steps["model"]).__name__,
            "trained_at": bundle["trained_at"],
        },
        "input": x,
    }
    if with_details:
        result["explanation"] = explain(bundle, mode, x, p_pass)
        result["interventions"] = interventions(bundle, mode, x, p_pass, grade)
    return result


def predict_many(rows: list[dict]) -> list[dict]:
    return [predict(r, with_details=False) for r in rows]
