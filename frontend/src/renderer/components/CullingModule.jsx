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

export function CullingModule({ node }) {
  const { api } = useBackend();

  const [roots, setRoots] = useState([]);
  const [glob, setGlob] = useState('');
  const [player, setPlayer] = useState('');
  const [players, setPlayers] = useState([]);
  // Scope carried from the stats module (glob-only runs, date span, recursion).
  // The culling bar has no date inputs, so we keep these to honour the count's
  // selection and to preserve scope across a manual re-"Visa".
  const [carriedGlobs, setCarriedGlobs] = useState([]);
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [recursive, setRecursive] = useState(true);

  const [files, setFiles] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState([]);

  const [leftWidthPct, setLeftWidthPct] = useState(32);

  // Latest filter params for auto-refresh; undo stack of trashed ids.
  const lastQueryRef = useRef(null);
  const undoStackRef = useRef([]);
  const watchedDirsRef = useRef(new Set());
  const debounceRef = useRef(null);
  const bodyRef = useRef(null);

  // The editable glob is a Finder-style basename filter (name_glob) over the
  // resolved files, NOT an independent filesystem glob. The scan source is
  // roots (+ any path-globs carried from the stats module).
  const buildQuery = useCallback(
    () => ({
      roots,
      globs: carriedGlobs,
      extension_preset: 'jpg',
      recursive,
      date_from: dateFrom,
      date_to: dateTo,
      name_glob: glob.trim() || null,
    }),
    [roots, carriedGlobs, recursive, dateFrom, dateTo, glob]
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
      setIsLoading(true);
      try {
        const data = await api.post('/api/v1/culling/files', query);
        setFiles(data.files);
        setPlayers(data.players);
        setError(null);
        setCurrentIndex((prev) => {
          if (data.files.length === 0) return -1;
          if (keepIndex && prev >= 0) return Math.min(prev, data.files.length - 1);
          return 0;
        });
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setIsLoading(false);
        setHasRun(true);
      }
    },
    [api]
  );

  const runFilter = useCallback(() => {
    const query = buildQuery();
    lastQueryRef.current = query;
    loadList(query);
    updateWatches(watchDirs());
  }, [buildQuery, loadList, updateWatches, watchDirs]);

  // Auto-refresh on folder change.
  useEffect(() => {
    const unsubscribe = window.ansiktenAPI.onFolderChanged?.(() => {
      if (!lastQueryRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        loadList(lastQueryRef.current, { keepIndex: true });
      }, REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (unsubscribe) unsubscribe();
      for (const dir of watchedDirsRef.current) window.ansiktenAPI.unwatchFolder?.(dir);
      watchedDirsRef.current = new Set();
    };
  }, [loadList]);

  // ----- filter bar actions ------------------------------------------
  const addFolders = useCallback(async () => {
    try {
      const paths = await window.ansiktenAPI.invoke('open-folder-paths');
      if (paths && paths.length) setRoots((r) => Array.from(new Set([...r, ...paths])));
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

      const query = {
        roots: nextRoots,
        globs: nextGlobs,
        extension_preset: 'jpg',
        recursive: nextRecursive,
        date_from: nextFrom,
        date_to: nextTo,
        name_glob: data.name ? `*${data.name}*` : null,
      };
      lastQueryRef.current = query;
      loadList(query);

      const dirs = new Set(nextRoots);
      for (const g of nextGlobs) {
        const base = globBaseDir(g);
        if (base) dirs.add(base);
      }
      updateWatches(dirs);
    },
    [loadList, updateWatches]
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
      if (id) undoStackRef.current.push(id);
    } catch (err) {
      setError(err.message || String(err));
      // Re-fetch to recover correct state on failure.
      if (lastQueryRef.current) loadList(lastQueryRef.current, { keepIndex: true });
    }
  }, [api, currentIndex, files, loadList]);

  const undoTrash = useCallback(async () => {
    // Pop until a still-trashed id restores - ids restored via the trash view
    // are removed from the stack, but guard anyway so Cmd+Z never no-ops loudly.
    while (undoStackRef.current.length > 0) {
      const id = undoStackRef.current.pop();
      try {
        const res = await api.post('/api/v1/culling/restore', { ids: [id] });
        if (res.restored && res.restored.length > 0) {
          if (lastQueryRef.current) loadList(lastQueryRef.current, { keepIndex: true });
          return;
        }
        // id no longer in trash -> fall through and try the next one.
      } catch (err) {
        setError(err.message || String(err));
        return;
      }
    }
  }, [api, loadList]);

  // ----- keyboard ----------------------------------------------------
  useEffect(() => {
    const handler = (e) => {
      if (node && !node.isVisible?.()) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (showTrash) return;

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
  }, [node, files.length, showTrash, trashCurrent, undoTrash]);

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
        await api.post('/api/v1/culling/restore', { ids: [id] });
        setTrashItems((prev) => prev.filter((it) => it.id !== id));
        // Keep the cull-loop undo stack in sync - this id is no longer trashable.
        undoStackRef.current = undoStackRef.current.filter((x) => x !== id);
        if (lastQueryRef.current) loadList(lastQueryRef.current, { keepIndex: true });
      } catch (err) {
        setError(err.message || String(err));
      }
    },
    [api, loadList]
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
    const body = bodyRef.current;
    if (!body) return;
    const onMove = (ev) => {
      const rect = body.getBoundingClientRect();
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

  return (
    <div className="module-container culling">
      <div className="culling-filterbar">
        <button className="btn-secondary" onClick={addFolders}>+ Mapp</button>
        <select
          className="form-select"
          value={player}
          onChange={(e) => selectPlayer(e.target.value)}
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
        <button className="btn-primary" onClick={runFilter} disabled={!canFilter || isLoading}>
          {isLoading ? '…' : 'Visa'}
        </button>
        <span className="culling-spacer" />
        <button
          className={showTrash ? 'btn-primary' : 'btn-secondary'}
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
        <div className="culling-body" ref={bodyRef}>
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
                >
                  <span className="culling-file-name">{f.basename}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="culling-divider" onMouseDown={startDrag} />

          <div className="culling-preview">
            {current ? (
              <img className="culling-image" src={toFileUrl(current.path)} alt={current.basename} />
            ) : (
              <div className="empty-state">Ingen bild vald.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
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

export default CullingModule;
