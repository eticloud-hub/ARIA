import pandas as pd
import argparse
import sys
import os
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, confusion_matrix
import joblib

def main(csv_path: str):
    """
    Loads telemetry CSV, trains an sklearn RandomForestClassifier,
    evaluates forensic metrics, and saves the binary model.
    """
    if not os.path.exists(csv_path):
        print(f"Error: Dataset CSV file not found at '{csv_path}'.")
        sys.exit(1)

    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"Error loading CSV data: {e}")
        sys.exit(1)

    # 1. Enforce specific schema
    required_cols = {'mean_delta_t', 'std_delta_t', 'entropy', 'label'}
    if not required_cols.issubset(df.columns):
        print(f"Error: Dataset is missing required columns.")
        print(f"Expected: {required_cols}")
        print(f"Found: {set(df.columns)}")
        sys.exit(1)

    X = df[['mean_delta_t', 'std_delta_t', 'entropy']]
    y = df['label']  # 0 = human, 1 = AI

    # 2. Split 80/20 train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)

    # 3. Train sklearn RandomForestClassifier with default params
    clf = RandomForestClassifier(random_state=42)
    clf.fit(X_train, y_train)

    # 4. Evaluate Test Set
    y_pred = clf.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)

    # Calculate False Positive Rate
    cm = confusion_matrix(y_test, y_pred)
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    else:
        fpr = 0.0

    # Print Results Table
    print("\n" + "="*45)
    print("   FORENSIC CLASSIFICATION RESULTS   ".center(45))
    print("="*45)
    print(f" Accuracy            : {acc:.4f}")
    print(f" Precision           : {prec:.4f}")
    print(f" False Positive Rate : {fpr:.4f}")
    print("="*45)

    if fpr > 0.01:
        print("WARNING: FPR exceeds legal threshold")
        print("="*45)

    # 5. Save Model
    model_output = 'model.pkl'
    try:
        joblib.dump(clf, model_output)
        print(f"\n[+] Model safely serialized and saved to '{model_output}'")
    except Exception as e:
        print(f"Error saving joblib model: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the Autonomy Classifier using Random Forest.")
    parser.add_argument("csv_path", help="Path to the training data CSV containing session telemetry.")
    args = parser.parse_args()

    main(args.csv_path)
