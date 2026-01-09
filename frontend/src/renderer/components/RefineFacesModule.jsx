/**
 * RefineFacesModule - React component for encoding refinement
 *
 * Features:
 * - Filter outlier encodings (std deviation or cluster-based)
 * - Repair inconsistent encoding shapes
 * - Preview changes before applying
 * - Backend-aware filtering (dlib vs InsightFace use different metrics)
 */

import React, { useState, useCallback } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { debugError } from '../shared/debug.js';
import './RefineFacesModule.css';

/**
 * RefineFacesModule Component
 */
export function RefineFacesModule() {
  const { api } = useBackend();

  // Mode selection
  const [mode, setMode] = useState('std');  // 'std', 'cluster', 'shape'

  // Configuration
  const [config, setConfig] = useState({
    stdThreshold: 2.0,
    clusterDist: '',  // Empty = use backend default
    clusterMin: 6,
    minEncodings: 8,
    backend: '',  // Empty = all backends
    person: ''    // Empty = all people
  });

  // State
  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState({ type: '', message: '' });

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
   * Fetch preview from API
   */
  const handlePreview = useCallback(async () => {
    setIsLoading(true);
    setPreview(null);
    setStatus({ type: '', message: '' });

    try {
      const params = new URLSearchParams();
      params.set('mode', mode);

      if (config.person.trim()) {
        params.set('person', config.person.trim());
      } else {
        params.set('person', '*');
      }

      if (config.backend) {
        params.set('backend_filter', config.backend);
      }

      params.set('std_threshold', config.stdThreshold.toString());

      if (config.clusterDist) {
        params.set('cluster_dist', config.clusterDist.toString());
      }

      params.set('cluster_min', config.clusterMin.toString());
      params.set('min_encodings', config.minEncodings.toString());

      const result = await api.get(`/api/refinement/preview?${params.toString()}`);
      setPreview(result);

      if (result.summary.total_remove === 0) {
        showSuccess('Inga encodings att ta bort med nuvarande inställningar.');
      }
    } catch (err) {
      debugError('RefineFaces', 'Preview failed:', err);
      showError('Förhandsgranskning misslyckades: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [api, mode, config]);

  /**
   * Apply filtering
   */
  const handleApply = useCallback(async (dryRun = false) => {
    if (!preview || preview.summary.total_remove === 0) {
      showError('Kör förhandsgranskning först');
      return;
    }

    const action = dryRun ? 'simulera' : 'ta bort';
    const confirmMsg = `Vill du ${action} ${preview.summary.total_remove} encodings från ${preview.summary.affected_people} personer?`;

    if (!dryRun && !confirm(confirmMsg)) return;

    setIsLoading(true);

    try {
      const body = {
        mode,
        backend_filter: config.backend || null,
        persons: config.person.trim() ? [config.person.trim()] : null,
        std_threshold: config.stdThreshold,
        cluster_dist: config.clusterDist ? parseFloat(config.clusterDist) : null,
        cluster_min: config.clusterMin,
        min_encodings: config.minEncodings,
        dry_run: dryRun
      };

      const result = await api.post('/api/refinement/apply', body);

      if (dryRun) {
        showSuccess(`Simulering: ${result.removed} encodings skulle tas bort`);
      } else {
        showSuccess(`${result.removed} encodings borttagna`);
        setPreview(null);  // Clear preview after successful apply
      }
    } catch (err) {
      debugError('RefineFaces', 'Apply failed:', err);
      showError('Applicering misslyckades: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [api, mode, config, preview]);

  /**
   * Apply shape repair
   */
  const handleRepairShapes = useCallback(async (dryRun = false) => {
    setIsLoading(true);
    setStatus({ type: '', message: '' });

    try {
      const body = {
        persons: config.person.trim() ? [config.person.trim()] : null,
        dry_run: dryRun
      };

      const result = await api.post('/api/refinement/repair-shapes', body);

      if (result.total_removed === 0) {
        showSuccess('Inga inkonsistenta shapes hittades.');
        return;
      }

      if (dryRun) {
        // Show detailed preview
        const details = result.repaired.map(r =>
          `${r.person}: ${r.removed} av ${r.total} (behåller ${r.kept_shape.join('x')})`
        ).join('\n');

        alert(`Shape-reparation skulle ta bort ${result.total_removed} encodings:\n\n${details}`);
        showSuccess(`Simulering: ${result.total_removed} encodings med fel shape`);
      } else {
        showSuccess(`${result.total_removed} encodings med inkonsistent shape borttagna`);
      }
    } catch (err) {
      debugError('RefineFaces', 'Repair shapes failed:', err);
      showError('Shape-reparation misslyckades: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }, [api, config.person]);

  return (
    <div className="module-container refine-faces">
      <div className="module-header">
        <h3 className="module-title">Förfina ansikten</h3>
      </div>

      <div className="module-body">
        {/* Filter Mode Selection */}
        <div className="section-card">
          <h4 className="section-title">Filterläge</h4>
          <div className="mode-selection">
            <label className="mode-option">
              <input
                type="radio"
                name="mode"
                value="std"
                checked={mode === 'std'}
                onChange={(e) => setMode(e.target.value)}
              />
              <span className="mode-label">Standardavvikelse</span>
              <span className="mode-desc">Ta bort encodings som avviker mer än N standardavvikelser från medelvärdet</span>
            </label>

            <label className="mode-option">
              <input
                type="radio"
                name="mode"
                value="cluster"
                checked={mode === 'cluster'}
                onChange={(e) => setMode(e.target.value)}
              />
              <span className="mode-label">Kluster</span>
              <span className="mode-desc">Behåll endast encodings inom ett tätt kluster kring centroiden</span>
            </label>

            <label className="mode-option">
              <input
                type="radio"
                name="mode"
                value="shape"
                checked={mode === 'shape'}
                onChange={(e) => setMode(e.target.value)}
              />
              <span className="mode-label">Shape-reparation</span>
              <span className="mode-desc">Ta bort encodings med inkonsistenta dimensioner (t.ex. blandade backends)</span>
            </label>
          </div>
        </div>

        {/* Configuration */}
        <div className="section-card">
          <h4 className="section-title">Inställningar</h4>
          <div className="config-grid">
            {/* Std threshold - only for std mode */}
            {mode === 'std' && (
              <div className="config-row">
                <label>Std-tröskel:</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="5"
                  value={config.stdThreshold}
                  onChange={(e) => setConfig(prev => ({ ...prev, stdThreshold: parseFloat(e.target.value) || 2.0 }))}
                />
                <span className="config-unit">σ</span>
                <span className="config-hint">Högre = färre tas bort</span>
              </div>
            )}

            {/* Cluster distance - only for cluster mode */}
            {mode === 'cluster' && (
              <>
                <div className="config-row">
                  <label>Klusteravstånd:</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.0"
                    placeholder="Backend-default"
                    value={config.clusterDist}
                    onChange={(e) => setConfig(prev => ({ ...prev, clusterDist: e.target.value }))}
                  />
                  <span className="config-hint">dlib: 0.55, insightface: 0.35</span>
                </div>
                <div className="config-row">
                  <label>Min klusterstorlek:</label>
                  <input
                    type="number"
                    min="2"
                    max="20"
                    value={config.clusterMin}
                    onChange={(e) => setConfig(prev => ({ ...prev, clusterMin: parseInt(e.target.value, 10) || 6 }))}
                  />
                </div>
              </>
            )}

            {/* Common settings - not for shape mode */}
            {mode !== 'shape' && (
              <div className="config-row">
                <label>Min encodings:</label>
                <input
                  type="number"
                  min="2"
                  max="50"
                  value={config.minEncodings}
                  onChange={(e) => setConfig(prev => ({ ...prev, minEncodings: parseInt(e.target.value, 10) || 8 }))}
                />
                <span className="config-hint">Hoppa över personer med färre</span>
              </div>
            )}

            {/* Backend filter */}
            <div className="config-row">
              <label>Backend:</label>
              <select
                value={config.backend}
                onChange={(e) => setConfig(prev => ({ ...prev, backend: e.target.value }))}
              >
                <option value="">Alla backends</option>
                <option value="insightface">InsightFace</option>
                <option value="dlib">dlib</option>
              </select>
            </div>

            {/* Person filter */}
            <div className="config-row">
              <label>Person:</label>
              <input
                type="text"
                placeholder="Alla personer"
                value={config.person}
                onChange={(e) => setConfig(prev => ({ ...prev, person: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-buttons">
          {mode === 'shape' ? (
            <>
              <button
                className="btn-secondary"
                onClick={() => handleRepairShapes(true)}
                disabled={isLoading}
              >
                Simulera reparation
              </button>
              <button
                className="btn-danger"
                onClick={() => handleRepairShapes(false)}
                disabled={isLoading}
              >
                Reparera shapes
              </button>
            </>
          ) : (
            <>
              <button
                className="btn-action"
                onClick={handlePreview}
                disabled={isLoading}
              >
                {isLoading ? 'Laddar...' : 'Förhandsgranska'}
              </button>
              {preview && preview.summary.total_remove > 0 && (
                <button
                  className="btn-danger"
                  onClick={() => handleApply(false)}
                  disabled={isLoading}
                >
                  Applicera filtrering
                </button>
              )}
            </>
          )}
        </div>

        {/* Preview Results */}
        {preview && preview.preview.length > 0 && (
          <div className="section-card preview-results">
            <h4 className="section-title">Förhandsgranskning</h4>
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Backend</th>
                    <th>Behåll</th>
                    <th>Ta bort</th>
                    <th>Orsak</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, idx) => (
                    <tr key={idx}>
                      <td className="cell-person">{row.person}</td>
                      <td className="cell-backend">{row.backend}</td>
                      <td className="cell-keep">{row.keep}</td>
                      <td className="cell-remove">{row.remove}</td>
                      <td className="cell-reason">{formatReason(row.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="preview-summary">
              Totalt: <strong>{preview.summary.total_remove}</strong> encodings
              tas bort från <strong>{preview.summary.affected_people}</strong> av {preview.summary.total_people} personer
            </div>
          </div>
        )}

        {/* Status Message */}
        {status.message && (
          <div className={`status-message ${status.type}`}>
            {status.message}
          </div>
        )}

        {/* Info Box */}
        <div className="info-box">
          <h5>Om backend-hantering</h5>
          <p>
            <strong>dlib</strong> använder Euclidean-avstånd (tröskel ~0.54)<br />
            <strong>InsightFace</strong> använder Cosine-avstånd (tröskel ~0.35)
          </p>
          <p>
            När "Alla backends" är valt processas varje backend separat
            med rätt distansmetrik och tröskelvärden.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Format reason code to Swedish
 */
function formatReason(reason) {
  const reasons = {
    'std_outlier': 'Standardavvikelse',
    'cluster_outlier': 'Utanför kluster',
    'shape_mismatch': 'Fel shape'
  };
  return reasons[reason] || reason;
}

export default RefineFacesModule;
