"""Pinned sentence-transformers embedding model (ARCHITECTURE §2, §5). Pin-on-first-use:
the first run downloads the pinned revision and records file checksums; every later run
re-verifies against that recorded file and refuses to start on mismatch."""
from __future__ import annotations

import hashlib
import pathlib

import numpy as np

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
EMBEDDING_MODEL_ID = f"all-MiniLM-L6-v2@{MODEL_REVISION}"
MAX_TOKENS = 256
CHECKSUM_PATH = pathlib.Path(__file__).resolve().parent.parent / "models" / "CHECKSUMS.txt"

_model = None


class EmbeddingFailedError(Exception):
    pass


class ChecksumMismatchError(Exception):
    pass


def _snapshot_download() -> str:
    from huggingface_hub import snapshot_download
    return snapshot_download(repo_id=MODEL_NAME, revision=MODEL_REVISION)


def _file_checksums(local_dir: str) -> dict[str, str]:
    return {
        f.name: hashlib.sha256(f.read_bytes()).hexdigest()
        for f in sorted(pathlib.Path(local_dir).rglob("*")) if f.is_file()
    }


def _download_and_verify() -> str:
    local_dir = _snapshot_download()
    checksums = _file_checksums(local_dir)
    if CHECKSUM_PATH.exists():
        recorded = dict(
            line.strip().split("\t") for line in CHECKSUM_PATH.read_text().splitlines() if line.strip()
        )
        if checksums != recorded:
            raise ChecksumMismatchError(
                f"model files at {local_dir} don't match {CHECKSUM_PATH} — refusing to start"
            )
    else:
        CHECKSUM_PATH.parent.mkdir(parents=True, exist_ok=True)
        CHECKSUM_PATH.write_text("".join(f"{name}\t{digest}\n" for name, digest in sorted(checksums.items())))
    return local_dir


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        local_dir = _download_and_verify()
        _model = SentenceTransformer(local_dir)
    return _model


def tokenize_and_decode(text: str, max_tokens: int = MAX_TOKENS, model=None) -> str:
    m = model if model is not None else get_model()
    ids = m.tokenizer.encode(text, add_special_tokens=False, truncation=True, max_length=max_tokens)
    return m.tokenizer.decode(ids, skip_special_tokens=True)


def embed(text: str, model=None) -> list[float]:
    m = model if model is not None else get_model()
    vector = m.encode(text, convert_to_numpy=True, normalize_embeddings=False)
    if not np.all(np.isfinite(vector)):
        raise EmbeddingFailedError("non-finite vector")
    if float(np.linalg.norm(vector)) == 0.0:
        raise EmbeddingFailedError("zero-norm vector")
    return [float(x) for x in vector]
