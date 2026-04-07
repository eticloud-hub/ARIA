import json
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any

try:
    import Evtx.Evtx as evtx
except ImportError:
    evtx = None

class BehavioralEvtxParser:
    """
    Parses Windows EVTX logs and extracts behavioral features specific to 
    identifying Human vs. AI actors via semantic chains and error propagation.
    """
    
    def __init__(self, target_file: str):
        self.target_file = target_file
        # XML Namespace used by EVTX
        self.ns = '{http://schemas.microsoft.com/win/2004/08/events/event}'

    def _parse_timestamp(self, ts_str: str) -> int:
        """Converts EVTX SystemTime string to epoch milliseconds."""
        try:
            # Handle standard EVTX format e.g. "2023-10-14T15:30:00.123456Z"
            ts_str = ts_str.replace('Z', '+00:00')
            dt = datetime.fromisoformat(ts_str)
            return int(dt.timestamp() * 1000)
        except Exception:
            return 0

    def parse(self) -> List[Dict[str, Any]]:
        """
        Parses the EVTX file and filters for actionable behavioral events (4688 & 4104).
        Returns the clean chronological schema for `extract_all_features()`.
        """
        if evtx is None:
            raise ImportError("python-evtx is not installed. Run `pip install python-evtx`.")

        parsed_session = []
        
        try:
            with evtx.Evtx(self.target_file) as log:
                for record in log.records():
                    try:
                        xml_str = record.xml()
                        root = ET.fromstring(xml_str)
                        
                        sys_node = root.find(f'{self.ns}System')
                        if sys_node is None:
                            continue
                            
                        event_id_node = sys_node.find(f'{self.ns}EventID')
                        time_node = sys_node.find(f'{self.ns}TimeCreated')
                        
                        if event_id_node is None or time_node is None:
                            continue
                            
                        event_id = event_id_node.text
                        timestamp_ms = self._parse_timestamp(time_node.attrib.get('SystemTime', ''))
                        
                        event_data = root.find(f'{self.ns}EventData')
                        if event_data is None:
                            continue
                            
                        # Extract Event ID 4688 (Process Creation)
                        if event_id == '4688':
                            command_line = ""
                            for data in event_data.findall(f'{self.ns}Data'):
                                if data.get('Name') == 'CommandLine' and data.text:
                                    command_line = data.text
                                    break
                            
                            if command_line:
                                parsed_session.append({
                                    'timestamp': timestamp_ms,
                                    'event_type': 'Proc',
                                    'payload': {
                                        'command': command_line.strip()
                                    }
                                })
                                
                        # Extract Event ID 4104 (PowerShell Script Block Logging / Warnings) 
                        elif event_id == '4104':
                            # PowerShell warnings/errors can be flagged by Level (2=Error, 3=Warning).
                            level_node = sys_node.find(f'{self.ns}Level')
                            level = int(level_node.text) if level_node is not None and level_node.text else 4
                            
                            # Standard user mistakes/fails often land in 2 or 3
                            if level in [2, 3]:
                                script_block = ""
                                for data in event_data.findall(f'{self.ns}Data'):
                                    if data.get('Name') == 'ScriptBlockText' and data.text:
                                        script_block = data.text
                                        break
                                
                                if script_block:
                                    parsed_session.append({
                                        'timestamp': timestamp_ms,
                                        'event_type': 'Error',
                                        'payload': {
                                            'command': script_block.strip()[:150], # Capture structural slice of the failing command
                                            'exit_code': level
                                        }
                                    })
                                    
                    except Exception as record_parse_error:
                        continue # Skip malformed or corrupted records
                        
        except Exception as e:
            print(f"Failed to open or parse EVTX file: {e}")
            
        # Chronological sort required by ML feature extractors
        parsed_session.sort(key=lambda x: x['timestamp'])
        return parsed_session

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python evtx_parser.py <path_to_evtx_file>")
        print("\nNote: Please ensure `python-evtx` is installed: pip install python-evtx")
        sys.exit(1)
        
    target_evtx = sys.argv[1]
    print(f"[+] Initializing Behavioral EVTX Parser on target: {target_evtx}")
    
    parser = BehavioralEvtxParser(target_evtx)
    session_data = parser.parse()
    
    print(f"[-] Search complete. Discovered {len(session_data)} actionable features (Proc/Error types).")
    
    if session_data:
        print("\n[+] JSON Output Schema Preview (First 3 Events):")
        print(json.dumps(session_data[:3], indent=2))
        print("\n[!] Ready for ingestion by extract_all_features(session).")
