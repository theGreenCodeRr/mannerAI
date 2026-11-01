from __future__ import annotations

import logging
from typing import List, Literal, Tuple

from asr.whisper_engine import format_mm_ss
from kinematics.bow_evaluator import (
    evaluate_bow_and_posture,
    generate_ideal_reference_frames,
)
from schemas import (
    BowIntervalSummary,
    DiagnosticResponse,
    FillerOccurrence,
    MetricCheckResult,
    PoseFrame,
    PostureSummary,
    TimelineEvent,
    WordToken,
)

logger = logging.getLogger("manner_ai.scoring")

BOW_SCORE_MAX = 30
GOSEN_SCORE_MAX = 30
POSTURE_SCORE_MAX = 20
FILLER_SCORE_MAX = 20

BOW_PENALTY_PER_DEGREE = 1.5
# Allow up to 150ms acoustic trailing tail overlap at speech completion before flagging Dojirei
GOSEN_REIREI_TOLERANCE_MS = 150
GOSEN_OVERLAP_ANGLE_DEG = 15.0
POSTURE_PASS_STABILITY_RATIO = 0.80


def _score_bow_angle(bow: BowIntervalSummary) -> Tuple[MetricCheckResult, List[TimelineEvent]]:
    events: List[TimelineEvent] = []
    target = bow.target_angle_deg
    min_deg = bow.target_min_deg
    max_deg = bow.target_max_deg
    peak = bow.peak_angle_deg

    if not bow.detected:
        metric = MetricCheckResult(
            key="bow_angle",
            title_ja="① Bow Angle (お辞儀角度)",
            title_en="1. Bow Angle",
            passed=False,
            score=0,
            max_score=BOW_SCORE_MAX,
            summary_ja=f"FAIL — 目標: {target}° / 有効なお辞儀未検出 (最大: {peak:.1f}°)",
            summary_en=f"FAIL — Target: {target}° / No valid bow detected (Peak: {peak:.1f}°)",
            detail_ja=f"10°以上のお辞儀が0.4秒以上継続しませんでした（適正範囲: {min_deg:.0f}°〜{max_deg:.0f}°）。",
            detail_en=f"Torso inclination did not exceed 10° for at least 0.4s (Target window: {min_deg:.0f}°–{max_deg:.0f}°).",
        )
        return metric, events

    if min_deg <= peak <= max_deg:
        score = BOW_SCORE_MAX
        passed = True
        summary_ja = f"PASS — 目標: {target}° / 計測最大: {peak:.1f}° (適正範囲内)"
        summary_en = f"PASS — Target: {target}° / Measured Peak: {peak:.1f}° (Within window)"
        detail_ja = f"腰を支点とした傾斜角が目標範囲（{min_deg:.0f}°〜{max_deg:.0f}°）に正確に収まっています。"
        detail_en = f"Peak hip-hinge inclination falls cleanly within the {min_deg:.0f}°–{max_deg:.0f}° target window."
    else:
        err_mag = abs(bow.angle_error_deg)
        raw_score = BOW_SCORE_MAX - (err_mag * BOW_PENALTY_PER_DEGREE)
        score = max(0, int(round(raw_score)))
        passed = False
        diff_from_target = peak - float(target)
        if peak > max_deg:
            direction_ja = f"+{diff_from_target:.1f}° 過剰"
            direction_en = f"+{diff_from_target:.1f}° excessive"
            event_label_ja = f"{format_mm_ss(bow.peak_ms or 0)} 角度超過 {peak:.0f}°"
            event_label_en = f"{format_mm_ss(bow.peak_ms or 0)} Over-bow {peak:.0f}°"
        else:
            direction_ja = f"{diff_from_target:.1f}° 浅い"
            direction_en = f"{diff_from_target:.1f}° shallow"
            event_label_ja = f"{format_mm_ss(bow.peak_ms or 0)} 角度不足 {peak:.0f}°"
            event_label_en = f"{format_mm_ss(bow.peak_ms or 0)} Shallow bow {peak:.0f}°"

        summary_ja = f"FAIL — 目標: {target}° / 計測最大: {peak:.1f}° ({direction_ja})"
        summary_en = f"FAIL — Target: {target}° / Measured Peak: {peak:.1f}° ({direction_en})"
        detail_ja = (
            f"適正範囲（{min_deg:.0f}°〜{max_deg:.0f}°）から {err_mag:.1f}° 逸脱しています（1°につき1.5点減点）。"
        )
        detail_en = (
            f"Deviated by {err_mag:.1f}° from the {min_deg:.0f}°–{max_deg:.0f}° passing window (-1.5 pts/deg)."
        )

        if bow.peak_ms is not None:
            events.append(
                TimelineEvent(
                    timestamp_ms=bow.peak_ms,
                    formatted_time=format_mm_ss(bow.peak_ms),
                    category="bow_angle",
                    severity="error",
                    label_ja=event_label_ja,
                    label_en=event_label_en,
                )
            )

    metric = MetricCheckResult(
        key="bow_angle",
        title_ja="① Bow Angle (お辞儀角度)",
        title_en="1. Bow Angle",
        passed=passed,
        score=score,
        max_score=BOW_SCORE_MAX,
        summary_ja=summary_ja,
        summary_en=summary_en,
        detail_ja=detail_ja,
        detail_en=detail_en,
    )
    return metric, events


def _score_gosen_reirei(
    frames: List[PoseFrame],
    words: List[WordToken],
    bow: BowIntervalSummary,
) -> Tuple[MetricCheckResult, List[TimelineEvent]]:
    events: List[TimelineEvent] = []
    violation_ms: int | None = None

    # Check 1: Explicit frame-level overlap where torso angle > 15 deg during active speech
    for word in words:
        for frame in frames:
            if (word.start_ms <= frame.timestamp_ms <= (word.end_ms - GOSEN_REIREI_TOLERANCE_MS)) and (
                frame.torso_angle_deg > GOSEN_OVERLAP_ANGLE_DEG
            ):
                violation_ms = frame.timestamp_ms
                break
        if violation_ms is not None:
            break

    # Check 2: Bow start vs preceding greeting speech end (t_bow_start >= t_speech_end - 150ms)
    if violation_ms is None and bow.detected and bow.start_ms is not None and bow.end_ms is not None:
        overlapping_words = [
            w
            for w in words
            if w.start_ms < bow.end_ms and (w.end_ms - GOSEN_REIREI_TOLERANCE_MS) > bow.start_ms
        ]
        if overlapping_words:
            violation_ms = max(bow.start_ms, overlapping_words[0].start_ms)

    if violation_ms is not None:
        ts_str = format_mm_ss(violation_ms)
        events.append(
            TimelineEvent(
                timestamp_ms=violation_ms,
                formatted_time=ts_str,
                category="gosen_reirei",
                severity="error",
                label_ja=f"{ts_str} 語先後礼違反 (同時礼の検出)",
                label_en=f"{ts_str} Gosen-reirei Violation (Simultaneous bow & speech)",
            )
        )
        metric = MetricCheckResult(
            key="gosen_reirei",
            title_ja="② Gosen-reirei (語先後礼)",
            title_en="2. Gosen-reirei Timing",
            passed=False,
            score=0,
            max_score=GOSEN_SCORE_MAX,
            summary_ja=f"FAIL — 同時礼検出 ({ts_str} 発声中にお辞儀開始)",
            summary_en=f"FAIL — Simultaneous bow detected ({ts_str} bowed during speech)",
            detail_ja=f"{ts_str} 同時礼の検出 (発声とお辞儀の重複)。発声を完全に終えてからお辞儀を開始してください。",
            detail_en=f"{ts_str} Simultaneous bow and speech overlap (>15° inclination during active vocalization).",
        )
    else:
        metric = MetricCheckResult(
            key="gosen_reirei",
            title_ja="② Gosen-reirei (語先後礼)",
            title_en="2. Gosen-reirei Timing",
            passed=True,
            score=GOSEN_SCORE_MAX,
            max_score=GOSEN_SCORE_MAX,
            summary_ja="PASS — 語先後礼の分離確認 (発声完了後にお辞儀開始)",
            summary_en="PASS — Clean separation (Bow initiated after speech completion)",
            detail_ja="挨拶の発声終了後にお辞儀が開始されており、語先後礼の原則を満たしています。",
            detail_en="Bow initiation strictly followed speech completion within the 150ms acoustic tolerance.",
        )

    return metric, events


def _score_posture(posture: PostureSummary) -> Tuple[MetricCheckResult, List[TimelineEvent]]:
    events: List[TimelineEvent] = []
    pct = posture.stability_ratio * 100.0
    passed = posture.stability_ratio >= POSTURE_PASS_STABILITY_RATIO

    if passed:
        score = POSTURE_SCORE_MAX
        summary_ja = f"PASS — 安定率 {pct:.1f}%"
        summary_en = f"PASS — Stability {pct:.1f}%"
        detail_ja = (
            f"立位フレームの {pct:.1f}% で左右の肩の水平維持（|y11-y12| < 0.035）と頸椎の直線性が保たれています。"
        )
        detail_en = (
            f"{pct:.1f}% of upright stance frames satisfied lateral shoulder symmetry and cervical alignment."
        )
    else:
        score = max(0, int(round(POSTURE_SCORE_MAX * (posture.stability_ratio / POSTURE_PASS_STABILITY_RATIO) * 0.5)))
        summary_ja = f"FAIL — 安定率 {pct:.1f}% (基準 80.0% 未満)"
        summary_en = f"FAIL — Stability {pct:.1f}% (< 80.0% threshold)"
        detail_ja = (
            f"立位時の肩の傾き（平均 {posture.mean_shoulder_tilt:.3f}）または首の前傾（平均 {posture.mean_neck_deviation_deg:.1f}°）が検出されました。"
        )
        detail_en = (
            f"Excessive lateral shoulder tilt ({posture.mean_shoulder_tilt:.3f}) or cervical flexion ({posture.mean_neck_deviation_deg:.1f}°) detected."
        )

    metric = MetricCheckResult(
        key="posture",
        title_ja="③ Posture (立位姿勢)",
        title_en="3. Upright Posture & Symmetry",
        passed=passed,
        score=score,
        max_score=POSTURE_SCORE_MAX,
        summary_ja=summary_ja,
        summary_en=summary_en,
        detail_ja=detail_ja,
        detail_en=detail_en,
    )
    return metric, events


def _score_fillers(
    fillers: List[FillerOccurrence],
) -> Tuple[MetricCheckResult, List[TimelineEvent]]:
    events: List[TimelineEvent] = []
    count = len(fillers)

    for item in fillers:
        events.append(
            TimelineEvent(
                timestamp_ms=item.timestamp_ms,
                formatted_time=item.formatted_time,
                category="filler",
                severity="warning" if count <= 2 else "error",
                label_ja=f"{item.formatted_time} フィラー「{item.word}」",
                label_en=f"{item.formatted_time} Filler \"{item.word}\"",
            )
        )

    if count == 0:
        score = FILLER_SCORE_MAX
        passed = True
        summary_ja = "PASS — 0回検出 (明瞭な発話)"
        summary_en = "PASS — 0 fillers detected"
        detail_ja = "つなぎ言葉（あの・えっと等）は検出されませんでした。"
        detail_en = "No conversational filler tokens were detected across the transcript."
    else:
        score = 10 if count <= 2 else 0
        passed = False
        formatted_items = ", ".join(f"{f.formatted_time}「{f.word}」" for f in fillers)
        formatted_items_en = ", ".join(f"{f.formatted_time} \"{f.word}\"" for f in fillers)
        summary_ja = f"FAIL — {count}回検出 ({formatted_items})"
        summary_en = f"FAIL — {count} detected ({formatted_items_en})"
        detail_ja = "面接時は言葉に詰まった際も無音の間（ポーズ）を保ち、つなぎ言葉を抑えましょう。"
        detail_en = "Replace vocalized hesitations with silent pauses during formal interview responses."

    metric = MetricCheckResult(
        key="filler_words",
        title_ja="④ Filler Words (つなぎ言葉)",
        title_en="4. Conversational Fillers",
        passed=passed,
        score=score,
        max_score=FILLER_SCORE_MAX,
        summary_ja=summary_ja,
        summary_en=summary_en,
        detail_ja=detail_ja,
        detail_en=detail_en,
    )
    return metric, events


def evaluate_manner_session(
    session_id: str,
    frames: List[PoseFrame],
    transcript_text: str,
    words: List[WordToken],
    fillers: List[FillerOccurrence],
    target_bow_angle: Literal[15, 30, 45] = 45,
) -> DiagnosticResponse:
    bow_summary, posture_summary = evaluate_bow_and_posture(frames, target_bow_angle=target_bow_angle)

    m_bow, ev_bow = _score_bow_angle(bow_summary)
    m_gosen, ev_gosen = _score_gosen_reirei(frames, words, bow_summary)
    m_posture, ev_posture = _score_posture(posture_summary)
    m_fillers, ev_fillers = _score_fillers(fillers)

    metrics = [m_bow, m_gosen, m_posture, m_fillers]
    total_score = sum(m.score for m in metrics)

    if total_score >= 85:
        grade_ja = "A — 面接基準クリア"
        grade_en = "Grade A — Etiquette Standard Met"
    elif total_score >= 70:
        grade_ja = "B — 軽微な改善推奨"
        grade_en = "Grade B — Minor Adjustments Needed"
    else:
        grade_ja = "C — 要改善 (基本動作の再確認)"
        grade_en = "Grade C — Action Required"

    timeline_events = sorted(
        ev_gosen + ev_bow + ev_posture + ev_fillers,
        key=lambda e: e.timestamp_ms,
    )

    ideal_frames = generate_ideal_reference_frames(frames, target_bow_angle, bow_summary)
    duration_ms = frames[-1].timestamp_ms if frames else 0

    return DiagnosticResponse(
        session_id=session_id,
        duration_ms=duration_ms,
        target_bow_angle=target_bow_angle,
        total_score=total_score,
        grade_label_ja=grade_ja,
        grade_label_en=grade_en,
        metrics=metrics,
        bow_summary=bow_summary,
        posture_summary=posture_summary,
        transcript_text=transcript_text,
        words=words,
        filler_occurrences=fillers,
        timeline_events=timeline_events,
        frames=frames,
        ideal_frames=ideal_frames,
    )

