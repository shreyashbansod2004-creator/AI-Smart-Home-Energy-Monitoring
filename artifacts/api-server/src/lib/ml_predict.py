#!/usr/bin/env python3
"""
ML Prediction Script — called by Node.js via child_process.spawn.

Usage:
    python3 ml_predict.py \
        --model   /path/to/bill_prediction_model.pkl \
        --features /path/to/features.json \
        --input   '{"avg_daily_kwh": 8.4, "current_month_kwh": 126.7, ...}' \
        [--scaler  /path/to/scaler.pkl]

Output (stdout): JSON  { "prediction": <float> }
Exit code: 0 on success, 1 on failure (error goes to stderr).
"""

import sys
import json
import argparse
import pickle

def main():
    parser = argparse.ArgumentParser(description="Run sklearn bill prediction model")
    parser.add_argument("--model",    required=True, help="Path to bill_prediction_model.pkl")
    parser.add_argument("--features", required=True, help="Path to features.json")
    parser.add_argument("--input",    required=True, help="JSON string of feature values")
    parser.add_argument("--scaler",   default=None,  help="Path to scaler.pkl (optional)")
    args = parser.parse_args()

    # Load feature order from features.json
    with open(args.features, "r") as f:
        feature_config = json.load(f)

    # features.json format: list of feature names  OR  { "features": [...] }
    if isinstance(feature_config, list):
        feature_names = feature_config
    elif isinstance(feature_config, dict) and "features" in feature_config:
        feature_names = feature_config["features"]
    else:
        print(json.dumps({"error": "features.json must be a list or {features: [...]}"}))
        sys.exit(1)

    # Parse input feature values from Node.js
    input_values = json.loads(args.input)

    # Build feature vector in the correct order
    try:
        X = [[input_values[name] for name in feature_names]]
    except KeyError as e:
        print(f"Missing feature: {e}", file=sys.stderr)
        sys.exit(1)

    # Load and optionally apply scaler
    if args.scaler:
        with open(args.scaler, "rb") as f:
            scaler = pickle.load(f)
        X = scaler.transform(X)

    # Load model and predict
    with open(args.model, "rb") as f:
        model = pickle.load(f)

    prediction = float(model.predict(X)[0])
    print(json.dumps({"prediction": round(prediction, 2)}))
    sys.exit(0)

if __name__ == "__main__":
    main()
