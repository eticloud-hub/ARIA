import numpy as np
from typing import List, Dict, Any

def extract_semantic_intent(session: List[Dict[str, Any]]) -> float:
    """
    Computes the Markov Transition Entropy of abstract intent states in a session.
    """
    intents = []
    recon = {'ls', 'dir', 'pwd', 'whoami', 'ipconfig'}
    read = {'cat', 'less', 'type', 'more'}
    net = {'ping', 'curl', 'wget', 'scp'}
    execute = {'chmod', './', 'python', 'bash', 'powershell', 'sh'}
    
    for ev in session:
        cmd = ev.get('payload', {}).get('command', '').lower().strip()
        if not cmd:
            continue
        base = cmd.split(' ')[0]
        if base in recon:
            intents.append('recon')
        elif base in read:
            intents.append('read')
        elif base in net:
            intents.append('net')
        elif base in execute:
            intents.append('execute')
        else:
            intents.append('other')
            
    if len(intents) < 2:
        return 0.0
        
    transitions = [f"{intents[i]}->{intents[i+1]}" for i in range(len(intents) - 1)]
    unique, counts = np.unique(transitions, return_counts=True)
    probs = counts / np.sum(counts)
    
    return float(-np.sum(probs * np.log2(probs)))

def extract_error_propagation(session: List[Dict[str, Any]]) -> float:
    """
    Calculates the average Levenshtein distance between an error-producing command
    and the immediate subsequent command executed. 
    """
    def levenshtein_distance(s1: str, s2: str) -> int:
        if len(s1) < len(s2):
            return levenshtein_distance(s2, s1)
        if len(s2) == 0:
            return len(s1)
        previous_row = np.arange(len(s2) + 1)
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            previous_row = current_row
        return int(previous_row[-1])

    distances = []
    for i in range(len(session) - 1):
        curr = session[i]
        nxt = session[i+1]
        
        is_error = curr.get('event_type') == 'Error' or curr.get('payload', {}).get('exit_code', 0) != 0
        if is_error:
            cmd1 = curr.get('payload', {}).get('command', '')
            cmd2 = nxt.get('payload', {}).get('command', '')
            if cmd1 and cmd2:
                distances.append(levenshtein_distance(cmd1, cmd2))
                
    return float(np.mean(distances)) if distances else 0.0

def extract_behavioral_drift(session: List[Dict[str, Any]]) -> float:
    """
    Splits continuous session into blocks and measures linear drift of Shannon Entropy.
    """
    def shannon_entropy(s: str) -> float:
        if not s:
            return 0.0
        unique, counts = np.unique(list(s), return_counts=True)
        probs = counts / np.sum(counts)
        return float(-np.sum(probs * np.log2(probs)))

    cmds = [ev.get('payload', {}).get('command', '') for ev in session if ev.get('payload', {}).get('command')]
    if len(cmds) < 5:
        return 0.0
        
    num_blocks = 5
    block_size = max(1, len(cmds) // num_blocks)
    entropies = []
    
    for i in range(num_blocks):
        end_idx = (i + 1) * block_size if i < num_blocks - 1 else len(cmds)
        block = cmds[i * block_size : end_idx]
        concat_str = "".join(block)
        entropies.append(shannon_entropy(concat_str))
        
    x = np.arange(num_blocks)
    y = np.array(entropies)
    slope, _ = np.polyfit(x, y, 1)
    return float(slope)

def extract_all_features(session: List[Dict[str, Any]]) -> Dict[str, float]:
    return {
        'semantic_intent_entropy': extract_semantic_intent(session),
        'error_propagation_distance': extract_error_propagation(session),
        'behavioral_drift_slope': extract_behavioral_drift(session)
    }

if __name__ == "__main__":
    sample_session = [
        {'timestamp': 0, 'event_type': 'Proc', 'payload': {'command': 'ls -la'}},
        {'timestamp': 1000, 'event_type': 'Error', 'payload': {'command': 'cat /etc/shadow', 'exit_code': 1}},
        {'timestamp': 2000, 'event_type': 'Proc', 'payload': {'command': 'whoami'}},
        {'timestamp': 3000, 'event_type': 'Proc', 'payload': {'command': 'pwd'}},
        {'timestamp': 4000, 'event_type': 'Proc', 'payload': {'command': 'cat /etc/passwd'}}
    ]
    print("\n[+] Testing Feature Extractors with Mock Human Session...")
    features = extract_all_features(sample_session)
    for k, v in features.items():
        print(f"    - {k}: {round(v, 4)}")
    print("\n[!] Execution completed.")
