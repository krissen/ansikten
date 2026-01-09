/**
 * NotificationListener - Bridges WebSocket notifications to toast system
 *
 * Listens for "notification" events from backend WebSocket and displays
 * them as toast notifications. Supports persistent notifications that
 * stay visible longer.
 */

import { useEffect, useRef } from 'react';
import { useBackend } from '../context/BackendContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { debug } from '../shared/debug.js';

/**
 * NotificationListener component
 *
 * Renders nothing - just subscribes to WebSocket notifications
 * and shows toasts when they arrive.
 */
export function NotificationListener() {
  const { client, isConnected } = useBackend();
  const showToast = useToast();
  const handlerRef = useRef(null);

  useEffect(() => {
    if (!client || !isConnected) return;

    // Handler for notification events
    handlerRef.current = (data) => {
      debug('Notification', 'Received:', data);

      const { type = 'info', title, message, persistent = false } = data;

      // Build display message
      const displayMessage = title ? `${title}: ${message}` : message;

      // Persistent notifications stay longer (30s vs default 5s)
      const duration = persistent ? 30000 : 5000;

      showToast(displayMessage, type, duration);
    };

    // Register handler
    client.onWSEvent('notification', handlerRef.current);
    debug('Notification', 'Listener registered');

    return () => {
      if (handlerRef.current) {
        client.offWSEvent('notification', handlerRef.current);
        debug('Notification', 'Listener unregistered');
      }
    };
  }, [client, isConnected, showToast]);

  // Render nothing - this is a listener-only component
  return null;
}

export default NotificationListener;
