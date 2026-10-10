from language import decide_skip_reason, detect_language


class FakeModel:
    def __init__(self, label: str, confidence: float):
        self.label, self.confidence = label, confidence

    def predict(self, text, k=1):
        return ([f"__label__{self.label}"], [self.confidence])


def test_short_text_uses_source_language():
    result = detect_language("short", "ta", model=FakeModel("en", 0.99))
    assert result == "ta"  # under 40 chars: detector never consulted for the decision


def test_long_text_high_confidence_overrides_source_language():
    text = "This is a sufficiently long piece of English text for detection. " * 2
    result = detect_language(text, "ta", model=FakeModel("en", 0.97))
    assert result == "en"


def test_long_text_low_confidence_keeps_source_language():
    text = "This is a sufficiently long piece of English text for detection. " * 2
    result = detect_language(text, "ta", model=FakeModel("en", 0.80))
    assert result == "ta"


def test_decide_skip_reason_for_unsupported_language():
    assert decide_skip_reason("hi", ["en"]) == "unsupported_language"


def test_decide_skip_reason_for_supported_language():
    assert decide_skip_reason("en", ["en"]) is None
