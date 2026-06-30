"""Tests for the k-NN twin recognition tie-break in DetectionService."""

from unittest.mock import MagicMock

import numpy as np

from api.services.detection_service import DetectionService


def _service():
    svc = DetectionService.__new__(DetectionService)
    svc.known_faces = {}
    be = MagicMock()
    be.backend_name = "insightface"
    # Cosine distance over unit vectors (matches InsightFaceBackend).
    be.compute_distances = lambda encs, t: 1.0 - (np.asarray(encs) @ np.asarray(t))
    svc.backend = be
    return svc


def _unit(seed, dim=16):
    v = np.random.RandomState(seed).randn(dim)
    return v / np.linalg.norm(v)


def _entry(vec):
    v = np.asarray(vec, dtype=float)
    return {"encoding": v / np.linalg.norm(v), "backend": "insightface"}


def _cluster(base, seeds, jitter=0.05):
    return [_entry(base + jitter * _unit(s)) for s in seeds]


def test_knn_picks_the_nearer_twin():
    svc = _service()
    a = _unit(0)
    b = a + 0.3 * _unit(99)
    svc.known_faces = {
        "Wilmer": _cluster(a, range(1, 6)),
        "Maximilian": _cluster(b, range(10, 15)),
    }
    probe_a = np.asarray(_entry(a + 0.05 * _unit(2))["encoding"])
    probe_b = np.asarray(_entry(b + 0.05 * _unit(11))["encoding"])

    assert svc._disambiguate_distinct_pair(probe_a, "Wilmer", "Maximilian", 5) == "Wilmer"
    assert svc._disambiguate_distinct_pair(probe_b, "Wilmer", "Maximilian", 5) == "Maximilian"


def test_knn_vote_beats_a_single_noisy_nearest_crop():
    # Wilmer has one outlier crop that sits nearest the probe, but the probe is
    # really Maximilian — a k-NN vote should still pick Maximilian, where a plain
    # 1-NN would be fooled by the single outlier.
    svc = _service()
    a = _unit(0)
    b = a + 0.4 * _unit(99)
    probe = np.asarray(_entry(b + 0.02 * _unit(3))["encoding"])
    wilmer = _cluster(a, range(1, 6))
    wilmer.append(_entry(probe + 0.01 * _unit(7)))  # one crop very close to the probe
    svc.known_faces = {"Wilmer": wilmer, "Maximilian": _cluster(b, range(10, 16))}

    assert svc._disambiguate_distinct_pair(probe, "Wilmer", "Maximilian", 5) == "Maximilian"


def test_returns_none_when_a_side_has_no_encodings():
    svc = _service()
    svc.known_faces = {
        "Wilmer": _cluster(_unit(0), range(1, 4)),
        "Maximilian": [{"encoding": None, "is_manual": True, "backend": "insightface"}],
    }
    probe = np.asarray(_entry(_unit(0))["encoding"])
    assert svc._disambiguate_distinct_pair(probe, "Wilmer", "Maximilian", 5) is None


def test_person_match_encodings_filters_backend_and_manual():
    svc = _service()
    svc.known_faces = {
        "X": [
            _entry(_unit(1)),
            {"encoding": None, "is_manual": True, "backend": "insightface"},
            {"encoding": _unit(2), "backend": "dlib"},
        ]
    }
    assert len(svc._person_match_encodings("X")) == 1
    assert svc._person_match_encodings("missing") == []


def test_detected_face_model_carries_disambiguated():
    # The route model must pass the field through to clients (else the feature is
    # silently dropped before the frontend can render it).
    from api.routes.detection import DetectedFace, BoundingBox

    face = DetectedFace(
        face_id="x",
        bounding_box=BoundingBox(x=0, y=0, width=1, height=1),
        confidence=0.5,
        disambiguated={"between": ["A", "B"], "chosen": "A", "method": "knn", "k": 3},
    )
    assert face.model_dump()["disambiguated"]["chosen"] == "A"


def test_distinct_pairs_version_changes_with_registry(tmp_path, monkeypatch):
    import api.services.detection_service as d

    monkeypatch.setattr(d, "DISTINCT_PAIRS_PATH", tmp_path / "distinct_pairs.json")
    svc = _service()
    assert svc._distinct_pairs_version() == 0  # absent → 0
    (tmp_path / "distinct_pairs.json").write_text("[]")
    assert svc._distinct_pairs_version() != 0  # present → mtime-based version
