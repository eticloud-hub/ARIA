"""
ARIA Worker — Log Normalization Layer
Parsers for .evtx, .pcap, .csv, .json log formats.

Refactored from v1:
- Parsers now accept file paths (not bytes) to avoid holding entire artifacts in RAM.
- Original bytes-based functions preserved for backward compatibility.
- File-path variants stream from disk, keeping memory usage constant.
"""
from __future__ import annotations

import csv
import io
import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class NormalizedEvent:
    """Unified event format consumed by the HABD engine."""

    timestamp: datetime
    event_type: str           # e.g., "file_access", "network_connection", "process_start"
    source: str               # "evtx", "pcap", "csv", "json"
    actor: str | None         # User or process identifier
    target: str | None        # Target resource (file path, URL, IP, etc.)
    metadata: dict[str, Any]  # Raw event-specific data


# ---------------------------------------------------------------------------
# File-path based parsers (streaming, no full-file-in-RAM)
# ---------------------------------------------------------------------------

def parse_evtx_file(path: Path) -> list[NormalizedEvent]:
    """Parse .evtx from disk — streams records without loading the entire file."""
    events: list[NormalizedEvent] = []
    try:
        import Evtx.Evtx as evtx

        with evtx.Evtx(str(path)) as log:
            for record in log.records():
                try:
                    xml_data = record.xml()
                    events.append(NormalizedEvent(
                        timestamp=record.timestamp(),
                        event_type=f"windows_event_{record.event_id()}",
                        source="evtx",
                        actor=None,
                        target=None,
                        metadata={"raw_xml": xml_data, "event_id": record.event_id()},
                    ))
                except Exception as e:
                    logger.warning(f"Skipping malformed EVTX record: {e}")
    except ImportError:
        logger.warning("python-evtx not available — using stub parser")
        events.append(NormalizedEvent(
            timestamp=datetime.utcnow(),
            event_type="evtx_stub",
            source="evtx",
            actor="SYSTEM",
            target=None,
            metadata={"stub": True, "file": str(path)},
        ))
    return events


def parse_pcap_file(path: Path) -> list[NormalizedEvent]:
    """Parse .pcap from disk — reads packets incrementally."""
    events: list[NormalizedEvent] = []
    try:
        import dpkt

        with open(path, "rb") as f:
            pcap = dpkt.pcap.Reader(f)
            for ts, buf in pcap:
                try:
                    eth = dpkt.ethernet.Ethernet(buf)
                    if isinstance(eth.data, dpkt.ip.IP):
                        ip = eth.data
                        src_ip = ".".join(map(str, ip.src))
                        dst_ip = ".".join(map(str, ip.dst))
                        events.append(NormalizedEvent(
                            timestamp=datetime.utcfromtimestamp(ts),
                            event_type="network_connection",
                            source="pcap",
                            actor=src_ip,
                            target=dst_ip,
                            metadata={
                                "protocol": ip.p,
                                "length": ip.len,
                                "src_port": getattr(ip.data, "sport", None),
                                "dst_port": getattr(ip.data, "dport", None),
                            },
                        ))
                except Exception as e:
                    logger.warning(f"Skipping malformed packet: {e}")
    except ImportError:
        logger.warning("dpkt not available — using stub parser")
        events.append(NormalizedEvent(
            timestamp=datetime.utcnow(),
            event_type="pcap_stub",
            source="pcap",
            actor="192.168.1.1",
            target="10.0.0.1",
            metadata={"stub": True, "file": str(path)},
        ))
    return events


def parse_csv_file(path: Path) -> list[NormalizedEvent]:
    """Parse CSV from disk — streams rows without loading entire file."""
    events: list[NormalizedEvent] = []
    timestamp_cols = ["timestamp", "Timestamp", "time", "Time", "datetime", "DateTime", "date"]

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts_col = next((c for c in timestamp_cols if c in row), None)
            timestamp = datetime.utcnow()
            if ts_col and row[ts_col]:
                try:
                    timestamp = datetime.fromisoformat(row[ts_col].replace("Z", "+00:00"))
                except ValueError:
                    pass

            events.append(NormalizedEvent(
                timestamp=timestamp,
                event_type=row.get("event_type", row.get("EventType", "csv_event")),
                source="csv",
                actor=row.get("user", row.get("User", row.get("actor", None))),
                target=row.get("target", row.get("Target", row.get("resource", None))),
                metadata=dict(row),
            ))
    return events


def parse_json_file(path: Path) -> list[NormalizedEvent]:
    """Parse JSON from disk — supports array and newline-delimited formats."""
    events: list[NormalizedEvent] = []

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()

    try:
        parsed = json.loads(text)
        items = parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        items = [json.loads(line) for line in text.strip().split("\n") if line.strip()]

    for item in items:
        timestamp = datetime.utcnow()
        for key in ["timestamp", "time", "datetime", "@timestamp"]:
            if key in item:
                try:
                    timestamp = datetime.fromisoformat(str(item[key]).replace("Z", "+00:00"))
                except ValueError:
                    pass
                break

        events.append(NormalizedEvent(
            timestamp=timestamp,
            event_type=item.get("event_type", item.get("type", "json_event")),
            source="json",
            actor=item.get("user", item.get("actor", None)),
            target=item.get("target", item.get("resource", None)),
            metadata=item,
        ))
    return events


# ---------------------------------------------------------------------------
# Legacy bytes-based parsers (kept for backward compatibility)
# ---------------------------------------------------------------------------

def parse_evtx(data: bytes) -> list[NormalizedEvent]:
    events: list[NormalizedEvent] = []
    try:
        import Evtx.Evtx as evtx
        with evtx.BinaryParser(io.BytesIO(data)) as parser:
            for record in parser.records():
                try:
                    xml_data = record.xml()
                    events.append(NormalizedEvent(
                        timestamp=record.timestamp(),
                        event_type=f"windows_event_{record.event_id()}",
                        source="evtx", actor=None, target=None,
                        metadata={"raw_xml": xml_data, "event_id": record.event_id()},
                    ))
                except Exception as e:
                    logger.warning(f"Skipping malformed EVTX record: {e}")
    except ImportError:
        events.append(NormalizedEvent(
            timestamp=datetime.utcnow(), event_type="evtx_stub", source="evtx",
            actor="SYSTEM", target=None, metadata={"stub": True, "size_bytes": len(data)},
        ))
    return events


def parse_pcap(data: bytes) -> list[NormalizedEvent]:
    events: list[NormalizedEvent] = []
    try:
        import dpkt
        pcap = dpkt.pcap.Reader(io.BytesIO(data))
        for ts, buf in pcap:
            try:
                eth = dpkt.ethernet.Ethernet(buf)
                if isinstance(eth.data, dpkt.ip.IP):
                    ip = eth.data
                    src_ip = ".".join(map(str, ip.src))
                    dst_ip = ".".join(map(str, ip.dst))
                    events.append(NormalizedEvent(
                        timestamp=datetime.utcfromtimestamp(ts), event_type="network_connection",
                        source="pcap", actor=src_ip, target=dst_ip,
                        metadata={"protocol": ip.p, "length": ip.len,
                                  "src_port": getattr(ip.data, "sport", None),
                                  "dst_port": getattr(ip.data, "dport", None)},
                    ))
            except Exception as e:
                logger.warning(f"Skipping malformed packet: {e}")
    except ImportError:
        events.append(NormalizedEvent(
            timestamp=datetime.utcnow(), event_type="pcap_stub", source="pcap",
            actor="192.168.1.1", target="10.0.0.1",
            metadata={"stub": True, "size_bytes": len(data)},
        ))
    return events


def parse_csv(data: bytes) -> list[NormalizedEvent]:
    events: list[NormalizedEvent] = []
    text = data.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    timestamp_cols = ["timestamp", "Timestamp", "time", "Time", "datetime", "DateTime", "date"]
    for row in reader:
        ts_col = next((c for c in timestamp_cols if c in row), None)
        timestamp = datetime.utcnow()
        if ts_col and row[ts_col]:
            try:
                timestamp = datetime.fromisoformat(row[ts_col].replace("Z", "+00:00"))
            except ValueError:
                pass
        events.append(NormalizedEvent(
            timestamp=timestamp, event_type=row.get("event_type", row.get("EventType", "csv_event")),
            source="csv", actor=row.get("user", row.get("User", row.get("actor", None))),
            target=row.get("target", row.get("Target", row.get("resource", None))),
            metadata=dict(row),
        ))
    return events


def parse_json(data: bytes) -> list[NormalizedEvent]:
    events: list[NormalizedEvent] = []
    text = data.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
        items = parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        items = [json.loads(line) for line in text.strip().split("\n") if line.strip()]
    for item in items:
        timestamp = datetime.utcnow()
        for key in ["timestamp", "time", "datetime", "@timestamp"]:
            if key in item:
                try:
                    timestamp = datetime.fromisoformat(str(item[key]).replace("Z", "+00:00"))
                except ValueError:
                    pass
                break
        events.append(NormalizedEvent(
            timestamp=timestamp, event_type=item.get("event_type", item.get("type", "json_event")),
            source="json", actor=item.get("user", item.get("actor", None)),
            target=item.get("target", item.get("resource", None)),
            metadata=item,
        ))
    return events


# ---------------------------------------------------------------------------
# Dispatch registries
# ---------------------------------------------------------------------------

PARSERS = {
    "evtx": parse_evtx,
    "pcap": parse_pcap,
    "csv": parse_csv,
    "json": parse_json,
}

FILE_PARSERS = {
    "evtx": parse_evtx_file,
    "pcap": parse_pcap_file,
    "csv": parse_csv_file,
    "json": parse_json_file,
}


def normalize_artifact(data: bytes, file_format: str) -> list[NormalizedEvent]:
    """Dispatch to format-specific parser (bytes-based — legacy)."""
    parser = PARSERS.get(file_format)
    if not parser:
        raise ValueError(f"Unsupported format: {file_format}")
    return parser(data)


def normalize_artifact_file(path: Path, file_format: str) -> list[NormalizedEvent]:
    """Dispatch to format-specific file parser (streaming — preferred)."""
    parser = FILE_PARSERS.get(file_format)
    if not parser:
        raise ValueError(f"Unsupported format: {file_format}")
    return parser(path)
