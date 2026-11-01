from __future__ import annotations

import json
import logging
import tempfile
import uuid
from pathlib import Path
from typing import Dict, List, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter, ValidationError

from asr.whisper_engine import WhisperASRService
from kinematics.bow_evaluator import recalibrate_and_smooth_frames
from schemas import DiagnosticResponse, PoseFrame
from scoring.manner_scorer import evaluate_manner_session

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("manner_ai.api")

app = FastAPI(
    title="MannerAI Verification Engine",
    description="On-device Multimodal Japanese Job-Hunting Interview Etiquette Analysis API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

asr_service = WhisperASRService(model_size="base", device="cpu", compute_type="int8")
_pose_frame_list_adapter = TypeAdapter(List[PoseFrame])


@app.get("/api/health")
async def health_check() -> Dict[str, str]:
    return {
        "status": "ok",
        "service": "manner-ai-backend",
        "asr_model": asr_service.model_size,
        "privacy_mode": "skeletal_coordinates_only",
    }


@app.post("/api/analyze", response_model=DiagnosticResponse)
async def analyze_session(
    audio_file: UploadFile = File(...),
    frames_json: str = Form(...),
    target_bow_angle: int = Form(45),
) -> DiagnosticResponse:
    if target_bow_angle not in (15, 30, 45):
        raise HTTPException(
            status_code=422,
            detail="target_bow_angle must be one of 15 (Eshaku), 30 (Keirei), or 45 (Saikeirei).",
        )
    validated_target: Literal[15, 30, 45] = target_bow_angle  # type: ignore[assignment]

    try:
        raw_frames_data = json.loads(frames_json)
        parsed_frames = _pose_frame_list_adapter.validate_python(raw_frames_data)
    except (json.JSONDecodeError, ValidationError) as exc:
        logger.warning("Invalid frames_json payload: %s", exc)
        raise HTTPException(status_code=422, detail=f"Invalid skeletal frames payload: {exc}") from exc

    if not parsed_frames:
        raise HTTPException(status_code=422, detail="frames_json must contain at least one PoseFrame.")

    calibrated_frames = recalibrate_and_smooth_frames(parsed_frames)

    suffix = Path(audio_file.filename or "session.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_audio:
        tmp_path = Path(tmp_audio.name)
        content = await audio_file.read()
        tmp_audio.write(content)

    try:
        if len(content) > 128:
            transcript_text, words, fillers = asr_service.transcribe_audio(tmp_path)
        else:
            logger.info("Empty or minimal audio buffer received; proceeding with kinematic-only evaluation.")
            transcript_text, words, fillers = "", [], []
    except Exception as exc:
        logger.warning(
            "ASR transcription encountered an error (%s); proceeding with kinematic evaluation.",
            exc,
        )
        transcript_text, words, fillers = "(音声認識スキップ / Audio analysis skipped)", [], []
    finally:
        tmp_path.unlink(missing_ok=True)

    session_id = f"session-{uuid.uuid4().hex[:8]}"
    diagnostic = evaluate_manner_session(
        session_id=session_id,
        frames=calibrated_frames,
        transcript_text=transcript_text,
        words=words,
        fillers=fillers,
        target_bow_angle=validated_target,
    )
    logger.info(
        "Session %s analyzed: score=%d/100, peak_bow=%.1f deg (target=%d deg), fillers=%d",
        session_id,
        diagnostic.total_score,
        diagnostic.bow_summary.peak_angle_deg,
        validated_target,
        len(fillers),
    )
    return diagnostic

