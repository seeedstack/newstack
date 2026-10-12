import config


def test_load_clustering_config_has_required_keys():
    cfg = config.load_clustering_config()
    assert cfg["cluster_version"] == "v1"
    assert cfg["similarity_threshold"] == 0.72
    assert cfg["supported_languages"] == ["en"]


def test_load_embed_input_config():
    cfg = config.load_embed_input_config()
    assert cfg["version"] == "e1"
    assert cfg["max_tokens"] == 256
    assert len(cfg["denylist_patterns"]) >= 1


def test_load_source_adapter_falls_back_to_generic():
    cfg = config.load_source_adapter("nonexistent-adapter")
    assert cfg["max_items_per_run"] == 200
    assert cfg["date_fields"] == ["published", "updated"]


def test_load_blindspot_config_has_required_keys():
    cfg = config.load_blindspot_config()
    assert cfg["n_min"] == 6
    assert cfg["materiality"] == 0.5
    assert cfg["z"] == 1.645
    assert cfg["baseline_window_days"] == 30
    assert cfg["pool_cutover_appearances"] == 500


def test_load_source_adapter_merges_override(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SOURCES_DIR", tmp_path)
    (tmp_path / "generic.yaml").write_text(
        "host_aliases: {}\nextra_tracking_params: []\nkeep_hashbang: true\n"
        "date_fields: [published]\ntitle_cleanup: []\nexcerpt_source: [summary]\nmax_items_per_run: 200\n"
    )
    (tmp_path / "custom.yaml").write_text("max_items_per_run: 50\n")
    cfg = config.load_source_adapter("custom")
    assert cfg["max_items_per_run"] == 50          # overridden
    assert cfg["date_fields"] == ["published"]     # inherited from generic
