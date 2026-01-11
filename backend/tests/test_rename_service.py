"""
Tests for rename_service.collect_persons_for_files

Verifies that:
1. Hash-matched review data is used when available
2. Unique basename fallback works when hash is missing
3. Duplicate basenames are NOT used (prevents collision)
4. Encoding data is merged correctly with review data
"""

import pytest
from pathlib import Path
from unittest.mock import patch

from api.services.rename_service import collect_persons_for_files


class TestCollectPersonsForFiles:
    """Test suite for collect_persons_for_files function."""

    def test_hash_match_preferred_over_basename(self, tmp_path):
        """When hash matches, use that review data even if basename also matches."""
        known_faces = {}
        # Create a real file so Path.exists() returns True
        test_file = tmp_path / "IMG_0001.NEF"
        test_file.touch()
        filelist = [str(test_file)]

        attempt_log = [
            {
                "filename": "/other/IMG_0001.NEF",
                "file_hash": "different_hash",
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[{"label": "#1\nWrong Person"}]],
            },
            {
                "filename": str(test_file),
                "file_hash": "correct_hash",
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[{"label": "#1\nCorrect Person"}]],
            },
        ]

        with patch("api.services.rename_service.get_file_hash", return_value="correct_hash"):
            result = collect_persons_for_files(filelist, known_faces, attempt_log=attempt_log)

        assert result[str(test_file)] == ["Correct Person"]

    def test_unique_basename_fallback_when_no_hash(self, tmp_path):
        """When file_hash is None but basename is unique, use basename fallback."""
        known_faces = {}
        test_file = tmp_path / "unique_file.NEF"
        test_file.touch()
        filelist = [str(test_file)]

        attempt_log = [
            {
                "filename": str(test_file),
                "file_hash": None,
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[{"label": "#1\nSome Person"}]],
            },
        ]

        with patch("api.services.rename_service.get_file_hash", return_value=None):
            result = collect_persons_for_files(filelist, known_faces, attempt_log=attempt_log)

        assert result[str(test_file)] == ["Some Person"]

    def test_duplicate_basename_not_used(self, tmp_path):
        """When multiple entries have same basename, skip review data to avoid collision."""
        known_faces = {}
        folder_a = tmp_path / "folder_a"
        folder_a.mkdir()
        test_file = folder_a / "IMG_0001.NEF"
        test_file.touch()
        filelist = [str(test_file)]

        # attempt_log has two entries with same basename but different paths
        attempt_log = [
            {
                "filename": str(test_file),
                "file_hash": None,
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[{"label": "#1\nPerson A"}]],
            },
            {
                "filename": "/folder_b/IMG_0001.NEF",
                "file_hash": None,
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[{"label": "#1\nPerson B"}]],
            },
        ]

        with patch("api.services.rename_service.get_file_hash", return_value=None):
            result = collect_persons_for_files(filelist, known_faces, attempt_log=attempt_log)

        # Should be empty because basename is ambiguous (2 entries with IMG_0001.NEF)
        assert result[str(test_file)] == []

    def test_merge_review_with_encodings(self, tmp_path):
        """Review data should be merged with encoding data, review first."""
        test_file = tmp_path / "IMG_0001.NEF"
        test_file.touch()
        known_faces = {
            "Encoding Person": [{"file": "IMG_0001.NEF", "hash": "some_hash", "encoding": [0.1]}]
        }
        filelist = [str(test_file)]

        attempt_log = [
            {
                "filename": str(test_file),
                "file_hash": "some_hash",
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[{"label": "#1\nReview Person"}]],
            },
        ]

        with patch("api.services.rename_service.get_file_hash", return_value="some_hash"):
            result = collect_persons_for_files(filelist, known_faces, attempt_log=attempt_log)

        # Review person first, then encoding person added
        assert result[str(test_file)] == ["Review Person", "Encoding Person"]

    def test_encoding_only_when_no_review(self, tmp_path):
        """When no review data exists, use encoding data only."""
        test_file = tmp_path / "IMG_0001.NEF"
        test_file.touch()
        known_faces = {
            "Encoding Person": [{"file": "IMG_0001.NEF", "hash": "some_hash", "encoding": [0.1]}]
        }
        filelist = [str(test_file)]
        attempt_log = []

        with patch("api.services.rename_service.get_file_hash", return_value="some_hash"):
            result = collect_persons_for_files(filelist, known_faces, attempt_log=attempt_log)

        assert result[str(test_file)] == ["Encoding Person"]

    def test_ignored_labels_filtered(self, tmp_path):
        """Labels marked as ignored should not be included."""
        known_faces = {}
        test_file = tmp_path / "IMG_0001.NEF"
        test_file.touch()
        filelist = [str(test_file)]

        attempt_log = [
            {
                "filename": str(test_file),
                "file_hash": "hash123",
                "used_attempt": 0,
                "review_results": ["ok"],
                "labels_per_attempt": [[
                    {"label": "#1\nReal Person"},
                    {"label": "#2\nIgnorerad"},
                    {"label": "#3\nokänt"},
                ]],
            },
        ]

        with patch("api.services.rename_service.get_file_hash", return_value="hash123"):
            result = collect_persons_for_files(filelist, known_faces, attempt_log=attempt_log)

        assert result[str(test_file)] == ["Real Person"]
