import sys
import os
import json
import xml.etree.ElementTree as ET
import numpy as np
from datetime import datetime

try:
    import Evtx.Evtx as evtx
except ImportError:
    evtx = None

# Requirement: All errors MUST be strictly logged to stderr, not stdout.
def log_error(msg: str):
    """Writes an explicit error message exclusively to standard error."""
    sys.stderr.write(f"ERROR: {msg}\n")
    sys.stderr.flush()

class BasicTimingExtractor:
    """
    Parses Windows EVTX files to compute the continuous Shannon Entropy of 
    inter-event timing sequences (delta_t) to differentiate mechanical RNG 
    vs biological biological typing variance.
    """
    def __init__(self, target_file: str = None):
        if evtx is None:
            log_error("`python-evtx` library missing. Install via `pip install python-evtx`.")
            sys.exit(1)
            
        self.target_file = target_file
        self.ns = '{http://schemas.microsoft.com/win/2004/08/events/event}'

    def _parse_timestamp(self, ts_str: str) -> int:
        """Converts EVTX SystemTime string to epoch milliseconds, handling failures."""
        if not ts_str:
            log_error("Parsed XML record is completely missing the SystemTime attribute string.")
            return -1
        try:
            ts_str = ts_str.replace('Z', '+00:00')
            dt = datetime.fromisoformat(ts_str)
            return int(dt.timestamp() * 1000)
        except Exception:
            # Handle Malformed Field gracefully
            log_error(f"Malformed SystemTime timestamp field encountered: '{ts_str}'")
            return -1

    def _calculate_timing_entropy(self, delta_t_list: list) -> float:
        """Calculates Shannon Entropy over a continuous distribution binned by 100ms."""
        if not delta_t_list:
            return 0.0
            
        # Bin the time deltas to compute meaningful frequency probability densities
        bins = [d // 100 * 100 for d in delta_t_list]
        unique, counts = np.unique(bins, return_counts=True)
        probs = counts / np.sum(counts)
        return float(-np.sum(probs * np.log2(probs)))

    def _process_timestamps(self, timestamps: list) -> dict:
        """Processes an array of raw timestamps into delta_t and entropy features."""
        if not timestamps or len(timestamps) < 2:
            return {"delta_t": [], "entropy": 0.0}
            
        # Sort chronologically (EVTX usually are but we must absolutely verify)
        timestamps.sort()
        
        delta_t = []
        for i in range(1, len(timestamps)):
            diff = timestamps[i] - timestamps[i-1]
            if diff >= 0:
                delta_t.append(int(diff))
                
        entropy = self._calculate_timing_entropy(delta_t)
        return {"delta_t": delta_t, "entropy": entropy}

    def extract_from_evtx(self) -> dict:
        """
        Parses the physical EVTX binary, explicitly trapping expected forensic errors.
        Returns the parsed feature dictionary structure.
        """
        if not self.target_file or not os.path.exists(self.target_file):
            # File Not Found Case
            log_error(f"EVTX File directly not found or permission denied: {self.target_file}")
            return {"delta_t": [], "entropy": 0.0}

        timestamps = []
        
        try:
            with evtx.Evtx(self.target_file) as log:
                for record in log.records():
                    try:
                        root = ET.fromstring(record.xml())
                        sys_node = root.find(f'{self.ns}System')
                        
                        if sys_node is not None:
                            time_node = sys_node.find(f'{self.ns}TimeCreated')
                            if time_node is not None and 'SystemTime' in time_node.attrib:
                                ts_str = time_node.attrib['SystemTime']
                                ts = self._parse_timestamp(ts_str)
                                if ts > 0:
                                    timestamps.append(ts)
                            else:
                                # Missing Timestamp Field
                                log_error("Missing TimeCreated/SystemTime field in valid XML record.")
                    except ET.ParseError:
                        # Corrupted Event Record
                        log_error("Corrupted or malformed EVTX XML record encountered and skipped.")
                    except Exception as parse_e:
                        log_error(f"Unexpected parsing error within individual event record: {parse_e}")
                        
        except Exception as file_error:
            # File locking or severe backend IO crash
            log_error(f"Catastrophic failure opening EVTX stream: {file_error}")
            return {"delta_t": [], "entropy": 0.0}

        return self._process_timestamps(timestamps)

# --- Unit Test Validation Block ---

def _run_unit_test():
    """Unit test bypassing EVTX IO using a localized mocked list of events."""
    sys.stderr.write("[TEST] Executing completely mocked event unit test without IO...\n")
    extractor = BasicTimingExtractor(None)
    
    # Simulate exactly 5 events, each structurally spaced exactly 1000ms apart
    # Representing a perfect scheduled machine polling loop
    mock_timestamps = [1000, 2000, 3000, 4000, 5000]
    
    res = extractor._process_timestamps(mock_timestamps)
    
    # Total deltas generated must be N-1 (4)
    assert len(res["delta_t"]) == 4, "Mock Output delta_t length scalar calculation failed."
    # Their structural math must equal exactly 1000ms difference per cycle
    assert all(d == 1000 for d in res["delta_t"]), "Mock Delta sequential substraction failed."
    # Since the variance is 0 (1000ms repeating 100% of the time uniformly), Entropy MUST be 0.0 bits
    assert res["entropy"] == 0.0, f"Mock Entropy calculation logic failed - Expected 0.0, Received: {res['entropy']}"
    
    sys.stderr.write("[TEST PASSED] Feature logic extraction mathematically sound.\n")


# --- Main CLI Pipeline Block ---

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        _run_unit_test()
        sys.exit(0)
    
    if len(sys.argv) < 2:
        log_error("Usage: python basic_timing_extractor.py <path_to_evtx_file.evtx>")
        sys.exit(1)
        
    # Execute EVTX Extraction
    target_evtx = sys.argv[1]
    extractor = BasicTimingExtractor(target_evtx)
    result_dict = extractor.extract_from_evtx()
    
    # Requirement: Output MUST be strictly valid JSON printed to stdout.
    # No extra conversational string data can pollute stdout (this causes SIEM parsing crashes).
    print(json.dumps(result_dict, indent=2))
