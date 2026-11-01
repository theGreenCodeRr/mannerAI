from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Tuple

from schemas import FillerOccurrence, WordToken

logger = logging.getLogger("manner_ai.asr")

JAPANESE_FILLERS: Tuple[str, ...] = (
    "あのー",
    "あの",
    "えっと",
    "えーと",
    "えー",
    "その",
    "なんか",
    "まあ",
)

INITIAL_PROMPT_JA = (
    "あの、えっと、えー、その、なんか、本日はよろしくお願いいたします。ありがとうございました。"
)


def format_mm_ss(timestamp_ms: int) -> str:
    total_seconds = max(0, int(round(timestamp_ms / 1000.0)))
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}:{seconds:02d}"


def normalize_token(raw_word: str) -> str:
    return raw_word.strip().strip("、。！？,.!?「」『』（）() ")


def detect_filler_in_token(raw_word: str) -> str | None:
    cleaned = normalize_token(raw_word)
    if not cleaned:
        return None
    for filler in JAPANESE_FILLERS:
        if cleaned == filler or cleaned.startswith(filler + "、"):
            return filler
    return None


class WhisperASRService:
    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def _get_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            logger.info(
                "Initializing faster-whisper model (size=%s, device=%s, compute_type=%s)",
                self.model_size,
                self.device,
                self.compute_type,
            )
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe_audio(
        self, audio_path: Path
    ) -> Tuple[str, List[WordToken], List[FillerOccurrence]]:
        model = self._get_model()
        # Supplying an explicit Japanese filler prompt biases Whisper's decoder
        # against suppressing disfluencies that standard ASR models normally strip.
        segments, _info = model.transcribe(
            str(audio_path),
            language="ja",
            word_timestamps=True,
            vad_filter=True,
            initial_prompt=INITIAL_PROMPT_JA,
        )

        words: List[WordToken] = []
        fillers: List[FillerOccurrence] = []
        transcript_parts: List[str] = []

        for segment in segments:
            if segment.text:
                transcript_parts.append(segment.text.strip())
            segment_words = getattr(segment, "words", None) or []
            for w in segment_words:
                raw_text = w.word.strip()
                if not raw_text:
                    continue
                start_ms = max(0, int(round(w.start * 1000.0)))
                end_ms = max(start_ms, int(round(w.end * 1000.0)))
                matched_filler = detect_filler_in_token(raw_text)
                is_filler = matched_filler is not None

                words.append(
                    WordToken(
                        word=raw_text,
                        start_ms=start_ms,
                        end_ms=end_ms,
                        is_filler=is_filler,
                    )
                )
                if is_filler and matched_filler is not None:
                    fillers.append(
                        FillerOccurrence(
                            word=matched_filler,
                            timestamp_ms=start_ms,
                            formatted_time=format_mm_ss(start_ms),
                        )
                    )

        full_transcript = " ".join(transcript_parts).strip()
        return full_transcript, words, fillers

