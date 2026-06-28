"""Culling Service

Backs the stats-driven culling workspace: list a player's image files, and
soft-delete (trash) / restore them with an app-managed, manifest-backed trash so
deletions are always reversible.

Reuses the shared file resolution (file_resolver) + filename parsing
(rakna_spelare.build_entries) for listing, and the sidecar-aware move idea from
filer2mappar for trashing. No face recognition — players are filename-derived.
"""

import json
import logging
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path

# Backend root on sys.path to import the CLI parser (pattern shared with the
# other services).
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from rakna_spelare import build_entries  # noqa: E402

from .file_resolver import TRASH_DIR, preset_extensions, resolve_files  # noqa: E402
from .rename_service import find_sidecar_files  # noqa: E402

logger = logging.getLogger(__name__)

MANIFEST_PATH = TRASH_DIR / "manifest.jsonl"

# Sidecar extensions to carry along when trashing/restoring (without dot).
SIDECAR_EXTENSIONS = ["xmp"]


class CullingService:
    """List player files and trash/restore them reversibly."""

    # ----- listing -------------------------------------------------------

    def list_files(
        self,
        roots: list[str] | None = None,
        globs: list[str] | None = None,
        extension_preset: str | None = "jpg",
        recursive: bool = True,
        date_from: str | None = None,
        date_to: str | None = None,
        player: str | None = None,
    ) -> dict:
        """Resolve files and return parsed entries, optionally filtered to a player.

        Returns {files: [{path, basename, names, datetime}], players: [name,...]}.
        ``players`` is the sorted set of names present across the resolved files
        (for the filter dropdown). Raises ValueError when no input is given.
        """
        roots = roots or []
        globs = globs or []
        if not roots and not globs:
            raise ValueError("Ange minst en mapp eller ett glob-mönster.")

        files = resolve_files(
            roots=roots,
            globs=globs,
            extensions=preset_extensions(extension_preset),
            recursive=recursive,
            date_from=date_from,
            date_to=date_to,
        )
        entries = build_entries(files)

        all_names: set[str] = set()
        out: list[dict] = []
        for dt, names, path in entries:
            all_names.update(names)
            if player is not None and player not in names:
                continue
            out.append({
                "path": path,
                "basename": Path(path).name,
                "names": names,
                "datetime": dt.isoformat(),
            })

        return {"files": out, "players": sorted(all_names)}

    # ----- trash manifest -----------------------------------------------

    def _load_manifest(self) -> list[dict]:
        if not MANIFEST_PATH.exists():
            return []
        entries: list[dict] = []
        with open(MANIFEST_PATH, "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
        return entries

    def _rewrite_manifest(self, entries: list[dict]) -> None:
        TRASH_DIR.mkdir(parents=True, exist_ok=True)
        tmp = MANIFEST_PATH.with_suffix(".jsonl.tmp")
        with open(tmp, "w") as f:
            for e in entries:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
        tmp.replace(MANIFEST_PATH)

    def _append_manifest(self, entry: dict) -> None:
        TRASH_DIR.mkdir(parents=True, exist_ok=True)
        with open(MANIFEST_PATH, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    # ----- trash / restore ----------------------------------------------

    def trash(self, paths: list[str]) -> dict:
        """Move files (+ sidecars) to the app trash, recording how to restore them.

        Returns {trashed: [{id, original_path, basename}], errors: [...]}.
        """
        TRASH_DIR.mkdir(parents=True, exist_ok=True)
        trashed: list[dict] = []
        errors: list[dict] = []

        for p in paths:
            src = Path(p)
            if not src.is_file():
                errors.append({"path": p, "error": "Filen finns inte"})
                continue
            try:
                tid = uuid.uuid4().hex
                stored_name = f"{tid}__{src.name}"
                shutil.move(str(src), str(TRASH_DIR / stored_name))

                stored_sidecars: list[dict] = []
                for sc in find_sidecar_files(src, SIDECAR_EXTENSIONS):
                    sc_stored = f"{tid}__{sc.name}"
                    shutil.move(str(sc), str(TRASH_DIR / sc_stored))
                    stored_sidecars.append({
                        "original_path": str(sc),
                        "stored_name": sc_stored,
                    })

                entry = {
                    "id": tid,
                    "original_path": str(src),
                    "stored_name": stored_name,
                    "basename": src.name,
                    "sidecars": stored_sidecars,
                    "trashed_at": datetime.now().isoformat(),
                }
                self._append_manifest(entry)
                trashed.append({"id": tid, "original_path": str(src), "basename": src.name})
            except Exception as e:
                logger.exception("Failed to trash %s", p)
                errors.append({"path": p, "error": str(e)})

        return {"trashed": trashed, "errors": errors}

    def list_trash(self) -> dict:
        """Return active trash entries, newest first."""
        entries = self._load_manifest()
        entries.sort(key=lambda e: e.get("trashed_at", ""), reverse=True)
        return {"items": entries}

    def restore(self, ids: list[str]) -> dict:
        """Move trashed files (+ sidecars) back to their original locations.

        Never overwrites: if the original path is occupied, restores alongside as
        ``<stem>-restored<suffix>``. Returns {restored: [...], errors: [...]}.
        """
        entries = self._load_manifest()
        by_id = {e["id"]: e for e in entries}
        restored: list[dict] = []
        errors: list[dict] = []
        keep = list(entries)

        for tid in ids:
            entry = by_id.get(tid)
            if entry is None:
                errors.append({"id": tid, "error": "Finns inte i papperskorgen"})
                continue
            try:
                dest = self._restore_one(entry["original_path"], entry["stored_name"])
                for sc in entry.get("sidecars", []):
                    self._restore_one(sc["original_path"], sc["stored_name"])
                keep = [e for e in keep if e["id"] != tid]
                restored.append({"id": tid, "restored_path": str(dest)})
            except Exception as e:
                logger.exception("Failed to restore %s", tid)
                errors.append({"id": tid, "error": str(e)})

        self._rewrite_manifest(keep)
        return {"restored": restored, "errors": errors}

    def _restore_one(self, original_path: str, stored_name: str) -> Path:
        """Move one stored file back to original_path, avoiding overwrite."""
        dest = Path(original_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            dest = dest.with_name(f"{dest.stem}-restored{dest.suffix}")
        shutil.move(str(TRASH_DIR / stored_name), str(dest))
        return dest

    def empty(self, ids: list[str] | None = None) -> dict:
        """Permanently delete trashed files (all, or the given ids)."""
        entries = self._load_manifest()
        target_ids = set(ids) if ids else {e["id"] for e in entries}
        keep: list[dict] = []
        deleted = 0
        for e in entries:
            if e["id"] not in target_ids:
                keep.append(e)
                continue
            for name in [e["stored_name"], *[sc["stored_name"] for sc in e.get("sidecars", [])]]:
                try:
                    (TRASH_DIR / name).unlink(missing_ok=True)
                    deleted += 1
                except Exception:
                    logger.exception("Failed to delete trashed file %s", name)
        self._rewrite_manifest(keep)
        return {"deleted": deleted}


culling_service = CullingService()
