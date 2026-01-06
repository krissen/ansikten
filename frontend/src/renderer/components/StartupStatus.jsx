import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { apiClient } from '../shared/api-client.js';
import { Icon } from './Icon.jsx';
import './StartupStatus.css';

const STATUS_ICONS = {
  pending: 'circle',
  loading: 'refresh',
  ready: 'check',
  error: 'warning'
};

const COMPONENT_LABELS = {
  backend: 'Backend',
  database: 'Database',
  mlModels: 'ML Models'
};

export function StartupStatus() {
  const { isConnected, api } = useBackend();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const readyTimerRef = useRef(null);
  const fetchedRef = useRef(false);

  const handleStatusUpdate = useCallback((data) => {
    setStatus(data);
    
    if (data.allReady && !readyTimerRef.current) {
      readyTimerRef.current = setTimeout(() => {
        setFadeOut(true);
        setTimeout(() => setDismissed(true), 500);
      }, 2000);
    }
  }, []);
  
  const handleDismiss = useCallback(() => {
    setFadeOut(true);
    setTimeout(() => setDismissed(true), 500);
  }, []);

  useEffect(() => {
    if (dismissed) return;

    apiClient.onWSEvent('startup-status', handleStatusUpdate);

    return () => {
      apiClient.offWSEvent('startup-status', handleStatusUpdate);
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
      }
    };
  }, [dismissed, handleStatusUpdate]);

  useEffect(() => {
    if (dismissed || fetchedRef.current || status) return;
    if (!isConnected) return;

    fetchedRef.current = true;
    api.get('/api/startup/status')
      .then(handleStatusUpdate)
      .catch(err => console.error('StartupStatus: Failed to fetch status', err));
  }, [isConnected, dismissed, status, api, handleStatusUpdate]);

  if (dismissed || !status) return null;

  const { items, allReady, hasError } = status;
  const anyLoading = Object.values(items).some(item => 
    item.state === 'loading' || item.state === 'pending'
  );
  const startupDone = allReady || (!anyLoading && hasError);
  
  let headerText = 'Starting...';
  if (allReady) headerText = 'Ready';
  else if (startupDone && hasError) headerText = 'Startup Error';

  return (
    <div 
      className={`startup-status ${fadeOut ? 'fade-out' : ''} ${allReady ? 'all-ready' : ''} ${startupDone && hasError ? 'has-error' : ''}`}
      onClick={handleDismiss}
      title="Click to dismiss"
    >
      <div className="startup-status-header">
        {headerText}
      </div>
      <div className="startup-status-items">
        {Object.entries(items).map(([key, item]) => (
          <div key={key} className={`startup-item ${item.state}`}>
            <span className={`startup-icon ${item.state}`}>
              <Icon name={STATUS_ICONS[item.state]} size={14} />
            </span>
            <span className="startup-label">
              {COMPONENT_LABELS[key] || key}
            </span>
            <span className={`startup-message ${item.state}`}>
              {item.message}
            </span>
            {item.state === 'error' && item.error && (
              <span className="startup-error-detail" title={item.error}>
                <Icon name="info" size={12} />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default StartupStatus;
