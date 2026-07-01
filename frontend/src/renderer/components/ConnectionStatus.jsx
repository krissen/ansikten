/**
 * ConnectionStatus - Displays offline/disconnected banner when backend is unreachable
 */

import React from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { t } from '../../i18n/index.js';
import './ConnectionStatus.css';

export function ConnectionStatus() {
  const { isConnected, isOffline } = useBackend();

  if (isConnected && !isOffline) {
    return null;
  }

  const message = isOffline
    ? t('connection.unreachable')
    : t('connection.connecting');

  return (
    <div className="connection-status-banner">
      <span className="connection-status-icon">⚠</span>
      <span className="connection-status-message">{message}</span>
    </div>
  );
}

export default ConnectionStatus;
