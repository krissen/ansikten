# Changelog

All notable changes to this project are documented in this file.

This changelog is initialized from git commit history after `v1.0.0` and can be refined before upcoming releases.

## [Unreleased]

### Added
- **Startup landing page**: when the app opens with an empty workspace, a centered view presents the workflow steps in order (Importera · Byt namn · Granska ansikten · Räkna spelare · Gallra spelare) as buttons that open the matching module. Import is enabled only while a camera card is mounted (polled), the rest are always available. The view disappears once a module opens or an image loads.
- **Räkna spelare** module: counts images per named player from filenames (no face recognition) with median-baseline over/under-representation stats; folder/glob input with extension presets and a filename-date span; live auto-refresh when the watched folder changes (#46).
- **Gallra spelare** culling workspace: filter by player or a Finder-style glob, file list beside a maximized preview, keystroke culling (`x`/Delete) with auto-advance and `Cmd+Z` undo, backed by an app-managed trash with restore-to-original (#46). Extended to NEF/RAW via the existing NEF→JPG preview pipeline, with debounced conversion on fast stepping (#47).
- Folder-level file-watching IPC and a folder-path dialog, shared by the new modules.
- **Importera** module: detect the mounted camera card, transfer its NEFs (+ `.xmp` sidecars) to a destination folder with live progress (move or copy, selectable), then eject the card. Skips files already present; ejects only after a zero-error transfer. macOS (`diskutil`) (#48-followup).
- **Byt namn** module: rename NEFs from EXIF `CreateDate` to `YYMMDD_HHMMSS.NEF` (rename_nef GUI), with a preview (dry-run) and confirm. Carries `.xmp` sidecars, disambiguates identical timestamps (`-NN`), skips files without a `CreateDate`, and never overwrites an existing target (restores the original on collision).

### Added
- **Gallra spelare trash filter**: the trash view (Papperskorg) now has a filetype filter (Alla / jpg / nef-raw) so JPEGs and raw files can be reviewed and restored separately. The header shows the filtered-of-total count, and "Töm" empties only the filtered subset when a filter is active (empties everything when set to Alla).
- **Gallra spelare trash retention**: the app-managed culling trash now auto-purges files older than a configurable threshold (default 30 days; `0` = keep forever). Purge runs lazily — at backend startup and whenever the trash view is opened — so the trash can't grow without bound. Configurable under Preferences → Files → Trash (Gallra), persisted as `trash_retention_days` in `config.json`. New endpoints `GET`/`POST /api/v1/culling/retention`.
- **Gallra spelare**: right-click a file for a context menu (navigate, rename, cull, undo) with each action's keyboard shortcut shown inline for discoverability, and a matching "Gallra spelare" section in the shortcuts help (`?`). Navigation extended: `→`/`↓` next, `←`/`↑` previous, `Alt`+arrow pages by 10.
- **Gallra spelare**: rename a file directly from the list — press `Enter` on the selected file (or double-click it) to edit its name inline (Finder-style; the extension is preserved), then `Enter` to commit or `Esc` to cancel. Renames carry `.xmp` sidecars and refuse to overwrite an existing file. Useful when a developed JPG was cropped so a named player is no longer in frame. New endpoint `POST /api/v1/culling/rename`.
- **Gallra spelare** now shows a live per-player count column on the left for the current scope (calls the player-count endpoint), updating immediately as you cull or restore files — so you can see each player's balance shift while you work.

### Changed
- Workflow steps launched from the startup landing page now open in a layout suited to the step: the self-contained modules (Importera · Byt namn · Räkna spelare · Gallra spelare) fill the workspace instead of docking beside the empty Review panel, and "Granska ansikten" opens the review layout.
- Räkna spelare / Gallra spelare filter controls: the primary "Räkna"/"Visa" buttons now use the themed button style (previously rendered as unstyled native buttons), and checkboxes are restyled to match the theme. Changing the player/filetype dropdown, or toggling "Inkl. undermappar" / "Per match", now re-runs immediately — no need to click the button.
- Documentation: established [CLAUDE.md](CLAUDE.md) as the canonical agent-instructions file; [AGENTS.md](AGENTS.md) and `.github/copilot-instructions.md` now point to it.

### Fixed
- Rename now keeps manually added faces in the new filename. Manual faces are persisted with the file's content hash (the batch-confirm path previously stored `hash=None`), and the rename name lookup now takes the union of basename- and hash-matched names instead of consulting the hash index only as a fallback — so a manual face anchored by only one key is no longer dropped when an auto-detected face matches by the other. Applies to both the GUI and the legacy CLI rename.
- Rename now holds a file out of name resolution while its review has unsaved changes, closing the ordering window behind the fix above: adding a manual face to an already-processed file and renaming during the brief save window could read the database before the face persisted and drop it from the first-pass filename. The Review panel signals unsaved changes and the file queue excludes such files from rename preview and execution until the save completes.
- Gallra spelare CSS referenced undefined `--border-color` / `--accent` variables, so borders fell back to nothing and the active file row rendered a non-theme blue; it now uses the theme variables (the active row uses the theme accent in both light and dark).

## [1.3.0] - 2026-06-27

### Added
- Added Review queue overview bar to the Review panel, showing queue progress at a glance.

### Fixed
- Fixed Refine Faces "Preview" failing with `HTTP 404: Not Found`: the request omitted the `/api/v1` prefix the refinement router is mounted under. Also fixed a crash in Shape Repair caused by calling an undefined `setStatus` (now uses `clearStatus`).
- Fixed the Review queue overview bar staying out of sync: queue status is now re-emitted on queue changes.

### Changed
- Simplified the Review queue overview bar by dropping the redundant remaining segment.

### Docs
- Documented the Review queue overview bar in the workspace guide.

## [1.2.0] - 2026-06-20

### Added
- Added file queue filter bar (`/` or `Cmd+F`): filter the file list by filename pattern, with match count indicator. Actions like rename and clear-done scope to filtered items when no checkbox selection exists.

### Fixed
- Fixed Cmd+/Cmd- zoom never stopping: `useKeyHold` now ignores Cmd/Ctrl combos (handled by menu accelerators) and matches keyup by physical key code to avoid stuck animation loops when Shift is released before the base key.
- Fixed menu zoom clicks (Zoom In/Out, Reset, Auto-Fit) having no effect due to stale closures captured at mount time in `useModuleEvent` handlers.
- Fixed first double-click in file queue showing an empty image viewer: `loadFile` now waits for ImageViewer's `load-image` listener before emitting, handling the async gap when `tabEnableRenderOnDemand` causes deferred mounting.
- Fixed `useKeyHold` cleanup using `clearInterval` instead of `cancelAnimationFrame` for rAF-based animation loops.
- Separated focused state from checkbox selection in file queue: plain click highlights an item without checking its checkbox; checkboxes require explicit click, Cmd+Click, or Shift+Click.
- Fixed non-image files (XMP sidecars, etc.) being added to queue from glob patterns. File extension filtering now applied in `addFiles()`, `expandFilePaths()`, and the `expand-glob` IPC handler.

### Changed
- Replaced conda/hardcoded Python paths with convention-based venv discovery (`backend/.venv/`).
- Migrated dependency management from `requirements.txt` to `pyproject.toml` (PEP 621).
- Moved pytest config from `pytest.ini` into `pyproject.toml`.
- Updated CI workflow to install from `pyproject.toml` with optional dependency groups.
- Updated all documentation to use `.venv` and `pip install -e ".[dev]"`.
- Updated release spec references from `bildvisare` to `ansikten`.

### Removed
- Removed obsolete planning and theme example files.

## [1.1.0] - 2026-01-11

### Added
- Added undo stack for face actions and ESC cancel support in review.
- Added backend log streaming to LogViewer over WebSocket and a copy action (`Cmd/Ctrl+A` support).
- Added drag-and-drop support in File Queue.
- Added sidecar file handling in rename flows and sidecar indicators in preview.
- Added JSON Schema for shared type definitions.
- Added pytest and vitest setup with example tests.

### Changed
- Rebranded app naming from Bildvisare/hitta_ansikten to Ansikten across code and documentation.
- Migrated API routes to `/api/v1/` prefix.
- Improved WebSocket reconnect behavior (cap + jitter) and API client offline/network timeout handling.
- Refactored `hitta_ansikten.py` by extracting config, image, and matching modules.
- Consolidated frontend logging via `debug.js` and expanded health endpoint component status.

### Fixed
- Fixed basename collision issues by moving review matching to hash-based logic.
- Fixed rename pipeline to include manual faces and rename only selected files when selection exists.
- Fixed broken thumbnails and missing API version in thumbnail URLs.
- Fixed spammy statistics summary requests and improved auto-refresh stability.
- Fixed multiple ReviewModule UX issues (tab behavior, focus feedback, face index sync, auto-advance edge cases).
- Fixed light theme button hover state and improved theme variables for confirmed/ignored face states.

### Docs
- Updated testing, shortcuts, install/release guides, and rebranding documentation.

### Build
- Added bundle analysis and removed unused dockview dependency.

## [1.0.1] - 2026-01-10

### Changed
- Improved backend packaging by excluding unused dependencies from backend spec.
- Added Electron cache in release workflow for faster CI builds.
- Improved release workflow reliability (skip redundant backend build, fixed PyInstaller onedir copying).
- Improved macOS build handling for symlinks in backend copy step.

### Fixed
- Fixed preprocessing manager state reset when stopping/clearing/renaming.
- Fixed review behavior to avoid auto-advance when no faces are detected.
- Fixed statistics to include additional attempt/resolution data from existing records.

## [1.0.0] - 2026-01-09

- Initial stable release tag.
