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
    # m.predict() wraps its result in np.array(..., copy=False), which raises under
    # NumPy 2.x (fasttext-wheel 0.9.2 predates that change) — call the underlying
    # binding directly instead, same contract (list of (prob, label) tuples).
    predictions = m.f.predict(normalized + "\n", 1, 0.0, "strict")
    if not predictions:
        return source_language
    confidence, label = predictions[0]
    detected = label.replace("__label__", "")
    return detected if confidence >= OVERRIDE_THRESHOLD else source_language


def decide_skip_reason(detected_language: str, supported_languages: list[str]) -> Optional[str]:
    return None if detected_language in supported_languages else "unsupported_language"
