from __future__ import annotations

import logging
import math
from typing import Dict, List, Literal, Tuple

import numpy as np

from schemas import (
    BowIntervalSummary,
    Landmark2D,
    Landmark3D,
    PoseFrame,
    PostureSummary,
)

logger = logging.getLogger("manner_ai.kinematics")

LEFT_EAR_IDX = 7
RIGHT_EAR_IDX = 8
LEFT_SHOULDER_IDX = 11
RIGHT_SHOULDER_IDX = 12
LEFT_HIP_IDX = 23
RIGHT_HIP_IDX = 24

# MediaPipe world coordinates exhibit ~1.5-2.0 deg single-frame jitter at 30 FPS;
# a 5-frame (~166ms) uniform moving average suppresses high-frequency keypoint noise
# without attenuating the peak inclination of a 1.2s-2.0s Japanese bow.
SMOOTHING_WINDOW_FRAMES = 5
UPRIGHT_CALIBRATION_WINDOW_MS = 1000
BOW_ACTIVE_THRESHOLD_DEG = 10.0
MIN_BOW_DURATION_MS = 400
CERVICAL_FLEXION_LIMIT_DEG = 18.0
LATERAL_SHOULDER_TILT_LIMIT = 0.035

TARGET_WINDOWS: Dict[int, Tuple[float, float]] = {
    15: (11.0, 20.0),
    30: (25.0, 35.0),
    45: (40.0, 50.0),
}


def _midpoint_3d(a: Landmark3D, b: Landmark3D) -> np.ndarray:
    return np.array(
        [(a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5],
        dtype=np.float64,
    )


def _vector_angle_deg(v1: np.ndarray, v2: np.ndarray) -> float:
    norm1 = float(np.linalg.norm(v1))
    norm2 = float(np.linalg.norm(v2))
    if norm1 < 1e-8 or norm2 < 1e-8:
        return 0.0
    cos_sim = float(np.clip(np.dot(v1, v2) / (norm1 * norm2), -1.0, 1.0))
    return float(math.degrees(math.acos(cos_sim)))


def extract_torso_and_neck_vectors(frame: PoseFrame) -> Tuple[np.ndarray, np.ndarray]:
    wl = frame.world_landmarks_3d
    shoulder_mid = _midpoint_3d(wl[LEFT_SHOULDER_IDX], wl[RIGHT_SHOULDER_IDX])
    hip_mid = _midpoint_3d(wl[LEFT_HIP_IDX], wl[RIGHT_HIP_IDX])
    ear_mid = _midpoint_3d(wl[LEFT_EAR_IDX], wl[RIGHT_EAR_IDX])

    v_torso = shoulder_mid - hip_mid
    v_neck = ear_mid - shoulder_mid
    return v_torso, v_neck


def moving_average_filter(values: List[float], window: int = SMOOTHING_WINDOW_FRAMES) -> List[float]:
    if not values or window <= 1:
        return list(values)
    n = len(values)
    smoothed: List[float] = []
    half = window // 2
    for i in range(n):
        start = max(0, i - half)
        end = min(n, i + half + 1)
        smoothed.append(float(np.mean(values[start:end])))
    return smoothed


def recalibrate_and_smooth_frames(frames: List[PoseFrame]) -> List[PoseFrame]:
    if not frames:
        return []

    t0 = frames[0].timestamp_ms
    torso_vectors: List[np.ndarray] = []
    neck_vectors: List[np.ndarray] = []

    for frame in frames:
        v_torso, v_neck = extract_torso_and_neck_vectors(frame)
        torso_vectors.append(v_torso)
        neck_vectors.append(v_neck)

    # Calibrate upright reference vector from the initial 1.0s stance window so that
    # a 30-45 deg diagonal camera yaw does not distort forward pitch measurement.
    baseline_candidates = [
        vec
        for frame, vec in zip(frames, torso_vectors)
        if (frame.timestamp_ms - t0) <= UPRIGHT_CALIBRATION_WINDOW_MS
    ]
    if not baseline_candidates:
        baseline_candidates = [torso_vectors[0]]

    v_base = np.mean(np.stack(baseline_candidates, axis=0), axis=0)
    if float(np.linalg.norm(v_base)) < 1e-8:
        v_base = np.array([0.0, -1.0, 0.0], dtype=np.float64)

    raw_torso_angles: List[float] = []
    raw_neck_angles: List[float] = []
    for v_torso, v_neck in zip(torso_vectors, neck_vectors):
        raw_torso_angles.append(_vector_angle_deg(v_torso, v_base))
        raw_neck_angles.append(_vector_angle_deg(v_torso, v_neck))

    smoothed_torso = moving_average_filter(raw_torso_angles, SMOOTHING_WINDOW_FRAMES)
    smoothed_neck = moving_average_filter(raw_neck_angles, SMOOTHING_WINDOW_FRAMES)

    calibrated_frames: List[PoseFrame] = []
    for idx, frame in enumerate(frames):
        t_angle = round(smoothed_torso[idx], 2)
        n_angle = round(smoothed_neck[idx], 2)
        l_sh = frame.landmarks_2d[LEFT_SHOULDER_IDX]
        r_sh = frame.landmarks_2d[RIGHT_SHOULDER_IDX]
        shoulder_tilt = abs(l_sh.y - r_sh.y)
        posture_ok = (shoulder_tilt < LATERAL_SHOULDER_TILT_LIMIT) and (
            n_angle <= CERVICAL_FLEXION_LIMIT_DEG
        )

        calibrated_frames.append(
            PoseFrame(
                timestamp_ms=frame.timestamp_ms,
                landmarks_2d=frame.landmarks_2d,
                world_landmarks_3d=frame.world_landmarks_3d,
                torso_angle_deg=t_angle,
                neck_angle_deg=n_angle,
                posture_ok=posture_ok,
            )
        )

    return calibrated_frames


def evaluate_bow_and_posture(
    frames: List[PoseFrame],
    target_bow_angle: Literal[15, 30, 45] = 45,
) -> Tuple[BowIntervalSummary, PostureSummary]:
    min_target, max_target = TARGET_WINDOWS.get(target_bow_angle, (40.0, 50.0))

    if not frames:
        return (
            BowIntervalSummary(
                detected=False,
                target_angle_deg=target_bow_angle,
                target_min_deg=min_target,
                target_max_deg=max_target,
            ),
            PostureSummary(
                upright_frame_count=0,
                stable_frame_count=0,
                stability_ratio=1.0,
                mean_shoulder_tilt=0.0,
                mean_neck_deviation_deg=0.0,
            ),
        )

    intervals: List[Tuple[int, int]] = []
    current_start: int | None = None

    for idx, frame in enumerate(frames):
        if frame.torso_angle_deg > BOW_ACTIVE_THRESHOLD_DEG:
            if current_start is None:
                current_start = idx
        else:
            if current_start is not None:
                intervals.append((current_start, idx - 1))
                current_start = None
    if current_start is not None:
        intervals.append((current_start, len(frames) - 1))

    valid_intervals: List[Tuple[int, int, float, int]] = []
    for s_idx, e_idx in intervals:
        duration_ms = frames[e_idx].timestamp_ms - frames[s_idx].timestamp_ms
        # Also allow compact frame series in unit tests where step size represents >= 400ms
        if duration_ms >= MIN_BOW_DURATION_MS:
            sub = frames[s_idx : e_idx + 1]
            peak_rel_idx = int(np.argmax([f.torso_angle_deg for f in sub]))
            peak_idx = s_idx + peak_rel_idx
            peak_angle = frames[peak_idx].torso_angle_deg
            valid_intervals.append((s_idx, e_idx, peak_angle, peak_idx))

    if valid_intervals:
        # Select the primary bow interval with the highest peak inclination angle.
        best_s, best_e, peak_angle, peak_idx = max(valid_intervals, key=lambda item: item[2])
        bow_slice = frames[best_s : best_e + 1]
        max_neck_dev = max(f.neck_angle_deg for f in bow_slice)

        if peak_angle < min_target:
            angle_error = round(peak_angle - min_target, 2)
        elif peak_angle > max_target:
            angle_error = round(peak_angle - max_target, 2)
        else:
            angle_error = 0.0

        bow_summary = BowIntervalSummary(
            detected=True,
            start_ms=frames[best_s].timestamp_ms,
            peak_ms=frames[peak_idx].timestamp_ms,
            end_ms=frames[best_e].timestamp_ms,
            peak_angle_deg=round(peak_angle, 2),
            target_angle_deg=target_bow_angle,
            target_min_deg=min_target,
            target_max_deg=max_target,
            angle_error_deg=angle_error,
            max_neck_deviation_deg=round(max_neck_dev, 2),
            kubi_ojigi_detected=max_neck_dev > CERVICAL_FLEXION_LIMIT_DEG,
        )
    else:
        global_peak_idx = int(np.argmax([f.torso_angle_deg for f in frames]))
        peak_angle = frames[global_peak_idx].torso_angle_deg
        angle_error = round(peak_angle - min_target, 2) if peak_angle < min_target else 0.0
        bow_summary = BowIntervalSummary(
            detected=False,
            start_ms=None,
            peak_ms=frames[global_peak_idx].timestamp_ms,
            end_ms=None,
            peak_angle_deg=round(peak_angle, 2),
            target_angle_deg=target_bow_angle,
            target_min_deg=min_target,
            target_max_deg=max_target,
            angle_error_deg=angle_error,
            max_neck_deviation_deg=round(max(f.neck_angle_deg for f in frames), 2),
            kubi_ojigi_detected=False,
        )

    upright_frames = [f for f in frames if f.torso_angle_deg <= BOW_ACTIVE_THRESHOLD_DEG]
    if not upright_frames:
        upright_frames = frames

    stable_count = 0
    tilts: List[float] = []
    neck_devs: List[float] = []

    for f in upright_frames:
        tilt = abs(f.landmarks_2d[LEFT_SHOULDER_IDX].y - f.landmarks_2d[RIGHT_SHOULDER_IDX].y)
        tilts.append(tilt)
        neck_devs.append(f.neck_angle_deg)
        if tilt < LATERAL_SHOULDER_TILT_LIMIT and f.neck_angle_deg <= CERVICAL_FLEXION_LIMIT_DEG:
            stable_count += 1

    stability_ratio = round(stable_count / len(upright_frames), 4)
    posture_summary = PostureSummary(
        upright_frame_count=len(upright_frames),
        stable_frame_count=stable_count,
        stability_ratio=stability_ratio,
        mean_shoulder_tilt=round(float(np.mean(tilts)), 4),
        mean_neck_deviation_deg=round(float(np.mean(neck_devs)), 2),
    )

    return bow_summary, posture_summary


def generate_ideal_reference_frames(
    actual_frames: List[PoseFrame],
    target_bow_angle: Literal[15, 30, 45],
    bow_summary: BowIntervalSummary,
) -> List[PoseFrame]:
    """Synthesizes an ideal 33-landmark skeletal trajectory matching the session timestamps."""
    if not actual_frames:
        return []

    total_duration = actual_frames[-1].timestamp_ms
    start_ms = bow_summary.start_ms if bow_summary.start_ms is not None else int(total_duration * 0.32)
    end_ms = bow_summary.end_ms if bow_summary.end_ms is not None else int(total_duration * 0.65)
    if end_ms <= start_ms + 600:
        end_ms = min(total_duration, start_ms + 2400)

    span = max(600, end_ms - start_ms)
    descent_end = start_ms + int(span * 0.32)
    hold_end = start_ms + int(span * 0.58)

    ideal_frames: List[PoseFrame] = []
    for frame in actual_frames:
        t = frame.timestamp_ms
        if t <= start_ms or t >= end_ms:
            ideal_angle = 0.0
        elif t <= descent_end:
            progress = (t - start_ms) / max(1, descent_end - start_ms)
            # Smooth cosine ease-in-out profile for biomechanically natural hip hinge
            ideal_angle = float(target_bow_angle) * 0.5 * (1.0 - math.cos(math.pi * progress))
        elif t <= hold_end:
            ideal_angle = float(target_bow_angle)
        else:
            progress = (t - hold_end) / max(1, end_ms - hold_end)
            ideal_angle = float(target_bow_angle) * 0.5 * (1.0 + math.cos(math.pi * progress))

        ideal_frames.append(_build_synthetic_skeleton_frame(t, round(ideal_angle, 2), neck_flexion_deg=2.5))

    return ideal_frames


def _build_synthetic_skeleton_frame(
    timestamp_ms: int,
    torso_angle_deg: float,
    neck_flexion_deg: float = 2.5,
    shoulder_tilt_offset: float = 0.0,
) -> PoseFrame:
    """Constructs a 33-landmark diagonal-view human skeleton pitched at `torso_angle_deg`."""
    theta = math.radians(torso_angle_deg)
    neck_theta = math.radians(torso_angle_deg + neck_flexion_deg)

    # Diagonal 35-degree stance projection factors
    diag_cos = math.cos(math.radians(35.0))
    diag_sin = math.sin(math.radians(35.0))

    hip_center_2d = (0.48, 0.58)
    torso_len_2d = 0.24
    neck_len_2d = 0.11
    upper_leg_2d = 0.18
    lower_leg_2d = 0.17

    # Forward bow rotates upper body toward the left-forward diagonal (-X, +Y in screen space)
    sh_center_x = hip_center_2d[0] - torso_len_2d * math.sin(theta) * 0.85
    sh_center_y = hip_center_2d[1] - torso_len_2d * math.cos(theta)

    head_center_x = sh_center_x - neck_len_2d * math.sin(neck_theta) * 0.85
    head_center_y = sh_center_y - neck_len_2d * math.cos(neck_theta)

    landmarks_2d: List[Landmark2D] = [
        Landmark2D(x=head_center_x, y=head_center_y, z=0.0, visibility=0.99)
        for _ in range(33)
    ]
    world_landmarks_3d: List[Landmark3D] = [
        Landmark3D(x=0.0, y=0.0, z=0.0, visibility=0.99) for _ in range(33)
    ]

    # World 3D coordinates (meters, origin at hip center, Y negative upward)
    torso_len_3d = 0.48
    neck_len_3d = 0.20
    sh_mid_3d = (
        -torso_len_3d * math.sin(theta) * diag_cos,
        -torso_len_3d * math.cos(theta),
        -torso_len_3d * math.sin(theta) * diag_sin,
    )
    ear_mid_3d = (
        sh_mid_3d[0] - neck_len_3d * math.sin(neck_theta) * diag_cos,
        sh_mid_3d[1] - neck_len_3d * math.cos(neck_theta),
        sh_mid_3d[2] - neck_len_3d * math.sin(neck_theta) * diag_sin,
    )

    def set_joint(idx: int, x2: float, y2: float, x3: float, y3: float, z3: float) -> None:
        landmarks_2d[idx] = Landmark2D(
            x=round(float(np.clip(x2, 0.02, 0.98)), 5),
            y=round(float(np.clip(y2, 0.02, 0.98)), 5),
            z=round(z3, 5),
            visibility=0.99,
        )
        world_landmarks_3d[idx] = Landmark3D(
            x=round(x3, 5),
            y=round(y3, 5),
            z=round(z3, 5),
            visibility=0.99,
        )

    # Head & Ears (0, 7, 8)
    set_joint(0, head_center_x - 0.02, head_center_y, ear_mid_3d[0] - 0.04, ear_mid_3d[1], ear_mid_3d[2])
    set_joint(LEFT_EAR_IDX, head_center_x - 0.025, head_center_y - 0.01, ear_mid_3d[0] - 0.03, ear_mid_3d[1], ear_mid_3d[2] + 0.06)
    set_joint(RIGHT_EAR_IDX, head_center_x + 0.025, head_center_y + 0.005, ear_mid_3d[0] + 0.03, ear_mid_3d[1], ear_mid_3d[2] - 0.06)

    # Shoulders (11, 12)
    set_joint(
        LEFT_SHOULDER_IDX,
        sh_center_x - 0.045,
        sh_center_y - shoulder_tilt_offset * 0.5,
        sh_mid_3d[0] - 0.09,
        sh_mid_3d[1],
        sh_mid_3d[2] + 0.15,
    )
    set_joint(
        RIGHT_SHOULDER_IDX,
        sh_center_x + 0.045,
        sh_center_y + shoulder_tilt_offset * 0.5,
        sh_mid_3d[0] + 0.09,
        sh_mid_3d[1],
        sh_mid_3d[2] - 0.15,
    )

    # Arms aligned neatly along torso sides toward thighs (13, 14, 15, 16)
    arm_angle = theta * 0.88
    elbow_offset_x = -0.11 * math.sin(arm_angle)
    elbow_offset_y = 0.12 * math.cos(arm_angle)
    wrist_offset_x = -0.20 * math.sin(arm_angle) - 0.02
    wrist_offset_y = 0.23 * math.cos(arm_angle)

    set_joint(13, sh_center_x - 0.045 + elbow_offset_x, sh_center_y + elbow_offset_y, sh_mid_3d[0] - 0.09, sh_mid_3d[1] + 0.24, sh_mid_3d[2] + 0.16)
    set_joint(14, sh_center_x + 0.045 + elbow_offset_x, sh_center_y + elbow_offset_y, sh_mid_3d[0] + 0.09, sh_mid_3d[1] + 0.24, sh_mid_3d[2] - 0.16)
    set_joint(15, sh_center_x - 0.04 + wrist_offset_x, sh_center_y + wrist_offset_y, -0.06, -0.02, 0.15)
    set_joint(16, sh_center_x + 0.04 + wrist_offset_x, sh_center_y + wrist_offset_y, 0.06, -0.02, -0.15)

    # Hips (23, 24)
    set_joint(LEFT_HIP_IDX, hip_center_2d[0] - 0.035, hip_center_2d[1], -0.06, 0.0, 0.11)
    set_joint(RIGHT_HIP_IDX, hip_center_2d[0] + 0.035, hip_center_2d[1], 0.06, 0.0, -0.11)

    # Knees (25, 26) & Ankles (27, 28)
    set_joint(25, hip_center_2d[0] - 0.035, hip_center_2d[1] + upper_leg_2d, -0.06, 0.42, 0.11)
    set_joint(26, hip_center_2d[0] + 0.035, hip_center_2d[1] + upper_leg_2d, 0.06, 0.42, -0.11)
    set_joint(27, hip_center_2d[0] - 0.035, hip_center_2d[1] + upper_leg_2d + lower_leg_2d, -0.06, 0.82, 0.11)
    set_joint(28, hip_center_2d[0] + 0.035, hip_center_2d[1] + upper_leg_2d + lower_leg_2d, 0.06, 0.82, -0.11)

    posture_ok = (shoulder_tilt_offset < LATERAL_SHOULDER_TILT_LIMIT) and (
        neck_flexion_deg <= CERVICAL_FLEXION_LIMIT_DEG
    )

    return PoseFrame(
        timestamp_ms=timestamp_ms,
        landmarks_2d=landmarks_2d,
        world_landmarks_3d=world_landmarks_3d,
        torso_angle_deg=round(torso_angle_deg, 2),
        neck_angle_deg=round(neck_flexion_deg, 2),
        posture_ok=posture_ok,
    )

