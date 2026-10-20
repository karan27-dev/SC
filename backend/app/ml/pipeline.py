"""End-to-end training pipeline.

Stages (each one is timed and logged so the frontend can replay the run):
  1. ingest      - load both UCI course files and tag the subject
  2. validate    - schema, missing values, duplicates, data quirks
  3. explore     - correlations and pass-rate breakdowns (EDA)
  4. engineer    - derived features (parent education, alcohol index, ...)
  5. split       - stratified 80/20 hold-out split
  6. train       - 5-fold CV over candidate models, two feature regimes
  7. evaluate    - hold-out metrics, confusion matrix, ROC, permutation importance
  8. deploy      - persist artefacts + report

Two feature regimes are trained:
  * early - demographic/behavioural only, usable on day one of the term
  * full  - additionally uses period grades G1/G2 (much stronger, but only
            available mid-year)
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingClassifier, GradientBoostingRegressor,
    RandomForestClassifier, RandomForestRegressor,
)
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score, confusion_matrix, f1_score, mean_absolute_error,
    precision_score, r2_score, recall_score, roc_auc_score, roc_curve,
    root_mean_squared_error,
)
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

from .features import (
    BINARY_COLS, ENGINEERED_COLS, FEATURES, GRADE_COLS, GROUP_REPRESENTATIVE,
    NOMINAL_COLS, ORDINAL_COLS, PASS_MARK, SUBJECT_GROUP, TARGET, TREND_COLS,
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
ARTIFACT_DIR = Path(__file__).resolve().parents[2] / "artifacts"
SEED = 42

Logger = Callable[[str, str, float], None]


# --------------------------------------------------------------------------- #
# Feature engineering (module-level so the fitted pipelines can be pickled)
# --------------------------------------------------------------------------- #
def _to_bin(s: pd.Series) -> pd.Series:
    return s.map(lambda v: 1 if v in (True, 1, "yes", "1", "true") else 0).astype(int)


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in BINARY_COLS:
        out[c] = _to_bin(out[c])
    out["parent_edu"] = out["Medu"] + out["Fedu"]
    # weekday drinking weighs 5/7, weekend 2/7
    out["alcohol_index"] = (5 * out["Dalc"] + 2 * out["Walc"]) / 7
    out["social_score"] = out["goout"] + out["freetime"]
    out["support_score"] = out["schoolsup"] + out["famsup"] + out["paid"]
    out["has_failures"] = (out["failures"] > 0).astype(int)
    out["log_absences"] = np.log1p(out["absences"])
    out["subject_group"] = out["subject"].map(lambda v: SUBJECT_GROUP.get(str(v).lower(), "languages"))
    if "G1" in out and "G2" in out:
        out["grade_trend"] = out["G2"] - out["G1"]
        out["grade_mean"] = (out["G1"] + out["G2"]) / 2
    return out


def feature_columns(mode: str) -> list[str]:
    cols = NOMINAL_COLS + BINARY_COLS + ORDINAL_COLS
    return cols + GRADE_COLS if mode == "full" else cols


# the model sees the subject group, never the individual subject
MODEL_NOMINAL_COLS = ["subject_group" if c == "subject" else c for c in NOMINAL_COLS]


def _preprocessor(mode: str) -> ColumnTransformer:
    numeric = BINARY_COLS + ORDINAL_COLS + ENGINEERED_COLS
    if mode == "full":
        numeric = numeric + GRADE_COLS + TREND_COLS
    return ColumnTransformer([
        ("nominal", OneHotEncoder(handle_unknown="ignore"), MODEL_NOMINAL_COLS),
        ("numeric", StandardScaler(), numeric),
    ])


def _wrap(mode: str, estimator) -> Pipeline:
    return Pipeline([
        ("engineer", FunctionTransformer(engineer)),
        ("preprocess", _preprocessor(mode)),
        ("model", estimator),
    ])


def candidate_classifiers():
    return {
        "Logistic Regression": LogisticRegression(max_iter=2000, class_weight="balanced", C=0.5),
        "Random Forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=3,
                                                class_weight="balanced", random_state=SEED, n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(n_estimators=200, learning_rate=0.05,
                                                        max_depth=3, subsample=0.9, random_state=SEED),
    }


def candidate_regressors():
    return {
        "Ridge Regression": Ridge(alpha=3.0),
        "Random Forest": RandomForestRegressor(n_estimators=300, min_samples_leaf=3,
                                               random_state=SEED, n_jobs=-1),
        "Gradient Boosting": GradientBoostingRegressor(n_estimators=250, learning_rate=0.05,
                                                       max_depth=3, subsample=0.9, random_state=SEED),
    }


# --------------------------------------------------------------------------- #
# Stages
# --------------------------------------------------------------------------- #
def load_dataset() -> pd.DataFrame:
    frames = []
    for fname, subject in (("student-mat.csv", "math"), ("student-por.csv", "portuguese")):
        df = pd.read_csv(DATA_DIR / fname, sep=";")
        df["subject"] = subject
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def _eda(df: pd.DataFrame) -> dict:
    eng = engineer(df)
    numeric = BINARY_COLS + ORDINAL_COLS + ENGINEERED_COLS + GRADE_COLS
    corr = eng[numeric + [TARGET]].corr(numeric_only=True)[TARGET].drop(TARGET)
    correlations = [
        {"feature": k, "label": FEATURES.get(k, {}).get("label", k.replace("_", " ")), "r": round(float(v), 3)}
        for k, v in corr.sort_values(key=abs, ascending=False).items()
    ]

    def pass_rate_by(col, bins=None, labels=None):
        s = eng[col] if bins is None else pd.cut(eng[col], bins=bins, labels=labels, include_lowest=True)
        g = eng.assign(_k=s).groupby("_k", observed=True)
        return [
            {"bucket": str(k), "pass_rate": round(float((grp[TARGET] >= PASS_MARK).mean()), 3),
             "avg_grade": round(float(grp[TARGET].mean()), 2), "n": int(len(grp))}
            for k, grp in g
        ]

    hist = np.bincount(df[TARGET].astype(int), minlength=21)
    return {
        "correlations": correlations,
        "grade_histogram": [{"grade": i, "count": int(c)} for i, c in enumerate(hist)],
        "breakdowns": {
            "studytime": pass_rate_by("studytime"),
            "failures": pass_rate_by("failures"),
            "higher": pass_rate_by("higher"),
            "alcohol": pass_rate_by("Walc"),
            "goout": pass_rate_by("goout"),
            "absences": pass_rate_by("absences", bins=[-1, 0, 5, 10, 20, 100],
                                     labels=["0", "1-5", "6-10", "11-20", "20+"]),
            "parent_edu": pass_rate_by("parent_edu", bins=[-1, 2, 4, 6, 8], labels=["0-2", "3-4", "5-6", "7-8"]),
            "subject_group": pass_rate_by("subject_group"),
        },
    }


def _downsample_roc(y, p, n=40):
    fpr, tpr, _ = roc_curve(y, p)
    idx = np.unique(np.linspace(0, len(fpr) - 1, min(n, len(fpr))).astype(int))
    return [{"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)} for i in idx]


def _train_mode(mode, X_tr, X_te, yc_tr, yc_te, yr_tr, yr_te, log: Logger, base_pct, span):
    cols = feature_columns(mode)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    tag = "EARLY" if mode == "early" else "FULL"

    clf_board, fitted_clf = [], {}
    cands = candidate_classifiers()
    for i, (name, est) in enumerate(cands.items()):
        log("train", f"[{tag}] classifier · {name}: 5-fold CV", base_pct + span * 0.5 * i / len(cands))
        pipe = _wrap(mode, est)
        cvr = cross_validate(pipe, X_tr[cols], yc_tr, cv=cv, scoring=["roc_auc", "f1", "accuracy"])
        pipe.fit(X_tr[cols], yc_tr)
        p = pipe.predict_proba(X_te[cols])[:, 1]
        yhat = (p >= 0.5).astype(int)
        row = {
            "name": name,
            "cv_auc": round(float(cvr["test_roc_auc"].mean()), 4),
            "cv_auc_std": round(float(cvr["test_roc_auc"].std()), 4),
            "cv_f1": round(float(cvr["test_f1"].mean()), 4),
            "cv_accuracy": round(float(cvr["test_accuracy"].mean()), 4),
            "test_auc": round(float(roc_auc_score(yc_te, p)), 4),
            "test_accuracy": round(float(accuracy_score(yc_te, yhat)), 4),
            "test_f1": round(float(f1_score(yc_te, yhat)), 4),
            "test_precision": round(float(precision_score(yc_te, yhat, zero_division=0)), 4),
            "test_recall": round(float(recall_score(yc_te, yhat)), 4),
        }
        clf_board.append(row)
        fitted_clf[name] = (pipe, p)
        log("train", f"[{tag}] {name}: CV AUC {row['cv_auc']:.3f} ± {row['cv_auc_std']:.3f}, "
                     f"hold-out AUC {row['test_auc']:.3f}", base_pct + span * 0.5 * (i + 1) / len(cands))

    reg_board, fitted_reg = [], {}
    rcands = candidate_regressors()
    for i, (name, est) in enumerate(rcands.items()):
        log("train", f"[{tag}] regressor · {name}: 5-fold CV", base_pct + span * (0.5 + 0.4 * i / len(rcands)))
        pipe = _wrap(mode, est)
        cvr = cross_validate(pipe, X_tr[cols], yr_tr, cv=5,
                             scoring=["neg_root_mean_squared_error", "r2"])
        pipe.fit(X_tr[cols], yr_tr)
        pr = np.clip(pipe.predict(X_te[cols]), 0, 20)
        row = {
            "name": name,
            "cv_rmse": round(float(-cvr["test_neg_root_mean_squared_error"].mean()), 3),
            "cv_r2": round(float(cvr["test_r2"].mean()), 3),
            "test_rmse": round(float(root_mean_squared_error(yr_te, pr)), 3),
            "test_mae": round(float(mean_absolute_error(yr_te, pr)), 3),
            "test_r2": round(float(r2_score(yr_te, pr)), 3),
        }
        reg_board.append(row)
        fitted_reg[name] = (pipe, pr)
        log("train", f"[{tag}] {name}: CV RMSE {row['cv_rmse']:.2f}, R² {row['cv_r2']:.2f}",
            base_pct + span * (0.5 + 0.4 * (i + 1) / len(rcands)))

    best_clf = max(clf_board, key=lambda r: r["cv_auc"])["name"]
    best_reg = min(reg_board, key=lambda r: r["cv_rmse"])["name"]
    log("evaluate", f"[{tag}] selected {best_clf} (classifier) and {best_reg} (regressor) by CV score",
        base_pct + span * 0.92)

    clf, p_te = fitted_clf[best_clf]
    reg, r_te = fitted_reg[best_reg]
    cm = confusion_matrix(yc_te, (p_te >= 0.5).astype(int)).tolist()

    log("evaluate", f"[{tag}] permutation importance on hold-out set (10 repeats)", base_pct + span * 0.95)
    pi = permutation_importance(clf, X_te[cols], yc_te, scoring="roc_auc", n_repeats=10,
                                random_state=SEED, n_jobs=-1)
    importance = sorted(
        [{"feature": c, "label": FEATURES[c]["label"], "importance": round(float(m), 4),
          "std": round(float(s), 4)}
         for c, m, s in zip(cols, pi.importances_mean, pi.importances_std)],
        key=lambda r: r["importance"], reverse=True,
    )

    return {
        "classifier": clf,
        "regressor": reg,
        "test_fail_prob": p_te,
        "test_grade": r_te,
        "report": {
            "mode": mode,
            "features_used": len(cols),
            "classification": {"leaderboard": clf_board, "selected": best_clf,
                               "confusion_matrix": cm, "labels": ["pass", "fail"],
                               "roc": _downsample_roc(yc_te, p_te)},
            "regression": {"leaderboard": reg_board, "selected": best_reg,
                           "residuals": [{"actual": int(a), "predicted": round(float(b), 2)}
                                         for a, b in zip(yr_te, r_te)]},
            "importance": importance,
        },
    }


def run_pipeline(log: Logger | None = None) -> dict:
    log = log or (lambda stage, msg, pct: print(f"[{pct:5.1f}%] {stage:9s} {msg}"))
    ARTIFACT_DIR.mkdir(exist_ok=True)
    steps, started = [], time.perf_counter()

    def step(key, title, fn):
        t0 = time.perf_counter()
        result, details = fn()
        steps.append({"key": key, "title": title, "duration_ms": round((time.perf_counter() - t0) * 1000),
                      "details": details})
        return result

    # 1. ingest ------------------------------------------------------------- #
    def _ingest():
        log("ingest", "reading student-mat.csv and student-por.csv (UCI id 320)", 2)
        df = load_dataset()
        log("ingest", f"loaded {len(df)} records × {df.shape[1]} columns", 5)
        log("ingest", "subject groups: maths → STEM (Maths, Science); portuguese → "
                      "languages & humanities (English, Hindi, History)", 6)
        return df, {"rows": len(df), "columns": int(df.shape[1]),
                    "by_subject": df["subject"].value_counts().to_dict(),
                    "subject_mapping": {"stem": ["maths", "science"], "languages": ["english", "hindi", "history"]},
                    "source": "UCI Machine Learning Repository — Student Performance (Cortez & Silva, 2008)"}
    df = step("ingest", "Data ingestion", _ingest)

    # 2. validate ----------------------------------------------------------- #
    def _validate():
        missing = int(df.isna().sum().sum())
        dupes = int(df.duplicated().sum())
        zero_g3 = int((df[TARGET] == 0).sum())
        for c in GRADE_COLS + [TARGET]:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        log("validate", f"{missing} missing values, {dupes} exact duplicates", 9)
        dropouts = df[TARGET] == 0
        zero_abs = float((df.loc[dropouts, "absences"] == 0).mean()) if zero_g3 else 0.0
        log("validate", f"{zero_g3} students have G3 = 0 — they dropped out before the final exam", 10)
        log("validate", f"{zero_abs:.0%} of them have absences recorded as 0 (vs "
                        f"{(df.loc[~dropouts, 'absences'] == 0).mean():.0%} of everyone else): a recording "
                        "artefact that would teach the model 'zero absences ⇒ fail'. Excluding them.", 12)
        out_of_range = {c: int((~df[c].between(FEATURES[c]["min"], FEATURES[c]["max"])).sum())
                        for c in ORDINAL_COLS if FEATURES[c]["type"] == "range"}
        clean = df.loc[~dropouts].reset_index(drop=True)
        log("validate", f"{len(clean)} records remain after cleaning", 13)
        return clean, {"missing_values": missing, "duplicates": dupes, "zero_final_grade": zero_g3,
                       "dropouts_zero_absence_share": round(zero_abs, 3), "excluded": zero_g3,
                       "rows_after_cleaning": len(clean), "out_of_range_values": sum(out_of_range.values()),
                       "pass_rate": round(float((clean[TARGET] >= PASS_MARK).mean()), 3)}
    df = step("validate", "Validation & cleaning", _validate)

    # 3. explore ------------------------------------------------------------ #
    def _explore():
        log("explore", "computing correlations and pass-rate breakdowns", 14)
        eda = _eda(df)
        top = eda["correlations"][:3]
        log("explore", "strongest linear signals: " + ", ".join(f"{c['feature']} (r={c['r']})" for c in top), 17)
        return eda, {"top_correlations": top}
    eda = step("explore", "Exploratory analysis", _explore)

    # 4. engineer ----------------------------------------------------------- #
    def _engineer():
        log("engineer", "deriving parent_edu, alcohol_index, social_score, support_score, "
                        "has_failures, log_absences, grade_trend, grade_mean", 20)
        return None, {"derived": ENGINEERED_COLS + TREND_COLS,
                      "encoding": "one-hot for 10 nominal columns, z-score scaling for numeric",
                      "raw_inputs": len(feature_columns("full"))}
    step("engineer", "Feature engineering", _engineer)

    # 5. split -------------------------------------------------------------- #
    def _split():
        y_fail = (df[TARGET] < PASS_MARK).astype(int)
        strat = y_fail.astype(str) + "_" + df["subject"]
        idx_tr, idx_te = train_test_split(df.index, test_size=0.2, random_state=SEED, stratify=strat)
        log("split", f"stratified split → {len(idx_tr)} train / {len(idx_te)} hold-out "
                     f"(stratified on outcome × subject)", 23)
        return (idx_tr, idx_te, y_fail), {"train": len(idx_tr), "test": len(idx_te),
                                          "fail_rate_train": round(float(y_fail[idx_tr].mean()), 3),
                                          "fail_rate_test": round(float(y_fail[idx_te].mean()), 3)}
    idx_tr, idx_te, y_fail = step("split", "Train / test split", _split)

    X_tr, X_te = df.loc[idx_tr], df.loc[idx_te]
    yc_tr, yc_te = y_fail[idx_tr].values, y_fail[idx_te].values
    yr_tr, yr_te = df.loc[idx_tr, TARGET].values, df.loc[idx_te, TARGET].values

    # 6 + 7. train & evaluate ---------------------------------------------- #
    results = {}

    def _train():
        results["early"] = _train_mode("early", X_tr, X_te, yc_tr, yc_te, yr_tr, yr_te, log, 25, 35)
        results["full"] = _train_mode("full", X_tr, X_te, yc_tr, yc_te, yr_tr, yr_te, log, 60, 33)
        return None, {
            m: {"classifier": results[m]["report"]["classification"]["selected"],
                "regressor": results[m]["report"]["regression"]["selected"]}
            for m in results
        }
    step("train", "Model training (5-fold CV)", _train)

    def _evaluate():
        out = {}
        for m, r in results.items():
            sel = r["report"]["classification"]["selected"]
            row = next(x for x in r["report"]["classification"]["leaderboard"] if x["name"] == sel)
            rsel = r["report"]["regression"]["selected"]
            rrow = next(x for x in r["report"]["regression"]["leaderboard"] if x["name"] == rsel)
            out[m] = {"auc": row["test_auc"], "accuracy": row["test_accuracy"],
                      "recall": row["test_recall"], "rmse": rrow["test_rmse"], "r2": rrow["test_r2"]}
        log("evaluate", f"hold-out: early AUC {out['early']['auc']:.3f} / full AUC {out['full']['auc']:.3f}", 95)
        return None, out
    step("evaluate", "Hold-out evaluation", _evaluate)

    # 8. deploy ------------------------------------------------------------- #
    def _deploy():
        raw_cols = feature_columns("full")
        baseline = {}
        for c in raw_cols:
            s = df[c]
            if c == "subject":
                baseline[c] = GROUP_REPRESENTATIVE[SUBJECT_GROUP[s.mode().iloc[0]]]
            elif c in NOMINAL_COLS or c in BINARY_COLS:
                baseline[c] = s.mode().iloc[0]
            else:
                baseline[c] = float(s.median())
        bundle = {
            "early": {"classifier": results["early"]["classifier"], "regressor": results["early"]["regressor"]},
            "full": {"classifier": results["full"]["classifier"], "regressor": results["full"]["regressor"]},
            "baseline": baseline,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
        joblib.dump(bundle, ARTIFACT_DIR / "models.joblib")
        cohort = df.loc[idx_te].copy()
        cohort["_fail_prob"] = results["early"]["test_fail_prob"]
        cohort.to_csv(ARTIFACT_DIR / "holdout_cohort.csv", index=False)
        log("deploy", "artefacts written: models.joblib, report.json, holdout_cohort.csv", 99)
        return None, {"artifacts": ["models.joblib", "report.json", "holdout_cohort.csv"]}
    step("deploy", "Persist & deploy", _deploy)

    report = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "duration_ms": round((time.perf_counter() - started) * 1000),
        "steps": steps,
        "eda": eda,
        "models": {m: r["report"] for m, r in results.items()},
    }
    (ARTIFACT_DIR / "report.json").write_text(json.dumps(report, indent=2, default=str))
    log("done", f"pipeline finished in {report['duration_ms'] / 1000:.1f}s", 100)
    return report


if __name__ == "__main__":
    # re-import under the package name so pickled pipelines reference
    # app.ml.pipeline.engineer rather than __main__.engineer
    from app.ml.pipeline import run_pipeline as _run
    _run()
