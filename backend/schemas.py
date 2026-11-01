from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class Landmark2D(BaseModel):
    x: float = Field(..., description="Normalized horizontal coordinate [0.0, 1.0]")
    y: float = Field(..., description="Normalized vertical coordinate [0.0, 1.0]")
    z: float = Field(0.0, description="Relative depth in image space")
    visibility: float = Field(1.0, ge=0.0, le=1.0)


class Landmark3D(BaseModel):
    x: float = Field(..., description="World X coordinate in meters relative to hip center")
    y: float = Field(..., description="World Y coordinate in meters relative to hip center")
    z: float = Field(..., description="World Z coordinate in meters relative to hip center")
    visibility: float = Field(1.0, ge=0.0, le=1.0)


class PoseFrame(BaseModel):
    timestamp_ms: int = Field(..., ge=0, description="Elapsed session timestamp in milliseconds")
    landmarks_2d: List[Landmark2D] = Field(..., min_length=33, max_length=33)
    world_landmarks_3d: List[Landmark3D] = Field(..., min_length=33, max_length=33)
    torso_angle_deg: float = Field(..., ge=0.0, le=180.0)
    neck_angle_deg: float = Field(..., ge=0.0, le=180.0)
    posture_ok: bool


class WordToken(BaseModel):
    word: str
    start_ms: int = Field(..., ge=0)
    end_ms: int = Field(..., ge=0)
    is_filler: bool = False


class FillerOccurrence(BaseModel):
    word: str
    timestamp_ms: int = Field(..., ge=0)
    formatted_time: str


class TimelineEvent(BaseModel):
    timestamp_ms: int = Field(..., ge=0)
    formatted_time: str
    category: Literal["gosen_reirei", "bow_angle", "posture", "filler"]
    severity: Literal["error", "warning", "info"]
    label_ja: str
    label_en: str


class MetricCheckResult(BaseModel):
    key: Literal["bow_angle", "gosen_reirei", "posture", "filler_words"]
    title_ja: str
    title_en: str
    passed: bool
    score: int = Field(..., ge=0)
    max_score: int = Field(..., gt=0)
    summary_ja: str
    summary_en: str
    detail_ja: str
    detail_en: str


class BowIntervalSummary(BaseModel):
    detected: bool
    start_ms: Optional[int] = None
    peak_ms: Optional[int] = None
    end_ms: Optional[int] = None
    peak_angle_deg: float = 0.0
    target_angle_deg: int = 45
    target_min_deg: float = 40.0
    target_max_deg: float = 50.0
    angle_error_deg: float = 0.0
    max_neck_deviation_deg: float = 0.0
    kubi_ojigi_detected: bool = False


class PostureSummary(BaseModel):
    upright_frame_count: int
    stable_frame_count: int
    stability_ratio: float = Field(..., ge=0.0, le=1.0)
    mean_shoulder_tilt: float = Field(..., ge=0.0)
    mean_neck_deviation_deg: float = Field(..., ge=0.0)


class DiagnosticResponse(BaseModel):
    session_id: str
    duration_ms: int = Field(..., ge=0)
    target_bow_angle: Literal[15, 30, 45]
    total_score: int = Field(..., ge=0, le=100)
    grade_label_ja: str
    grade_label_en: str
    metrics: List[MetricCheckResult]
    bow_summary: BowIntervalSummary
    posture_summary: PostureSummary
    transcript_text: str
    words: List[WordToken]
    filler_occurrences: List[FillerOccurrence]
    timeline_events: List[TimelineEvent]
    frames: List[PoseFrame]
    ideal_frames: List[PoseFrame]

