import numpy as np
import json
import uuid
import random
from typing import List, Dict, Any

class HybridSessionGenerator:
    """
    Generates synthetic hybrid forensic sessions to train Behavioral Attribution 
    systems capable of detecting 'Grey-Zone' hands-on-keyboard vs. AI handoffs.
    """
    def __init__(self, seed: int = None):
        if seed is not None:
            np.random.seed(seed)
            random.seed(seed)
            
    def _generate_human_events(self, start_time: int, count: int) -> List[Dict[str, Any]]:
        events = []
        current_time = start_time
        recon_commands = ['dir', 'pwd', 'whoami', 'ipconfig /all', 'ping 8.8.8.8', 'cat /etc/passwd']
        
        for _ in range(count):
            # Human timing entropy: high variance log-normal distribution, slow execution
            delay = int(np.random.lognormal(mean=7.0, sigma=1.0)) # ~1000ms+
            current_time += delay
            events.append({
                "timestamp": current_time,
                "event_type": "4688",
                "payload": {"command": random.choice(recon_commands)}
            })
        return events

    def _generate_ai_events(self, start_time: int, count: int) -> List[Dict[str, Any]]:
        events = []
        current_time = start_time
        execution_commands = ['powershell.exe -enc XYZ_BASE64', 'schtasks /create', 'Invoke-WebRequest', 'net group "Domain Admins"']
        
        for _ in range(count):
            # AI timing entropy: programmatic, deterministic millisecond scale constraints
            delay = int(np.random.normal(loc=15, scale=2)) # ~15ms
            current_time += max(1, delay)
            events.append({
                "timestamp": current_time,
                "event_type": "4688",
                "payload": {"command": random.choice(execution_commands)}
            })
        return events

    def generate_human_handoff_ai(self) -> Dict[str, Any]:
        """
        1. Human initiates (recon).
        2. Human installs agent (Event ID 7045).
        3. AI autonomously finishes attack loop at extreme speed.
        """
        session_id = str(uuid.uuid4())
        start_time = 1700000000000
        
        # Human Recon Phase (10-20 events)
        human_count = random.randint(10, 20)
        events = self._generate_human_events(start_time, human_count)
        for ev in events:
            ev['actor_phase'] = "human_recon"
            
        handoff_timestamp = events[-1]['timestamp'] + random.randint(5000, 15000)
        
        # Handoff Event (Service Install)
        events.append({
            "timestamp": handoff_timestamp,
            "event_type": "7045",
            "actor_phase": "human_recon",
            "payload": {"command": "sc create malicious_agent binPath= agent.exe"}
        })
        
        # AI Execution Phase (40-60 events)
        ai_count = random.randint(40, 60)
        ai_events = self._generate_ai_events(handoff_timestamp, ai_count)
        for ev in ai_events:
            ev['actor_phase'] = "ai_execution"
            
        events.extend(ai_events)
        
        # Soft label: [P(Human), P(AI)] based on event count ratio weighting
        p_human = (human_count + 1) / len(events)
        label = [round(p_human, 2), round(1.0 - p_human, 2)]
        
        return {
            "session_id": session_id,
            "session_type": "human_handoff_ai",
            "events": events,
            "handoff_timestamp": handoff_timestamp,
            "label": label # Soft target array for ML
        }

    def generate_ai_handoff_human(self) -> Dict[str, Any]:
        """
        1. AI runs dense volumetric network recon (5156).
        2. AI halts.
        3. Human takes over terminal.
        """
        session_id = str(uuid.uuid4())
        start_time = 1700000000000
        events = []
        
        # AI Recon Phase (dense 5156 network ping sweeps)
        ai_count = random.randint(30, 50)
        current_time = start_time
        for _ in range(ai_count):
            delay = int(np.random.normal(loc=5, scale=1)) # Extremely fast loop
            current_time += max(1, delay)
            events.append({
                "timestamp": current_time,
                "event_type": "5156",
                "actor_phase": "ai_recon",
                "payload": {"command": "WFP_PortScan_Outbound"}
            })
            
        # Cognitive Pause
        cognitive_pause = int(np.abs(np.random.normal(loc=120000, scale=30000))) # ~2 minutes macro jump
        human_start = current_time + cognitive_pause
        
        # Human Execution (incorporating typos via Powershell 4104)
        human_count = random.randint(10, 25)
        human_events = self._generate_human_events(human_start, human_count)
        for i, ev in enumerate(human_events):
            ev['actor_phase'] = "human_execution"
            # Invert 10% of standard commands to syntax errors
            if random.random() < 0.1:
                ev['event_type'] = "4104"
                ev['payload']['command'] = "poweershell.exe" # Deliberate structural typo
                
        events.extend(human_events)
        
        # Seq2Seq Labeling: 1 for AI, 0 for Human for every temporal step
        label = [1 if ev['actor_phase'] == 'ai_recon' else 0 for ev in events]
        
        return {
            "session_id": session_id,
            "session_type": "ai_handoff_human",
            "events": events,
            "cognitive_pause_duration": cognitive_pause,
            "label": label
        }

    def generate_autonomous_mimicry(self) -> Dict[str, Any]:
        """
        AI agent executes autonomously but injects bounded sleep() timers
        and non-functional 'whoami' calls to simulate biological rhythm.
        """
        session_id = str(uuid.uuid4())
        start_time = 1700000000000
        events = []
        current_time = start_time
        
        total_events = random.randint(30, 50)
        for _ in range(total_events):
            # Mimicry: Uniform programmatic delay to fake human speed boundaries
            fake_human_delay = random.randint(500, 3000) 
            current_time += fake_human_delay
            
            # Is this a mimicry artifact? (e.g. running whoami purely as behavioral camouflage)
            is_mimicry = random.random() < 0.3
            cmd = "whoami" if is_mimicry else "powershell.exe -Enc XYZ"
            
            events.append({
                "timestamp": current_time,
                "event_type": "4688",
                "is_mimicry_artifact": is_mimicry,
                "payload": {"command": cmd}
            })
            
            # Record Process Exit matching the sub-millisecond physical speed limitation
            events.append({
                "timestamp": current_time + random.randint(5, 20),
                "event_type": "4689",
                "is_mimicry_artifact": is_mimicry,
                "payload": {"command": "ProcessTerminated"}
            })
            
        # Explicit Multi-Class Definition
        # Class 0: Human, Class 1: AI, Class 2: Mimicry
        label = [0, 0, 1] 
        
        return {
            "session_id": session_id,
            "session_type": "autonomous_mimicry",
            "events": events,
            "mimicry_confidence_score": round(random.uniform(0.7, 0.99), 2),
            "label": label
        }

    def generate_dataset(self, n_per_type: int) -> List[Dict[str, Any]]:
        dataset = []
        for _ in range(n_per_type):
            dataset.append(self.generate_human_handoff_ai())
            dataset.append(self.generate_ai_handoff_human())
            dataset.append(self.generate_autonomous_mimicry())
        return dataset

if __name__ == "__main__":
    generator = HybridSessionGenerator(seed=42)
    n_sessions = 10
    print(f"[*] Generating {n_sessions} hybrid sessions per subtype (Total: {n_sessions * 3})...")
    
    dataset = generator.generate_dataset(n_sessions)
    
    dist = {
        "human_handoff_ai": 0,
        "ai_handoff_human": 0,
        "autonomous_mimicry": 0
    }
    
    # Validation loop
    for session in dataset:
        dist[session['session_type']] += 1
        
    print("\n[+] Generation Complete. Label Distribution:")
    for k, v in dist.items():
        print(f"    - {k}: {v} sessions generated")
        
    print("\n[+] Previewing 'human_handoff_ai' first structured event:")
    preview_htoa = next(s for s in dataset if s['session_type'] == 'human_handoff_ai')
    print(json.dumps(preview_htoa['events'][0], indent=2))
    print(f"    -> Applied Target Soft Label: {preview_htoa['label']}")
    
    print("\n[+] Previewing 'ai_handoff_human' structural handoff size:")
    preview_atoh = next(s for s in dataset if s['session_type'] == 'ai_handoff_human')
    print(f"    -> Seq2Seq Temporal Label Array Length: {len(preview_atoh['label'])}")
    
    print("\n[+] Previewing 'autonomous_mimicry' One-Hot Class array:")
    preview_mimic = next(s for s in dataset if s['session_type'] == 'autonomous_mimicry')
    print(f"    -> Sub-Class 2 Mimicry Array: {preview_mimic['label']}")
