"""
cli_matching.py - Face matching utilities for hitta_ansikten CLI

Contains:
- Backend threshold management
- Encoding validation
- Database filtering by backend
- Face matching (best_matches, best_matches_filtered)
- Match status and label generation
"""

import logging

import numpy as np


def _get_backend_thresholds(config, backend):
    """
    Get appropriate thresholds for current backend.

    Args:
        config: Full config dict
        backend: FaceBackend instance

    Returns:
        Dict with 'match_threshold', 'ignore_distance', 'hard_negative_distance'
    """
    threshold_mode = config.get('threshold_mode', 'auto')

    if threshold_mode == 'manual':
        # Use backend-specific thresholds when available
        backend_thresholds = config.get('backend_thresholds', {})
        if backend.backend_name in backend_thresholds:
            return backend_thresholds[backend.backend_name]

        # Fallback: log warning and use top-level config values
        logging.warning(
            f"Manual threshold mode: no thresholds configured for backend '{backend.backend_name}'; "
            f"falling back to top-level threshold values which may not match this "
            f"backend's distance metric."
        )
        return {
            'match_threshold': config.get('match_threshold', 0.6),
            'ignore_distance': config.get('ignore_distance', 0.5),
            'hard_negative_distance': config.get('hard_negative_distance', 0.45)
        }
    else:
        # Auto mode: prefer backend-specific thresholds, then adjust by distance metric
        backend_thresholds = config.get('backend_thresholds', {})
        backend_specific = backend_thresholds.get(backend.backend_name)
        if backend_specific is not None:
            return backend_specific

        # Fallback based on backend distance metric
        distance_metric = getattr(backend, 'distance_metric', 'euclidean')

        # Default thresholds for Euclidean-like metrics (preserves existing behavior)
        default_match = 0.6
        default_ignore = 0.5
        default_hard_negative = 0.45

        # For cosine distance, typical thresholds are lower (e.g. ~0.4)
        if isinstance(distance_metric, str) and 'cos' in distance_metric.lower():
            default_match = 0.4
            default_ignore = 0.35
            default_hard_negative = 0.32

        return {
            'match_threshold': config.get('match_threshold', default_match),
            'ignore_distance': config.get('ignore_distance', default_ignore),
            'hard_negative_distance': config.get('hard_negative_distance', default_hard_negative)
        }


def validate_encoding_dimension(encoding, backend, context=""):
    """
    Validate that encoding dimension matches backend's expected dimension.

    Args:
        encoding: Numpy array encoding to validate
        backend: FaceBackend instance
        context: Optional context string for logging (e.g., "known_faces:PersonName")

    Returns:
        True if valid, False if dimension mismatch
    """
    if encoding is None:
        return False

    if not hasattr(encoding, '__len__'):
        logging.warning(f"[VALIDATION] Invalid encoding type {type(encoding).__name__} {context}")
        return False

    expected_dim = backend.encoding_dim
    actual_dim = len(encoding)

    if actual_dim != expected_dim:
        logging.warning(
            f"[VALIDATION] Encoding dimension mismatch for {backend.backend_name} backend: "
            f"expected {expected_dim}, got {actual_dim} {context}"
        )
        return False

    return True


def filter_database_by_backend(known_faces, ignored_faces, hard_negatives, backend):
    """
    Pre-filter all database structures by backend for efficient batch processing.

    This optimization reduces redundant filtering when processing multiple faces
    from the same image. Call once per image, then reuse filtered results.

    Args:
        known_faces: Dict of {name: [encoding_entries]}
        ignored_faces: List of encoding entries
        hard_negatives: Dict of {name: [hard_negative_entries]}
        backend: FaceBackend instance

    Returns:
        Tuple of (filtered_known, filtered_ignored, filtered_hard_negs)
        where encodings are pre-filtered and validated for the backend
    """
    # Filter known_faces
    filtered_known = {}
    for name, entries in known_faces.items():
        encs = []
        for entry in entries:
            if isinstance(entry, dict):
                entry_enc = entry.get("encoding")
                entry_backend = entry.get("backend", "dlib")
            else:
                entry_enc = entry
                entry_backend = "dlib"

            if entry_enc is not None and entry_backend == backend.backend_name:
                if isinstance(entry_enc, np.ndarray):
                    if validate_encoding_dimension(entry_enc, backend, f"known_faces:{name}"):
                        encs.append(entry_enc)

        if encs:
            filtered_known[name] = np.array(encs)

    # Filter ignored_faces
    filtered_ignored = []
    for entry in ignored_faces:
        if isinstance(entry, dict):
            entry_enc = entry.get("encoding")
            entry_backend = entry.get("backend", "dlib")
        else:
            entry_enc = entry
            entry_backend = "dlib"

        if entry_enc is not None and entry_backend == backend.backend_name:
            if isinstance(entry_enc, np.ndarray):
                if validate_encoding_dimension(entry_enc, backend, "ignored_faces"):
                    filtered_ignored.append(entry_enc)

    filtered_ignored = np.array(filtered_ignored) if filtered_ignored else None

    # Filter hard_negatives
    filtered_hard_negs = {}
    for name, entries in hard_negatives.items():
        negs = []
        for entry in entries:
            if isinstance(entry, dict):
                entry_enc = entry.get("encoding")
                entry_backend = entry.get("backend", "dlib")
            else:
                entry_enc = entry
                entry_backend = "dlib"

            if entry_enc is not None and entry_backend == backend.backend_name:
                if isinstance(entry_enc, np.ndarray):
                    if validate_encoding_dimension(entry_enc, backend, f"hard_negatives:{name}"):
                        negs.append(entry_enc)

        if negs:
            filtered_hard_negs[name] = np.array(negs)

    return filtered_known, filtered_ignored, filtered_hard_negs


def best_matches_filtered(encoding, filtered_known, filtered_ignored, filtered_hard_negs, config, backend):
    """
    Find best matching person using pre-filtered encodings (optimized version).

    This is an optimized version of best_matches() that accepts pre-filtered
    numpy arrays instead of raw database structures. Use filter_database_by_backend()
    to prepare the inputs. This avoids redundant filtering when processing
    multiple faces from the same image.

    Args:
        encoding: Face encoding to match
        filtered_known: Dict of {name: np.array of encodings} (pre-filtered)
        filtered_ignored: np.array of ignored encodings or None (pre-filtered)
        filtered_hard_negs: Dict of {name: np.array of hard negs} (pre-filtered)
        config: Config dict
        backend: FaceBackend instance

    Returns:
        (best_name, best_name_dist), (best_ignore_idx, best_ignore_dist)
    """
    best_name = None
    best_name_dist = None
    best_ignore_idx = None
    best_ignore_dist = None

    # Get backend-appropriate thresholds
    thresholds = _get_backend_thresholds(config, backend)
    hard_negative_thr = thresholds.get('hard_negative_distance', 0.45)

    # Match against known faces
    for name, encs_array in filtered_known.items():
        # Check hard negatives for this person
        is_hard_negative = False
        if filtered_hard_negs and name in filtered_hard_negs:
            neg_dists = backend.compute_distances(filtered_hard_negs[name], encoding)
            if np.min(neg_dists) < hard_negative_thr:
                is_hard_negative = True

        if is_hard_negative:
            continue  # Skip this person

        # Compute distances using backend
        dists = backend.compute_distances(encs_array, encoding)
        min_dist = np.min(dists)

        if best_name_dist is None or min_dist < best_name_dist:
            best_name_dist = min_dist
            best_name = name

    # Match against ignored faces
    if filtered_ignored is not None and len(filtered_ignored) > 0:
        dists = backend.compute_distances(filtered_ignored, encoding)
        min_dist = np.min(dists)
        best_ignore_dist = min_dist
        best_ignore_idx = int(np.argmin(dists))
    else:
        best_ignore_dist = None
        best_ignore_idx = None

    return (best_name, best_name_dist), (best_ignore_idx, best_ignore_dist)


def best_matches(encoding, known_faces, ignored_faces, hard_negatives, config, backend):
    """
    Find best matching person and ignore candidate using backend.

    Args:
        encoding: Face encoding to match
        known_faces: Dict of {name: [encoding_entries]}
        ignored_faces: List of ignored encoding entries
        hard_negatives: Dict of {name: [hard_negative_entries]}
        config: Config dict
        backend: FaceBackend instance

    Returns:
        (best_name, best_name_dist), (best_ignore_idx, best_ignore_dist)
    """
    best_name = None
    best_name_dist = None
    best_ignore_idx = None
    best_ignore_dist = None

    # Get backend-appropriate thresholds
    thresholds = _get_backend_thresholds(config, backend)
    hard_negative_thr = thresholds.get('hard_negative_distance', 0.45)

    # Match against known faces (with backend filtering)
    for name, entries in known_faces.items():
        # Filter encodings by backend
        encs = []
        for entry in entries:
            if isinstance(entry, dict):
                entry_enc = entry.get("encoding")
                entry_backend = entry.get("backend", "dlib")
            else:
                # Legacy numpy array
                entry_enc = entry
                entry_backend = "dlib"

            # Only match against same backend with correct dimensions
            if entry_enc is not None and entry_backend == backend.backend_name:
                if isinstance(entry_enc, np.ndarray):
                    if validate_encoding_dimension(entry_enc, backend, f"known_faces:{name}"):
                        encs.append(entry_enc)

        if not encs:
            continue  # No encodings for this backend

        # Check hard negatives (same backend filtering)
        hard_negs = []
        if hard_negatives and name in hard_negatives:
            for neg in hard_negatives[name]:
                if isinstance(neg, dict):
                    neg_enc = neg.get("encoding")
                    neg_backend = neg.get("backend", "dlib")
                else:
                    neg_enc = neg
                    neg_backend = "dlib"

                if neg_enc is not None and neg_backend == backend.backend_name:
                    if isinstance(neg_enc, np.ndarray):
                        if validate_encoding_dimension(neg_enc, backend, f"hard_negatives:{name}"):
                            hard_negs.append(neg_enc)

        # Check if encoding matches hard negatives
        is_hard_negative = False
        if hard_negs:
            neg_dists = backend.compute_distances(np.array(hard_negs), encoding)
            if np.min(neg_dists) < hard_negative_thr:
                is_hard_negative = True

        if is_hard_negative:
            continue  # Skip this person

        # Compute distances using backend
        dists = backend.compute_distances(np.array(encs), encoding)
        min_dist = np.min(dists)

        if best_name_dist is None or min_dist < best_name_dist:
            best_name_dist = min_dist
            best_name = name

    # Match against ignored faces (with backend filtering)
    ignored_encs = []
    for entry in ignored_faces:
        if isinstance(entry, dict):
            entry_enc = entry.get("encoding")
            entry_backend = entry.get("backend", "dlib")
        else:
            entry_enc = entry
            entry_backend = "dlib"

        if entry_enc is not None and entry_backend == backend.backend_name:
            if isinstance(entry_enc, np.ndarray):
                if validate_encoding_dimension(entry_enc, backend, "ignored_faces"):
                    ignored_encs.append(entry_enc)

    if ignored_encs:
        dists = backend.compute_distances(np.array(ignored_encs), encoding)
        min_dist = np.min(dists)
        best_ignore_dist = min_dist
        best_ignore_idx = int(np.argmin(dists))
    else:
        best_ignore_dist = None
        best_ignore_idx = None

    return (best_name, best_name_dist), (best_ignore_idx, best_ignore_dist)


def get_face_match_status(i, best_name, best_name_dist, name_conf, best_ignore, best_ignore_dist, ign_conf, config):
    """
    Determine face match status and generate label.

    Args:
        i: Face index (0-based)
        best_name: Best matching person name or None
        best_name_dist: Distance to best name match
        name_conf: Confidence for name match (0-100)
        best_ignore: Best ignore index or None
        best_ignore_dist: Distance to best ignore match
        ign_conf: Confidence for ignore match (0-100)
        config: Config dict

    Returns:
        Tuple of (label_string, status_code)
        Status codes: "unknown", "uncertain_name", "uncertain_ign", "name", "ign"
    """
    name_thr = config.get("match_threshold", 0.6)
    ignore_thr = config.get("ignore_distance", 0.5)
    margin = config.get("prefer_name_margin", 0.10)
    min_conf = config.get("min_confidence", 0.4)

    # Confidence-filter
    if (
        (name_conf is not None and name_conf / 100 < min_conf) and
        (ign_conf is not None and ign_conf / 100 < min_conf)
    ):
        return "#%d\nOkänt" % (i + 1), "unknown"

    # Osäker mellan namn och ignore
    if (
        best_name is not None and best_name_dist is not None and best_name_dist < name_thr and
        best_ignore_dist is not None and best_ignore_dist < ignore_thr and
        abs(best_name_dist - best_ignore_dist) < margin
    ):
        if best_name_dist < best_ignore_dist:
            return f"#%d\n{best_name} / ign" % (i + 1), "uncertain_name"
        else:
            return f"#%d\nign / {best_name}" % (i + 1), "uncertain_ign"

    # Namn vinner klart
    elif (
        best_name is not None and best_name_dist is not None and best_name_dist < name_thr and
        (best_ignore_dist is None or best_name_dist < best_ignore_dist - margin)
    ):
        return f"#%d\n{best_name}" % (i + 1), "name"

    # Ign vinner klart
    elif (
        best_ignore_dist is not None and best_ignore_dist < ignore_thr and
        (best_name_dist is None or best_ignore_dist < best_name_dist - margin)
    ):
        return "#%d\nign" % (i + 1), "ign"

    # Ingen tillräckligt nära
    else:
        return "#%d\nOkänt" % (i + 1), "unknown"


def get_match_label(i, best_name, best_name_dist, name_conf, best_ignore, best_ignore_dist, ign_conf, config):
    """
    Wrapper for get_face_match_status - generates match label.

    Returns:
        Tuple of (label_string, status_code)
    """
    return get_face_match_status(i, best_name, best_name_dist, name_conf, best_ignore, best_ignore_dist, ign_conf, config)


def label_preview_for_encodings(face_encodings, known_faces,
                                ignored_faces, hard_negatives, config, backend):
    """
    Label face encodings with matches. Uses optimized filtering for batch processing.

    Args:
        face_encodings: List of face encoding arrays
        known_faces: Dict of {name: [encoding_entries]}
        ignored_faces: List of ignored encoding entries
        hard_negatives: Dict of {name: [hard_negative_entries]}
        config: Config dict
        backend: FaceBackend instance

    Returns:
        List of label strings for each face
    """
    # Pre-filter database once for all faces (optimization for multiple faces)
    filtered_known, filtered_ignored, filtered_hard_negs = filter_database_by_backend(
        known_faces, ignored_faces, hard_negatives, backend
    )

    labels = []
    for i, encoding in enumerate(face_encodings):
        # Use optimized filtered matching
        (best_name, best_name_dist), (best_ignore, best_ignore_dist) = best_matches_filtered(
            encoding, filtered_known, filtered_ignored, filtered_hard_negs, config, backend
        )
        name_conf = int((1 - best_name_dist) * 100) if best_name_dist is not None else None
        ign_conf = int((1 - best_ignore_dist) * 100) if best_ignore_dist is not None else None
        label, _ = get_match_label(i, best_name, best_name_dist, name_conf, best_ignore, best_ignore_dist, ign_conf, config)
        labels.append(label)
    return labels
