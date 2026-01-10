/**
 * RefineFacesModule - React component for encoding refinement
 *
 * Features:
 * - Filter outlier encodings (std deviation, cluster, or Mahalanobis)
 * - Repair inconsistent encoding shapes
 * - Remove deprecated dlib encodings
 * - Preview changes before applying with statistics
 *
 * Only InsightFace encodings are supported. dlib is deprecated.
 */

import React, { useState, useCallback } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { useOperationStatus } from '../hooks/useOperationStatus.js';
import { debugError } from '../shared/debug.js';
import './RefineFacesModule.css';

/**
 * RefineFacesModule Component
 */
export function RefineFacesModule() {
  const { api } = useBackend();

  // Mode selection
  const [mode, setMode] = useState('std');  // 'std', 'cluster', 'mahalanobis', 'shape'

  // Configuration
  const [config, setConfig] = useState({
    stdThreshold: 2.0,
    clusterDist: 0.35,
    clusterMin: 6,
    mahalanobisThreshold: 3.0,
    minEncodings: 8,
    person: ''    // Empty = all people
  });

  // State
  const [preview, setPreview] = useState(null);

  // Operation status (loading, success, error) - replaces manual isLoading/status/showSuccess/showError
  const { isLoading, setIsLoading, status, showSuccess, showError, clearStatus } = useOperationStatus();

  /**
   * Fetch preview from API
   */
  const handlePreview = useCallback(async () => {
    setIsLoading(true);
    setPreview(null);
    clearStatus();

    try {
      const params = new URLSearchParams();
      params.set('mode', mode);

      if (config.person.trim()) {
        params.set('person', config.person.trim());
      } else {
        params.set('person', '*');
      }

      params.set('std_threshold', config.stdThreshold.toString());
      params.set('cluster_dist', config.clusterDist.toString());
      params.set('cluster_min', config.clusterMin.toString());
      params.set('mahalanobis_threshold', config.mahalanobisThreshold.toString());
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
        persons: config.person.trim() ? [config.person.trim()] : null,
        std_threshold: config.stdThreshold,
        cluster_dist: config.clusterDist,
        cluster_min: config.clusterMin,
        mahalanobis_threshold: config.mahalanobisThreshold,
        min_encodings: config.minEncodings,
        dry_run: dryRun
      };

      const result = await api.post('/api/v1/refinement/apply', body);

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

      const result = await api.post('/api/v1/refinement/repair-shapes', body);

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
                value="mahalanobis"
                checked={mode === 'mahalanobis'}
                onChange={(e) => setMode(e.target.value)}
              />
              <span className="mode-label">Mahalanobis</span>
              <span className="mode-desc">Kovariansmedveten outlier-detektion (bättre för högdimensionell data)</span>
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
              <span className="mode-desc">Ta bort encodings med inkonsistenta dimensioner</span>
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
                    value={config.clusterDist}
                    onChange={(e) => setConfig(prev => ({ ...prev, clusterDist: parseFloat(e.target.value) || 0.35 }))}
                  />
                  <span className="config-hint">Cosine-avstånd (0.35 = rekommenderat)</span>
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

            {/* Mahalanobis threshold - only for mahalanobis mode */}
            {mode === 'mahalanobis' && (
              <div className="config-row">
                <label>Mahal-tröskel:</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={config.mahalanobisThreshold}
                  onChange={(e) => setConfig(prev => ({ ...prev, mahalanobisThreshold: parseFloat(e.target.value) || 3.0 }))}
                />
                <span className="config-hint">Högre = färre tas bort (kräver många encodings)</span>
              </div>
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
            {preview.warnings && preview.warnings.length > 0 && (
              <div className="preview-warnings">
                {preview.warnings.map((warning, idx) => (
                  <div key={idx} className="warning-message">{warning}</div>
                ))}
              </div>
            )}
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Behåll</th>
                    <th>Ta bort</th>
                    <th>Statistik</th>
                    <th>Orsak</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.preview.map((row, idx) => (
                    <tr key={idx}>
                      <td className="cell-person">{row.person}</td>
                      <td className="cell-keep">{row.keep}</td>
                      <td className="cell-remove">{row.remove}</td>
                      <td className="cell-stats">
                        {row.stats ? (
                          <span title={`min=${row.stats.min_dist.toFixed(4)}, max=${row.stats.max_dist.toFixed(4)}`}>
                            μ={row.stats.mean_dist.toFixed(3)}, σ={row.stats.std_dist.toFixed(3)}
                          </span>
                        ) : '-'}
                      </td>
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
          <h5>Om filtrering</h5>
          <p>
            Endast <strong>InsightFace</strong>-encodings stöds (512-dimensionella, cosine-avstånd).
            dlib-backend är avvecklat och bör tas bort.
          </p>
          <p>
            <strong>Standardavvikelse</strong> tar bort encodings som ligger långt från genomsnittet.<br />
            <strong>Kluster</strong> behåller endast encodings nära centroiden.<br />
            <strong>Mahalanobis</strong> tar hänsyn till korrelationer mellan dimensioner.
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
    'mahalanobis_outlier': 'Mahalanobis',
    'shape_mismatch': 'Fel shape'
  };
  return reasons[reason] || reason;
}

export default RefineFacesModule;
