"""Räkna spelare exclusion config: save round-trip + the GUI/API exclusions
surface (get_exclusions / save_exclusions)."""

import json

import pytest

import rakna_spelare
from rakna_spelare import (
    ALWAYS_GRUPP,
    ALWAYS_PUBLIK,
    load_exclusion_config,
    save_exclusion_config,
)
from api.services.player_count_service import PlayerCountService


@pytest.fixture
def config(tmp_path, monkeypatch):
    """Point the exclusion config at a temp file (no real ~/.local writes)."""
    cfg = tmp_path / "rakna_spelare.json"
    monkeypatch.setattr(rakna_spelare, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(rakna_spelare, "CONFIG_FILE", cfg)
    # Env overrides config in resolve_exclusion_sets — clear so tests are
    # deterministic regardless of the host environment.
    for env in ("RAKNA_TRANARE", "RAKNA_PUBLIK", "RAKNA_GRUPP"):
        monkeypatch.delenv(env, raising=False)
    return cfg


def test_save_round_trips(config):
    save_exclusion_config(tranare=["Anna", "Bo"], publik=["Cecilia"])
    assert load_exclusion_config() == {
        "tranare": ["Anna", "Bo"],
        "publik": ["Cecilia"],
        "grupp": [],
    }


def test_save_strips_always_markers(config):
    # ALWAYS markers are merged by the resolver, so they must not be persisted.
    save_exclusion_config(
        tranare=["Coach"],
        publik=["Cecilia", *ALWAYS_PUBLIK],
        grupp=list(ALWAYS_GRUPP),
    )
    written = json.loads(config.read_text())
    assert written["publik"] == ["Cecilia"]
    assert written["grupp"] == []
    assert not (set(written["publik"]) & ALWAYS_PUBLIK)


def test_save_dedupes_and_drops_empties(config):
    save_exclusion_config(tranare=["Anna", "  Anna  ", "", "Bo"], publik=[])
    assert load_exclusion_config()["tranare"] == ["Anna", "Bo"]


def test_save_none_preserves_existing_grupp(config):
    save_exclusion_config(grupp=["Reserverna"])
    # A later save of only tranare/publik must keep the configured grupp.
    save_exclusion_config(tranare=["Anna"], publik=["Cecilia"])
    assert load_exclusion_config()["grupp"] == ["Reserverna"]


def test_get_exclusions_shape_includes_always(config):
    save_exclusion_config(tranare=["Anna"], publik=["Cecilia"])
    result = PlayerCountService().get_exclusions()

    assert result["tranare"] == ["Anna"]
    assert "Cecilia" in result["publik"]
    # ALWAYS markers are merged into the resolved lists...
    assert ALWAYS_PUBLIK <= set(result["publik"])
    assert ALWAYS_GRUPP <= set(result["grupp"])
    # ...and reported separately so the GUI can lock them.
    assert set(result["always"]["publik"]) == ALWAYS_PUBLIK
    assert set(result["always"]["grupp"]) == ALWAYS_GRUPP


def test_save_exclusions_service_persists_and_returns(config):
    result = PlayerCountService().save_exclusions(tranare=["Anna"], publik=["Cecilia"])
    assert result["tranare"] == ["Anna"]
    assert load_exclusion_config()["tranare"] == ["Anna"]


def test_post_partial_payload_rejected_without_wiping(config):
    # Both lists are required: an accidental {} must 422, not silently wipe the
    # existing config.
    from fastapi.testclient import TestClient
    from api.server import app

    save_exclusion_config(tranare=["Anna"], publik=["Cecilia"])
    client = TestClient(app)

    resp = client.post("/api/v1/players/exclusions", json={})
    assert resp.status_code == 422
    assert load_exclusion_config()["tranare"] == ["Anna"]  # untouched

    # An explicit both-lists save still works (and can clear).
    ok = client.post("/api/v1/players/exclusions", json={"tranare": ["Bo"], "publik": []})
    assert ok.status_code == 200
    assert load_exclusion_config() == {"tranare": ["Bo"], "publik": [], "grupp": []}
