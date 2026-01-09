"""
Encoding Refinement Service

Provides statistical filtering operations to refine face encodings.
Ports functionality from forfina_ansikten.py to API-friendly format
with correct backend-aware distance calculations.
"""

import logging
import sys
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# Add parent directory to path to import CLI modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from faceid_db import load_database, save_database

logger = logging.getLogger(__name__)

# Default thresholds per backend
DEFAULT_THRESHOLDS = {
    'dlib': {
        'std_threshold': 2.0,
        'cluster_dist': 0.55,  # Euclidean distance
    },
    'insightface': {
        'std_threshold': 2.0,
        'cluster_dist': 0.35,  # Cosine distance (lower = closer)
    }
}

# Minimum encodings required for filtering
DEFAULT_MIN_ENCODINGS = 8
DEFAULT_CLUSTER_MIN = 6


def _get_backend(entry) -> str:
    """Extract backend type from encoding entry."""
    if isinstance(entry, dict):
        return entry.get("backend", "dlib")
    return "dlib"  # Legacy numpy array


def _get_encoding(entry) -> Optional[np.ndarray]:
    """Extract numpy encoding from entry."""
    if isinstance(entry, dict) and "encoding" in entry:
        enc = entry["encoding"]
        if isinstance(enc, np.ndarray):
            return enc
    elif isinstance(entry, np.ndarray):
        return entry
    return None


def _compute_distances_to_centroid(
    encodings: List[np.ndarray],
    backend_type: str
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute distances from each encoding to the centroid.

    Uses the correct distance metric for each backend:
    - dlib: Euclidean distance
    - insightface: Cosine distance

    Args:
        encodings: List of encoding vectors
        backend_type: 'dlib' or 'insightface'

    Returns:
        (centroid, distances) tuple
    """
    arr = np.stack(encodings)
    centroid = np.mean(arr, axis=0)

    if backend_type == 'insightface':
        # Cosine distance: 1 - dot(a, b) where both are L2-normalized
        # Centroid must be normalized for proper cosine distance
        centroid_norm = np.linalg.norm(centroid)
        if centroid_norm > 1e-6:
            centroid_normalized = centroid / centroid_norm
        else:
            centroid_normalized = centroid

        # InsightFace encodings are already L2-normalized
        similarities = np.dot(arr, centroid_normalized)
        distances = 1.0 - similarities
    else:
        # dlib: Euclidean distance
        distances = np.linalg.norm(arr - centroid, axis=1)

    return centroid, distances


def _std_outlier_filter(
    encodings: List[np.ndarray],
    backend_type: str,
    std_threshold: float = 2.0
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Filter encodings by standard deviation from centroid.

    Returns mask (True=keep) and distances array.
    """
    _, dists = _compute_distances_to_centroid(encodings, backend_type)
    std = np.std(dists)
    mean = np.mean(dists)
    mask = np.abs(dists - mean) < std_threshold * std
    return mask, dists


def _cluster_filter(
    encodings: List[np.ndarray],
    backend_type: str,
    cluster_dist: Optional[float] = None,
    cluster_min: int = DEFAULT_CLUSTER_MIN
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Keep only encodings within cluster_dist from centroid.

    If too few encodings would remain, keeps all.
    Returns mask (True=keep) and distances array.
    """
    if cluster_dist is None:
        cluster_dist = DEFAULT_THRESHOLDS.get(backend_type, {}).get('cluster_dist', 0.55)

    _, dists = _compute_distances_to_centroid(encodings, backend_type)
    inlier_mask = dists < cluster_dist

    if np.count_nonzero(inlier_mask) >= cluster_min:
        return inlier_mask, dists
    else:
        # Too few would remain - don't filter
        return np.ones_like(inlier_mask, dtype=bool), dists


class RefinementService:
    """Service for encoding refinement operations."""

    def __init__(self):
        self.known_faces = {}
        self.ignored_faces = []
        self.hard_negatives = {}
        self.processed_files = []
        self._last_reload = 0
        self._cache_ttl = 2.0
        self._reload_lock = threading.Lock()
        self._reload_from_disk()

    def _reload_from_disk(self):
        import time
        logger.debug("[RefinementService] Loading database from disk")
        self.known_faces, self.ignored_faces, self.hard_negatives, self.processed_files = load_database()
        self._last_reload = time.time()

    def reload_database(self):
        import time
        if time.time() - self._last_reload > self._cache_ttl:
            with self._reload_lock:
                if time.time() - self._last_reload > self._cache_ttl:
                    self._reload_from_disk()

    def save(self):
        """Save database to disk (atomic write with file locking)."""
        logger.info("[RefinementService] Saving database to disk")
        save_database(self.known_faces, self.ignored_faces, self.hard_negatives, self.processed_files)

    def _group_by_backend(self, entries: List) -> Dict[str, List[Tuple[int, Any, np.ndarray]]]:
        """
        Group encoding entries by backend.

        Returns dict mapping backend -> list of (original_index, entry, encoding)
        """
        groups = {}
        for i, entry in enumerate(entries):
            backend = _get_backend(entry)
            encoding = _get_encoding(entry)
            if encoding is not None:
                if backend not in groups:
                    groups[backend] = []
                groups[backend].append((i, entry, encoding))
        return groups

    async def preview(
        self,
        person: Optional[str] = None,
        mode: str = "std",
        backend_filter: Optional[str] = None,
        std_threshold: float = 2.0,
        cluster_dist: Optional[float] = None,
        cluster_min: int = DEFAULT_CLUSTER_MIN,
        min_encodings: int = DEFAULT_MIN_ENCODINGS
    ) -> Dict[str, Any]:
        """
        Preview what encodings would be removed.

        Args:
            person: Person name, or None for all people
            mode: 'std' (standard deviation), 'cluster', or 'shape'
            backend_filter: 'dlib', 'insightface', or None for all
            std_threshold: Standard deviations for outlier detection
            cluster_dist: Max distance from centroid (None = backend default)
            cluster_min: Minimum cluster size
            min_encodings: Skip filtering if fewer encodings

        Returns:
            Preview results with per-person, per-backend breakdown
        """
        self.reload_database()

        preview_results = []
        total_remove = 0
        affected_people = 0

        # Determine which people to process
        if person and person != "*":
            people_to_check = {person: self.known_faces.get(person, [])}
        else:
            people_to_check = self.known_faces

        for name, entries in people_to_check.items():
            if not entries:
                continue

            # Group by backend
            backend_groups = self._group_by_backend(entries)

            # Filter to requested backend if specified
            if backend_filter:
                backend_groups = {k: v for k, v in backend_groups.items() if k == backend_filter}

            person_affected = False

            for backend, indexed_entries in backend_groups.items():
                if len(indexed_entries) < min_encodings:
                    continue

                indices = [ie[0] for ie in indexed_entries]
                encodings = [ie[2] for ie in indexed_entries]

                if mode == "shape":
                    # Shape repair: find encodings with non-majority shape
                    shapes = [enc.shape for enc in encodings]
                    shape_counts = {}
                    for s in shapes:
                        shape_counts[s] = shape_counts.get(s, 0) + 1
                    if not shape_counts:
                        continue
                    common_shape = max(shape_counts, key=shape_counts.get)
                    mask = np.array([enc.shape == common_shape for enc in encodings])
                    reason = "shape_mismatch"
                elif mode == "cluster":
                    mask, _ = _cluster_filter(
                        encodings, backend, cluster_dist, cluster_min
                    )
                    reason = "cluster_outlier"
                else:  # std
                    mask, _ = _std_outlier_filter(
                        encodings, backend, std_threshold
                    )
                    reason = "std_outlier"

                remove_count = np.count_nonzero(~mask)
                if remove_count > 0:
                    person_affected = True
                    remove_indices = [indices[i] for i in range(len(mask)) if not mask[i]]
                    preview_results.append({
                        "person": name,
                        "backend": backend,
                        "total": len(encodings),
                        "keep": int(np.count_nonzero(mask)),
                        "remove": remove_count,
                        "remove_indices": remove_indices,
                        "reason": reason
                    })
                    total_remove += remove_count

            if person_affected:
                affected_people += 1

        return {
            "preview": preview_results,
            "summary": {
                "total_people": len(people_to_check),
                "affected_people": affected_people,
                "total_remove": total_remove
            }
        }

    async def apply(
        self,
        mode: str = "std",
        backend_filter: Optional[str] = None,
        persons: Optional[List[str]] = None,
        std_threshold: float = 2.0,
        cluster_dist: Optional[float] = None,
        cluster_min: int = DEFAULT_CLUSTER_MIN,
        min_encodings: int = DEFAULT_MIN_ENCODINGS,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Apply filtering to remove outlier encodings.

        Args:
            mode: 'std' or 'cluster'
            backend_filter: 'dlib', 'insightface', or None for all
            persons: List of person names, or None for all
            std_threshold: Standard deviations for outlier detection
            cluster_dist: Max distance from centroid
            cluster_min: Minimum cluster size
            min_encodings: Skip filtering if fewer encodings
            dry_run: If True, don't save changes

        Returns:
            Results with counts of removed encodings
        """
        self._reload_from_disk()

        removed_by_person = {}
        removed_by_backend = {}
        total_removed = 0

        # Determine which people to process
        if persons:
            people_to_process = {name: self.known_faces.get(name, []) for name in persons}
        else:
            people_to_process = dict(self.known_faces)

        for name, entries in people_to_process.items():
            if not entries:
                continue

            # Group by backend
            backend_groups = self._group_by_backend(entries)

            # Filter to requested backend if specified
            if backend_filter:
                backend_groups = {k: v for k, v in backend_groups.items() if k == backend_filter}

            # Track which indices to remove
            indices_to_remove = set()

            for backend, indexed_entries in backend_groups.items():
                if len(indexed_entries) < min_encodings:
                    continue

                indices = [ie[0] for ie in indexed_entries]
                encodings = [ie[2] for ie in indexed_entries]

                if mode == "cluster":
                    mask, _ = _cluster_filter(
                        encodings, backend, cluster_dist, cluster_min
                    )
                else:  # std
                    mask, _ = _std_outlier_filter(
                        encodings, backend, std_threshold
                    )

                for i, keep in enumerate(mask):
                    if not keep:
                        indices_to_remove.add(indices[i])
                        removed_by_backend[backend] = removed_by_backend.get(backend, 0) + 1

            if indices_to_remove:
                removed_count = len(indices_to_remove)
                removed_by_person[name] = removed_count
                total_removed += removed_count

                # Keep only non-removed entries
                self.known_faces[name] = [
                    e for i, e in enumerate(entries) if i not in indices_to_remove
                ]

        if not dry_run and total_removed > 0:
            self.save()

        return {
            "status": "success",
            "dry_run": dry_run,
            "removed": total_removed,
            "by_person": removed_by_person,
            "by_backend": removed_by_backend
        }

    async def repair_shapes(
        self,
        persons: Optional[List[str]] = None,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Repair inconsistent encoding shapes.

        For each person, finds the most common shape and removes
        encodings with different shapes.

        Args:
            persons: List of person names, or None for all
            dry_run: If True, don't save changes

        Returns:
            Results with details of what was repaired
        """
        self._reload_from_disk()

        repaired = []
        total_removed = 0

        # Determine which people to process
        if persons:
            people_to_process = {name: self.known_faces.get(name, []) for name in persons}
        else:
            people_to_process = dict(self.known_faces)

        for name, entries in people_to_process.items():
            if not entries:
                continue

            # Extract shapes for all valid encodings
            shapes_with_index = []
            for i, entry in enumerate(entries):
                encoding = _get_encoding(entry)
                if encoding is not None:
                    shapes_with_index.append((i, encoding.shape))

            if not shapes_with_index:
                continue

            # Find most common shape
            shape_counts = {}
            for _, shape in shapes_with_index:
                shape_counts[shape] = shape_counts.get(shape, 0) + 1

            common_shape = max(shape_counts, key=shape_counts.get)

            # Find indices with non-common shape
            bad_indices = {i for i, shape in shapes_with_index if shape != common_shape}

            if bad_indices:
                removed_shapes = list({shape for i, shape in shapes_with_index if i in bad_indices})
                repaired.append({
                    "person": name,
                    "removed": len(bad_indices),
                    "total": len(entries),
                    "kept_shape": list(common_shape),
                    "removed_shapes": [list(s) for s in removed_shapes]
                })
                total_removed += len(bad_indices)

                if not dry_run:
                    self.known_faces[name] = [
                        e for i, e in enumerate(entries) if i not in bad_indices
                    ]

        if not dry_run and total_removed > 0:
            self.save()

        return {
            "status": "success",
            "dry_run": dry_run,
            "total_removed": total_removed,
            "repaired": repaired
        }


# Lazy singleton
_refinement_service = None


def get_refinement_service():
    global _refinement_service
    if _refinement_service is None:
        _refinement_service = RefinementService()
    return _refinement_service


class _RefinementServiceProxy:
    def __getattr__(self, name):
        return getattr(get_refinement_service(), name)


refinement_service = _RefinementServiceProxy()
