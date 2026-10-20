"""Bootstraps the database: demo admin account + the hold-out cohort.

The dashboard cohort is deliberately the 20% hold-out split — students the
models never saw during training — so predicted vs actual is an honest view.
"""
import random

import pandas as pd

from .config import DEMO_EMAIL, DEMO_PASSWORD
from .ml import pipeline, predictor
from .ml.features import FEATURES
from .models import Prediction, Student, User
from .security import hash_password

FIRST_F = ["Aanya", "Ananya", "Diya", "Ishita", "Kavya", "Meera", "Priya", "Riya", "Saanvi", "Sneha",
           "Pooja", "Neha", "Aditi", "Shreya", "Tanvi", "Nandini", "Anjali", "Divya", "Lakshmi", "Simran",
           "Fatima", "Harleen", "Gauri", "Pallavi", "Radhika"]
FIRST_M = ["Aarav", "Arjun", "Vihaan", "Aditya", "Rohan", "Karan", "Rahul", "Vikram", "Siddharth", "Ishaan",
           "Kabir", "Aryan", "Dev", "Nikhil", "Pranav", "Rajesh", "Sameer", "Varun", "Yash", "Harsh",
           "Imran", "Gurpreet", "Manish", "Abhishek", "Tejas"]
LAST = ["Sharma", "Verma", "Gupta", "Patel", "Singh", "Kumar", "Reddy", "Iyer", "Nair", "Menon",
        "Joshi", "Desai", "Mehta", "Shah", "Rao", "Chopra", "Kapoor", "Malhotra", "Bose", "Banerjee",
        "Mukherjee", "Das", "Pillai", "Kulkarni", "Jain", "Agarwal", "Khan", "Saxena", "Mishra", "Chauhan"]


def ensure_model():
    if predictor.load() is None:
        print("No trained model found — running the training pipeline (≈30s)…")
        pipeline.run_pipeline()
        predictor.load(force=True)


def seed(db):
    if not db.query(User).filter_by(email=DEMO_EMAIL).first():
        db.add(User(name="Admin", email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD), role="admin"))
        db.commit()
    if db.query(Student).count() > 0:
        return
    cohort = pd.read_csv(pipeline.ARTIFACT_DIR / "holdout_cohort.csv")
    rng = random.Random(7)
    raw_cols = [c for c in FEATURES if c not in ("G1", "G2")]
    for i, row in enumerate(cohort.to_dict("records"), start=1):
        # dashboard cohort uses the early-warning view (no period grades), the
        # realistic start-of-term scenario; G1/G2 can be added per student later
        feats = {c: row[c] for c in raw_cols}
        # source rows are Maths or Portuguese; spread them over the subjects of
        # the same group (the model only sees the group, so scores are unchanged)
        feats["subject"] = rng.choice(["maths", "science"] if row["subject"] == "math"
                                      else ["english", "hindi", "history"])
        feats = {k: (v.item() if hasattr(v, "item") else v) for k, v in feats.items()}
        first = rng.choice(FIRST_F if row["sex"] == "F" else FIRST_M)
        r = predictor.predict(feats, with_details=False)
        s = Student(code=f"STU-{i:04d}", name=f"{first} {rng.choice(LAST)}", subject=r["input"]["subject"],
                    features=r["input"], actual_grade=float(row["G3"]), predicted_grade=r["predicted_grade"],
                    pass_probability=r["pass_probability"], risk=r["risk"], mode=r["mode"], source="holdout")
        db.add(s)
        db.flush()
        db.add(Prediction(student_id=s.id, mode=r["mode"], predicted_grade=r["predicted_grade"],
                          pass_probability=r["pass_probability"], risk=r["risk"], payload={"seed": True}))
    db.commit()
    print(f"Seeded {len(cohort)} hold-out students.")
