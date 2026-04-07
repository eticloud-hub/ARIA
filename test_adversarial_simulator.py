import pytest
from adversarial_simulator import AdversarialBehaviorSimulator

def test_inject_typing_delays_empty():
    """Edge Case: Empty sequence returns empty sequence."""
    sim = AdversarialBehaviorSimulator()
    assert sim.inject_typing_delays([]) == []

def test_inject_typing_delays_basic():
    """Ensure delays are injected and timestamps are shifted."""
    sim = AdversarialBehaviorSimulator(base_wpm=60)
    seq = [{'command': 'ls'}]
    res = sim.inject_typing_delays(seq)
    
    assert len(res) == 1
    assert 'timestamp' in res[0]
    assert 'duration' in res[0]
    assert res[0]['duration'] > 0
    assert res[0]['timestamp'] == 0.0

def test_introduce_fake_errors_empty():
    """Edge Case: Empty sequence returns empty sequence."""
    sim = AdversarialBehaviorSimulator()
    assert sim.introduce_fake_errors([]) == []

def test_introduce_fake_errors_high_rate():
    """Ensure errors are introduced when error rate is 100%."""
    sim = AdversarialBehaviorSimulator(base_error_rate=1.0)
    seq = [{'command': 'pwd'}]
    res = sim.introduce_fake_errors(seq)
    
    # original 'pwd' should be split into typo, backspace, and correction
    assert len(res) >= 3
    assert any(action.get('is_error') for action in res)
    assert any(action.get('is_correction') for action in res)

def test_add_inter_event_noise_empty():
    """Edge Case: Empty list returns empty list."""
    sim = AdversarialBehaviorSimulator()
    assert sim.add_inter_event_noise([]) == []

def test_add_inter_event_noise_single_action():
    """Edge Case: Single action does not have inter-event noise."""
    sim = AdversarialBehaviorSimulator()
    seq = [{'command': 'ls', 'timestamp': 0.0}]
    res = sim.add_inter_event_noise(seq)
    assert len(res) == 1
    assert res[0]['timestamp'] == 0.0

def test_add_inter_event_noise_multiple():
    """Ensure cognitive delays are applied shifting subsequent timestamps."""
    sim = AdversarialBehaviorSimulator(cognitive_delay_mu=0, cognitive_delay_sigma=0.1)
    seq = [
        {'command': 'ls', 'timestamp': 0.0, 'output_length': 100},
        {'command': 'pwd', 'timestamp': 1.0}
    ]
    res = sim.add_inter_event_noise(seq)
    
    assert len(res) == 2
    assert res[1]['timestamp'] > 1.0  # Output timestamp must be shifted by cumulative cognitive delay

def test_obfuscate_session():
    """Test full orchestrator pipeline."""
    sim = AdversarialBehaviorSimulator(base_wpm=80, base_error_rate=0.5)
    seq = [
        {'command': 'echo hello', 'timestamp': 0.0, 'output_length': 10},
        {'command': 'cat file.txt', 'timestamp': 1.0, 'output_length': 200}
    ]
    res = sim.obfuscate_session(seq)
    
    assert len(res) >= 2
    # Verify the sequence pipeline output altered the timestamps and added durations
    assert all('duration' in event for event in res if 'command' in event)
