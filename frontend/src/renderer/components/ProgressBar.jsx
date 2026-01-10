/**
 * ProgressBar Component
 *
 * Themeable progress indicator using CSS variables.
 * Supports both determinate (percentage) and indeterminate (loading) modes.
 *
 * Theme variables used:
 * - --progress-track-bg: Background of the track
 * - --progress-fill: Fill color
 * - --progress-text: Text color (for labels)
 * - --progress-height: Height of the bar
 * - --progress-radius: Border radius
 */

import React from 'react';
import './ProgressBar.css';

/**
 * ProgressBar - Visual progress indicator
 *
 * @param {number} value - Progress value (0-100), or undefined for indeterminate
 * @param {string} label - Optional label text
 * @param {string} size - Size variant: 'sm', 'md', 'lg' (default: 'md')
 * @param {boolean} showPercent - Show percentage text (default: false)
 * @param {string} className - Additional CSS classes
 */
export function ProgressBar({
  value,
  label,
  size = 'md',
  showPercent = false,
  className = ''
}) {
  const isIndeterminate = value === undefined || value === null;
  const percent = isIndeterminate ? 0 : Math.min(100, Math.max(0, value));

  const classes = [
    'progress-bar',
    `progress-bar--${size}`,
    isIndeterminate ? 'progress-bar--indeterminate' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {label && <div className="progress-bar__label">{label}</div>}
      <div className="progress-bar__track">
        <div
          className="progress-bar__fill"
          style={{ width: isIndeterminate ? '30%' : `${percent}%` }}
        />
      </div>
      {showPercent && !isIndeterminate && (
        <div className="progress-bar__percent">{Math.round(percent)}%</div>
      )}
    </div>
  );
}

/**
 * LoadingSpinner - Circular loading indicator
 *
 * @param {string} size - Size variant: 'sm', 'md', 'lg' (default: 'md')
 * @param {string} className - Additional CSS classes
 */
export function LoadingSpinner({ size = 'md', className = '' }) {
  const classes = [
    'loading-spinner',
    `loading-spinner--${size}`,
    className
  ].filter(Boolean).join(' ');

  return <div className={classes} />;
}

/**
 * LoadingOverlay - Full-area loading overlay with spinner and optional message
 *
 * @param {string} message - Optional loading message
 * @param {boolean} visible - Whether overlay is visible
 */
export function LoadingOverlay({ message, visible = true }) {
  if (!visible) return null;

  return (
    <div className="loading-overlay">
      <LoadingSpinner size="lg" />
      {message && <div className="loading-overlay__message">{message}</div>}
    </div>
  );
}

export default ProgressBar;
