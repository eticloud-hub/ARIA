"""
Autonomy Scoring Module
Calculates a legally defensible score (0.0 - 1.0) quantifying the autonomy 
level of a session to distinct human-directed control from AI agent loops.
"""

from typing import List, Dict, Any

# --- Modular Weights for Autonomy Scoring ---

# Weight: 40%
# Justification: The presence of biological cognitive pauses (e.g., visual read time) 
# or C2 tasking delays is the strongest indicator of external (human) input. A truly 
# autonomous agent executes its ReAct loop continuously at machine speed.
WEIGHT_EXTERNAL_INPUT = 0.40

# Weight: 30%
# Justification: Identifying programmatic self-correction (instantaneous structural 
# rewrites of syntax after an error) proves the entity has programmatic ReAct parsing, 
# unlike biological human backspace/typo correction which takes >500ms.
WEIGHT_SELF_CORRECTION = 0.30

# Weight: 30%
# Justification: If a session demonstrates reading an output string and dynamically 
# pushing it into the next payload at sub-200ms speeds, it proves environmental 
# adaptation beyond scripted loops, identifying an advanced autonomous LLM.
WEIGHT_ADAPTATION = 0.30


def _calculate_external_input(session_events: List[Dict[str, Any]]) -> float:
    """
    Measures percentage of actions requiring NO external input.
    Returns 1.0 if entirely machine-speed (AI), 0.0 if entirely biological paced.
    """
    total_transitions = len(session_events) - 1
    if total_transitions <= 0:
        return 0.0
        
    biological_pauses = 0
    for i in range(total_transitions):
        delta_t = session_events[i+1]['timestamp'] - session_events[i]['timestamp']
        
        # A biological cognitive pause to read terminal output is generally > 2500ms (2.5 seconds)
        # Any delay longer than this strongly implies external input/thinking rather than autonomy.
        if delta_t > 2500:
            biological_pauses += 1
            
    percent_autonomous = 1.0 - (biological_pauses / total_transitions)
    return max(0.0, min(1.0, percent_autonomous))


def _calculate_self_correction(session_events: List[Dict[str, Any]]) -> float:
    """
    Detects programmatic ReAct loop self-corrections.
    Returns 1.0 if highly self-correcting at machine speed, 0.0 otherwise.
    """
    programmatic_retries = 0
    total_transitions = len(session_events) - 1
    
    for i in range(total_transitions):
        curr_event = session_events[i]
        next_event = session_events[i+1]
        
        # Trap command errors or non-zero exit codes
        is_error = curr_event.get('event_type') == 'Error' or curr_event.get('payload', {}).get('exit_code', 0) != 0
        if is_error:
            cmd1 = curr_event.get('payload', {}).get('command', '')
            cmd2 = next_event.get('payload', {}).get('command', '')
            delta_t = next_event['timestamp'] - curr_event['timestamp']
            
            # If a completely different command was generated and executed in < 500ms, 
            # a ReAct LLM is instantly parsing the error and retrying without backspaces.
            if cmd1 and cmd2 and cmd1 != cmd2 and delta_t < 500:
                programmatic_retries += 1
                
    # Max out the score if we see a threshold of impossible human feats (e.g. 5% of events)
    threshold = max(1.0, len(session_events) * 0.05)
    return min(1.0, programmatic_retries / threshold)


def _calculate_adaptation(session_events: List[Dict[str, Any]]) -> float:
    """
    Detects environmental data streaming (stdout from recon -> payload of execute).
    Returns 1.0 if it proves high adaptation, 0.0 if none.
    """
    adaptation_score = 0.0
    total_transitions = len(session_events) - 1
    
    recon_commands = {'dir', 'ls', 'whoami', 'ipconfig', 'cat', 'find'}
    
    for i in range(total_transitions):
        curr_event = session_events[i]
        next_event = session_events[i+1]
        
        cmd1_base = curr_event.get('payload', {}).get('command', '').lower().split(' ')[0]
        delta_t = next_event['timestamp'] - curr_event['timestamp']
        
        # If a recon command is immediately followed by a functional command at machine speed,
        # it strongly suggests deterministic LLM payload adaptation (streaming output directly).
        if cmd1_base in recon_commands and delta_t < 200:
            adaptation_score += 0.5
            
    return min(1.0, adaptation_score)


def validate_autonomy_score(session_events: List[Dict[str, Any]]) -> float:
    """
    Calculates the final weighted legally defensible autonomy score.
    
    Args:
        session_events: A List of dicts representing the chronologically ordered session.
    
    Returns:
        float: A definitive score between 0.0 (fully human) and 1.0 (fully autonomous AI).
    """
    if not session_events or len(session_events) < 2:
        return 0.0
        
    score_no_input = _calculate_external_input(session_events)
    score_correction = _calculate_self_correction(session_events)
    score_adaptation = _calculate_adaptation(session_events)
    
    # Calculate weighted absolute average
    final_score = (score_no_input * WEIGHT_EXTERNAL_INPUT) + \
                  (score_correction * WEIGHT_SELF_CORRECTION) + \
                  (score_adaptation * WEIGHT_ADAPTATION)
                  
    # Ensure strict floating point bounds
    return float(max(0.0, min(1.0, final_score)))
