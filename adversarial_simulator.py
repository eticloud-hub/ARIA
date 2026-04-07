from typing import List, Dict, Any, Optional
import numpy as np
import copy
import random

class AdversarialBehaviorSimulator:
    """
    Simulates human-like behavioral imperfections to obfuscate deterministic 
    AI agent session telemetry, mimicking human cognitive and motor variance.
    
    This module transforms clean, syntactically perfect AI action sequences 
    into noisy, irregular sequences. It is designed to generate adversarial 
    training examples (synthetic "grey area" data) for behavioral classifiers.
    """

    def __init__(self, 
                 base_wpm: float = 65.0, 
                 base_error_rate: float = 0.04, 
                 cognitive_delay_mu: float = 1.2, 
                 cognitive_delay_sigma: float = 0.8):
        """
        Initializes the simulator with baseline human parameters.
        
        Args:
            base_wpm (float): The target base typing speed in Words Per Minute.
            base_error_rate (float): The probability of generating a typo/misclick per action.
            cognitive_delay_mu (float): The mean parameter for log-normal cognitive delay (seconds).
            cognitive_delay_sigma (float): The standard deviation for cognitive delay variance.
        """
        self.base_wpm = base_wpm
        self.base_error_rate = base_error_rate
        self.cognitive_delay_mu = cognitive_delay_mu
        self.cognitive_delay_sigma = cognitive_delay_sigma
        
        cps = (self.base_wpm * 5) / 60.0
        self.mean_keystroke_delay = 1.0 / cps if cps > 0 else 0.2

    def inject_typing_delays(self, action_sequence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Injects biologically realistic typing delays between keystroke events.
        
        Applies a log-normal distribution to inter-character and inter-word 
        timings to simulate human motor execution, breaking deterministic, 
        machine-speed string buffering.
        
        Args:
            action_sequence (List[Dict[str, Any]]): The raw, un-timed sequence of actions 
                                                    (e.g., shell commands, keystrokes).
            
        Returns:
            List[Dict[str, Any]]: The sequence with modified `timestamp` and `duration` 
                                  fields representing human-like delays.
        """
        if not action_sequence:
            return []
            
        obfuscated = copy.deepcopy(action_sequence)
        
        mu = np.log(self.mean_keystroke_delay**2 / np.sqrt(self.mean_keystroke_delay**2 + (self.mean_keystroke_delay * 0.5)**2))
        sigma = np.sqrt(np.log(1 + ((self.mean_keystroke_delay * 0.5)**2) / self.mean_keystroke_delay**2))
            
        current_time = float(obfuscated[0].get('timestamp', 0.0))
        
        for action in obfuscated:
            command = action.get('command', '')
            if isinstance(command, str) and len(command) > 0:
                delays = np.random.lognormal(mean=mu, sigma=sigma, size=len(command))
                total_delay = max(0.0, float(np.sum(delays)))
            else:
                total_delay = max(0.0, float(np.random.lognormal(mean=mu, sigma=sigma)))
                
            action['timestamp'] = current_time
            action['duration'] = total_delay
            current_time += total_delay
            
        return obfuscated

    def introduce_fake_errors(self, action_sequence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Introduces randomized manual errors and their subsequent corrections.
        
        Simulates:
        - Typos (e.g., adjacent key presses on a QWERTY layout).
        - Corrective keystrokes (e.g., `Backspace`, `Ctrl+W`, `Delete`).
        - Misclicks or accidental window focus shifts.
        
        Args:
            action_sequence (List[Dict[str, Any]]): The sequence to inject errors into.
            
        Returns:
            List[Dict[str, Any]]: The expanded sequence including errors and logical corrections 
                                  before the final command execution phase.
        """
        if not action_sequence:
            return []
            
        obfuscated = []
        for action in action_sequence:
            command = action.get('command', '')
            if isinstance(command, str) and len(command) > 0:
                if random.random() < self.base_error_rate:
                    idx = random.randint(0, len(command) - 1)
                    typo_char = chr(min(126, ord(command[idx]) + 1)) 
                    
                    action1 = copy.deepcopy(action)
                    action1['command'] = command[:idx] + typo_char
                    action1['is_error'] = True
                    obfuscated.append(action1)
                    
                    action_bs = copy.deepcopy(action)
                    action_bs['command'] = '\b'
                    action_bs['event_type'] = 'keypress'
                    action_bs['is_correction'] = True
                    obfuscated.append(action_bs)
                    
                    action2 = copy.deepcopy(action)
                    action2['command'] = command[idx:]
                    obfuscated.append(action2)
                else:
                    obfuscated.append(copy.deepcopy(action))
            else:
                obfuscated.append(copy.deepcopy(action))
                
        return obfuscated

    def add_inter_event_noise(self, action_sequence: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Adds macro-level cognitive noise and temporal variance between distinct events.
        
        Simulates "think time", such as a user pausing to read terminal output, 
        scanning file contents, or figuring out the next command step. The duration
        of the noise scales with the estimated complexity of the preceding command's output.
        
        Args:
            action_sequence (List[Dict[str, Any]]): The sequence to add inter-event noise to.
            
        Returns:
            List[Dict[str, Any]]: The sequence adjusted with higher-entropy timestamps 
                                  reflecting cognitive pauses.
        """
        if not action_sequence:
            return []
            
        obfuscated = copy.deepcopy(action_sequence)
        
        cumulative_shift = 0.0
        for i in range(1, len(obfuscated)):
            prev_action = obfuscated[i-1]
            curr_action = obfuscated[i]
            
            delay = np.random.lognormal(mean=self.cognitive_delay_mu, sigma=self.cognitive_delay_sigma)
            output_len = prev_action.get('output_length', 100)
            scale = min(10.0, max(0.5, output_len / 100.0))
            actual_delay = delay * scale
            
            cumulative_shift += actual_delay
            if 'timestamp' in curr_action:
                curr_action['timestamp'] += cumulative_shift
            else:
                curr_action['cognitive_delay'] = actual_delay
                
        return obfuscated

    def obfuscate_session(self, ai_session_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Orchestrates the complete suite of adversarial obfuscations to a clean AI session.
        
        This sequentially applies `introduce_fake_errors`, `inject_typing_delays`, 
        and `add_inter_event_noise` to produce a full adversarially modified 
        session ready for ingestion by a classifier.
        
        Args:
            ai_session_data (List[Dict[str, Any]]): The raw, deterministic AI telemetry.
            
        Returns:
            List[Dict[str, Any]]: The fully obfuscated, human-like telemetry sequence.
        """
        seq = self.introduce_fake_errors(ai_session_data)
        seq = self.inject_typing_delays(seq)
        seq = self.add_inter_event_noise(seq)
        return seq
