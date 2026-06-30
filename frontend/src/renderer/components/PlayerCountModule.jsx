/**
 * PlayerCountModule - GUI for the rakna_spelare CLI.
 *
 * Counts how many images each named player appears in across a folder/glob/date
 * selection, with over/under-representation statistics. The input bar collects a
 * folder/wildcard + extension preset + date span; the backend resolves the files
 * and counts. Stats auto-refresh live when the watched folder(s) change.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { useModuleAPI } from '../hooks/useModuleEvent.js';
import { InputBar, EMPTY_INPUT } from './InputBar.jsx';
import { getScanScope, setScanScope, scanScopeHasSelection } from '../shared/scanScope.js';
import './PlayerCountModule.css';

const REFRESH_DEBOUNCE_MS = 400;

export function PlayerCountModule() {
  const { api } = useBackend();
  const { emit, waitForListeners } = useModuleAPI();

  const [input, setInput] = useState(EMPTY_INPUT);
  const [perMatch, setPerMatch] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Params of the last submitted query, so auto-refresh re-runs the same thing.
  const lastParamsRef = useRef(null);
  // Monotonic id so a slower older request can't overwrite a newer result
  // (e.g. toggling Per match / filters quickly on a large folder).
  const reqSeqRef = useRef(0);
  const watchedDirsRef = useRef(new Set());
  const debounceRef = useRef(null);

  const buildParams = useCallback(
    (inp, includePerMatch) => ({
      roots: inp.roots,
      globs: inp.glob.trim() ? [inp.glob.trim()] : [],
      extension_preset: inp.preset,
      recursive: inp.recursive,
      date_from: inp.dateFrom || null,
      date_to: inp.dateTo || null,
      per_match: includePerMatch,
    }),
    []
  );

  const runCount = useCallback(
    async (params, { silent = false } = {}) => {
      const seq = ++reqSeqRef.current;
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        const data = await api.post('/api/v1/players/count', params);
        if (seq !== reqSeqRef.current) return; // superseded by a newer request
        setResult(data);
        setError(null);
      } catch (err) {
        if (seq !== reqSeqRef.current) return;
        setError(err.message || String(err));
      } finally {
        if (seq === reqSeqRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
          setHasRun(true);
        }
      }
    },
    [api]
  );

  // Compute the directories to watch for a given input.
  const watchDirsFor = useCallback((inp) => {
    const dirs = new Set(inp.roots);
    const g = inp.glob.trim();
    if (g) {
      const base = globBaseDir(g);
      if (base) dirs.add(base);
    }
    return dirs;
  }, []);

  // Reconcile the active folder watches with the desired set.
  const updateWatches = useCallback((desired) => {
    const current = watchedDirsRef.current;
    for (const dir of current) {
      if (!desired.has(dir)) {
        window.ansiktenAPI.unwatchFolder?.(dir);
      }
    }
    for (const dir of desired) {
      if (!current.has(dir)) {
        window.ansiktenAPI.watchFolder?.(dir, true);
      }
    }
    watchedDirsRef.current = desired;
  }, []);

  const submitWith = useCallback(
    (inp, includePerMatch) => {
      const params = buildParams(inp, includePerMatch);
      lastParamsRef.current = params;
      // Publish the scan scope so Gallra spelare mirrors the same selection.
      setScanScope({
        roots: params.roots,
        globs: params.globs,
        recursive: params.recursive,
        date_from: params.date_from,
        date_to: params.date_to,
        extension_preset: params.extension_preset,
      });
      runCount(params);
      updateWatches(watchDirsFor(inp));
    },
    [buildParams, runCount, updateWatches, watchDirsFor]
  );

  const handleSubmit = useCallback(
    () => submitWith(input, perMatch),
    [submitWith, input, perMatch]
  );

  // On open, adopt the shared scan scope (e.g. coming from Gallra spelare) when
  // the panel is still empty, so it shows the same files instead of starting
  // blank. Translates the scan scope into the InputBar shape (path-glob array →
  // single glob string; null dates → empty).
  useEffect(() => {
    if (lastParamsRef.current) return;
    const s = getScanScope();
    if (!scanScopeHasSelection(s)) return;
    const adopted = {
      roots: s.roots || [],
      glob: (s.globs && s.globs[0]) || '',
      preset: s.extension_preset || 'jpg',
      dateFrom: s.date_from || '',
      dateTo: s.date_to || '',
      recursive: s.recursive ?? true,
    };
    setInput(adopted);
    submitWith(adopted, perMatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Select/checkbox changes from the InputBar apply immediately, but only once a
  // query has run (otherwise there's nothing to recompute yet).
  const handleAutoApply = useCallback(
    (nextInput) => {
      setInput(nextInput);
      if (lastParamsRef.current) submitWith(nextInput, perMatch);
    },
    [submitWith, perMatch]
  );

  // Open the culling workspace filtered to a player (from the stats table).
  const openCullForPlayer = useCallback(
    async (name) => {
      const params = lastParamsRef.current || buildParams(input, perMatch);
      window.workspace?.openModule?.('culling');
      // The culling module subscribes on mount; wait so the event isn't missed.
      await waitForListeners('cull-player', 3000);
      emit('cull-player', {
        name,
        roots: params.roots,
        globs: params.globs,
        recursive: params.recursive,
        date_from: params.date_from,
        date_to: params.date_to,
      });
    },
    [emit, waitForListeners, input, perMatch, buildParams]
  );

  // Subscribe to folder-change events for live auto-refresh.
  useEffect(() => {
    const unsubscribe = window.ansiktenAPI.onFolderChanged?.(() => {
      if (!lastParamsRef.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        runCount(lastParamsRef.current, { silent: true });
      }, REFRESH_DEBOUNCE_MS);
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (unsubscribe) unsubscribe();
      for (const dir of watchedDirsRef.current) {
        window.ansiktenAPI.unwatchFolder?.(dir);
      }
      watchedDirsRef.current = new Set();
    };
  }, [runCount]);

  const totalImages = result?.total_images ?? 0;

  return (
    <div className="module-container player-count">
      <div className="module-header">
        <h3 className="module-title">Räkna spelare</h3>
        <div className="button-group">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={perMatch}
              onChange={(e) => {
                const v = e.target.checked;
                setPerMatch(v);
                if (lastParamsRef.current) submitWith(input, v);
              }}
            />
            Per match
          </label>
          {isRefreshing && <span className="player-count-refreshing">uppdaterar…</span>}
        </div>
      </div>

      <InputBar
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        onAutoApply={handleAutoApply}
        busy={isLoading}
      />

      <div className="module-body player-count-body">
        {error && <div className="status-message error">Fel: {error}</div>}

        {isLoading && <div className="empty-state">Räknar…</div>}

        {!isLoading && !error && !hasRun && (
          <div className="empty-state">
            Välj en mapp eller ange ett wildcard och tryck <strong>Räkna</strong>.
          </div>
        )}

        {!isLoading && !error && hasRun && result && (
          <>
            <ResultSummary result={result} />
            {totalImages === 0 ? (
              <div className="empty-state">Inga matchande bilder hittades.</div>
            ) : (
              <>
                <PlayerTable players={result.players} totalImages={totalImages} onPlayerClick={openCullForPlayer} />
                <ExcludedSections excluded={result.excluded} />
                {perMatch && result.matches?.length > 0 && (
                  <MatchSections matches={result.matches} onPlayerClick={openCullForPlayer} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ResultSummary({ result }) {
  const tr = result.time_range;
  return (
    <div className="player-count-summary">
      <span><strong>{result.total_images}</strong> bilder</span>
      <span><strong>{result.players.length}</strong> spelare</span>
      <span>Baseline ({result.baseline_method}): <strong>{result.baseline}</strong></span>
      {result.files_resolved != null && (
        <span className="player-count-dim">{result.files_resolved} filer</span>
      )}
      {tr && (
        <span className="player-count-dim">
          {fmtTime(tr.start)} → {fmtTime(tr.end)} ({Math.round(tr.duration_minutes)} min)
        </span>
      )}
    </div>
  );
}

function PlayerTable({ players, totalImages, onPlayerClick }) {
  const maxCount = players.reduce((m, p) => Math.max(m, p.count), 1);
  return (
    <table className="player-count-table">
      <thead>
        <tr>
          <th>Namn</th>
          <th className="num">Antal</th>
          <th className="num">%</th>
          <th className="num">Δ%</th>
          <th className="bar-col">Fördelning</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr
            key={p.name}
            className={onPlayerClick ? 'clickable' : ''}
            onClick={onPlayerClick ? () => onPlayerClick(p.name) : undefined}
            title={onPlayerClick ? `Gallra ${p.name}` : undefined}
          >
            <td>{p.name}</td>
            <td className="num">{p.count}</td>
            <td className="num">{p.pct}%</td>
            <td className={`num delta delta-${p.level}`}>
              {p.delta_pct > 0 ? '+' : ''}{p.delta_pct}%
            </td>
            <td className="bar-col">
              <div className="player-bar-track">
                <div
                  className={`player-bar-fill level-${p.level}`}
                  style={{ width: `${(p.count / maxCount) * 100}%` }}
                />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const EXCLUDED_LABELS = {
  tranare: 'Tränare',
  grupp: 'Gruppbilder',
  publik: 'Publik',
  below_threshold: 'Under tröskeln',
};

function ExcludedSections({ excluded }) {
  if (!excluded) return null;
  const groups = Object.entries(EXCLUDED_LABELS).filter(
    ([key]) => excluded[key] && excluded[key].length > 0
  );
  if (groups.length === 0) return null;

  return (
    <div className="player-count-excluded">
      {groups.map(([key, label]) => (
        <details key={key} className="player-count-group">
          <summary>{label} ({excluded[key].length})</summary>
          <ul>
            {excluded[key].map((e) => (
              <li key={e.name}>{e.name}: {e.count} ({e.pct}%)</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function MatchSections({ matches, onPlayerClick }) {
  return (
    <div className="player-count-matches">
      {matches.map((m) => (
        <details key={m.index} className="player-count-group">
          <summary>
            Match {m.index} — {fmtDateTime(m.start)} → {fmtTime(m.end)} ({Math.round(m.duration_minutes)} min, {m.total_images} bilder)
          </summary>
          {m.players.length > 0 ? (
            <PlayerTable players={m.players} totalImages={m.total_images} onPlayerClick={onPlayerClick} />
          ) : (
            <div className="empty-state compact">Inga spelare över tröskeln.</div>
          )}
        </details>
      ))}
    </div>
  );
}

// Directory before the first wildcard char in a glob pattern.
function globBaseDir(pattern) {
  const wildcardIdx = pattern.search(/[*?[]/);
  const literal = wildcardIdx === -1 ? pattern : pattern.slice(0, wildcardIdx);
  const slashIdx = literal.lastIndexOf('/');
  if (slashIdx === -1) return '';
  return literal.slice(0, slashIdx);
}

function fmtTime(iso) {
  if (!iso) return '';
  return iso.slice(11, 16);
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export default PlayerCountModule;
