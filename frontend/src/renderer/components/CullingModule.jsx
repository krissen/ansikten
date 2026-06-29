/**
 * CullingModule - Stats-driven culling/balancing workspace.
 *
 * Pick a player (or type a Finder-style glob), preview their JPEGs, and trash the
 * weak ones recoverably until each player is balanced against the others. Layout:
 * a full-width filter bar on top, then a resizable two-column row - file list on
 * the left, the selected image maximized on the right.
 *
 * Trashing is reversible (app-managed trash + restore). Works on JPEGs over
 * file://, so no NEF/RAW pipeline is needed.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { useModuleEvent } from '../hooks/useModuleEvent.js';
import './CullingModule.css';

const REFRESH_DEBOUNCE_MS = 400;
// Delay RAW conversion until the selection settles, so fast keyboard stepping
// only converts the file the user rests on, not every file passed through.
const PREVIEW_DEBOUNCE_MS = 150;

// The live stats panel counts every player in the folder, so it uses the
// scan scope only — not the player/name_glob filter that narrows the file list.
// min_images: 1 overrides the count endpoint's default of 3 so players culled
// down to 1-2 images stay visible (the whole point is watching counts shrink).
function statsScopeFromQuery(q) {
  if (!q) return null;
  return {
    roots: q.roots,
    globs: q.globs,
    extension_preset: q.extension_preset,
    recursive: q.recursive,
    date_from: q.date_from,
    date_to: q.date_to,
    min_images: 1,
  };
}

export function CullingModule({ node }) {
  const { api } = useBackend();

  const [roots, setRoots] = useState([]);
  const [glob, setGlob] = useState('');
  const [player, setPlayer] = useState('');
  const [players, setPlayers] = useState([]);
  // Live per-player counts for the current scope (from /players/count), shown in
  // the left stats column and refreshed as files are culled.
  const [stats, setStats] = useState(null);
  const [preset, setPreset] = useState('jpg'); // jpg | nef | raw
  // Scope carried from the stats module (glob-only runs, date span, recursion).
  // The culling bar has no date inputs, so we keep these to honour the count's
  // selection and to preserve scope across a manual re-"Visa".
  const [carriedGlobs, setCarriedGlobs] = useState([]);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [recursive, setRecursive] = useState(true);

  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  // Inline rename: path of the file being edited (null = none) + its draft
  // value. Keyed by path, not list index, so a mid-edit auto-refresh that
  // reorders the list can't make Enter rename a different file.
  const [editPath, setEditPath] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState([]);

  const [leftWidthPct, setLeftWidthPct] = useState(32);

  // Resolved preview for the right pane. JPEGs load directly; RAW goes through
  // the NEF->JPG pipeline, so resolution is async.
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // Latest filter params for auto-refresh; undo stack of trashed ids.
  const lastQueryRef = useRef(null);
  // Monotonic id so out-of-order list responses (e.g. switching players fast on
  // a large folder) can't clobber a newer result — critical here because the
  // list drives which files `x`/Delete trashes.
  const reqSeqRef = useRef(0);
  const statsSeqRef = useRef(0);
  const undoStackRef = useRef([]);
  const watchedDirsRef = useRef(new Set());
  const debounceRef = useRef(null);
  const statsDebounceRef = useRef(null);
  const mainRef = useRef(null);

  // The editable glob is a Finder-style basename filter (name_glob) over the
  // resolved files, NOT an independent filesystem glob. The scan source is
  // roots (+ any path-globs carried from the stats module).
  // `overrides` lets callers run with a just-changed value before the matching
  // setState has flushed (e.g. auto-apply on a dropdown change).
  const buildQuery = useCallback(
    (overrides = {}) => ({
      roots,
      globs: carriedGlobs,
      extension_preset: preset,
      recursive,
      date_from: dateFrom,
      date_to: dateTo,
      // Exact player filter (from the dropdown / stats hand-off) so substring
      // names can't conflate players; name_glob is the extra editable refinement.
      player: player || null,
      name_glob: glob.trim() || null,
      ...overrides,
    }),
    [roots, carriedGlobs, preset, recursive, dateFrom, dateTo, player, glob]
  );

  // ----- folder watching (live refresh) ------------------------------
  const watchDirs = useCallback(() => {
    const dirs = new Set(roots);
    for (const g of carriedGlobs) {
      const base = globBaseDir(g);
      if (base) dirs.add(base);
    }
    return dirs;
  }, [roots, carriedGlobs]);

  const updateWatches = useCallback((desired) => {
    const current = watchedDirsRef.current;
    for (const dir of current) {
      if (!desired.has(dir)) window.ansiktenAPI.unwatchFolder?.(dir);
    }
    for (const dir of desired) {
      if (!current.has(dir)) window.ansiktenAPI.watchFolder?.(dir, true);
    }
    watchedDirsRef.current = desired;
  }, []);

  // ----- listing ------------------------------------------------------
  const loadList = useCallback(
    async (query, { keepIndex = false } = {}) => {
      const seq = ++reqSeqRef.current;
      setIsLoading(true);
      try {
        const data = await api.post('/api/v1/culling/files', query);
        if (seq !== reqSeqRef.current) return; // a newer request superseded this one
        setFiles(data.files);
        setPlayers(data.players);
        setError(null);
        setCurrentIndex((prev) => {
          if (data.files.length === 0) return -1;
          if (keepIndex && prev >= 0) return Math.min(prev, data.files.length - 1);
          return 0;
        });
      } catch (err) {
        if (seq !== reqSeqRef.current) return;
        setError(err.message || String(err));
      } finally {
        // Leave isLoading true if a newer request is still in flight (it will clear it).
        if (seq === reqSeqRef.current) {
          setIsLoading(false);
          setHasRun(true);
        }
      }
    },
    [api]
  );

  // Live per-player counts for the scan scope (no player filter), so the panel
  // shows the balance across all players. Guarded against out-of-order responses.
  const loadStats = useCallback(
    async (scope) => {
      if (!scope) return;
      const seq = ++statsSeqRef.current;
      try {
        const data = await api.post('/api/v1/players/count', scope);
        if (seq !== statsSeqRef.current) return;
        setStats(data);
      } catch {
        if (seq === statsSeqRef.current) setStats(null);
      }
    },
    [api]
  );

  // Trailing-debounced stats refresh for the mutation paths (cull/restore), so
  // rapid culling coalesces into one rescan instead of a backend scan per key.
  const refreshStatsDebounced = useCallback(() => {
    if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
    statsDebounceRef.current = setTimeout(() => {
      loadStats(statsScopeFromQuery(lastQueryRef.current));
    }, REFRESH_DEBOUNCE_MS);
  }, [loadStats]);

  const runFilter = useCallback((overrides = {}) => {
    const query = buildQuery(overrides);
    lastQueryRef.current = query;
    loadList(query);
    loadStats(statsScopeFromQuery(query));
    updateWatches(watchDirs());
  }, [buildQuery, loadList, loadStats, updateWatches, watchDirs]);

  // Auto-refresh on folder change.
  useEffect(() => {
    const unsubscribe = window.ansiktenAPI.onFolderChanged?.(() => {
      if (!lastQueryRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadList(lastQueryRef.current, { keepIndex: true });
        loadStats(statsScopeFromQuery(lastQueryRef.current));
      }, REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (statsDebounceRef.current) clearTimeout(statsDebounceRef.current);
      if (unsubscribe) unsubscribe();
      for (const dir of watchedDirsRef.current) window.ansiktenAPI.unwatchFolder?.(dir);
      watchedDirsRef.current = new Set();
    };
  }, [loadList, loadStats]);

  // ----- filter bar actions ------------------------------------------
  const addFolders = useCallback(async () => {
    try {
      const paths = await window.ansiktenAPI.invoke('open-folder-paths');
      if (paths && paths.length) {
        setRoots((r) => Array.from(new Set([...r, ...paths])));
        // A manual folder choice replaces the (hidden) scan source carried from a
        // glob-only count, so the stale glob can't silently mix into the results.
        setCarriedGlobs([]);
      }
    } catch (err) {
      console.error('[Culling] folder pick failed', err);
    }
  }, []);

  // Picking a player fills the editable glob with a basename pattern (the user's
  // "klicka till glob" affordance); the directory scope (roots) is untouched.
  const selectPlayer = useCallback((name) => {
    setPlayer(name);
    setGlob(name ? `*${name}*` : '');
  }, []);

  // Open filtered to a player from the stats module, honouring the count's full
  // scope: folders OR path-globs, the date span, and the recursion flag.
  useModuleEvent(
    'cull-player',
    (data) => {
      if (!data) return;
      const nextRoots = data.roots || [];
      const nextGlobs = data.globs || [];
      const nextRecursive = data.recursive ?? true;
      const nextFrom = data.date_from || null;
      const nextTo = data.date_to || null;
      setRoots(nextRoots);
      setCarriedGlobs(nextGlobs);
      setRecursive(nextRecursive);
      setDateFrom(nextFrom);
      setDateTo(nextTo);
      setPlayer(data.name || '');
      setGlob(data.name ? `*${data.name}*` : '');
      // Stats culling is always on developed JPEGs.
      setPreset('jpg');

      const query = {
        roots: nextRoots,
        globs: nextGlobs,
        extension_preset: 'jpg',
        recursive: nextRecursive,
        date_from: nextFrom,
        date_to: nextTo,
        player: data.name || null,
        name_glob: data.name ? `*${data.name}*` : null,
      };
      lastQueryRef.current = query;
      loadList(query);
      loadStats(statsScopeFromQuery(query));

      const dirs = new Set(nextRoots);
      for (const g of nextGlobs) {
        const base = globBaseDir(g);
        if (base) dirs.add(base);
      }
      updateWatches(dirs);
    },
    [loadList, loadStats, updateWatches]
  );

  // ----- cull loop ----------------------------------------------------
  const trashCurrent = useCallback(async () => {
    if (currentIndex < 0 || currentIndex >= files.length) return;
    const victim = files[currentIndex];
    // Optimistic: drop from list, advance.
    setFiles((prev) => prev.filter((_, i) => i !== currentIndex));
    setCurrentIndex((prev) => {
      const nextLen = files.length - 1;
      if (nextLen === 0) return -1;
      return Math.min(prev, nextLen - 1);
    });
    try {
      const res = await api.post('/api/v1/culling/trash', { paths: [victim.path] });
      const id = res.trashed?.[0]?.id;
      if (id) {
        undoStackRef.current.push(id);
        // Reflect the removed image in the live counts (debounced for fast culling).
        refreshStatsDebounced();
      } else {
        // 200 with errors[] (permission/lock/race): the file is still on disk, so
        // roll the optimistic removal back by reloading and surface the reason.
        setError(res.errors?.[0]?.error || 'Kunde inte flytta filen till papperskorgen.');
        if (lastQueryRef.current) loadList(lastQueryRef.current, { keepIndex: true });
      }
    } catch (err) {
      setError(err.message || String(err));
      // Re-fetch to recover correct state on failure.
      if (lastQueryRef.current) loadList(lastQueryRef.current, { keepIndex: true });
    }
  }, [api, currentIndex, files, loadList, refreshStatsDebounced]);

  const undoTrash = useCallback(async () => {
    // Pop until a still-trashed id restores - ids restored via the trash view
    // are removed from the stack, but guard anyway so Cmd+Z never no-ops loudly.
    while (undoStackRef.current.length > 0) {
      const id = undoStackRef.current.pop();
      try {
        const res = await api.post('/api/v1/culling/restore', { ids: [id] });
        if (res.restored && res.restored.length > 0) {
          if (lastQueryRef.current) {
            loadList(lastQueryRef.current, { keepIndex: true });
            refreshStatsDebounced();
          }
          return;
        }
        // id no longer in trash -> fall through and try the next one.
      } catch (err) {
        setError(err.message || String(err));
        return;
      }
    }
  }, [api, loadList, refreshStatsDebounced]);

  // ----- inline rename -----------------------------------------------
  // Edit the filename without its extension (Finder-style); the extension is
  // re-appended on commit so the YYMMDD_HHMMSS… format / suffix is preserved.
  const beginEdit = useCallback((index) => {
    const f = files[index];
    if (!f) return;
    setCurrentIndex(index);
    setEditValue(stripExt(f.basename));
    setEditPath(f.path);
  }, [files]);

  const cancelEdit = useCallback(() => setEditPath(null), []);

  const commitEdit = useCallback(async () => {
    const path = editPath;
    setEditPath(null);
    if (!path) return;
    const next = editValue.trim();
    // Derive the extension from the file being renamed (not the list), so a
    // reorder mid-edit can't change which file or extension we commit.
    const newBasename = next + extOf(basename(path));
    if (!next || newBasename === basename(path)) return; // no-op
    try {
      await api.post('/api/v1/culling/rename', { path, new_basename: newBasename });
      if (lastQueryRef.current) loadList(lastQueryRef.current, { keepIndex: true });
      refreshStatsDebounced();
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [api, editPath, editValue, loadList, refreshStatsDebounced]);

  // ----- keyboard ----------------------------------------------------
  useEffect(() => {
    const handler = (e) => {
      if (node && !node.isVisible?.()) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (showTrash) return;

      if (e.key === 'Enter') {
        // Enter renames the selected file (mirrors Finder muscle memory). Only
        // act when culling is the active tabset, so we don't collide with
        // another visible module's Enter handler (e.g. Review accept-face).
        const activeTabsetId = node?.getModel?.().getActiveTabset?.()?.getId?.();
        const myTabsetId = node?.getParent?.()?.getId?.();
        if (activeTabsetId && myTabsetId && activeTabsetId !== myTabsetId) return;
        e.preventDefault();
        if (currentIndex >= 0) beginEdit(currentIndex);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoTrash();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(i + 1, files.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'x') {
        e.preventDefault();
        trashCurrent();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [node, files.length, showTrash, trashCurrent, undoTrash, currentIndex, beginEdit]);

  // ----- trash view --------------------------------------------------
  const openTrash = useCallback(async () => {
    setShowTrash(true);
    try {
      const data = await api.get('/api/v1/culling/trash');
      setTrashItems(data.items || []);
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [api]);

  const restoreItem = useCallback(
    async (id) => {
      try {
        const res = await api.post('/api/v1/culling/restore', { ids: [id] });
        if (res.restored && res.restored.length > 0) {
          setTrashItems((prev) => prev.filter((it) => it.id !== id));
          // Keep the cull-loop undo stack in sync - this id is no longer trashable.
          undoStackRef.current = undoStackRef.current.filter((x) => x !== id);
          if (lastQueryRef.current) {
            loadList(lastQueryRef.current, { keepIndex: true });
            refreshStatsDebounced();
          }
        } else {
          // 200 with errors[] (unwritable folder, missing stored file): the item
          // stays in the manifest, so keep it visible and surface the reason.
          setError(res.errors?.[0]?.error || 'Kunde inte återställa filen.');
        }
      } catch (err) {
        setError(err.message || String(err));
      }
    },
    [api, loadList, refreshStatsDebounced]
  );

  const emptyTrash = useCallback(async () => {
    try {
      await api.post('/api/v1/culling/empty', {});
      setTrashItems([]);
      undoStackRef.current = [];
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [api]);

  // ----- divider drag ------------------------------------------------
  const startDrag = useCallback((e) => {
    e.preventDefault();
    // Measure against the list+preview area (excludes the fixed stats column).
    const main = mainRef.current;
    if (!main) return;
    const onMove = (ev) => {
      const rect = main.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftWidthPct(Math.min(70, Math.max(15, pct)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const current = currentIndex >= 0 ? files[currentIndex] : null;
  const canFilter = roots.length > 0 || glob.trim() !== '';

  // Resolve the preview for the current file. RAW is converted via the NEF
  // pipeline; the cancelled guard prevents a slow conversion from painting over
  // a newer selection when the user steps quickly.
  const currentPath = current?.path;
  useEffect(() => {
    if (!currentPath) {
      setPreviewUrl(null); setPreviewError(null); setPreviewLoading(false);
      return;
    }
    if (!isRaw(currentPath)) {
      setPreviewUrl(toFileUrl(currentPath)); setPreviewError(null); setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true); setPreviewError(null); setPreviewUrl(null);
    // Debounced: clearing the timer on a fast step cancels the POST before it
    // fires, so no abandoned conversions pile up behind the one the user lands on.
    const timer = setTimeout(() => {
      api.post('/api/v1/preprocessing/nef', { file_path: currentPath })
        .then((res) => {
          if (cancelled) return;
          if (res.status === 'error' || !res.nef_jpg_path) {
            setPreviewError(res.error || 'Kunde inte konvertera NEF.');
          } else {
            setPreviewUrl(toFileUrl(res.nef_jpg_path));
          }
        })
        .catch((err) => { if (!cancelled) setPreviewError(err.message || String(err)); })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, PREVIEW_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [currentPath, api]);

  // Prefetch the next RAW so stepping through is usually a cache hit - also
  // debounced, so a fast run of keypresses only warms the file after the rest.
  useEffect(() => {
    const next = files[currentIndex + 1];
    if (!next || !isRaw(next.path)) return;
    const timer = setTimeout(() => {
      api.post('/api/v1/preprocessing/nef', { file_path: next.path }).catch(() => {});
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [currentIndex, files, api]);

  return (
    <div className="module-container culling">
      <div className="culling-filterbar">
        <button className="btn-secondary" onClick={addFolders}>+ Mapp</button>
        <select
          className="form-select"
          value={preset}
          onChange={(e) => {
            const v = e.target.value;
            setPreset(v);
            // Auto-apply once a scope exists (a query has run).
            if (lastQueryRef.current) runFilter({ extension_preset: v });
          }}
          title="Filtyp"
        >
          <option value="jpg">jpg / jpeg</option>
          <option value="nef">nef</option>
          <option value="raw">raw (alla)</option>
        </select>
        <select
          className="form-select"
          value={player}
          onChange={(e) => {
            const name = e.target.value;
            selectPlayer(name);
            // Picking a player applies immediately — no need to press Visa.
            if (lastQueryRef.current) {
              const g = name ? `*${name}*` : '';
              runFilter({ player: name || null, name_glob: g || null });
            }
          }}
          title="Spelare"
        >
          <option value="">Alla spelare</option>
          {players.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input
          className="form-input culling-glob"
          type="text"
          placeholder="Glob, t.ex. *ArvidW*"
          value={glob}
          onChange={(e) => { setGlob(e.target.value); setPlayer(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') runFilter(); }}
        />
        <button className="btn-action" onClick={() => runFilter()} disabled={!canFilter || isLoading}>
          {isLoading ? '…' : 'Visa'}
        </button>
        <span className="culling-spacer" />
        <button
          className={showTrash ? 'btn-action' : 'btn-secondary'}
          onClick={() => (showTrash ? setShowTrash(false) : openTrash())}
        >
          Papperskorg
        </button>
      </div>

      {roots.length > 0 && (
        <div className="culling-roots">
          {roots.map((r) => (
            <span className="culling-chip" key={r} title={r}>
              {basename(r)}
              <button className="culling-chip-x" onClick={() => setRoots((rs) => rs.filter((x) => x !== r))}>×</button>
            </span>
          ))}
        </div>
      )}

      {error && <div className="status-message error">Fel: {error}</div>}

      {showTrash ? (
        <div className="module-body culling-trashview">
          <div className="culling-trash-header">
            <span>{trashItems.length} i papperskorgen</span>
            {trashItems.length > 0 && (
              <button className="btn-secondary" onClick={emptyTrash}>Töm</button>
            )}
          </div>
          {trashItems.length === 0 ? (
            <div className="empty-state">Papperskorgen är tom.</div>
          ) : (
            <ul className="culling-trash-list">
              {trashItems.map((it) => (
                <li key={it.id}>
                  <span className="culling-trash-name" title={it.original_path}>{it.basename}</span>
                  <button className="btn-secondary" onClick={() => restoreItem(it.id)}>Återställ</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="culling-body">
          <CullingStats stats={stats} selected={player} />
          <div className="culling-main" ref={mainRef}>
          <div className="culling-list" style={{ width: `${leftWidthPct}%` }}>
            <div className="culling-list-header">
              {files.length} bilder{player ? ` · ${player}` : ''}
            </div>
            {!hasRun && !isLoading && (
              <div className="empty-state">Välj mapp + spelare/glob och tryck <strong>Visa</strong>.</div>
            )}
            {hasRun && files.length === 0 && !isLoading && (
              <div className="empty-state">Inga bilder.</div>
            )}
            <ul className="culling-files">
              {files.map((f, i) => (
                <li
                  key={f.path}
                  className={i === currentIndex ? 'active' : ''}
                  onClick={() => setCurrentIndex(i)}
                  onDoubleClick={() => beginEdit(i)}
                >
                  {editPath === f.path ? (
                    <input
                      className="culling-rename-input"
                      value={editValue}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                      }}
                      onBlur={cancelEdit}
                    />
                  ) : (
                    <span className="culling-file-name">{f.basename}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="culling-divider" onMouseDown={startDrag} />

          <div className="culling-preview">
            {!current ? (
              <div className="empty-state">Ingen bild vald.</div>
            ) : previewError ? (
              <div className="status-message error">Fel: {previewError}</div>
            ) : previewLoading ? (
              <div className="empty-state">Konverterar…</div>
            ) : previewUrl ? (
              <img className="culling-image" src={previewUrl} alt={current.basename} />
            ) : null}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

// RAW extensions that must go through the NEF->JPG preview pipeline
// (matches file_resolver EXTENSION_PRESETS.raw).
const RAW_EXTS = ['.nef', '.cr2', '.cr3', '.arw', '.dng', '.raw', '.raf', '.orf', '.rw2'];

function isRaw(p) {
  const i = p.lastIndexOf('.');
  return i !== -1 && RAW_EXTS.includes(p.slice(i).toLowerCase());
}

// file:// URL builder - mirrors ImageViewer.loadImage encoding.
function toFileUrl(p) {
  if (p.startsWith('file://')) return p;
  const normalized = p.replace(/\\/g, '/');
  const isWin = /^[a-zA-Z]:\//.test(normalized);
  const encoded = encodeURI(normalized)
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D');
  return isWin ? 'file:///' + encoded : 'file://' + encoded;
}

function globBaseDir(pattern) {
  const idx = pattern.search(/[*?[]/);
  const literal = idx === -1 ? pattern : pattern.slice(0, idx);
  const slash = literal.lastIndexOf('/');
  return slash === -1 ? '' : literal.slice(0, slash);
}

function basename(p) {
  const parts = p.replace(/\/+$/, '').split('/');
  return parts[parts.length - 1] || p;
}

// Split a basename into its editable name and its extension (incl. the dot).
// A leading dot (dotfile) is treated as part of the name, not an extension.
function extOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i) : '';
}

function stripExt(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

/**
 * Live per-player count for the current scope, shown left of the file list.
 * `stats` is the /players/count response (or null); `selected` highlights the
 * player currently filtered in the list.
 */
function CullingStats({ stats, selected }) {
  const players = stats?.players || [];
  return (
    <div className="culling-stats">
      <div className="culling-stats-header">
        <span>Spelare</span>
        {stats?.baseline != null && (
          <span className="culling-stats-baseline" title="Baslinje (median)">
            ~{Math.round(stats.baseline)}
          </span>
        )}
      </div>
      {players.length === 0 ? (
        <div className="culling-stats-empty">—</div>
      ) : (
        <ul className="culling-stats-list">
          {players.map((p) => (
            <li
              key={p.name}
              className={`culling-stat delta-${p.level || 'ok'}${p.name === selected ? ' active' : ''}`}
              title={`${p.name}: ${p.count}`}
            >
              <span className="culling-stat-name">{p.name}</span>
              <span className="culling-stat-count">{p.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CullingModule;
