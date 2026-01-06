/**
 * useCapabilities - Track backend capability readiness (KASAM UX)
 *
 * Returns which capabilities are ready and helper functions for gating actions.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBackend } from '../context/BackendContext.jsx';

export function useCapabilities() {
  const { isConnected } = useBackend();
  const [capabilities, setCapabilities] = useState({
    backendConnected: false,
    dbReady: false,
    mlReady: false,
    allReady: false,
  });
  const wsRef = useRef(null);

  useEffect(() => {
    setCapabilities(prev => ({ ...prev, backendConnected: isConnected }));
    
    if (!isConnected) return;

    const ws = new WebSocket(`ws://127.0.0.1:${window.backendPort || 5001}/ws/progress`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'startup-status') {
          const { items, allReady } = msg.data;
          setCapabilities({
            backendConnected: isConnected,
            dbReady: items.database?.state === 'ready',
            mlReady: items.mlModels?.state === 'ready',
            allReady,
          });
        }
      } catch (e) {
        console.error('useCapabilities: Failed to parse message', e);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [isConnected]);

  const requireCapability = useCallback((capability) => {
    const ready = capabilities[capability];
    const messages = {
      dbReady: 'Database is loading...',
      mlReady: 'ML models are loading (~5-10s)...',
      allReady: 'Backend is starting up...',
    };
    return {
      allowed: ready,
      reason: ready ? null : messages[capability] || 'Capability not ready',
    };
  }, [capabilities]);

  return { capabilities, requireCapability };
}

export default useCapabilities;
