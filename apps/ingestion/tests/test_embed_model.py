import numpy as np
import pytest

from embed import model as embed_model


class FakeTokenizer:
    def encode(self, text, add_special_tokens=False, truncation=True, max_length=256):
        return text.split()[:max_length]

    def decode(self, ids, skip_special_tokens=True):
        return " ".join(ids)


class FakeModel:
    def __init__(self, vector):
        self.tokenizer = FakeTokenizer()
        self._vector = vector

    def encode(self, text, convert_to_numpy=True, normalize_embeddings=False):
        return np.array(self._vector, dtype=np.float32)


def test_tokenize_and_decode_truncates():
    fake = FakeModel([0.1, 0.2])
    result = embed_model.tokenize_and_decode("one two three four", max_tokens=2, model=fake)
    assert result == "one two"


def test_embed_returns_list_of_floats():
    fake = FakeModel([0.1, 0.2, 0.3])
    vector = embed_model.embed("some text", model=fake)
    assert vector == pytest.approx([0.1, 0.2, 0.3], abs=1e-6)


def test_embed_raises_on_non_finite_vector():
    fake = FakeModel([float("nan"), 0.2])
    with pytest.raises(embed_model.EmbeddingFailedError, match="non-finite"):
        embed_model.embed("bad text", model=fake)


def test_embed_raises_on_zero_norm_vector():
    fake = FakeModel([0.0, 0.0, 0.0])
    with pytest.raises(embed_model.EmbeddingFailedError, match="zero-norm"):
        embed_model.embed("empty text", model=fake)


def test_checksum_recorded_on_first_run(tmp_path, monkeypatch):
    monkeypatch.setattr(embed_model, "CHECKSUM_PATH", tmp_path / "CHECKSUMS.txt")
    model_dir = tmp_path / "snapshot"
    model_dir.mkdir()
    (model_dir / "model.safetensors").write_bytes(b"fake-weights")
    monkeypatch.setattr(embed_model, "_snapshot_download", lambda: str(model_dir))

    local_dir = embed_model._download_and_verify()

    assert local_dir == str(model_dir)
    assert (tmp_path / "CHECKSUMS.txt").exists()
    assert "model.safetensors" in (tmp_path / "CHECKSUMS.txt").read_text()


def test_checksum_mismatch_raises(tmp_path, monkeypatch):
    monkeypatch.setattr(embed_model, "CHECKSUM_PATH", tmp_path / "CHECKSUMS.txt")
    model_dir = tmp_path / "snapshot"
    model_dir.mkdir()
    (model_dir / "model.safetensors").write_bytes(b"fake-weights")
    monkeypatch.setattr(embed_model, "_snapshot_download", lambda: str(model_dir))
    (tmp_path / "CHECKSUMS.txt").write_text("model.safetensors\tdeadbeef\n")

    with pytest.raises(embed_model.ChecksumMismatchError):
        embed_model._download_and_verify()
