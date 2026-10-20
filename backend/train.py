"""CLI: python train.py — retrain all models and regenerate the report."""
from app.ml.pipeline import run_pipeline

if __name__ == "__main__":
    run_pipeline()
