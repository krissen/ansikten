# Changelog

All notable changes to this project are documented in this file.

This changelog is initialized from git commit history after `v1.0.0` and can be refined before upcoming releases.

## [Unreleased]

### Added
- **Räkna spelare — per-match view now complete:** with "Per match" on, each match now shows the same detail as the session view (and the `rakna_spelare.py -p` terminal output) does — an info row with the player count, excluded count, and the match's baseline (`Baslinje (median): X`), plus the collapsible excluded buckets (Tränare / Gruppbilder / Publik / Under tröskeln). A match that contains only excluded people (e.g. a team or crowd shot) now reports them instead of appearing empty. Pure frontend rendering of data `/players/count` already returns.
- **Räkna spelare — full CLI parity in the table:** the player table now matches the `rakna_spelare.py` terminal output — a per-player **temporal sparkline** (a density histogram of when that player was photographed across the session, and per match when "Per match" is on), an absolute **ΔN** column (image-count deviation from the baseline) alongside Δ%, and a **baseline-relative distribution bar** (at-baseline fills half the track, 2× fills it, with a baseline tick) instead of the previous max-relative bar. All from data the `/players/count` endpoint already returns — no backend change.
- **Räkna spelare ↔ Gallra spelare share the same file selection:** opening one now adopts the other's current scan scope (folders, path-globs, date span, recursion, extension preset) instead of starting empty — so after culling a folder you can open Räkna spelare and immediately see its counts for the same files, and vice versa. Only the scan scope is mirrored, not culling's per-player filter (Räkna spelare counts everyone). Shared in-memory for the session.
- **Räkna spelare — always-excluded markers (`FBK` / `Klacken`):** the photographer's labels for team photos (`FBK`, alongside the built-in `Laget`) and crowd shots (`Klacken`) are now always treated as group/audience exclusions, never counted as players, regardless of image count or config — in both the CLI and the GUI/API. The group (`grupp`) exclusion list is now configurable too (config-file `grupp` key + `RAKNA_GRUPP` env), with `Laget`/`FBK` always merged in and `Klacken` always in `publik`. Coach/audience/group resolution is now a single shared function so the CLI and GUI never diverge.
- **Gallra spelare — auto-advance after rename:** renaming a file in culling (inline `Enter` rename or the `Cmd+Enter` name removal) now advances to the next file, so you can keep moving through the set. Configurable under Preferences → Files → Gallra spelare ("Auto-advance after rename"), default on.
- **Gallra spelare — snabb bortbockning av namn:** the preview pane shows the current file's player names as checked chips in an overlay at the top. Unchecking a name **previews the resulting filename live in the left file list** (the current row turns orange while the change is uncommitted — shown once, in the list, not duplicated in the overlay); `Cmd+Enter` commits the rename for real. Faster than manual inline rename when a developed JPG was cropped so one player is no longer in frame. Removal is filename-only (splits the `,_`-joined names, drops the toggled-off pieces, rejoins) — it never adds names; removing all leaves a bare timestamp. `Enter` still opens the full manual inline rename. **Navigating away with an uncommitted toggle prompts a dialog** — `Cmd+Enter` saves, `Enter` discards (default), `Esc` cancels — so a pending rename isn't lost silently.
- **Gallra spelare — `Cmd+⌫` to cull:** following Finder's "move to trash" convention, `Cmd+Backspace` now culls the current file (alongside the existing `x` and `Delete`).
- **CLI subcommands (`ansikten culling` / `ansikten faces`)**: the terminal launcher now selects a workflow via a verb instead of always feeding files into the face queue. `ansikten culling DIR` (alias `cull`) opens/focuses the Gallra spelare module and loads the folder; `ansikten faces *.NEF` (or bare `ansikten *.NEF`) queues for face review as before. `--clear`/`-c` resets the target's working set before adding (alone = just empty); without it, paths are appended to the existing set. `--recursive`/`-r` (culling) scans sub-folders too — the default is just the named folder, matching shell-glob intuition. When the app is already running the args are routed into the live window (the right module opens/focuses). The launcher is now a versioned script in the repo (`bin/ansikten`) replacing the previous zsh function; all argument parsing lives in `src/main/cli-args.js` (unit-tested).
- **Startup landing page**: when the app opens with an empty workspace, a centered view presents the workflow steps in order (Importera · Byt namn · Granska ansikten · Räkna spelare · Gallra spelare) as buttons that open the matching module. Import is enabled only while a camera card is mounted (polled), the rest are always available. The view disappears once a module opens or an image loads.
- **Räkna spelare** module: counts images per named player from filenames (no face recognition) with median-baseline over/under-representation stats; folder/glob input with extension presets and a filename-date span; live auto-refresh when the watched folder changes (#46).
- **Gallra spelare** culling workspace: filter by player or a Finder-style glob, file list beside a maximized preview, keystroke culling (`x`/Delete) with auto-advance and `Cmd+Z` undo, backed by an app-managed trash with restore-to-original (#46). Extended to NEF/RAW via the existing NEF→JPG preview pipeline, with debounced conversion on fast stepping (#47).
- Folder-level file-watching IPC and a folder-path dialog, shared by the new modules.
- **Importera** module: detect the mounted camera card, transfer its NEFs (+ `.xmp` sidecars) to a destination folder with live progress (move or copy, selectable), then eject the card. Skips files already present; ejects only after a zero-error transfer. macOS (`diskutil`) (#48-followup).
- **Byt namn** module: rename NEFs from EXIF `CreateDate` to `YYMMDD_HHMMSS.NEF` (rename_nef GUI), with a preview (dry-run) and confirm. Carries `.xmp` sidecars, disambiguates identical timestamps (`-NN`), skips files without a `CreateDate`, and never overwrites an existing target (restores the original on collision).

### Added
- **Remove redundant encodings** in Database Management: scans each person for redundant encodings — exact byte-identical duplicates, plus near-identical ones above an adjustable threshold — and lists `name: total → kept (N redundant)`, so re-processing bloat can be cleaned per person or all at once. Manual faces are never removed; default threshold `0` removes only exact duplicates. New endpoints `GET /api/v1/management/redundant-encodings` and `POST /api/v1/management/dedup-people` (supports `dry_run`).
- **Find duplicates** in Database Management: scans for pairs of distinctly-named people whose faces look like the same person (centroid cosine distance ≤ an adjustable threshold) and lists them closest-first, so accidental name variants (e.g. "Elis" vs "Elis Niemi") can be reviewed and merged with one click — "Keep A" / "Keep B" merges the other into the kept name. New endpoint `GET /api/v1/management/find-duplicates`; resolution reuses `merge-people`. People with only manual faces (no embedding) are skipped.
- **Twin recognition disambiguation**: at detection time, when a face's top two candidates are a confirmed-distinct pair (e.g. identical twins) and nearly equidistant, the suggested name is re-decided by a k-NN vote over both people's confirmed photos — more robust than the single nearest crop, which can pick the wrong twin. The Review panel shows a "Tvilling-särskiljning → <namn>" hint when this happens. Tunable via `twin_margin` / `twin_knn_k` in `config.json`. Builds on the confirmed-distinct registry below.
- **Twin-aware duplicate detection**: each candidate pair now also reports a head-to-head *separability* — a 1-NN leave-one-out score over both people's confirmed photos. Pairs that are close on centroid but cleanly separable (different people who look alike, e.g. identical twins) are flagged "likely distinct" and sorted last, instead of topping the list. Plus a **"Not a duplicate"** action that records the pair to a persistent confirmed-distinct registry (`distinct_pairs.json`) so future scans skip it, with an "Excluded pairs" list to undo. New endpoints `GET/POST /api/v1/management/distinct-pair(s)` and `POST …/distinct-pair/remove`. (Separability needs ≥2 confirmed photos per person; below that it falls back to centroid distance and the manual exclusion.)
- **Gallra spelare trash filter**: the trash view (Papperskorg) now has a filetype filter (Alla / jpg / nef-raw) so JPEGs and raw files can be reviewed and restored separately. The header shows the filtered-of-total count, and "Töm" empties only the filtered subset when a filter is active (empties everything when set to Alla).
- **Gallra spelare trash retention**: the app-managed culling trash now auto-purges files older than a configurable threshold (default 30 days; `0` = keep forever). Purge runs lazily — at backend startup and whenever the trash view is opened — so the trash can't grow without bound. Configurable under Preferences → Files → Trash (Gallra), persisted as `trash_retention_days` in `config.json`. New endpoints `GET`/`POST /api/v1/culling/retention`.
- **Gallra spelare**: right-click a file for a context menu (navigate, rename, cull, undo) with each action's keyboard shortcut shown inline for discoverability, and a matching "Gallra spelare" section in the shortcuts help (`?`). Navigation extended: `→`/`↓` next, `←`/`↑` previous, `Alt`+arrow pages by 10.
- **Gallra spelare**: rename a file directly from the list — press `Enter` on the selected file (or double-click it) to edit its name inline (Finder-style; the extension is preserved), then `Enter` to commit or `Esc` to cancel. Renames carry `.xmp` sidecars and refuse to overwrite an existing file. Useful when a developed JPG was cropped so a named player is no longer in frame. New endpoint `POST /api/v1/culling/rename`.
- **Gallra spelare** now shows a live per-player count column on the left for the current scope (calls the player-count endpoint), updating immediately as you cull or restore files — so you can see each player's balance shift while you work. The column mirrors the Räkna spelare table — name · count · % · deviation Δ% (signed, color-coded) · distribution bar — with coaches/audience/group and below-threshold names collapsed into an "excluded" section instead of mixed into the counts (the included set now matches `rakna_spelare.py` and the Räkna spelare page exactly). Click a player to filter the list to them (click again to clear).
- **Gallra spelare**: both internal column boundaries are now draggable — the stats column width and the list/preview split — and the widths persist across restarts.

### Changed
- **`ansikten culling` from the CLI** no longer leaves the face-review panel docked beside culling, and no longer flashes the startup landing page: a CLI launch target skips the landing entirely, and opening culling closes the Review panel (Review is for face review, not culling) while leaving every other open tab in place — it no longer replaces the whole workspace. Review reappears when you enter face review.
- Workflow steps launched from the startup landing page now open in a layout suited to the step: the self-contained modules (Importera · Byt namn · Räkna spelare · Gallra spelare) fill the workspace instead of docking beside the empty Review panel, and "Granska ansikten" opens the review layout.
- Räkna spelare / Gallra spelare filter controls: the primary "Räkna"/"Visa" buttons now use the themed button style (previously rendered as unstyled native buttons), and checkboxes are restyled to match the theme. Changing the player/filetype dropdown, or toggling "Inkl. undermappar" / "Per match", now re-runs immediately — no need to click the button.
- Documentation: established [CLAUDE.md](CLAUDE.md) as the canonical agent-instructions file; [AGENTS.md](AGENTS.md) and `.github/copilot-instructions.md` now point to it.

### Fixed
- **Gallra spelare player-filter dropdown now excludes non-players**: the dropdown listed every parsed name verbatim, so group/crowd markers (`Laget`/`FBK`/`Klacken`), coaches, and below-threshold names showed up as filterable "players" — unlike the stats column, which already excludes them. The dropdown now applies the same shared `resolve_exclusion_sets` + `min_images` threshold, so it lists the same player set as `rakna_spelare.py` / the stats column. Files themselves are still listed in full.
- **Gallra spelare — `Esc` discards a file's pending name toggles**: after unchecking names in the preview overlay (row turns orange), there was no way to abandon the change from the main window without either committing it or triggering the navigation dialog. `Esc` now discards the pending toggles for the current file (the row returns to normal) with no dialog. It only acts when culling is the active tabset (so an `Esc` meant for another visible pane can't silently drop culling's edits) and in the capture phase (so it wins over Review's `Esc`); it's a no-op when nothing is pending, leaves the context menu's `Esc` (close menu) alone, and the navigation dialog still owns `Esc` while it's open.
- Rename now keeps manually added faces in the new filename. Manual faces are persisted with the file's content hash (the batch-confirm path previously stored `hash=None`), and the rename name lookup now takes the union of basename- and hash-matched names instead of consulting the hash index only as a fallback — so a manual face anchored by only one key is no longer dropped when an auto-detected face matches by the other. Applies to both the GUI and the legacy CLI rename.
- Rename now holds a file out of name resolution while its review has unsaved changes, closing the ordering window behind the fix above: adding a manual face to an already-processed file and renaming during the brief save window could read the database before the face persisted and drop it from the first-pass filename. The Review panel signals unsaved changes and the file queue excludes such files from rename preview and execution until the save completes.
- Gallra spelare CSS referenced undefined `--border-color` / `--accent` variables, so borders fell back to nothing and the active file row rendered a non-theme blue; it now uses the theme variables (the active row uses the theme accent in both light and dark).
- **Gallra spelare / Räkna spelare deviation colors had poor contrast**: the player tables referenced `--warning`/`--success`/`--error`, which don't exist (the theme defines `--color-warning` etc.), so they fell back to a dull amber — barely legible on the beige theme, and the warn level was invisible on the gold active-row highlight ("yellow on gold"). They now use the real theme colors, and the culling stats active row uses a subtle left-accent-bar + tint instead of a solid gold fill so all three deviation levels stay readable.
- **Undefined CSS variables across several modules**: `ImportModule`, `RenameNefModule`, `ConnectionStatus`, `PlayerCountModule` and `InputBar` referenced non-existent vars (`--border-color`, `--success`/`--warning`/`--error`, `--warning-bg`/`--warning-text`) that fell back to hardcoded off-theme colors (or nothing). They now use the real theme vars (`--border-subtle`, `--color-success`/`-warning`/`-error`, and a theme-aware orange badge for the connection-warning state), so borders and status colors follow the active theme in both light and dark.
- **Gallra spelare keyboard focus traps**: after picking a player in the dropdown, focus stayed on the `<select>` so the next arrow keypress changed the dropdown instead of navigating files; and after a rename (especially `Cmd+Enter` from a name-overlay checkbox) focus lingered on the control so arrows were swallowed. Focus is now handed back to the file list after both, single-key navigation is no longer blocked by a focused overlay checkbox, and the selected row auto-scrolls into view (with ~3 rows of padding) as you navigate.

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
