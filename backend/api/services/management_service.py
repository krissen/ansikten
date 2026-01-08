"""
Database Management Service

Provides database management operations for the workspace.
Ports functionality from hantera_ansikten.py to API-friendly format.
"""

import fnmatch
import hashlib
import logging
import sys
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

# Add parent directory to path to import CLI modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from faceid_db import load_attempt_log, load_database, save_database

logger = logging.getLogger(__name__)


def _count_encodings_by_backend(encodings: List) -> Dict[str, int]:
    """
    Count encodings grouped by backend.

    Args:
        encodings: List of encoding entries (dicts or numpy arrays)

    Returns:
        Dict mapping backend name to count, e.g. {"insightface": 5, "dlib": 3}
    """
    counts = {}
    for entry in encodings:
        if isinstance(entry, dict):
            backend = entry.get("backend", "dlib")
        else:
            # Legacy numpy array - assume dlib
            backend = "dlib"
        counts[backend] = counts.get(backend, 0) + 1
    return counts


def _filter_encodings_by_backend(encodings: List, backend: Optional[str]) -> List:
    """
    Filter encodings to only include those from specified backend.

    Args:
        encodings: List of encoding entries
        backend: Backend name to filter by, or None to include all

    Returns:
        Filtered list of encodings
    """
    if backend is None:
        return encodings

    filtered = []
    for entry in encodings:
        if isinstance(entry, dict):
            entry_backend = entry.get("backend", "dlib")
        else:
            entry_backend = "dlib"

        if entry_backend == backend:
            filtered.append(entry)

    return filtered


class ManagementService:
    """Service for database management operations"""

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
        logger.debug("[ManagementService] Loading database from disk")
        self.known_faces, self.ignored_faces, self.hard_negatives, self.processed_files = load_database()
        self._last_reload = time.time()

    def reload_database(self):
        import time
        if time.time() - self._last_reload > self._cache_ttl:
            with self._reload_lock:
                if time.time() - self._last_reload > self._cache_ttl:
                    self._reload_from_disk()

    def save(self):
        """Save database to disk (atomic write with file locking)"""
        logger.info("[ManagementService] Saving database to disk")
        save_database(self.known_faces, self.ignored_faces, self.hard_negatives, self.processed_files)

    async def get_database_state(self) -> Dict[str, Any]:
        """
        Get current database state with per-backend encoding counts.

        Returns dict with:
        - people: List of {name, encoding_count, encodings_by_backend}
        - ignored_count: Total ignored encodings
        - ignored_by_backend: Dict of backend -> count
        - hard_negatives_count: Number of hard negative examples
        - processed_files_count: Number of processed files
        - backends_in_use: List of backend names with data
        """
        self.reload_database()

        # Collect all backends in use
        all_backends = set()

        people = []
        for name, encodings in sorted(self.known_faces.items()):
            by_backend = _count_encodings_by_backend(encodings)
            all_backends.update(by_backend.keys())
            people.append({
                "name": name,
                "encoding_count": len(encodings),
                "encodings_by_backend": by_backend
            })

        ignored_by_backend = _count_encodings_by_backend(self.ignored_faces)
        all_backends.update(ignored_by_backend.keys())

        return {
            "people": people,
            "ignored_count": len(self.ignored_faces),
            "ignored_by_backend": ignored_by_backend,
            "hard_negatives_count": sum(len(v) for v in self.hard_negatives.values()),
            "processed_files_count": len(self.processed_files),
            "backends_in_use": sorted(all_backends),
        }

    async def rename_person(self, old_name: str, new_name: str) -> Dict[str, Any]:
        """
        Rename person in database

        Args:
        - old_name: Current person name
        - new_name: New person name

        Raises:
        - ValueError if old_name doesn't exist or new_name already exists
        """
        self._reload_from_disk()

        if old_name not in self.known_faces:
            raise ValueError(f"Person '{old_name}' not found")

        if new_name in self.known_faces:
            raise ValueError(f"Person '{new_name}' already exists (use merge instead)")

        # Rename by moving encodings
        self.known_faces[new_name] = self.known_faces.pop(old_name)
        self.save()

        logger.info(f"[ManagementService] Renamed '{old_name}' to '{new_name}'")

        return {
            "status": "success",
            "message": f"Renamed '{old_name}' to '{new_name}'",
            "new_state": await self.get_database_state(),
        }

    async def merge_people(
        self,
        source_names: List[str],
        target_name: str,
        backend_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Merge multiple people into target name.

        Args:
        - source_names: List of person names to merge
        - target_name: Result name (can be one of source_names or new name)
        - backend_filter: If set, only merge encodings from this backend

        Deduplicates encodings by encoding_hash. Returns warning if mixing backends.
        """
        self._reload_from_disk()

        for name in source_names:
            if name not in self.known_faces:
                raise ValueError(f"Person '{name}' not found")

        encodings = []
        backends_involved = set()

        if target_name in self.known_faces:
            target_encodings = self.known_faces[target_name]
            if backend_filter:
                target_encodings = _filter_encodings_by_backend(target_encodings, backend_filter)
            encodings.extend(target_encodings)
            backends_involved.update(_count_encodings_by_backend(target_encodings).keys())

        for name in source_names:
            if name in self.known_faces:
                source_encodings = self.known_faces[name]
                if backend_filter:
                    source_encodings = _filter_encodings_by_backend(source_encodings, backend_filter)
                encodings.extend(source_encodings)
                backends_involved.update(_count_encodings_by_backend(source_encodings).keys())

        seen = set()
        encodings_unique = []

        for enc in encodings:
            if isinstance(enc, dict):
                enc_hash = enc.get('encoding_hash')
            else:
                try:
                    enc_hash = hashlib.sha1(enc.tobytes()).hexdigest()
                except (AttributeError, ValueError):
                    enc_hash = None

            if enc_hash and enc_hash in seen:
                continue

            if enc_hash:
                seen.add(enc_hash)
            encodings_unique.append(enc)

        if backend_filter:
            existing_other_backend = _filter_encodings_by_backend(
                self.known_faces.get(target_name, []),
                None
            )
            existing_other_backend = [
                e for e in existing_other_backend
                if (e.get("backend", "dlib") if isinstance(e, dict) else "dlib") != backend_filter
            ]
            encodings_unique = existing_other_backend + encodings_unique

        self.known_faces[target_name] = encodings_unique

        for name in source_names:
            if name != target_name and name in self.known_faces:
                del self.known_faces[name]

        self.save()

        final_by_backend = _count_encodings_by_backend(encodings_unique)
        warning = None
        if len(backends_involved) > 1:
            warning = f"Merged encodings from multiple backends: {', '.join(sorted(backends_involved))}"

        logger.info(f"[ManagementService] Merged {source_names} into '{target_name}' ({len(encodings_unique)} unique encodings)")

        return {
            "status": "success",
            "message": f"Merged {len(source_names)} people into '{target_name}' ({len(encodings_unique)} unique encodings)",
            "warning": warning,
            "encodings_by_backend": final_by_backend,
            "new_state": await self.get_database_state(),
        }

    async def delete_person(self, name: str) -> Dict[str, Any]:
        """
        Delete person from database

        Args:
        - name: Person name to delete

        Raises:
        - ValueError if person doesn't exist
        """
        self._reload_from_disk()

        if name not in self.known_faces:
            raise ValueError(f"Person '{name}' not found")

        encoding_count = len(self.known_faces[name])
        del self.known_faces[name]
        self.save()

        logger.info(f"[ManagementService] Deleted '{name}' ({encoding_count} encodings)")

        return {
            "status": "success",
            "message": f"Deleted '{name}' ({encoding_count} encodings)",
            "new_state": await self.get_database_state(),
        }

    async def move_to_ignore(
        self,
        name: str,
        backend_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Move person's encodings to ignored list.

        Args:
        - name: Person name to move to ignored
        - backend_filter: If set, only move encodings from this backend
        """
        self._reload_from_disk()

        if name not in self.known_faces:
            raise ValueError(f"Person '{name}' not found")

        all_encodings = self.known_faces[name]
        to_move = _filter_encodings_by_backend(all_encodings, backend_filter)

        if not to_move:
            backend_desc = backend_filter or "any backend"
            raise ValueError(f"No encodings for '{name}' from {backend_desc}")

        self.ignored_faces.extend(to_move)

        if backend_filter:
            remaining = [e for e in all_encodings if e not in to_move]
            if remaining:
                self.known_faces[name] = remaining
            else:
                del self.known_faces[name]
        else:
            del self.known_faces[name]

        self.save()

        moved_by_backend = _count_encodings_by_backend(to_move)
        logger.info(f"[ManagementService] Moved '{name}' to ignored ({len(to_move)} encodings)")

        return {
            "status": "success",
            "message": f"Moved {len(to_move)} encodings from '{name}' to ignored",
            "moved_by_backend": moved_by_backend,
            "new_state": await self.get_database_state(),
        }

    async def move_from_ignore(
        self,
        count: int,
        target_name: str,
        backend_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Move encodings from ignored list to person.

        Args:
        - count: Number of encodings to move (or -1 for all matching)
        - target_name: Person name to receive encodings
        - backend_filter: If set, only move encodings from this backend
        """
        self._reload_from_disk()

        available = _filter_encodings_by_backend(self.ignored_faces, backend_filter)

        if count == -1:
            count = len(available)

        if count < 1:
            raise ValueError("Count must be at least 1 (or -1 for all)")

        if count > len(available):
            backend_desc = backend_filter or "any backend"
            raise ValueError(f"Only {len(available)} ignored encodings available from {backend_desc}")

        to_move = available[:count]
        to_move_set = set(id(e) for e in to_move)
        self.ignored_faces = [e for e in self.ignored_faces if id(e) not in to_move_set]

        if target_name not in self.known_faces:
            self.known_faces[target_name] = []
        self.known_faces[target_name].extend(to_move)

        self.save()

        moved_by_backend = _count_encodings_by_backend(to_move)
        logger.info(f"[ManagementService] Moved {count} encodings from ignored to '{target_name}'")

        return {
            "status": "success",
            "message": f"Moved {count} encodings from ignored to '{target_name}'",
            "moved_by_backend": moved_by_backend,
            "new_state": await self.get_database_state(),
        }

    async def undo_file(self, filename_pattern: str) -> Dict[str, Any]:
        """
        Undo processing for file(s) matching pattern

        Args:
        - filename_pattern: Exact filename or glob pattern (e.g., "2024*.NEF")

        Returns information about how many encodings were removed.
        Supports glob patterns via fnmatch.
        """
        self._reload_from_disk()

        # Find matching files
        matched_files = [
            pf
            for pf in self.processed_files
            if fnmatch.fnmatch((pf["name"] if isinstance(pf, dict) else pf), filename_pattern)
        ]

        if not matched_files:
            return {
                "status": "success",
                "message": f"No files match pattern '{filename_pattern}'",
                "new_state": await self.get_database_state(),
            }

        # Load attempt log to find what was added by these files
        log = load_attempt_log()

        removed_total = 0
        names_to_remove = set(
            pf["name"] if isinstance(pf, dict) else pf for pf in matched_files
        )

        # Remove from processed files
        self.processed_files = [
            pf
            for pf in self.processed_files
            if (pf["name"] if isinstance(pf, dict) else pf) not in names_to_remove
        ]

        # Remove encodings added by these files
        for target_name in names_to_remove:
            for entry in reversed(log):
                if Path(entry.get("filename", "")).name == target_name:
                    labels_per_attempt = entry.get("labels_per_attempt", [])
                    for labels in labels_per_attempt:
                        for label in labels:
                            if isinstance(label, dict):
                                label = label.get("label", "")
                            parts = label.split("\n")
                            if len(parts) == 2:
                                name = parts[1]
                                if name == "ignorerad":
                                    if self.ignored_faces:
                                        self.ignored_faces.pop()
                                        removed_total += 1
                                else:
                                    if name in self.known_faces and self.known_faces[name]:
                                        self.known_faces[name].pop()
                                        removed_total += 1

        self.save()

        logger.info(f"[ManagementService] Undid {len(matched_files)} files, removed {removed_total} encodings")

        return {
            "status": "success",
            "message": f"Undid {len(matched_files)} files, removed {removed_total} encodings",
            "files_undone": [pf["name"] if isinstance(pf, dict) else pf for pf in matched_files],
            "new_state": await self.get_database_state(),
        }

    async def purge_encodings(
        self,
        name: str,
        count: int,
        backend_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Remove last X encodings from person or ignore list.

        Args:
        - name: Person name or "ignore"
        - count: Number of encodings to remove from end
        - backend_filter: If set, only purge encodings from this backend
        """
        self._reload_from_disk()

        if count < 1:
            raise ValueError("Count must be at least 1")

        if name == "ignore":
            if backend_filter:
                matching_indices = [
                    i for i, e in enumerate(self.ignored_faces)
                    if (e.get("backend", "dlib") if isinstance(e, dict) else "dlib") == backend_filter
                ]
                if count > len(matching_indices):
                    raise ValueError(f"Only {len(matching_indices)} ignored encodings from {backend_filter}")
                to_remove = set(matching_indices[-count:])
                purged_by_backend = {backend_filter: count}
            else:
                if count > len(self.ignored_faces):
                    raise ValueError(f"Only {len(self.ignored_faces)} ignored encodings available")
                to_remove = set(range(len(self.ignored_faces) - count, len(self.ignored_faces)))
                purged_by_backend = _count_encodings_by_backend(self.ignored_faces[-count:])

            self.ignored_faces = [e for i, e in enumerate(self.ignored_faces) if i not in to_remove]
            self.save()

            logger.info(f"[ManagementService] Purged {count} encodings from ignored")

            return {
                "status": "success",
                "message": f"Purged {count} encodings from ignored",
                "purged_by_backend": purged_by_backend,
                "new_state": await self.get_database_state(),
            }

        elif name in self.known_faces:
            encodings = self.known_faces[name]

            if backend_filter:
                matching_indices = [
                    i for i, e in enumerate(encodings)
                    if (e.get("backend", "dlib") if isinstance(e, dict) else "dlib") == backend_filter
                ]
                if count > len(matching_indices):
                    raise ValueError(f"Only {len(matching_indices)} encodings from {backend_filter} for '{name}'")
                to_remove = set(matching_indices[-count:])
                purged_by_backend = {backend_filter: count}
            else:
                if count > len(encodings):
                    raise ValueError(f"Only {len(encodings)} encodings available for '{name}'")
                to_remove = set(range(len(encodings) - count, len(encodings)))
                purged_by_backend = _count_encodings_by_backend(encodings[-count:])

            self.known_faces[name] = [e for i, e in enumerate(encodings) if i not in to_remove]
            self.save()

            logger.info(f"[ManagementService] Purged {count} encodings from '{name}'")

            return {
                "status": "success",
                "message": f"Purged {count} encodings from '{name}'",
                "purged_by_backend": purged_by_backend,
                "new_state": await self.get_database_state(),
            }

        else:
            raise ValueError(f"Person '{name}' not found")

    async def get_recent_files(self, n: int = 10) -> List[Dict[str, str]]:
        """
        Get last N processed files

        Args:
        - n: Number of files to return (default 10)

        Returns list of {name, hash} dicts
        """
        self.reload_database()

        recent = list(reversed(self.processed_files[-n:]))

        # Ensure each entry is a dict
        result = []
        for entry in recent:
            if isinstance(entry, dict):
                result.append({"name": entry.get("name", ""), "hash": entry.get("hash", "")})
            else:
                # Legacy format: just filename string
                result.append({"name": entry, "hash": ""})

        return result


# Lazy singleton
_management_service = None

def get_management_service():
    global _management_service
    if _management_service is None:
        _management_service = ManagementService()
    return _management_service

class _ManagementServiceProxy:
    def __getattr__(self, name):
        return getattr(get_management_service(), name)

management_service = _ManagementServiceProxy()
