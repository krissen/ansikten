/**
 * StartupStatus - Shows backend initialization progress (KASAM UX)
 * 
 * Displays a checklist of loading components with status icons.
 * Auto-dismisses when all components are ready.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { Icon } from './Icon.jsx';
import './StartupStatus.css';

const STATUS_ICONS = {
  pending: 'circle',
  loading: 'refresh',
  ready: 'check',
  error: 'warning'
};

const STATUS_LABELS = {
  database: 'Database',
  mlModels: 'ML Models'
};

export function StartupStatus() {
  const { isConnected } = useBackend();
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const wsRef = useRef(null);
  const readyTimerRef = useRef(null);

  useEffect(() => {
    if (!isConnected || dismissed) return;

    const ws = new WebSocket(`ws://127.0.0.1:${window.backendPort || 5001}/ws/progress`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'startup-status') {
          setStatus(msg.data);
          
          if (msg.data.allReady && !readyTimerRef.current) {
            readyTimerRef.current = setTimeout(() => {
              setFadeOut(true);
              setTimeout(() => setDismissed(true), 500);
            }, 2000);
          }
        }
      } catch (e) {
        console.error('StartupStatus: Failed to parse message', e);
      }
    };

    ws.onerror = (err) => {
      console.error('StartupStatus: WebSocket error', err);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
      }
    };
  }, [isConnected, dismissed]);

  if (dismissed || !status) return null;

  const { items, allReady, hasError } = status;

  return (
    <div className={`startup-status ${fadeOut ? 'fade-out' : ''} ${allReady ? 'all-ready' : ''} ${hasError ? 'has-error' : ''}`}>
      <div className="startup-status-header">
        {allReady ? 'Ready' : hasError ? 'Startup Error' : 'Starting...'}
      </div>
      <div className="startup-status-items">
        {Object.entries(items).map(([key, item]) => (
          <div key={key} className={`startup-item ${item.state}`}>
            <span className={`startup-icon ${item.state}`}>
              <Icon name={STATUS_ICONS[item.state]} size={14} />
            </span>
            <span className="startup-label">{STATUS_LABELS[key] || key}</span>
            {item.state === 'loading' && (
              <span className="startup-progress">...</span>
            )}
            {item.state === 'error' && (
              <span className="startup-error" title={item.error}>!</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default StartupStatus;
