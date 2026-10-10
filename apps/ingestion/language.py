"""Language detection (ARCHITECTURE §5): fastText lid.176, overriding the source's declared
language only at high confidence on long-enough normalized text."""
from __future__ import annotations

import pathlib
from typing import Optional

MIN_CHARS = 40
OVERRIDE_THRESHOLD = 0.95
MODEL_PATH = pathlib.Path(__file__).resolve().parent / "models" / "lid.176.bin"

_model = None


def _get_model():
    global _model
    if _model is None:
        import fasttext
        _model = fasttext.load_model(str(MODEL_PATH))
    return _model


def detect_language(text: str, source_language: str, model=None) -> str:
    normalized = " ".join(text.split())
    if len(normalized) < MIN_CHARS:
        return source_language
    m = model if model is not None else _get_model()
    labels, probs = m.predict(normalized, k=1)
    detected = labels[0].replace("__label__", "")
    confidence = probs[0]
    return detected if confidence >= OVERRIDE_THRESHOLD else source_language


def decide_skip_reason(detected_language: str, supported_languages: list[str]) -> Optional[str]:
    return None if detected_language in supported_languages else "unsupported_language"
