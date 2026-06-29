"""Player Count Service

GUI/API backing for the ``rakna_spelare.py`` CLI: resolve a folder/glob/date-span
input into image files and count how many images each named person appears in,
with over/under-representation statistics.

Shares the counting core (``compute_player_stats``) with the CLI so the numbers
never fork, and the file resolution with the shared ``file_resolver``.
"""

import logging
import os
import sys
from pathlib import Path

# Backend root on sys.path to import the CLI counting core (pattern shared with
# the other services).
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from rakna_spelare import (  # noqa: E402
    compute_player_stats,
    load_exclusion_config,
)

from .file_resolver import preset_extensions, resolve_files  # noqa: E402

logger = logging.getLogger(__name__)


class PlayerCountService:
    """Counts images per named person from resolved files."""

    def _exclusion_sets(
        self,
        tranare: list[str] | None,
        publik: list[str] | None,
    ) -> tuple[set[str], set[str], set[str]]:
        """Resolve coach/audience/group sets.

        Per-request overrides take precedence; otherwise fall back to env +
        config file (~/.local/share/faceid/rakna_spelare.json) via the CLI's
        own loader. "Laget" is always treated as a group photo.
        """
        config = load_exclusion_config()

        env_tranare = os.environ.get("RAKNA_TRANARE", "")
        env_publik = os.environ.get("RAKNA_PUBLIK", "")
        if env_tranare:
            config["tranare"] = [n.strip() for n in env_tranare.split(",") if n.strip()]
        if env_publik:
            config["publik"] = [n.strip() for n in env_publik.split(",") if n.strip()]

        tranare_set = set(tranare) if tranare is not None else set(config.get("tranare", []))
        publik_set = set(publik) if publik is not None else set(config.get("publik", []))
        grupp_set = {"Laget"}
        return tranare_set, publik_set, grupp_set

    def count(
        self,
        roots: list[str] | None = None,
        globs: list[str] | None = None,
        extension_preset: str | None = None,
        extensions: list[str] | None = None,
        recursive: bool = True,
        date_from: str | None = None,
        date_to: str | None = None,
        gap_minutes: int = 30,
        baseline: str = "median",
        min_images: int = 3,
        per_match: bool = False,
        tranare: list[str] | None = None,
        publik: list[str] | None = None,
    ) -> dict:
        """Resolve files and compute player statistics.

        Returns the dict from ``compute_player_stats`` plus ``files_resolved``.
        Raises ValueError when no folder/glob input is given.
        """
        roots = roots or []
        globs = globs or []
        if not roots and not globs:
            raise ValueError("Ange minst en mapp eller ett glob-mönster.")

        # Explicit extensions win over the preset; preset 'all'/None keeps everything.
        ext_list = extensions if extensions else preset_extensions(extension_preset)

        files = resolve_files(
            roots=roots,
            globs=globs,
            extensions=ext_list,
            recursive=recursive,
            date_from=date_from,
            date_to=date_to,
        )

        tranare_set, publik_set, grupp_set = self._exclusion_sets(tranare, publik)

        stats = compute_player_stats(
            files,
            gap_minutes=gap_minutes,
            baseline_method=baseline,
            min_images=min_images,
            tranare_set=tranare_set,
            publik_set=publik_set,
            grupp_set=grupp_set,
            per_match=per_match,
        )
        stats["files_resolved"] = len(files)
        return stats


player_count_service = PlayerCountService()
