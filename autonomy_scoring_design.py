from typing import List, Dict, Any

def calculate_autonomy_score(session_events: List[Dict[str, Any]]) -> float:
    """
    Calculates a legally defensible Autonomy Score (0.0 to 1.0) to quantify the 
    synthesized autonomy level of an attack session.

    A score of 0.0 implies fully human-directed, interactive Hands-On-Keyboard (HOK).
    A score of 1.0 implies fully autonomous AI (LLM ReAct loop or autonomous agent).

    Args:
        session_events: Chronological normalized list of EVTX events.
            Format: [{'timestamp': ms, 'event_type': 'Proc'|'Error', 'payload': ...}]

    Returns:
        float: Normalized autonomy score [0.0 - 1.0].
    """
    total_events = len(session_events)
    if total_events < 2:
        return 0.0  # Cannot establish autonomy from a single isolated event

    # -------------------------------------------------------------------------
    # Criteria 1: Percentage of Actions Requiring No External Input (Weight: 40%)
    # -------------------------------------------------------------------------
    # Humans require cognitive pauses to read outputs, wait on C2 tasking, or type.
    # Autonomous LLMs buffer their thoughts internally and execute immediately.
    biological_pauses = 0
    total_transitions = total_events - 1

    for i in range(total_transitions):
        delta_t = session_events[i+1]['timestamp'] - session_events[i]['timestamp']
        
        # If the gap between identical intent commands exceeds normal human typing (e.g. >2s)
        # without matching a perfect robotic polling sleep (e.g. exactly 5.000s).
        if is_cognitive_biological_pause(delta_t):
            biological_pauses += 1
            
    # Autonomy increases as biological cognitive pauses approach 0
    percent_autonomous_execution = 1.0 - (biological_pauses / total_transitions)
    score_no_input = percent_autonomous_execution * 0.40

    # -------------------------------------------------------------------------
    # Criteria 2: Presence of Self-Correction Loops (Weight: 30%)
    # -------------------------------------------------------------------------
    # A human corrects via interactive backspaces, CTR-C, or typo fixes.
    # An AI Agent corrects programmatically: it parses stderr, generates a new 
    # structured command from scratch, and executes it without intermediate keystrokes.
    self_correction_score = 0.0
    programmatic_retries = 0

    for i in range(total_transitions):
        curr_event = session_events[i]
        next_event = session_events[i+1]
        
        if is_error_event(curr_event):
            # Did it rewrite a perfectly structured, entirely new syntax command instantly?
            # Or did it take 4 seconds, hit backspace, and execute the exact same command with 1 fix?
            if is_programmatic_rewrite(curr_event, next_event) and \
               get_delta_t(curr_event, next_event) < 500: # 500ms
                programmatic_retries += 1
                
    # Max out the correction autonomy score if it proves itself a programmatic ReAct loop
    self_correction_score = min(1.0, programmatic_retries / max_expected_retries(total_events))
    score_correction = self_correction_score * 0.30

    # -------------------------------------------------------------------------
    # Criteria 3: Evidence of Environment-Driven Adaptation (Weight: 30%)
    # -------------------------------------------------------------------------
    # Does the entity dynamically mutate its functional attack graph based on new data?
    # Simple botnets don't adapt. Humans adapt slowly. Advanced AI adapts instantly.
    adaptation_score = 0.0

    for i in range(total_transitions):
        curr_event = session_events[i]
        next_event = session_events[i+1]
        
        if is_recon_discovery(curr_event):
            # Example: `dir C:\Users\` followed immediately by `type C:\Users\Admin\secrets.txt`
            # Check if a newly discovered string from stdout is mapped perfectly into the next 
            # execution payload at machine speeds (impossible for a human to read+type that fast).
            if parses_stdout_into_next_payload(curr_event, next_event) and \
               get_delta_t(curr_event, next_event) < 200: # 200ms
                adaptation_score += 0.5 # Two strong instances is enough to flag high autonomy

    adaptation_score = min(1.0, adaptation_score)
    score_adaptation = adaptation_score * 0.30

    # -------------------------------------------------------------------------
    # Final Autonomy Score Computation
    # -------------------------------------------------------------------------
    return float(score_no_input + score_correction + score_adaptation)
