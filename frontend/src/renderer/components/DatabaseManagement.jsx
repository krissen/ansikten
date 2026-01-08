/**
 * DatabaseManagement - React component for database operations
 *
 * Features:
 * - Database state display
 * - Rename/Merge/Delete persons
 * - Move to/from ignored
 * - Undo file processing
 * - Purge encodings
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { useModuleEvent } from '../hooks/useModuleEvent.js';
import { debug, debugWarn, debugError } from '../shared/debug.js';
import './DatabaseManagement.css';

function fuzzyMatch(text, query) {
  if (!query) return { match: true, score: 0 };
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return { match: true, score: 3 };
  if (t.startsWith(q)) return { match: true, score: 2 };
  if (t.includes(q)) return { match: true, score: 1 };
  return { match: false, score: 0 };
}

function formatBackendBreakdown(byBackend) {
  if (!byBackend || Object.keys(byBackend).length === 0) return null;
  if (Object.keys(byBackend).length === 1) {
    const [backend, count] = Object.entries(byBackend)[0];
    return `${count} ${backend}`;
  }
  return Object.entries(byBackend)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([backend, count]) => `${count} ${backend}`)
    .join(', ');
}

/**
 * DatabaseManagement Component
 */
export function DatabaseManagement() {
  const { api } = useBackend();

  // Database state
  const [databaseState, setDatabaseState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState({ type: '', message: '' });

  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [renameForm, setRenameForm] = useState({ oldName: '', newName: '' });
  const [mergeForm, setMergeForm] = useState({ source1: '', source2: '', target: '', backend: '' });
  const [deleteForm, setDeleteForm] = useState({ name: '' });
  const [moveToIgnoreForm, setMoveToIgnoreForm] = useState({ name: '', backend: '' });
  const [moveFromIgnoreForm, setMoveFromIgnoreForm] = useState({ count: '', target: '', backend: '' });
  const [undoForm, setUndoForm] = useState({ pattern: '' });
  const [purgeForm, setPurgeForm] = useState({ name: '', count: '', backend: '' });

  const filteredPeople = useMemo(() => {
    if (!databaseState?.people) return [];
    if (!searchTerm.trim()) return databaseState.people;
    
    return databaseState.people
      .map(person => ({ ...person, ...fuzzyMatch(person.name, searchTerm) }))
      .filter(p => p.match)
      .sort((a, b) => b.score - a.score);
  }, [databaseState?.people, searchTerm]);

  /**
   * Load database state
   */
  const loadDatabaseState = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/api/management/database-state');
      setDatabaseState(response);
    } catch (err) {
      debugError('DatabaseMgmt', 'Failed to load:', err);
      showError('Failed to load database state: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  // Initial load
  useEffect(() => {
    loadDatabaseState();
  }, [loadDatabaseState]);

  // Listen for database updates
  useModuleEvent('database-updated', loadDatabaseState);

  /**
   * Show success message
   */
  const showSuccess = (message) => {
    setStatus({ type: 'success', message });
    setTimeout(() => setStatus({ type: '', message: '' }), 5000);
  };

  /**
   * Show error message
   */
  const showError = (message) => {
    setStatus({ type: 'error', message });
  };

  /**
   * Operation handlers
   */
  const handleRename = async () => {
    const { oldName, newName } = renameForm;
    if (!oldName.trim() || !newName.trim()) {
      showError('Please enter both old and new names');
      return;
    }

    if (!confirm(`Rename '${oldName}' to '${newName}'?`)) return;

    try {
      const result = await api.post('/api/management/rename-person', {
        old_name: oldName.trim(),
        new_name: newName.trim()
      });
      showSuccess(result.message);
      setDatabaseState(result.new_state);
      setRenameForm({ oldName: '', newName: '' });
    } catch (err) {
      showError('Rename failed: ' + err.message);
    }
  };

  const handleMerge = async () => {
    const { source1, source2, target, backend } = mergeForm;
    if (!source1.trim() || !source2.trim()) {
      showError('Please enter two people to merge');
      return;
    }

    const targetName = target.trim() || source1.trim();
    const backendDesc = backend ? ` (${backend} only)` : '';

    if (!confirm(`Merge '${source1}' and '${source2}' into '${targetName}'${backendDesc}?`)) return;

    try {
      const result = await api.post('/api/management/merge-people', {
        source_names: [source1.trim(), source2.trim()],
        target_name: targetName,
        backend_filter: backend || null
      });
      let msg = result.message;
      if (result.warning) {
        msg += `\n⚠️ ${result.warning}`;
      }
      showSuccess(msg);
      setDatabaseState(result.new_state);
      setMergeForm({ source1: '', source2: '', target: '', backend: '' });
    } catch (err) {
      showError('Merge failed: ' + err.message);
    }
  };

  const handleDelete = async () => {
    const { name } = deleteForm;
    if (!name.trim()) {
      showError('Please enter person name to delete');
      return;
    }

    if (!confirm(`Delete '${name}'? This will permanently remove all their encodings.`)) return;

    try {
      const result = await api.post('/api/management/delete-person', { name: name.trim() });
      showSuccess(result.message);
      setDatabaseState(result.new_state);
      setDeleteForm({ name: '' });
    } catch (err) {
      showError('Delete failed: ' + err.message);
    }
  };

  const handleMoveToIgnore = async () => {
    const { name, backend } = moveToIgnoreForm;
    if (!name.trim()) {
      showError('Please enter person name');
      return;
    }

    const backendDesc = backend ? ` (${backend} only)` : '';
    if (!confirm(`Move '${name}' to ignored list${backendDesc}?`)) return;

    try {
      const result = await api.post('/api/management/move-to-ignore', {
        name: name.trim(),
        backend_filter: backend || null
      });
      showSuccess(result.message);
      setDatabaseState(result.new_state);
      setMoveToIgnoreForm({ name: '', backend: '' });
    } catch (err) {
      showError('Move to ignore failed: ' + err.message);
    }
  };

  const handleMoveFromIgnore = async () => {
    const { count, target, backend } = moveFromIgnoreForm;
    const countNum = parseInt(count, 10);

    if (isNaN(countNum) || !target.trim()) {
      showError('Please enter count and target name');
      return;
    }

    const backendDesc = backend ? ` (${backend} only)` : '';
    if (!confirm(`Move ${countNum === -1 ? 'all' : countNum} encodings from ignored to '${target}'${backendDesc}?`)) return;

    try {
      const result = await api.post('/api/management/move-from-ignore', {
        count: countNum,
        target_name: target.trim(),
        backend_filter: backend || null
      });
      showSuccess(result.message);
      setDatabaseState(result.new_state);
      setMoveFromIgnoreForm({ count: '', target: '', backend: '' });
    } catch (err) {
      showError('Move from ignore failed: ' + err.message);
    }
  };

  const handleUndo = async () => {
    const { pattern } = undoForm;
    if (!pattern.trim()) {
      showError('Please enter filename or pattern');
      return;
    }

    if (!confirm(`Undo processing for files matching '${pattern}'?`)) return;

    try {
      const result = await api.post('/api/management/undo-file', { filename_pattern: pattern.trim() });
      let message = result.message;
      if (result.files_undone?.length) {
        message += '\nFiles: ' + result.files_undone.join(', ');
      }
      showSuccess(message);
      setDatabaseState(result.new_state);
      setUndoForm({ pattern: '' });
    } catch (err) {
      showError('Undo failed: ' + err.message);
    }
  };

  const handleShowRecentFiles = async () => {
    try {
      const files = await api.get('/api/management/recent-files', { n: 10 });
      const fileList = files.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
      alert(`Recent 10 processed files:\n\n${fileList}`);
    } catch (err) {
      showError('Failed to load recent files: ' + err.message);
    }
  };

  const handlePurge = async () => {
    const { name, count, backend } = purgeForm;
    const countNum = parseInt(count, 10);

    if (!name.trim() || isNaN(countNum) || countNum < 1) {
      showError('Please enter person name and count');
      return;
    }

    const backendDesc = backend ? ` (${backend} only)` : '';
    if (!confirm(`Remove last ${countNum} encodings from '${name}'${backendDesc}? This cannot be undone.`)) return;

    try {
      const result = await api.post('/api/management/purge-encodings', {
        name: name.trim(),
        count: countNum,
        backend_filter: backend || null
      });
      showSuccess(result.message);
      setDatabaseState(result.new_state);
      setPurgeForm({ name: '', count: '', backend: '' });
    } catch (err) {
      showError('Purge failed: ' + err.message);
    }
  };

  // People names for autocomplete
  const peopleNames = databaseState?.people?.map(p => p.name) || [];

  return (
    <div className="module-container db-management">
      <div className="module-header">
        <h3 className="module-title">Database Management</h3>
        <button className="btn-secondary" onClick={loadDatabaseState}>
          Reload Database
        </button>
      </div>

      <div className="module-body">
      {/* Database State */}
      <div className="section-card">
        <h4 className="section-title">Current Database</h4>
        {isLoading ? (
          <div className="db-stats">Loading...</div>
        ) : databaseState ? (
          <>
            <div className="db-stats">
              <strong>{databaseState.people?.length || 0}</strong> people,{' '}
              <strong>{databaseState.ignored_count || 0}</strong> ignored
              {databaseState.ignored_by_backend && Object.keys(databaseState.ignored_by_backend).length > 1 && (
                <span className="backend-detail"> ({formatBackendBreakdown(databaseState.ignored_by_backend)})</span>
              )},{' '}
              <strong>{databaseState.processed_files_count || 0}</strong> files processed
              {databaseState.backends_in_use?.length > 0 && (
                <div className="backends-in-use">
                  Backends: {databaseState.backends_in_use.join(', ')}
                </div>
              )}
            </div>
            <input
              type="text"
              className="people-search"
              placeholder="Filter names..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="people-list">
              {filteredPeople.map(person => {
                const breakdown = formatBackendBreakdown(person.encodings_by_backend);
                return (
                  <div key={person.name} className="person-item">
                    <span className="person-name">{person.name}</span>
                    <span className="person-count">
                      {breakdown || person.encoding_count}
                    </span>
                  </div>
                );
              })}
              {searchTerm && filteredPeople.length === 0 && (
                <div className="person-item no-match">No matches</div>
              )}
            </div>
          </>
        ) : (
          <div className="db-stats">Failed to load</div>
        )}
      </div>

      {/* Operations */}
      <div className="operations-panel">
        <h4 className="section-title">Operations</h4>

        {/* 1. Rename */}
        <OperationForm title="1. Rename Person">
          <div className="form-row">
            <input
              list="people-list"
              placeholder="Current name"
              value={renameForm.oldName}
              onChange={(e) => setRenameForm(prev => ({ ...prev, oldName: e.target.value }))}
            />
            <span>→</span>
            <input
              placeholder="New name"
              value={renameForm.newName}
              onChange={(e) => setRenameForm(prev => ({ ...prev, newName: e.target.value }))}
            />
            <button className="btn-action" onClick={handleRename}>Rename</button>
          </div>
        </OperationForm>

        {/* 2. Merge */}
        <OperationForm title="2. Merge People">
          <div className="form-column">
            <input
              list="people-list"
              placeholder="First person"
              value={mergeForm.source1}
              onChange={(e) => setMergeForm(prev => ({ ...prev, source1: e.target.value }))}
            />
            <input
              list="people-list"
              placeholder="Second person"
              value={mergeForm.source2}
              onChange={(e) => setMergeForm(prev => ({ ...prev, source2: e.target.value }))}
            />
            <input
              placeholder="Result name (optional)"
              value={mergeForm.target}
              onChange={(e) => setMergeForm(prev => ({ ...prev, target: e.target.value }))}
            />
            <div className="form-row">
              <BackendSelect
                value={mergeForm.backend}
                onChange={(v) => setMergeForm(prev => ({ ...prev, backend: v }))}
                backends={databaseState?.backends_in_use}
              />
              <button className="btn-action" onClick={handleMerge}>Merge</button>
            </div>
          </div>
        </OperationForm>

        {/* 3. Delete */}
        <OperationForm title="3. Delete Person">
          <div className="form-row">
            <input
              list="people-list"
              placeholder="Person to delete"
              value={deleteForm.name}
              onChange={(e) => setDeleteForm({ name: e.target.value })}
            />
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </div>
        </OperationForm>

        {/* 4. Move to Ignore */}
        <OperationForm title="4. Move to Ignored">
          <div className="form-row">
            <input
              list="people-list"
              placeholder="Person name"
              value={moveToIgnoreForm.name}
              onChange={(e) => setMoveToIgnoreForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <BackendSelect
              value={moveToIgnoreForm.backend}
              onChange={(v) => setMoveToIgnoreForm(prev => ({ ...prev, backend: v }))}
              backends={databaseState?.backends_in_use}
            />
            <button className="btn-action" onClick={handleMoveToIgnore}>Move to Ignored</button>
          </div>
        </OperationForm>

        {/* 5. Move from Ignore */}
        <OperationForm title="5. Move from Ignored">
          <div className="form-column">
            <div className="form-row">
              <input
                type="number"
                placeholder="Count (-1 for all)"
                min="-1"
                value={moveFromIgnoreForm.count}
                onChange={(e) => setMoveFromIgnoreForm(prev => ({ ...prev, count: e.target.value }))}
              />
              <span>→</span>
              <input
                placeholder="New person name"
                value={moveFromIgnoreForm.target}
                onChange={(e) => setMoveFromIgnoreForm(prev => ({ ...prev, target: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <BackendSelect
                value={moveFromIgnoreForm.backend}
                onChange={(v) => setMoveFromIgnoreForm(prev => ({ ...prev, backend: v }))}
                backends={databaseState?.backends_in_use}
              />
              <button className="btn-action" onClick={handleMoveFromIgnore}>Move</button>
            </div>
          </div>
        </OperationForm>

        {/* 8/10. Undo File */}
        <OperationForm title="8/10. Undo File Processing">
          <div className="form-column">
            <input
              placeholder="Filename or glob (e.g., 2024*.NEF)"
              value={undoForm.pattern}
              onChange={(e) => setUndoForm({ pattern: e.target.value })}
            />
            <div className="button-row">
              <button className="btn-action" onClick={handleUndo}>Undo</button>
              <button className="btn-secondary" onClick={handleShowRecentFiles}>
                Show Recent Files
              </button>
            </div>
          </div>
        </OperationForm>

        {/* 9. Purge */}
        <OperationForm title="9. Purge Last X Encodings">
          <div className="form-column">
            <div className="form-row">
              <input
                list="people-list-with-ignore"
                placeholder="Person or 'ignore'"
                value={purgeForm.name}
                onChange={(e) => setPurgeForm(prev => ({ ...prev, name: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Count"
                min="1"
                value={purgeForm.count}
                onChange={(e) => setPurgeForm(prev => ({ ...prev, count: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <BackendSelect
                value={purgeForm.backend}
                onChange={(v) => setPurgeForm(prev => ({ ...prev, backend: v }))}
                backends={databaseState?.backends_in_use}
              />
              <button className="btn-danger" onClick={handlePurge}>Purge</button>
            </div>
          </div>
        </OperationForm>
      </div>

      {/* Status */}
      {status.message && (
        <div className={`status-message ${status.type}`}>
          {status.message}
        </div>
      )}
      </div>

      {/* Datalists for autocomplete */}
      <datalist id="people-list">
        {peopleNames.map(name => <option key={name} value={name} />)}
      </datalist>
      <datalist id="people-list-with-ignore">
        {peopleNames.map(name => <option key={name} value={name} />)}
        <option value="ignore" />
      </datalist>
    </div>
  );
}

function OperationForm({ title, children }) {
  return (
    <div className="section-card operation-form">
      <h5 className="subsection-title">{title}</h5>
      {children}
    </div>
  );
}

function BackendSelect({ value, onChange, backends }) {
  if (!backends || backends.length < 2) return null;
  return (
    <select
      className="backend-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All backends</option>
      {backends.map(b => (
        <option key={b} value={b}>{b}</option>
      ))}
    </select>
  );
}

export default DatabaseManagement;
