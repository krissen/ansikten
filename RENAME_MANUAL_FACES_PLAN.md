# Rename bug — manually added faces dropped from new filename

Status: **fixed** on branch `feature/rename-manual-faces`.

## Context

When a NEF is renamed by the face-based rename pipeline, the new filename included
auto-detected + confirmed faces but **dropped manually added faces**. Reported example:
`~/Pictures/nerladdat/260111_080910_Aryan.NEF` — "Aryan" was auto-detected and confirmed,
"Elis" was added manually, yet the rename produced only `_Aryan`.

CHANGELOG 1.1.0 claims this was already fixed ("Fixed rename pipeline to include manual
faces"). That merge logic *is* present and correct, but a structural data-model gap
underneath it could still drop manual faces.

## Root cause

The relevant pipeline is the **face/name-based rename**: `routes/files.py` →
`services/rename_service.py`. All name assembly happens in `preview_rename` →
`collect_persons_for_files` (`rename_service.py`), merging three sources: `encodings.pkl`
(`known_faces`), `attempt_stats.jsonl` (`attempt_log`), and `processed_files.jsonl`.

A **detected** face is double-anchored: in `encodings.pkl` with a real `hash` *and* `file`,
and in `attempt_stats.jsonl` by content `file_hash`. A **manually added** face was fragilely
single-anchored, due to two interacting defects:

1. **`hash=None` for manual encodings** — the batch-confirm path the GUI uses
   (`_confirm_identity_nosave` manual branch, `detection_service.py`) stored `hash=None`.
   (The single-call async `confirm_identity` *did* compute the hash — the two paths were
   inconsistent.) A `hash=None` entry is indexed only by basename, never by hash, so it is
   recoverable only by an exact current-basename match.
2. **Hash lookup was a fallback, not a union** — `collect_persons_for_files` consulted the
   hash index only when the basename index was empty (`if not encoding_persons and h:`).
   Once the detected face was found by basename, the hash branch was skipped, so a
   hash-only-anchored manual face was silently dropped.

`attempt_stats.jsonl` is the remaining safety net (it carries manual faces by content hash),
so the bug manifested when that lookup also missed — chiefly when the rename ran **before**
`mark_review_complete`/the manual confirm had persisted the name (an ordering issue), or on
stale data written before earlier fixes.

## Diagnostic findings (real data, `~/.local/share/faceid/`)

Inspecting the reported file confirmed all of the above:

- **encodings.pkl**: "Elis Niemi" (`is_manual=True`) and "Aryan Rasheed" now both carry the
  same content hash `531d80efa0…` and the same basename — the data is currently
  self-consistent (and the file is now correctly named `…_Aryan,_Elis.NEF`).
- **attempt_stats.jsonl**: three review records for the same physical image (hash
  `531d80…`). The record whose filename is `260111_080910_Aryan.NEF` post-dates the rename;
  the pre-rename record (`260111_080910-1.NEF`, same hash) lists `[Aryan, Elis, ignorerad]`.

Conclusion: the rename that produced `_Aryan` ran before "Elis" was persisted to either
store (an ordering trigger), while the two structural defects removed the safety nets that
would otherwise have recovered the name. The fixes below make the data model robust so a
re-rename heals such cases and a singly-anchored manual face is never dropped again.

## Fix (implemented)

### Change 1 — anchor manual encodings by content hash
`backend/api/services/detection_service.py`, `_confirm_identity_nosave` manual branch:
compute `get_file_hash(image_path)` (mirrors the single-call path) instead of `hash=None`.
Manual faces become hash-anchored → survive renames and basename divergence.

### Change 2 — union basename + hash lookup
`backend/api/services/rename_service.py`, `collect_persons_for_files`: replace the
`if not encoding_persons` fallback with a deduped **union** of basename- and hash-matched
names, so a face anchored by only one key is never suppressed by a match on the other. This
also heals existing data: `_update_database_paths` keeps manual entries' basename current,
so even legacy `hash=None` entries are recovered by basename.

### Change 3 — CLI parity
`backend/hitta_ansikten.py`, the near-identical `collect_persons_for_files`: same union
change so the legacy CLI rename behaves identically.

## Tests

`backend/tests/test_rename_service.py`:
- `test_manual_face_hash_only_not_suppressed_by_basename` — the decisive regression for
  defect #2 (fails before Change 2).
- `test_legacy_manual_face_hash_none_recovered_by_basename` — legacy `hash=None` entry still
  recovered.
- `test_union_does_not_duplicate_when_both_keys_match` — no duplication.

`backend/tests/test_detection_manual_confirm.py`:
- `test_manual_confirm_anchors_content_hash` — Change 1: manual confirm stores the file's
  content hash, not None.
- `test_manual_confirm_missing_file_keeps_hash_none` — graceful fallback when file absent.

Run: `cd backend && pytest` (23 passed) and `cd frontend && npm test` (18 passed).

## Follow-up (logged in TODO.md)

The structural fix is durable, but the underlying *ordering* trigger (a rename reading the
DB before a just-added manual face is persisted) is a frontend sequencing concern; the
auto-save → rename path (`c7564d3`) should be audited to guarantee the manual confirm and
`mark_review_complete` always complete before a rename can run.
