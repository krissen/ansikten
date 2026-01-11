/**
 * ToastContext - Global toast notification system
 *
 * Provides toast notifications that are visible regardless of which tab is active.
 * Toasts stack from bottom-right with smooth animations.
 * StartupStatus is integrated as a sticky toast at the bottom of the stack.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { StartupStatus } from '../components/StartupStatus.jsx';

// Create the context
const ToastContext = createContext(null);

/**
 * ToastProvider - Wrap your app with this to enable global toasts
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message, type = 'success', duration = 5000) => {
    const id = ++toastIdRef.current;
    const minDuration = 3000;
    const actualDuration = Math.max(duration, minDuration);
    setToasts(prev => [...prev, { id, message, type, exiting: false }]);

    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 300);
    }, actualDuration);
  }, []);

  const dismissToast = useCallback((id) => {
    // Start exit animation
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    // Remove after animation completes
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 300);
  }, []);

  const value = { showToast, dismissToast, toasts };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="global-toast-container">
      <StartupStatus />
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`global-toast ${t.type} ${t.exiting ? 'exiting' : ''}`}
          onClick={() => onDismiss(t.id)}
          title="Click to dismiss"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

/**
 * useToast - Hook to access toast functionality
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context.showToast;
}

export default ToastContext;
