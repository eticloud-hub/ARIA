"""
ARIA Worker — HABD Engine
Human–Agent Behavioral Divergence Model (5 Dimensions)

Per TRD §04:
  1. Decision Pattern Analysis — temporal gaps, tree diversity
  2. Performance Consistency — coefficient of variation, recovery patterns
  3. Error Rate & Type — error frequency, distribution shape
  4. Behavioral Inertia — session stability vs. sharp pivots
  5. Cognitive Bias Markers — anchoring, recency, framing effects

Each dimension returns a score 0-100 and confidence 0.0-1.0
"""
from __future__ import annotations

import hashlib
import json
import logging
import platform
import sys
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Any

import numpy as np

from .config import config
from .parsers import NormalizedEvent

logger = logging.getLogger(__name__)


@dataclass
class EvidenceItem:
    """Individual piece of evidence supporting a dimension score."""
    type: str
    severity: str     # low, medium, high, critical
    timestamp_offset_ms: int
    description: str


@dataclass
class DimensionResult:
    """Result of a single HABD dimension analysis."""
    dimension: str
    score: int            # 0 (strong AI) to 100 (strong human)
    confidence: float     # 0.0 to 1.0
    evidence: list[EvidenceItem] = field(default_factory=list)


@dataclass
class HABDResult:
    """Complete HABD analysis result."""
    human_attribution_score: int
    confidence_interval_low: int
    confidence_interval_high: int
    mimicry_flag: bool
    dimension_scores: list[DimensionResult]
    insufficient_data_dimensions: list[str]
    agent_profile_notes: str | None
    session_breakdown: dict[str, Any] | None
    executive_summary: str
    engine_manifest: dict[str, Any]


class HABDEngine:
    """
    HABD Analysis Engine — Hermetic Execution
    Per TRD: No external API calls, no network access during analysis.
    All computation happens in-memory on normalized events only.
    """

    VERSION = "1.0.0"

    def analyze(self, events: list[NormalizedEvent]) -> HABDResult:
        """Run full HABD analysis across all 5 dimensions."""
        manifest = self._build_manifest(events)

        if len(events) < 10:
            return HABDResult(
                human_attribution_score=50,
                confidence_interval_low=10,
                confidence_interval_high=90,
                mimicry_flag=False,
                dimension_scores=[],
                insufficient_data_dimensions=[
                    "decision_pattern", "performance_consistency",
                    "error_rate", "behavioral_inertia", "cognitive_bias"
                ],
                agent_profile_notes="Insufficient data for reliable analysis.",
                session_breakdown=None,
                executive_summary="Analysis inconclusive: fewer than 10 events available.",
                engine_manifest=manifest,
            )

        dimensions = [
            self._analyze_decision_patterns(events),
            self._analyze_performance_consistency(events),
            self._analyze_error_rate(events),
            self._analyze_behavioral_inertia(events),
            self._analyze_cognitive_bias(events),
        ]

        # Filter out insufficient data dimensions
        valid_dims = [d for d in dimensions if d.confidence >= config.HABD_CONFIDENCE_MINIMUM]
        insufficient = [d.dimension for d in dimensions if d.confidence < config.HABD_CONFIDENCE_MINIMUM]

        # Weighted average score
        if valid_dims:
            weights = [d.confidence for d in valid_dims]
            total_weight = sum(weights)
            score = int(sum(d.score * d.confidence for d in valid_dims) / total_weight)
        else:
            score = 50  # Inconclusive

        # Confidence interval
        if valid_dims:
            scores = [d.score for d in valid_dims]
            std_dev = float(np.std(scores)) if len(scores) > 1 else 15.0
            ci_low = max(0, int(score - 1.96 * std_dev / len(scores) ** 0.5))
            ci_high = min(100, int(score + 1.96 * std_dev / len(scores) ** 0.5))
        else:
            ci_low, ci_high = 10, 90

        # Mimicry detection
        mimicry_flag = self._detect_mimicry(dimensions, events)

        # Executive summary
        summary = self._generate_summary(score, ci_low, ci_high, mimicry_flag, valid_dims)

        return HABDResult(
            human_attribution_score=score,
            confidence_interval_low=ci_low,
            confidence_interval_high=ci_high,
            mimicry_flag=mimicry_flag,
            dimension_scores=dimensions,
            insufficient_data_dimensions=insufficient,
            agent_profile_notes=self._profile_agent(events) if score < 40 else None,
            session_breakdown=None,
            executive_summary=summary,
            engine_manifest=manifest,
        )

    # ========================= DIMENSION ANALYZERS =========================

    def _analyze_decision_patterns(self, events: list[NormalizedEvent]) -> DimensionResult:
        """
        Dimension 1: Decision Pattern Analysis
        Human: Variable gaps, diverse action sequences
        AI: Uniform timing, repetitive patterns
        """
        evidence: list[EvidenceItem] = []

        # Inter-event timing
        timestamps = sorted([e.timestamp for e in events])
        if len(timestamps) < 2:
            return DimensionResult("decision_pattern", 50, 0.3)

        gaps = [(timestamps[i + 1] - timestamps[i]).total_seconds()
                for i in range(len(timestamps) - 1)]

        # Coefficient of variation — humans have higher variability
        mean_gap = float(np.mean(gaps))
        std_gap = float(np.std(gaps))
        cv = std_gap / mean_gap if mean_gap > 0 else 0

        # Score mapping: high CV → more human
        pattern_score = min(100, int(cv * 50))

        if cv < 0.2:
            evidence.append(EvidenceItem(
                type="timing_uniformity",
                severity="high",
                timestamp_offset_ms=0,
                description=f"Suspicious timing uniformity: CV={cv:.3f} (expected >0.5 for humans)",
            ))

        confidence = min(1.0, len(events) / 100)

        return DimensionResult("decision_pattern", pattern_score, confidence, evidence)

    def _analyze_performance_consistency(self, events: list[NormalizedEvent]) -> DimensionResult:
        """
        Dimension 2: Performance Consistency
        Human: Fatigue effects, learning curves, breaks
        AI: Constant performance, no degradation
        """
        evidence: list[EvidenceItem] = []

        # Group events by hour
        hourly_counts: dict[int, int] = {}
        for e in events:
            hour = e.timestamp.hour
            hourly_counts[hour] = hourly_counts.get(hour, 0) + 1

        if len(hourly_counts) < 3:
            return DimensionResult("performance_consistency", 50, 0.3)

        counts = list(hourly_counts.values())
        cv = float(np.std(counts) / np.mean(counts)) if np.mean(counts) > 0 else 0

        # Human: higher variability across hours (fatigue, breaks)
        score = min(100, int(cv * 60))

        if cv < 0.15:
            evidence.append(EvidenceItem(
                type="constant_performance",
                severity="medium",
                timestamp_offset_ms=0,
                description=f"Near-constant hourly activity: CV={cv:.3f}",
            ))

        confidence = min(1.0, len(hourly_counts) / 12)

        return DimensionResult("performance_consistency", score, confidence, evidence)

    def _analyze_error_rate(self, events: list[NormalizedEvent]) -> DimensionResult:
        """
        Dimension 3: Error Rate & Type
        Human: Occasional errors, correction patterns
        AI: Very low error rate OR systematic failures
        """
        error_events = [e for e in events if "error" in e.event_type.lower()
                        or e.metadata.get("status") == "error"]
        error_rate = len(error_events) / len(events) if events else 0

        # Humans: ~2-8% error rate; AI: <1% or >15%
        if error_rate < 0.01:
            score = 20  # Suspiciously low — likely AI
        elif error_rate < 0.08:
            score = 75  # Normal human error range
        elif error_rate < 0.15:
            score = 50  # Could be either
        else:
            score = 30  # Systematic failures or adversarial

        evidence: list[EvidenceItem] = []
        if error_rate < 0.01:
            evidence.append(EvidenceItem(
                type="zero_error_rate",
                severity="high",
                timestamp_offset_ms=0,
                description=f"Error rate {error_rate:.1%} is suspiciously low for human activity",
            ))

        confidence = min(1.0, len(events) / 50)

        return DimensionResult("error_rate", score, confidence, evidence)

    def _analyze_behavioral_inertia(self, events: list[NormalizedEvent]) -> DimensionResult:
        """
        Dimension 4: Behavioral Inertia
        Human: Gradual shifts, habitual patterns
        AI: Sharp context switches, no inertia
        """
        # Analyze event type transitions
        event_types = [e.event_type for e in events]
        if len(event_types) < 5:
            return DimensionResult("behavioral_inertia", 50, 0.3)

        # Count sequential repetitions vs. switches
        repetitions = sum(1 for i in range(1, len(event_types))
                         if event_types[i] == event_types[i - 1])
        transitions = len(event_types) - 1
        repetition_rate = repetitions / transitions if transitions > 0 else 0

        # Humans tend to repeat similar actions before switching
        score = min(100, int(repetition_rate * 120))

        evidence: list[EvidenceItem] = []
        if repetition_rate < 0.1:
            evidence.append(EvidenceItem(
                type="low_behavioral_inertia",
                severity="medium",
                timestamp_offset_ms=0,
                description=f"Extremely low action repetition rate: {repetition_rate:.1%}",
            ))

        confidence = min(1.0, len(events) / 80)

        return DimensionResult("behavioral_inertia", score, confidence, evidence)

    def _analyze_cognitive_bias(self, events: list[NormalizedEvent]) -> DimensionResult:
        """
        Dimension 5: Cognitive Bias Markers
        Human: Anchoring, recency bias, status quo bias
        AI: No sequential dependency effects
        """
        evidence: list[EvidenceItem] = []

        # Recency bias: do later actions in a session cluster in a smaller space?
        if len(events) < 20:
            return DimensionResult("cognitive_bias", 50, 0.3)

        targets = [e.target for e in events if e.target]
        if len(targets) < 5:
            return DimensionResult("cognitive_bias", 50, 0.3)

        # Diversity ratio: unique targets / total targets
        unique_targets = len(set(targets))
        diversity = unique_targets / len(targets)

        # Humans tend to revisit the same targets (anchoring)
        # AI explores more uniformly
        if diversity < 0.3:
            score = 80  # Lots of revisiting — human anchoring
        elif diversity < 0.6:
            score = 60
        else:
            score = 30  # High diversity — possibly AI

        if diversity > 0.8:
            evidence.append(EvidenceItem(
                type="high_target_diversity",
                severity="medium",
                timestamp_offset_ms=0,
                description=f"Target diversity ratio {diversity:.1%} — no anchoring detected",
            ))

        confidence = min(1.0, len(targets) / 50)

        return DimensionResult("cognitive_bias", score, confidence, evidence)

    # ========================= MIMICRY DETECTION =========================

    def _detect_mimicry(
        self, dimensions: list[DimensionResult], events: list[NormalizedEvent]
    ) -> bool:
        """
        Cross-dimensional mimicry detection.
        If all dimensions score uniformly (no variance), suspect adversarial mimicry.
        Per TRD: Threshold from environment config.
        """
        scores = [d.score for d in dimensions if d.confidence >= config.HABD_CONFIDENCE_MINIMUM]
        if len(scores) < 3:
            return False

        # If all scores are in a very narrow range, suspect mimicry
        score_range = max(scores) - min(scores)
        return score_range < config.HABD_MIMICRY_THRESHOLD

    # ========================= HELPERS =========================

    def _generate_summary(
        self, score: int, ci_low: int, ci_high: int,
        mimicry_flag: bool, dimensions: list[DimensionResult]
    ) -> str:
        """Generate plain-language executive summary."""
        if mimicry_flag:
            return (
                f"Analysis produced a Human Attribution Score of {score}/100 "
                f"(95% CI: {ci_low}–{ci_high}), however a possible adversarial mimicry "
                f"pattern was detected. Results should be interpreted with caution and "
                f"supplemented with additional forensic investigation."
            )

        if score >= 76:
            attribution = "strong indicators of human-driven activity"
        elif score >= 51:
            attribution = "probable human activity, with some automated characteristics"
        elif score >= 31:
            attribution = "inconclusive — mixed human and automated behavioral signals"
        else:
            attribution = "strong indicators of autonomous AI agent activity"

        return (
            f"Analysis produced a Human Attribution Score of {score}/100 "
            f"(95% CI: {ci_low}–{ci_high}), indicating {attribution}. "
            f"The assessment is based on {len(dimensions)} behavioral dimensions "
            f"with sufficient data for reliable scoring."
        )

    def _profile_agent(self, events: list[NormalizedEvent]) -> str | None:
        """Generate notes about potential AI agent characteristics."""
        # Check for uniform timing patterns
        timestamps = sorted([e.timestamp for e in events])
        if len(timestamps) < 5:
            return None

        gaps = [(timestamps[i + 1] - timestamps[i]).total_seconds()
                for i in range(len(timestamps) - 1)]

        mean_gap = float(np.mean(gaps))
        std_gap = float(np.std(gaps))

        notes = []
        if std_gap / mean_gap < 0.1:
            notes.append(f"Metronomic timing pattern: {mean_gap:.2f}s ± {std_gap:.2f}s")

        if not notes:
            return None
        return "; ".join(notes)

    def _build_manifest(self, events: list[NormalizedEvent]) -> dict[str, Any]:
        """
        Engine Manifest — reproducibility metadata.
        Per TRD: Captures engine version, git SHA, Python version,
        and input hash for audit trail.
        """
        # Hash of sorted event data for repeatability verification
        event_json = json.dumps(
            [{"ts": e.timestamp.isoformat(), "type": e.event_type, "src": e.source}
             for e in sorted(events, key=lambda x: x.timestamp)],
            sort_keys=True,
        )
        input_hash = hashlib.sha256(event_json.encode()).hexdigest()

        return {
            "engine_version": self.VERSION,
            "python_version": platform.python_version(),
            "numpy_version": np.__version__,
            "platform": platform.platform(),
            "input_event_count": len(events),
            "input_hash": input_hash,
            "timestamp": datetime.utcnow().isoformat(),
            "config": {
                "mimicry_threshold": config.HABD_MIMICRY_THRESHOLD,
                "confidence_minimum": config.HABD_CONFIDENCE_MINIMUM,
            },
        }
