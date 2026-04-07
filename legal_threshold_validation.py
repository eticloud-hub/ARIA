import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix
from typing import Dict, Any

def validate_legal_threshold(model: Any, X_test: pd.DataFrame, y_test: pd.Series, threshold: float = 0.01) -> Dict[str, Any]:
    """
    Validates if the trained behavior attribution model meets the strict 
    legal requirement of False Positive Rate (human misclassified as AI).
    
    Args:
        model: Trained sklearn-compatible model.
        X_test: Test features DataFrame consisting of behavioral metadata.
        y_test: True labels (0 = Human, 1 = AI).
        threshold: The maximum allowable False Positive Rate (default: 0.01).
        
    Returns:
        dict: containing 'passed' (bool), 'fpr' (float), and 'top_contributing_features' (list of str).
    """
    y_pred = model.predict(X_test)
    
    # Calculate the numerical false positive rate
    cm = confusion_matrix(y_test, y_pred)
    
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    else:
        # Edge case: fallback if test set homogeneously lacks one class (unlikely but safe)
        tn = sum((y_test == 0) & (y_pred == 0))
        fp = sum((y_test == 0) & (y_pred == 1))
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0

    print("-" * 55)
    print("      FORENSIC LEGAL THRESHOLD VALIDATION      ")
    print("-" * 55)
    print(f"Target Threshold : <= {threshold:.4f} ({threshold*100:.2f}%)")
    print(f"Calculated FPR   : {fpr:.4f} ({fpr*100:.2f}%)")
    
    passed = fpr <= threshold
    top_features = []
    
    # Print formal PASS or FAIL verdict
    if passed:
        print("\nVerdict: [PASS] - Model securely falls below legally defined error margins.")
        print("-" * 55)
    else:
        print("\nVerdict: [FAIL] - Model exceeds maximum allowable false positive rate.")
        print("WARNING: Deploying this model carries high risk of wrongful human attribution.")
        
        # If FAIL, print the top 3 features with the highest contribution
        if hasattr(model, 'feature_importances_') and hasattr(X_test, 'columns'):
            importances = model.feature_importances_
            feature_names = X_test.columns
            
            # Sort indices descending to get highest importance first
            sorted_indices = np.argsort(importances)[::-1]
            top_3_indices = sorted_indices[:min(3, len(importances))]
            
            print("\n[!] Root Cause Analysis - Top Contributing Features:")
            for idx in top_3_indices:
                feature = feature_names[idx]
                weight = importances[idx]
                top_features.append(feature)
                print(f"    - '{feature}' (Gini Weight: {weight:.4f})")
                
            print("\n    Recommendation: Analyze misclassifications. Consider dropping or transforming these specific features.")
        else:
            print("\n[!] Root Cause Analysis: feature_importances_ natively unavailable for this model type.")
            
        print("-" * 55)
        
    return {
        "passed": bool(passed),
        "fpr": float(fpr),
        "top_contributing_features": top_features
    }

# --- Pytest Unit Test Suite ---

import pytest
from sklearn.ensemble import RandomForestClassifier

@pytest.fixture
def mock_pipeline():
    """Builds a simple mock dataset and trains a real sklearn Random Forest for physical IO testing."""
    X = pd.DataFrame({
        'feature_alpha': [0.1, 0.2, 0.9, 0.8, 0.15, 0.85],
        'feature_beta':  [10, 20, 90, 80, 15, 85],
        'feature_gamma': [0, 0, 1, 1, 0, 1]
    })
    y = pd.Series([0, 0, 1, 1, 0, 1])
    
    model = RandomForestClassifier(random_state=42)
    model.fit(X, y)
    
    return model, X

def test_fpr_safely_below_threshold(mock_pipeline):
    """Test where FPR is 0.0 (safely below the default 0.01 threshold)"""
    model, X = mock_pipeline
    y_test_pass = pd.Series([0, 0, 1, 1, 0, 1]) 
    
    result = validate_legal_threshold(model, X, y_test_pass, threshold=0.01)
    
    assert result['passed'] is True
    assert result['fpr'] == 0.0
    assert len(result['top_contributing_features']) == 0

def test_fpr_exactly_at_threshold():
    """Test where FPR is exactly equal to the threshold (0.01)"""
    class MockModelAtThreshold:
        def __init__(self):
            self.feature_importances_ = np.array([0.5, 0.3, 0.2])
        def predict(self, X_t):
            # 100 human negative samples: predict 99 as 0 (TN), and 1 as 1 (FP). 
            # FPR = 1 FP / (99 TN + 1 FP) = 0.01
            preds = [0]*99 + [1] + [1]*10
            return np.array(preds)
            
    mock_model = MockModelAtThreshold()
    y_test = pd.Series([0]*100 + [1]*10)
    X_test = pd.DataFrame(np.zeros((110, 3)), columns=['f1', 'f2', 'f3'])
    
    result = validate_legal_threshold(mock_model, X_test, y_test, threshold=0.01)
    
    assert result['fpr'] == 0.01
    assert result['passed'] is True # Since the logic check is natively `<= threshold`

def test_fpr_fails_threshold():
    """Test where FPR fails (exceeds threshold), successfully triggering feature importance tracking."""
    class MockModelFail:
        def __init__(self):
            self.feature_importances_ = np.array([0.1, 0.8, 0.1])
        def predict(self, X_t):
            # 10 human samples: predict 5 as 0 (TN), and 5 as 1 (FP). (FPR = 0.50)
            preds = [0]*5 + [1]*5
            return np.array(preds)
            
    mock_model = MockModelFail()
    y_test = pd.Series([0] * 10)
    X_test = pd.DataFrame(np.zeros((10, 3)), columns=['Feature_A', 'Feature_B', 'Feature_C'])
    
    result = validate_legal_threshold(mock_model, X_test, y_test, threshold=0.01)
    
    assert result['passed'] is False
    assert result['fpr'] == 0.5
    assert len(result['top_contributing_features']) <= 3
    
    # Based on the mocked feature_importances_ array [0.1, 0.8, 0.1], 'Feature_B' is the heavy hitter
    assert result['top_contributing_features'][0] == 'Feature_B'
