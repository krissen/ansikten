"""Tests for the confirmed-distinct pair registry + head-to-head separability."""

import threading
from pathlib import Path

import numpy as np
import pytest

import api.services.management_service as m
from api.services.management_service import ManagementService, _pair_separability


def _unit(seed):
    v = np.random.RandomState(seed).randn(512)
    return v / np.linalg.norm(v)


def _norm_list(seeds, base=None, jitter=0.0, jseed=0):
    out = []
    for k, s in enumerate(seeds):
        v = _unit(s) if base is None else base + jitter * _unit(jseed + k)
        out.append(v / np.linalg.norm(v))
    return out


def _entry(vec):
    return {"encoding": np.asarray(vec, dtype=float), "backend": "insightface"}


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "DISTINCT_PAIRS_PATH", tmp_path / "distinct_pairs.json")
    svc = ManagementService.__new__(ManagementService)
    svc.known_faces = {}
    svc.ignored_faces = []
    svc.hard_negatives = {}
    svc.processed_files = []
    svc._reload_lock = threading.Lock()
    svc._last_reload = 9e18  # never re-read disk
    svc._cache_ttl = 2.0
    return svc


# ----- separability metric -------------------------------------------------

def test_separability_high_for_separable_sets():
    base = _unit(0)
    a = _norm_list(range(1, 6), base=base, jitter=0.02, jseed=1)
    b = _norm_list(range(1, 6), base=base + 0.1 * _unit(99), jitter=0.02, jseed=50)
    acc, margin = _pair_separability(a, b)
    assert acc >= 0.9          # cleanly separable → different people
    assert margin > 0


def test_separability_low_for_overlapping_sets():
    base = _unit(0)
    a = _norm_list(range(1, 6), base=base, jitter=0.02, jseed=1)
    b = _norm_list(range(1, 6), base=base, jitter=0.02, jseed=30)
    acc, _ = _pair_separability(a, b)
    assert acc < 0.75          # indistinguishable → likely the same person


def test_separability_none_when_too_few_samples():
    assert _pair_separability([_unit(1)], [_unit(2), _unit(3)]) is None
    assert _pair_separability([], [_unit(2), _unit(3)]) is None


# ----- registry + find_duplicate_people ------------------------------------

@pytest.mark.asyncio
async def test_registry_add_remove_list_roundtrip(service):
    assert (await service.list_distinct_pairs())["count"] == 0
    await service.add_distinct_pair("Wilmer", "Maximilian")
    listed = await service.list_distinct_pairs()
    assert listed["count"] == 1
    assert listed["pairs"][0] == {"name_a": "Maximilian", "name_b": "Wilmer"}  # sorted
    await service.remove_distinct_pair("Maximilian", "Wilmer")
    assert (await service.list_distinct_pairs())["count"] == 0


@pytest.mark.asyncio
async def test_add_distinct_pair_order_independent_and_validated(service):
    await service.add_distinct_pair("B name", "A name")
    await service.add_distinct_pair("A name", "B name")  # same pair, no dup
    assert (await service.list_distinct_pairs())["count"] == 1
    with pytest.raises(ValueError):
        await service.add_distinct_pair("Same", "Same")


@pytest.mark.asyncio
async def test_find_duplicates_excludes_registered_pair(service):
    base = _unit(0)
    service.known_faces = {
        "Wilmer": [_entry(v) for v in _norm_list(range(1, 6), base=base, jitter=0.02, jseed=1)],
        "Maximilian": [_entry(v) for v in _norm_list(range(1, 6), base=base, jitter=0.02, jseed=30)],
    }
    before = await service.find_duplicate_people(0.35)
    assert any({p["name_a"], p["name_b"]} == {"Wilmer", "Maximilian"} for p in before["pairs"])

    await service.add_distinct_pair("Wilmer", "Maximilian")
    after = await service.find_duplicate_people(0.35)
    assert all({p["name_a"], p["name_b"]} != {"Wilmer", "Maximilian"} for p in after["pairs"])


@pytest.mark.asyncio
async def test_find_duplicates_flags_likely_distinct_and_sorts_last(service):
    base = _unit(0)
    # Twins: close centroids but separable clusters.
    twin_a = _norm_list(range(1, 6), base=base, jitter=0.02, jseed=1)
    twin_b = _norm_list(range(1, 6), base=base + 0.1 * _unit(99), jitter=0.02, jseed=50)
    # True duplicate: one cluster under two names.
    dup_a = _norm_list(range(1, 6), base=base, jitter=0.02, jseed=200)
    dup_b = _norm_list(range(1, 6), base=base, jitter=0.02, jseed=230)
    service.known_faces = {
        "TwinA": [_entry(v) for v in twin_a],
        "TwinB": [_entry(v) for v in twin_b],
        "DupA": [_entry(v) for v in dup_a],
        "DupB": [_entry(v) for v in dup_b],
    }
    result = await service.find_duplicate_people(0.35)
    by_pair = {frozenset((p["name_a"], p["name_b"])): p for p in result["pairs"]}

    twin = by_pair[frozenset(("TwinA", "TwinB"))]
    dup = by_pair[frozenset(("DupA", "DupB"))]
    assert twin["likely_distinct"] is True
    assert dup["likely_distinct"] is False
    # likely_distinct pairs sink below true candidates.
    assert result["pairs"][0]["likely_distinct"] is False
    assert result["pairs"][-1]["likely_distinct"] is True
