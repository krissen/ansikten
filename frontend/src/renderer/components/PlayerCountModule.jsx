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
import { getScanScope, setScanScope, scanScopeHasSelection, signalExternalLoad } from '../shared/scanScope.js';
import './PlayerCountModule.css';

const REFRESH_DEBOUNCE_MS = 400;

// Default counting options, mirroring the CLI's argparse defaults.
export const DEFAULT_OPTIONS = { gapMinutes: 30, baseline: 'median', minImages: 3 };

// Build the /players/count request body. Pure + exported for unit tests.
// `exclOverride` is { tranare, publik } to override the config/env exclusion
// lists, or null/undefined to keep the backend defaults (config/env).
export function buildCountParams(inp, options, includePerMatch, exclOverride) {
  const opts = options || DEFAULT_OPTIONS;
  return {
    roots: inp.roots,
    globs: inp.glob.trim() ? [inp.glob.trim()] : [],
    extension_preset: inp.preset,
    recursive: inp.recursive,
    date_from: inp.dateFrom || null,
    date_to: inp.dateTo || null,
    gap_minutes: opts.gapMinutes,
    baseline: opts.baseline,
    min_images: opts.minImages,
    per_match: includePerMatch,
    tranare: exclOverride ? exclOverride.tranare : null,
    publik: exclOverride ? exclOverride.publik : null,
  };
}

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

  // Counting options (CLI parity: gap_minutes / baseline / min_images).
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  // Editable coach/audience exclusion lists (always-markers held separately and
  // shown locked). Sent as a per-request override only once the user edits them.
  const [exclusions, setExclusions] = useState({ tranare: [], publik: [] });
  const [alwaysMarkers, setAlwaysMarkers] = useState({ publik: [], grupp: [] });
  const [exclusionsDirty, setExclusionsDirty] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);

  // Params of the last submitted query, so auto-refresh re-runs the same thing.
  const lastParamsRef = useRef(null);
  // Monotonic id so a slower older request can't overwrite a newer result
  // (e.g. toggling Per match / filters quickly on a large folder).
  const reqSeqRef = useRef(0);
  const watchedDirsRef = useRef(new Set());
  const debounceRef = useRef(null);

  const buildParams = useCallback(
    (inp, includePerMatch, opts, exclOverride) =>
      buildCountParams(inp, opts, includePerMatch, exclOverride),
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
    (inp, includePerMatch, opts = options, exclOverride) => {
      // Undefined = fall back to current state; explicit null = force defaults.
      const override =
        exclOverride !== undefined ? exclOverride : exclusionsDirty ? exclusions : null;
      const params = buildParams(inp, includePerMatch, opts, override);
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
    [buildParams, runCount, updateWatches, watchDirsFor, options, exclusions, exclusionsDirty]
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

  // Counting-option changes apply immediately (like the InputBar selects), but
  // only once a query has run. Thread the new options explicitly so we don't
  // race the async state update.
  const applyOptions = useCallback(
    (next) => {
      setOptions(next);
      if (lastParamsRef.current) submitWith(input, perMatch, next);
    },
    [submitWith, input, perMatch]
  );

  // Fetch the resolved exclusion lists (config/env + always-markers). The
  // always-markers are kept separate and rendered locked; the editable lists
  // exclude them.
  const loadExclusions = useCallback(async () => {
    try {
      const data = await api.get('/api/v1/players/exclusions');
      const always = data.always || { publik: [], grupp: [] };
      const strip = (list, locked) => (list || []).filter((n) => !(locked || []).includes(n));
      setAlwaysMarkers(always);
      setExclusions({
        tranare: strip(data.tranare, always.tranare),
        publik: strip(data.publik, always.publik),
      });
    } catch {
      /* Non-fatal: leave the editor empty. */
    }
  }, [api]);

  useEffect(() => {
    loadExclusions();
  }, [loadExclusions]);

  // Edit the exclusion lists (per-request override; marks dirty + re-runs).
  const applyExclusions = useCallback(
    (next) => {
      setExclusions(next);
      setExclusionsDirty(true);
      if (lastParamsRef.current) submitWith(input, perMatch, options, next);
    },
    [submitWith, input, perMatch, options]
  );

  const addExcluded = useCallback(
    (kind, name) => {
      const clean = name.trim();
      if (!clean || exclusions[kind].includes(clean)) return;
      applyExclusions({ ...exclusions, [kind]: [...exclusions[kind], clean] });
    },
    [exclusions, applyExclusions]
  );

  const removeExcluded = useCallback(
    (kind, name) => {
      applyExclusions({ ...exclusions, [kind]: exclusions[kind].filter((n) => n !== name) });
    },
    [exclusions, applyExclusions]
  );

  // Persist the current lists as the new defaults (config.json → future counts + CLI).
  const saveDefaults = useCallback(async () => {
    setSavingDefaults(true);
    try {
      const data = await api.post('/api/v1/players/exclusions', {
        tranare: exclusions.tranare,
        publik: exclusions.publik,
      });
      const always = data.always || { publik: [], grupp: [] };
      const strip = (list, locked) => (list || []).filter((n) => !(locked || []).includes(n));
      setAlwaysMarkers(always);
      setExclusions({
        tranare: strip(data.tranare, always.tranare),
        publik: strip(data.publik, always.publik),
      });
      setExclusionsDirty(false); // the saved lists are now the default
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSavingDefaults(false);
    }
  }, [api, exclusions]);

  // Discard edits and re-run with the saved defaults.
  const resetExclusions = useCallback(async () => {
    await loadExclusions();
    setExclusionsDirty(false);
    if (lastParamsRef.current) submitWith(input, perMatch, options, null);
  }, [loadExclusions, submitWith, input, perMatch, options]);

  // Open the culling workspace filtered to a player (from the stats table).
  const openCullForPlayer = useCallback(
    async (name) => {
      const params = lastParamsRef.current || buildParams(input, perMatch, options, null);
      // Tell culling's adopt-on-mount that we'll immediately load the
      // player-filtered query, so it skips its own unfiltered scan.
      signalExternalLoad();
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
    [emit, waitForListeners, input, perMatch, buildParams, options]
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

      <CountOptions
        options={options}
        onOptionsChange={applyOptions}
        exclusions={exclusions}
        alwaysMarkers={alwaysMarkers}
        exclusionsDirty={exclusionsDirty}
        savingDefaults={savingDefaults}
        onAddExcluded={addExcluded}
        onRemoveExcluded={removeExcluded}
        onSaveDefaults={saveDefaults}
        onReset={resetExclusions}
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
                <PlayerTable players={result.players} baseline={result.baseline} timeRange={result.time_range} onPlayerClick={openCullForPlayer} />
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
      <span>Baslinje ({result.baseline_method}): <strong>{result.baseline}</strong></span>
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

// Counting-options row: the three CLI-parity controls (matchgap / baseline /
// min images) plus a collapsible coach/audience exclusion editor. Purely driven
// by props — the parent owns state and re-runs the count on change.
export function CountOptions({
  options,
  onOptionsChange,
  exclusions,
  alwaysMarkers,
  exclusionsDirty,
  savingDefaults,
  onAddExcluded,
  onRemoveExcluded,
  onSaveDefaults,
  onReset,
  busy,
}) {
  const [open, setOpen] = useState(false);

  const setNum = (key, raw, min) => {
    const n = parseInt(raw, 10);
    onOptionsChange({ ...options, [key]: Number.isNaN(n) ? min : Math.max(min, n) });
  };

  const total =
    exclusions.tranare.length + exclusions.publik.length + (alwaysMarkers.publik?.length || 0);

  return (
    <div className="player-count-options">
      <div className="player-count-options-row">
        <label className="pc-option">
          Matchgap (min)
          <input
            className="form-input pc-num"
            type="number"
            min="1"
            value={options.gapMinutes}
            onChange={(e) => setNum('gapMinutes', e.target.value, 1)}
            disabled={busy}
            title="Minsta lucka mellan matcher (delar upp bilderna i matcher)"
          />
        </label>
        <label className="pc-option">
          Baslinje
          <select
            className="form-select"
            value={options.baseline}
            onChange={(e) => onOptionsChange({ ...options, baseline: e.target.value })}
            disabled={busy}
            title="Referens för över-/underrepresentation"
          >
            <option value="median">median</option>
            <option value="mean">medel</option>
          </select>
        </label>
        <label className="pc-option">
          Min bilder
          <input
            className="form-input pc-num"
            type="number"
            min="1"
            value={options.minImages}
            onChange={(e) => setNum('minImages', e.target.value, 1)}
            disabled={busy}
            title="Minsta antal bilder för att räknas som spelare"
          />
        </label>
        <button
          type="button"
          className="btn-secondary pc-excl-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          Uteslutna{total > 0 ? ` (${total})` : ''} {open ? '▾' : '▸'}
        </button>
      </div>

      {open && (
        <div className="player-count-exclusions">
          <ExclusionList
            title="Tränare"
            kind="tranare"
            names={exclusions.tranare}
            locked={[]}
            onAdd={onAddExcluded}
            onRemove={onRemoveExcluded}
            busy={busy}
          />
          <ExclusionList
            title="Publik"
            kind="publik"
            names={exclusions.publik}
            locked={alwaysMarkers.publik || []}
            onAdd={onAddExcluded}
            onRemove={onRemoveExcluded}
            busy={busy}
          />
          <div className="pc-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onSaveDefaults}
              disabled={busy || savingDefaults || !exclusionsDirty}
              title="Spara listorna till config (gäller framtida räkningar och CLI)"
            >
              {savingDefaults ? 'Sparar…' : 'Spara som standard'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={onReset}
              disabled={busy || savingDefaults}
              title="Återställ till sparade standardlistor"
            >
              Återställ
            </button>
            {exclusionsDirty && <span className="player-count-dim">osparade ändringar</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// One editable exclusion list (Tränare or Publik): locked always-markers first,
// then removable chips, then an add-name field. `onAdd`/`onRemove` take (kind, name).
function ExclusionList({ title, kind, names, locked, onAdd, onRemove, busy }) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    onAdd(kind, draft);
    setDraft('');
  };
  return (
    <div className="pc-list">
      <div className="pc-list-title">{title}</div>
      <div className="pc-chips">
        {locked.map((name) => (
          <span className="pc-chip pc-chip-locked" key={`lock-${name}`} title="Alltid utesluten">
            {name}
          </span>
        ))}
        {names.map((name) => (
          <span className="pc-chip" key={name}>
            <span className="pc-chip-label">{name}</span>
            <button
              type="button"
              className="pc-chip-remove"
              onClick={() => onRemove(kind, name)}
              disabled={busy}
              aria-label={`Ta bort ${name}`}
            >
              ×
            </button>
          </span>
        ))}
        {names.length === 0 && locked.length === 0 && (
          <span className="player-count-dim pc-empty">inga</span>
        )}
      </div>
      <input
        className="form-input pc-add"
        type="text"
        placeholder={`Lägg till ${title.toLowerCase()}…`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        disabled={busy}
      />
    </div>
  );
}

// Bin timestamps into `bins` density buckets across the [start, end] window.
// Returns null when there's nothing to show. Pure (unit-tested).
export function binTimestamps(timestamps, start, end, bins = 24) {
  if (!timestamps || timestamps.length === 0 || !start || !end) return null;
  const t0 = new Date(start).getTime();
  const t1 = new Date(end).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  const span = Math.max(1, t1 - t0);
  const counts = new Array(bins).fill(0);
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) continue;
    let idx = Math.floor(((t - t0) / span) * bins);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    counts[idx] += 1;
  }
  return counts;
}

// Temporal sparkline: a tiny density histogram of the player's timestamps across
// the [start, end] window, mirroring the CLI's spark column (when were this
// player's images taken across the session/match).
function Spark({ timestamps, start, end, bins = 24 }) {
  const counts = binTimestamps(timestamps, start, end, bins);
  if (!counts) {
    return <span className="player-spark player-spark-empty" />;
  }
  const max = Math.max(1, ...counts);
  return (
    <span className="player-spark" title={`${timestamps.length} bilder över tid`}>
      {counts.map((c, i) => (
        <span
          key={i}
          className="player-spark-bin"
          style={{ height: c ? `${Math.max(8, (c / max) * 100)}%` : '0' }}
        />
      ))}
    </span>
  );
}

// `timeRange` is { start, end } (the session window, or a match's window) used
// for the spark; `baseline` anchors the distribution bar at 50% of the track,
// mirroring the CLI's baseline-relative bar (at-baseline = half-full, 2× = full).
function PlayerTable({ players, baseline, timeRange, onPlayerClick }) {
  const maxCount = players.reduce((m, p) => Math.max(m, p.count), 1);
  const ref = baseline > 0 ? baseline : maxCount; // bar reference (baseline → 50%)
  return (
    <table className="player-count-table">
      <thead>
        <tr>
          <th>Namn</th>
          <th className="num">Antal</th>
          <th className="num">%</th>
          <th className="num">Δ%</th>
          <th className="num">ΔN</th>
          <th className="bar-col">Fördelning</th>
          <th className="spark-col">Tidslinje</th>
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
            <td className={`num delta delta-${p.level}`}>
              {p.delta_n > 0 ? '+' : ''}{Math.round(p.delta_n)}
            </td>
            <td className="bar-col">
              <div className="player-bar-track">
                <div className="player-bar-baseline" title={`Baslinje ${baseline}`} />
                <div
                  className={`player-bar-fill level-${p.level}`}
                  style={{ width: `${Math.min(100, (p.count / (ref * 2)) * 100)}%` }}
                />
              </div>
            </td>
            <td className="spark-col">
              <Spark timestamps={p.timestamps} start={timeRange?.start} end={timeRange?.end} />
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

// Total distinct names + excluded count for a match, mirroring the CLI's
// `total_in_list` / `excluded_count` in print_section (players + all excluded
// buckets). Sums over the same bucket keys `ExcludedSections` renders, so the
// two never drift.
function excludedCount(excluded) {
  if (!excluded) return 0;
  return Object.keys(EXCLUDED_LABELS).reduce(
    (sum, key) => sum + (excluded[key]?.length || 0),
    0
  );
}

// Per-match info row: mirrors the CLI's `Spelare: N (av T, exkl. K)  Baseline:
// method=B` line. Duration/total_images already live in the <summary>.
function MatchInfoRow({ match }) {
  const excl = excludedCount(match.excluded);
  const total = match.players.length + excl;
  return (
    <div className="player-count-summary player-count-match-info">
      <span><strong>{match.players.length}</strong> spelare</span>
      {excl > 0 && (
        <span className="player-count-dim">(av {total}, exkl. {excl})</span>
      )}
      <span>Baslinje ({match.baseline_method}): <strong>{match.baseline}</strong></span>
    </div>
  );
}

export function MatchSections({ matches, onPlayerClick }) {
  return (
    <div className="player-count-matches">
      {matches.map((m) => (
        <details key={m.index} className="player-count-group">
          <summary>
            Match {m.index} — {fmtDateTime(m.start)} → {fmtTime(m.end)} ({Math.round(m.duration_minutes)} min, {m.total_images} bilder)
          </summary>
          <MatchInfoRow match={m} />
          {m.players.length > 0 ? (
            <PlayerTable players={m.players} baseline={m.baseline} timeRange={{ start: m.start, end: m.end }} onPlayerClick={onPlayerClick} />
          ) : (
            <div className="empty-state compact">Inga spelare över tröskeln.</div>
          )}
          <ExcludedSections excluded={m.excluded} />
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
