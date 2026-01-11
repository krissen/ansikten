/**
 * ConnectionStatus - Displays offline/disconnected banner when backend is unreachable
 */

import React from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import './ConnectionStatus.css';

export function ConnectionStatus() {
  const { isConnected, isOffline } = useBackend();

  if (isConnected && !isOffline) {
    return null;
  }

  const message = isOffline
    ? 'Backend unreachable - check your connection'
    : 'Connecting to backend...';

  return (
    <div className="connection-status-banner">
      <span className="connection-status-icon">⚠</span>
      <span className="connection-status-message">{message}</span>
    </div>
  );
}

export default ConnectionStatus;
