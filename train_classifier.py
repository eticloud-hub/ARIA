import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, confusion_matrix
import joblib
import sys

def train_and_evaluate(csv_path: str, model_output_path: str = 'model.pkl'):
    """
    Loads session telemetry data, trains a Random Forest Classifier to detect
    AI vs Human actors, evaluates forensic metrics, and saves the model.
    """
    print(f"[*] Loading training data from: {csv_path}")
    try:
        df = pd.read_csv(csv_path)
    except Exception as e:
        print(f"ERROR: Failed to load CSV file ({e})")
        sys.exit(1)
        
    # Ensure all pipeline columns exist
    required_cols = {'mean_delta_t', 'std_delta_t', 'entropy', 'label'}
    if not required_cols.issubset(df.columns):
        print(f"ERROR: CSV is missing required columns. Expected: {required_cols}")
        print(f"       Found: {set(df.columns)}")
        sys.exit(1)

    # 1. Prepare features and target
    X = df[['mean_delta_t', 'std_delta_t', 'entropy']]
    y = df['label']  # 0 = Human, 1 = AI Agent

    # 2. Split 80/20 train/test
    print("[*] Splitting dataset 80/20 for Train/Test...")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)

    # 3. Train sklearn RandomForestClassifier with default params
    print("[*] Training Random Forest Classifier...")
    # Using default parameters as requested, fixing random_state for reproducibility
    clf = RandomForestClassifier(random_state=42)
    clf.fit(X_train, y_train)

    # 4. Evaluate and print Accuracy, Precision, False Positive Rate
    print("[*] Evaluating Model Performance...")
    y_pred = clf.predict(X_test)
    
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    
    cm = confusion_matrix(y_test, y_pred)
    
    # Calculate False Positive Rate safely from the confusion matrix
    # Format for binary classification:
    # [[True_Negative (TN), False_Positive (FP)],
    #  [False_Negative (FN), True_Positive (TP)]]
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    else:
        # Fallback if the test set is perfectly homogeneous (only contains 1 class)
        fpr = 0.0
        print("[!] Warning: Confusion matrix is not 2x2. Test validation set may lack one class.")

    print(f"\n[+] Validation Metrics:")
    print(f"    - Accuracy            : {acc:.4f}")
    print(f"    - Precision           : {prec:.4f}")
    print(f"    - False Positive Rate : {fpr:.4f}")

    # 5. Save the model to model.pkl using joblib
    print(f"\n[*] Saving model to {model_output_path}...")
    try:
        joblib.dump(clf, model_output_path)
        print(f"[+] Model successfully saved as '{model_output_path}'.")
        print("    -> You can load it later via: clf = joblib.load('model.pkl')")
    except Exception as e:
        print(f"ERROR: Failed to save model: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python train_classifier.py <path_to_dataset.csv>")
        print("\nNote: Please ensure scikit-learn & pandas are installed! (pip install scikit-learn pandas)")
        sys.exit(1)
        
    dataset_csv = sys.argv[1]
    train_and_evaluate(dataset_csv, "model.pkl")
