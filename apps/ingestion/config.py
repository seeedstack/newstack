"""Loads the YAML config that governs clustering parameters, embed-input construction, and
per-source adapter overrides (ARCHITECTURE §5, §6). Publisher quirks live in these files,
never in code branches."""
import pathlib

import yaml

CONFIG_ROOT = pathlib.Path(__file__).resolve().parents[2] / "config"
CLUSTERING_DIR = CONFIG_ROOT / "clustering"
EMBED_INPUT_DIR = CONFIG_ROOT / "embed_input"
SOURCES_DIR = CONFIG_ROOT / "sources"


def load_clustering_config(version: str = "v1") -> dict:
    with open(CLUSTERING_DIR / f"{version}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_embed_input_config(version: str = "e1") -> dict:
    with open(EMBED_INPUT_DIR / f"{version}.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_source_adapter(adapter: str) -> dict:
    """generic.yaml, then the adapter's own file overriding individual keys (ARCHITECTURE §5:
    'every key overridable per adapter'). Falls back to generic alone if the adapter has no file."""
    with open(SOURCES_DIR / "generic.yaml", encoding="utf-8") as f:
        merged = yaml.safe_load(f)
    adapter_path = SOURCES_DIR / f"{adapter}.yaml"
    if adapter_path.exists():
        with open(adapter_path, encoding="utf-8") as f:
            overrides = yaml.safe_load(f) or {}
        merged.update(overrides)
    return merged
