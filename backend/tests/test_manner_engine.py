from __future__ import annotations

import json
from pathlib import Path

from asr.whisper_engine import detect_filler_in_token, format_mm_ss
from kinematics.bow_evaluator import (
    _build_synthetic_skeleton_frame,
    evaluate_bow_and_posture,
    recalibrate_and_smooth_frames,
)
from schemas import DiagnosticResponse, FillerOccurrence, WordToken
from scoring.manner_scorer import evaluate_manner_session


def test_filler_token_detection() -> None:
    assert detect_filler_in_token("あの") == "あの"
    assert detect_filler_in_token("えっと、") == "えっと"
    assert detect_filler_in_token("本日は") is None
    assert format_mm_ss(14200) == "00:14"
    assert format_mm_ss(42400) == "00:42"


def test_diagonal_invariant_bow_evaluation_and_scoring() -> None:
    frames = []
    for idx in range(30):
        t_ms = idx * 200
        if 8 <= idx <= 16:
            angle = 65.0 if idx in (11, 12, 13) else 48.0
        else:
            angle = 1.0
        frames.append(_build_synthetic_skeleton_frame(t_ms, angle, neck_flexion_deg=3.0))

    calibrated = recalibrate_and_smooth_frames(frames)
    bow_summary, posture_summary = evaluate_bow_and_posture(calibrated, target_bow_angle=45)

    assert bow_summary.detected is True
    assert bow_summary.peak_angle_deg > 50.0
    assert posture_summary.stability_ratio >= 0.80

    words = [
        WordToken(word="よろしくお願いいたします", start_ms=1000, end_ms=2200, is_filler=False),
        WordToken(word="あの", start_ms=3600, end_ms=4000, is_filler=True),
    ]
    fillers = [
        FillerOccurrence(word="あの", timestamp_ms=3600, formatted_time="00:04"),
    ]

    result = evaluate_manner_session(
        session_id="unit-test-01",
        frames=calibrated,
        transcript_text="よろしくお願いいたします あの",
        words=words,
        fillers=fillers,
        target_bow_angle=45,
    )

    assert isinstance(result, DiagnosticResponse)
    gosen_metric = next(m for m in result.metrics if m.key == "gosen_reirei")
    assert gosen_metric.passed is False
    assert gosen_metric.score == 0


def test_shared_sample_diagnostic_contract() -> None:
    sample_path = Path(__file__).resolve().parent.parent.parent / "shared" / "sample_diagnostic.json"
    raw = json.loads(sample_path.read_text(encoding="utf-8"))
    validated = DiagnosticResponse.model_validate(raw)

    assert validated.total_score == 50
    assert validated.target_bow_angle == 45
    assert validated.bow_summary.peak_angle_deg == 65.0
    assert len(validated.frames) == 60
    assert len(validated.ideal_frames) == 60
    assert len(validated.filler_occurrences) == 3

