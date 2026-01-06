/**
 * useCapabilities - Track backend capability readiness (KASAM UX)
 *
 * Returns which capabilities are ready and helper functions for gating actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { apiClient } from '../shared/api-client.js';

export function useCapabilities() {
  const { isConnected } = useBackend();
  const [capabilities, setCapabilities] = useState({
    backendConnected: false,
    dbReady: false,
    mlReady: false,
    allReady: false,
  });

  useEffect(() => {
    setCapabilities(prev => ({ ...prev, backendConnected: isConnected }));
  }, [isConnected]);

  useEffect(() => {
    const handleStatusUpdate = (data) => {
      const { items, allReady } = data;
      setCapabilities(prev => ({
        ...prev,
        dbReady: items.database?.state === 'ready',
        mlReady: items.mlModels?.state === 'ready',
        allReady,
      }));
    };

    apiClient.onWSEvent('startup-status', handleStatusUpdate);

    return () => {
      apiClient.offWSEvent('startup-status', handleStatusUpdate);
    };
  }, []);

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
