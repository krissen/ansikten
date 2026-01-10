/**
 * FileQueueModule - File queue management for batch image processing
 *
 * Features:
 * - Visual file list with status indicators
 * - Add/remove files from queue
 * - Click to load file in ImageViewer
 * - Auto-advance after review completion
 * - Fix mode for re-reviewing processed files
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useModuleEvent, useEmitEvent } from '../hooks/useModuleEvent.js';
import { useBackend } from '../context/BackendContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { debug, debugWarn, debugError } from '../shared/debug.js';
import { apiClient } from '../shared/api-client.js';
import { getPreprocessingManager, PreprocessingStatus } from '../services/preprocessing/index.js';
import { Icon } from './Icon.jsx';
import { isFileEligible as isFileEligiblePure, findNextEligibleIndex } from './fileQueueEligibility.js';
import './FileQueueModule.css';

// Read preference directly from localStorage to avoid circular dependency
const getAutoLoadPreference = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.fileQueue?.autoLoadOnStartup ?? true;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return true; // Default to enabled
};

// Get rename configuration from preferences
const getRenameConfig = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      const rename = prefs.rename || {};
      // Only include non-default values
      const config = {};
      if (rename.prefixSource !== undefined) config.prefixSource = rename.prefixSource;
      if (rename.exifFallback !== undefined) config.exifFallback = rename.exifFallback;
      if (rename.datePattern !== undefined) config.datePattern = rename.datePattern;
      if (rename.filenamePattern !== undefined) config.filenamePattern = rename.filenamePattern;
      if (rename.nameSeparator !== undefined) config.nameSeparator = rename.nameSeparator;
      if (rename.useFirstNameOnly !== undefined) config.useFirstNameOnly = rename.useFirstNameOnly;
      if (rename.alwaysIncludeSurname !== undefined) config.alwaysIncludeSurname = rename.alwaysIncludeSurname;
      if (rename.disambiguationStyle !== undefined) config.disambiguationStyle = rename.disambiguationStyle;
      if (rename.removeDiacritics !== undefined) config.removeDiacritics = rename.removeDiacritics;
      if (rename.includeIgnoredFaces !== undefined) config.includeIgnoredFaces = rename.includeIgnoredFaces;
      if (rename.allowAlreadyRenamed !== undefined) config.allowAlreadyRenamed = rename.allowAlreadyRenamed;
      // Sidecar settings
      if (rename.renameSidecars !== undefined) config.renameSidecars = rename.renameSidecars;
      if (rename.sidecarExtensions !== undefined) config.sidecarExtensions = rename.sidecarExtensions;
      return Object.keys(config).length > 0 ? config : null;
    }
  } catch (e) {
    // Ignore parse errors
  }
  return null;
};

// Get preprocessing notification preference
const getNotificationPreference = (key) => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      const notifications = prefs.preprocessing?.notifications || {};
      if (key === 'showStatusIndicator') return notifications.showStatusIndicator ?? true;
      if (key === 'showToastOnPause') return notifications.showToastOnPause ?? true;
      if (key === 'showToastOnResume') return notifications.showToastOnResume ?? false;
    }
  } catch (e) {
    // Ignore parse errors
  }
  if (key === 'showStatusIndicator') return true;
  if (key === 'showToastOnPause') return true;
  if (key === 'showToastOnResume') return false;
  return false;
};

// Get preprocessing config including rolling window settings
const getPreprocessingConfig = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      const preprocessing = prefs.preprocessing || {};
      return {
        enabled: preprocessing.enabled ?? true,
        maxWorkers: preprocessing.parallelWorkers ?? 2,
        steps: preprocessing.steps || {},
        rollingWindow: preprocessing.rollingWindow || {}
      };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return {};
};

// Get rename confirmation preference
const getRequireRenameConfirmation = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.rename?.requireConfirmation ?? true;
    }
  } catch (e) {}
  return true;
};

// Get auto-remove missing files preference
const getAutoRemoveMissingPreference = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.fileQueue?.autoRemoveMissing ?? true;
    }
  } catch (e) {}
  return true;
};

// Get toast duration multiplier from preferences (1.0 = normal, 2.0 = double)
const getToastDurationMultiplier = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.notifications?.toastDuration ?? 1.0;
    }
  } catch (e) {}
  return 1.0;
};

// Get insert mode preference: 'bottom' or 'alphabetical'
const getInsertModePreference = () => {
  try {
    const stored = localStorage.getItem('bildvisare-preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      return prefs.fileQueue?.insertMode ?? 'alphabetical';
    }
  } catch (e) {}
  return 'alphabetical';
};

// Natural sort comparator for filenames (handles numbers correctly)
const naturalSortCompare = (a, b) => {
  return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
};

// Generate simple unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

/**
 * FileQueueModule Component
 */
export function FileQueueModule() {
  const { api, isConnected } = useBackend();
  const emit = useEmitEvent();
  const globalShowToast = useToast();

  // Queue state
  const [queue, setQueue] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [fixMode, setFixMode] = useState(false);
  const [processedFiles, setProcessedFiles] = useState(new Set());
  const [processedHashes, setProcessedHashes] = useState(new Set());
  const processedHashesRef = useRef(processedHashes);
  processedHashesRef.current = processedHashes;
  const [processedFilesLoaded, setProcessedFilesLoaded] = useState(false);
  const [preprocessingStatus, setPreprocessingStatus] = useState({});
  const [preprocessingPaused, setPreprocessingPaused] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Set()); // Selected file IDs

  // Rename state
  const [showPreviewNames, setShowPreviewNames] = useState(false);
  const [previewData, setPreviewData] = useState(null); // { path: { newName, status, persons } }
  const [renameInProgress, setRenameInProgress] = useState(false);
  const renameInProgressRef = useRef(false);
  renameInProgressRef.current = renameInProgress;

  // Toast wrapper that applies duration preference
  // Base durations are longer now: success=4s, info=4s, warning=5s, error=6s
  const showToast = useCallback((message, type = 'success', baseDuration = 4000) => {
    const multiplier = getToastDurationMultiplier();
    const duration = Math.round(baseDuration * multiplier);
    globalShowToast(message, type, duration);
  }, [globalShowToast]);

  // Alias for backwards compatibility
  const queueToast = showToast;

  // Track missing files for batched removal
  const missingFilesRef = useRef([]);
  const missingFilesTimeoutRef = useRef(null);

  // Refs for processed files state (for use in callbacks without stale closure)
  const processedFilesLoadedRef = useRef(false);
  processedFilesLoadedRef.current = processedFilesLoaded;
  const processedFilesRef = useRef(new Set());
  processedFilesRef.current = processedFiles;

  // Get preprocessing manager (singleton)
  const preprocessingManager = useRef(null);
  if (!preprocessingManager.current) {
    const config = getPreprocessingConfig();
    preprocessingManager.current = getPreprocessingManager(config);
  }

  // Refs
  const moduleRef = useRef(null);
  const listRef = useRef(null);
  const currentFileRef = useRef(null);
  const queueRef = useRef(queue); // Keep current queue in ref for callbacks
  queueRef.current = queue; // Sync on every render (not just in useEffect)
  const fixModeRef = useRef(fixMode);
  fixModeRef.current = fixMode;

  const loadFileRef = useRef(null);

  const [shouldAutoLoad, setShouldAutoLoad] = useState(false);
  const savedIndexRef = useRef(-1);

  // Load processed files from backend on mount
  const loadProcessedFilesFailedRef = useRef(false);
  const loadProcessedFiles = useCallback(async () => {
    debug('FileQueue', '>>> loadProcessedFiles starting...');
    try {
      const response = await api.get('/api/v1/management/recent-files?n=100000');
      if (response && Array.isArray(response)) {
        const fileNames = new Set(response.map(f => f.name));
        const fileHashes = new Set(response.map(f => f.hash).filter(Boolean));
        setProcessedFiles(fileNames);
        setProcessedHashes(fileHashes);
        setProcessedFilesLoaded(true);
        debug('FileQueue', '>>> loadProcessedFiles COMPLETE:', fileNames.size, 'files loaded');
        loadProcessedFilesFailedRef.current = false;
      }
    } catch (err) {
      debugWarn('FileQueue', 'Could not load processed files (non-fatal):', err.message);
      setProcessedFilesLoaded(true);
      if (!loadProcessedFilesFailedRef.current) {
        loadProcessedFilesFailedRef.current = true;
        showToast('⚠️ Could not load processed files status', 'warning', 3000);
      }
    }
  }, [api, showToast]);

  const emitQueueStatus = useCallback((currentIdx = currentIndex) => {
    const q = queueRef.current;
    const done = q.filter(item => item.status === 'completed').length;
    // Remaining = total - done, but minimum 0 (avoid -1 when queue is empty)
    const remaining = Math.max(0, q.length - done);
    emit('queue-status', {
      total: q.length,
      current: currentIdx,
      done: done,
      remaining: remaining
    });
  }, [emit, currentIndex]);

  useEffect(() => {
    loadProcessedFiles();
  }, [loadProcessedFiles]);

  useEffect(() => {
    if (preprocessingManager.current) {
      preprocessingManager.current.setHashChecker((hash) => processedHashesRef.current.has(hash));
    }
  }, [processedFilesLoaded]);
  const statsFetchedRef = useRef(new Set());
  useEffect(() => {
    if (!processedFilesLoaded || processedFiles.size === 0) return;
    
    setQueue(prev => {
      let hasChanges = false;
      const updated = prev.map(item => {
        const shouldBeProcessed = processedFiles.has(item.fileName);
        if (shouldBeProcessed && !item.isAlreadyProcessed) {
          hasChanges = true;
          return { ...item, isAlreadyProcessed: true };
        }
        return item;
      });
      return hasChanges ? updated : prev;
    });
  }, [processedFilesLoaded, processedFiles]);

  useEffect(() => {
    if (!processedFilesLoaded || processedFiles.size === 0 || !api) return;
    
    const itemsNeedingStats = queue.filter(item => 
      item.isAlreadyProcessed && !statsFetchedRef.current.has(item.filePath)
    );
    
    if (itemsNeedingStats.length === 0) return;
    
    itemsNeedingStats.forEach(item => statsFetchedRef.current.add(item.filePath));
    
    const filepaths = itemsNeedingStats.map(item => item.filePath);
    debug('FileQueue', 'Fetching stats via hash for', filepaths.length, 'files');
    api.post('/api/v1/statistics/file-stats', { filepaths })
      .then(stats => {
        debug('FileQueue', 'Got stats for', Object.keys(stats).length, 'files');
        setPreprocessingStatus(prev => {
          const updates = {};
          for (const item of itemsNeedingStats) {
            const stat = stats[item.fileName];
            if (stat) {
              updates[item.filePath] = {
                status: PreprocessingStatus.COMPLETED,
                faceCount: stat.face_count,
                persons: stat.persons,
              };
            }
          }
          return { ...prev, ...updates };
        });
      })
      .catch(err => {
        debugWarn('FileQueue', 'Failed to fetch stats for processed files:', err);
      });
  }, [processedFilesLoaded, processedFiles, api, queue]);

  // Subscribe to preprocessing manager events
  useEffect(() => {
    const manager = preprocessingManager.current;
    if (!manager) return;

    const handleStatusChange = ({ filePath, status }) => {
      setPreprocessingStatus(prev => ({
        ...prev,
        [filePath]: { ...(prev[filePath] || {}), status }
      }));
    };

    const handleCompleted = ({ filePath, hash, faceCount }) => {
      setPreprocessingStatus(prev => {
        const existing = prev[filePath];
        // Preserve existing faceCount if it's valid (faces-detected may have set it)
        const actualFaceCount = (existing?.faceCount > 0) ? existing.faceCount : faceCount;
        return {
          ...prev,
          [filePath]: { status: PreprocessingStatus.COMPLETED, faceCount: actualFaceCount, hash }
        };
      });

      // Check if file hash matches a processed file (handles renamed files)
      if (hash && processedHashes.has(hash)) {
        setQueue(prev => prev.map(item =>
          item.filePath === filePath && !item.isAlreadyProcessed
            ? { ...item, isAlreadyProcessed: true }
            : item
        ));
        debug('FileQueue', 'File recognized by hash as already processed:', filePath);
      }

      debug('FileQueue', 'Preprocessing completed:', filePath, `(${faceCount ?? 0} faces)`);
    };

    const handleError = ({ filePath, error }) => {
      setPreprocessingStatus(prev => ({
        ...prev,
        [filePath]: { status: PreprocessingStatus.ERROR }
      }));
      debugWarn('FileQueue', 'Preprocessing error:', filePath, error);
      // Show error toast for preprocessing failure
      const fileName = filePath.split('/').pop();
      showToast(`Preprocessing failed: ${fileName}`, 'error', 4000);
    };

    const handleFileNotFound = ({ filePath }) => {
      setPreprocessingStatus(prev => ({
        ...prev,
        [filePath]: { status: PreprocessingStatus.FILE_NOT_FOUND }
      }));

      const hash = preprocessingManager.current?.removeFile(filePath);
      if (hash) {
        apiClient.batchDeleteCache([hash]).catch(() => {});
      }

      const autoRemove = getAutoRemoveMissingPreference();

      if (autoRemove) {
        missingFilesRef.current.push(filePath);

        if (missingFilesTimeoutRef.current) {
          clearTimeout(missingFilesTimeoutRef.current);
        }

        missingFilesTimeoutRef.current = setTimeout(() => {
          const count = missingFilesRef.current.length;
          if (count > 0) {
            const pathsToRemove = new Set(missingFilesRef.current);
            setQueue(prev => prev.filter(item => !pathsToRemove.has(item.filePath)));
            showToast(`Removed ${count} missing file${count > 1 ? 's' : ''} from queue`, 'info', 3000);
            debug('FileQueue', `Auto-removed ${count} missing files`);
            missingFilesRef.current = [];
          }
        }, 500);
      } else {
        setQueue(prev => prev.map(item =>
          item.filePath === filePath
            ? { ...item, status: 'missing', error: 'File not found' }
            : item
        ));
      }
      debug('FileQueue', 'File not found:', filePath);
    };

    const handlePaused = ({ readyCount, queueLength }) => {
      debug('FileQueue', `Preprocessing paused: ${readyCount} ready, ${queueLength} in queue`);
      setPreprocessingPaused(true);
      const showPauseToast = getNotificationPreference('showToastOnPause');
      if (showPauseToast) {
        showToast(`Preprocessing paused (${readyCount} files ready)`, 'info', 3000);
      }
    };

    const handleResumed = () => {
      debug('FileQueue', 'Preprocessing resumed');
      setPreprocessingPaused(false);
      const showResumeToast = getNotificationPreference('showToastOnResume');
      if (showResumeToast) {
        showToast('Preprocessing resumed', 'info', 2000);
      }
    };

    const handleCacheCleared = async ({ count, hashes }) => {
      debug('FileQueue', `Preprocessing cache cleared: ${count} items`);
      if (hashes && hashes.length > 0) {
        try {
          await apiClient.batchDeleteCache(hashes);
          debug('FileQueue', `Cleared ${hashes.length} items from backend cache`);
        } catch (err) {
          debugWarn('FileQueue', 'Failed to clear backend cache:', err.message);
        }
      }
    };

    const handleAlreadyProcessed = ({ filePath, hash }) => {
      debug('FileQueue', 'File skipped (hash already processed):', filePath);
      setQueue(prev => prev.map(item =>
        item.filePath === filePath
          ? { ...item, isAlreadyProcessed: true }
          : item
      ));
      setPreprocessingStatus(prev => ({
        ...prev,
        [filePath]: { status: PreprocessingStatus.COMPLETED, skipped: true }
      }));
    };

    manager.on('status-change', handleStatusChange);
    manager.on('completed', handleCompleted);
    manager.on('error', handleError);
    manager.on('file-not-found', handleFileNotFound);
    manager.on('paused', handlePaused);
    manager.on('resumed', handleResumed);
    manager.on('cache-cleared', handleCacheCleared);
    manager.on('already-processed', handleAlreadyProcessed);

    return () => {
      manager.off('status-change', handleStatusChange);
      manager.off('completed', handleCompleted);
      manager.off('error', handleError);
      manager.off('file-not-found', handleFileNotFound);
      manager.off('paused', handlePaused);
      manager.off('resumed', handleResumed);
      manager.off('cache-cleared', handleCacheCleared);
      manager.off('already-processed', handleAlreadyProcessed);
    };
  }, [showToast, processedHashes]);

  // Handle file-deleted events from file watcher
  // Use refs to avoid re-subscribing on every preprocessingStatus change
  const preprocessingStatusRef = useRef(preprocessingStatus);
  preprocessingStatusRef.current = preprocessingStatus;

  useEffect(() => {
    const handleFileDeleted = (filePath) => {
      debug('FileQueue', 'File deleted from disk:', filePath);

      // During rename, ignore file-deleted events entirely
      // (rename triggers delete events for old paths - we handle path updates in handleRename)
      if (renameInProgressRef.current) {
        debug('FileQueue', 'Ignoring file-deleted during rename:', filePath.split('/').pop());
        return;
      }

      const ppStatus = preprocessingStatusRef.current[filePath];
      const removedHash = preprocessingManager.current?.removeFile(filePath);
      const hash = removedHash || ppStatus?.hash;

      if (hash) {
        apiClient.batchDeleteCache([hash]).catch(err => {
          debugWarn('FileQueue', 'Failed to clear backend cache:', err.message);
        });
      }

      setPreprocessingStatus(prev => {
        const updated = { ...prev };
        delete updated[filePath];
        return updated;
      });

      const fileName = filePath.split('/').pop();
      setQueue(prev => prev.filter(item => item.filePath !== filePath));
      showToast(`Removed deleted file: ${fileName}`, 'info', 3000);
    };

    const unsubscribe = window.bildvisareAPI?.onFileDeleted(handleFileDeleted);
    return () => unsubscribe?.();
  }, [showToast]);

  useEffect(() => {
    const handleWatcherError = (dir, affectedFiles) => {
      const currentQueue = queueRef.current;
      const queuePaths = new Set(currentQueue.map(item => item.filePath));
      const stillInQueue = affectedFiles.filter(fp => queuePaths.has(fp));

      if (stillInQueue.length > 0) {
        debugWarn('FileQueue', `Watcher error for ${dir}, re-registering ${stillInQueue.length}/${affectedFiles.length} files`);
        for (const filePath of stillInQueue) {
          window.bildvisareAPI?.watchFile(filePath);
        }
      }
    };

    const unsubscribe = window.bildvisareAPI?.onWatcherError(handleWatcherError);
    return () => unsubscribe?.();
  }, []);

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bildvisare-file-queue');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.queue) && parsed.queue.length > 0) {
          // Reset 'active' status to 'pending' since no file is loaded yet
          // This prevents mismatch between status and currentIndex at startup
          const restoredQueue = parsed.queue.map(item => ({
            ...item,
            status: item.status === 'active' ? 'pending' : item.status
          }));
          setQueue(restoredQueue);
          setAutoAdvance(parsed.autoAdvance ?? true);
          setFixMode(parsed.fixMode ?? false);
          setShowPreviewNames(parsed.showPreviewNames ?? false);
          savedIndexRef.current = parsed.currentIndex ?? -1;
          setShouldAutoLoad(true);
          debug('FileQueue', 'Restored queue with', restoredQueue.length, 'files, will auto-load');
          const withReviewed = restoredQueue.filter(q => q.reviewedFaces?.length > 0);
          if (withReviewed.length > 0) {
            debug('FileQueue', `Found ${withReviewed.length} items with reviewedFaces:`,
              withReviewed.map(q => `${q.fileName}: ${q.reviewedFaces.length} faces`));
          }
        }
      }
    } catch (err) {
      debugError('FileQueue', 'Failed to load saved queue:', err);
    }
  }, []);

  const [pendingAutoLoad, setPendingAutoLoad] = useState(-1);

  // Save queue to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem('bildvisare-file-queue', JSON.stringify({
        queue,
        currentIndex,
        autoAdvance,
        fixMode,
        showPreviewNames
      }));
    } catch (err) {
      debugError('FileQueue', 'Failed to save queue:', err);
    }
  }, [queue, currentIndex, autoAdvance, fixMode, showPreviewNames]);

  // Watch queued files for deletion
  const watchedFilesRef = useRef(new Set());
  useEffect(() => {
    const currentPaths = new Set(queue.map(item => item.filePath));
    const watched = watchedFilesRef.current;

    currentPaths.forEach(filePath => {
      if (!watched.has(filePath)) {
        window.bildvisareAPI?.watchFile(filePath);
        watched.add(filePath);
      }
    });

    watched.forEach(filePath => {
      if (!currentPaths.has(filePath)) {
        window.bildvisareAPI?.unwatchFile(filePath);
        watched.delete(filePath);
      }
    });

  }, [queue]);

  // Cleanup all file watchers only on unmount
  useEffect(() => {
    return () => {
      window.bildvisareAPI?.unwatchAllFiles();
      watchedFilesRef.current.clear();
    };
  }, []);

  // Update backend cache priority (queue files evicted last)
  const priorityHashesTimerRef = useRef(null);
  useEffect(() => {
    if (priorityHashesTimerRef.current) {
      clearTimeout(priorityHashesTimerRef.current);
    }

    priorityHashesTimerRef.current = setTimeout(() => {
      const queueHashes = queue
        .map(item => preprocessingStatus[item.filePath]?.hash)
        .filter(Boolean);

      // Always send, even empty list to clear old priorities
      apiClient.setPriorityCacheHashes(queueHashes).catch(() => {});
    }, 500);

    return () => {
      if (priorityHashesTimerRef.current) {
        clearTimeout(priorityHashesTimerRef.current);
      }
    };
  }, [queue, preprocessingStatus]);

  // Track preprocessing completion for toast notification
  const prevPreprocessingCountRef = useRef({ pending: 0, total: 0 });
  useEffect(() => {
    if (queue.length === 0) return;

    // Count files still preprocessing
    const pendingPreprocessing = queue.filter(item => {
      const status = preprocessingStatus[item.filePath];
      // Still preprocessing if no status yet or in progress
      return !status ||
             (status !== PreprocessingStatus.COMPLETED &&
              status !== PreprocessingStatus.ERROR &&
              status !== PreprocessingStatus.FILE_NOT_FOUND);
    }).length;

    const prev = prevPreprocessingCountRef.current;

    // Show toast when preprocessing completes (was pending, now all done)
    if (prev.pending > 0 && pendingPreprocessing === 0 && queue.length > 0) {
      const completedCount = queue.filter(item =>
        preprocessingStatus[item.filePath] === PreprocessingStatus.COMPLETED
      ).length;
      if (completedCount > 0) {
        showToast(`Preprocessing complete (${completedCount} files cached)`, 'success', 3000);
      }
    }

    prevPreprocessingCountRef.current = { pending: pendingPreprocessing, total: queue.length };
  }, [queue, preprocessingStatus, showToast]);

  // Backend connection status - only show toast on RECONNECTION (not initial connect)
  const connectionStateRef = useRef({ prev: null, hasEverConnected: false });
  useEffect(() => {
    const state = connectionStateRef.current;

    if (state.prev === null) {
      state.prev = isConnected;
      if (isConnected) state.hasEverConnected = true;
      return;
    }

    if (state.prev !== isConnected) {
      if (isConnected) {
        if (state.hasEverConnected) {
          showToast('🟢 Backend reconnected', 'success', 2500);
        }
        state.hasEverConnected = true;
      } else {
        // Ignore disconnect during rename (WebSocket briefly disconnects during file operations)
        if (renameInProgressRef.current) {
          debug('FileQueue', 'Backend disconnected during rename - ignoring');
        } else {
          showToast('🔴 Backend disconnected', 'error', 4000);
        }
      }
      state.prev = isConnected;
    }
  }, [isConnected, showToast]);

  // Startup toasts - show once after initial load
  const startupToastsShownRef = useRef(false);
  useEffect(() => {
    if (startupToastsShownRef.current) return;

    const showStartupToasts = async () => {
      startupToastsShownRef.current = true;

      // Wait a bit for queue to load
      await new Promise(r => setTimeout(r, 1000));

      // Show queue count if files are queued
      if (queue.length > 0) {
        const pending = queue.filter(q => q.status === 'pending').length;
        if (pending > 0) {
          queueToast(`${queue.length} files in queue (${pending} pending)`, 'info', 3000);
        }
      }

      // Database stats now shown in StartupStatus - no separate toast needed

      // Check cache status
      try {
        const cacheStatus = await api.get('/api/v1/preprocessing/cache/status');
        if (cacheStatus && cacheStatus.usage_percent > 80) {
          queueToast(
            `⚠️ Cache ${Math.round(cacheStatus.usage_percent)}% full (${Math.round(cacheStatus.total_size_mb)}/${cacheStatus.max_size_mb} MB)`,
            'warning',
            5000
          );
        }
      } catch (err) {
        // Non-fatal - skip this toast
        debug('FileQueue', 'Could not fetch cache status:', err.message);
      }
    };

    showStartupToasts();
  }, [queue, queueToast, api]);

  // Check if file is already processed
  const isFileProcessed = useCallback((fileName) => {
    return processedFiles.has(fileName);
  }, [processedFiles]);

  const getEligibilityContext = useCallback(() => ({
    fixMode: fixModeRef.current,
    processedFiles: processedFilesRef.current
  }), []);

  const isFileEligible = useCallback((item) => {
    return isFileEligiblePure(item, getEligibilityContext());
  }, [getEligibilityContext]);

  const startNextEligible = useCallback((options = {}) => {
    const { preferIndex = -1, showToastIfNone = true } = options;

    if (!processedFilesLoadedRef.current) {
      debug('FileQueue', 'startNextEligible: BLOCKED - processed files not loaded');
      return false;
    }

    const q = queueRef.current;
    const context = getEligibilityContext();
    const indexToLoad = findNextEligibleIndex(q, context, { preferIndex });

    debug('FileQueue', 'startNextEligible:', { preferIndex, indexToLoad, queueLength: q.length });

    if (indexToLoad >= 0) {
      loadFileRef.current?.(indexToLoad);
      return true;
    }

    if (showToastIfNone && q.length > 0) {
      showToast('All files already processed. Enable fix-mode to reprocess.', 'info', 5000);
    }
    return false;
  }, [getEligibilityContext, showToast]);

  useEffect(() => {
    if (!processedFilesLoaded) return;
    if (!shouldAutoLoad || queue.length === 0) return;
    setShouldAutoLoad(false);

    if (preprocessingManager.current) {
      const context = getEligibilityContext();
      const eligibleItems = queue.filter(item => isFileEligiblePure(item, context));
      debug('FileQueue', 'Starting preprocessing for', eligibleItems.length, 'eligible items');
      eligibleItems.forEach(item => preprocessingManager.current.addToQueue(item.filePath));
    }

    if (!getAutoLoadPreference()) {
      debug('FileQueue', 'Auto-load disabled in preferences');
      return;
    }

    const preferIndex = savedIndexRef.current;
    debug('FileQueue', 'Auto-load: trying to start with preferIndex:', preferIndex);
    startNextEligible({ preferIndex, showToastIfNone: true });
  }, [shouldAutoLoad, queue, processedFilesLoaded, getEligibilityContext, startNextEligible]);

  const addFiles = useCallback((filePaths, position = 'default') => {
    if (!filePaths || filePaths.length === 0) return;

    const currentProcessedFiles = processedFilesRef.current;
    debug('FileQueue', '>>> addFiles called', {
      count: filePaths.length,
      processedFilesLoaded: processedFilesLoadedRef.current,
      processedFilesSize: currentProcessedFiles.size,
      fixMode: fixModeRef.current
    });

    const effectivePosition = position === 'default' ? getInsertModePreference() : position;

    const newItems = filePaths.map(filePath => {
      const fileName = filePath.split('/').pop();
      const alreadyProcessed = currentProcessedFiles.has(fileName);
      debug('FileQueue', '>>> addFiles item', { fileName, alreadyProcessed });
      return {
        id: generateId(),
        filePath,
        fileName,
        status: 'pending',
        isAlreadyProcessed: alreadyProcessed,
        error: null
      };
    });

    let addedCount = 0;
    let alreadyProcessedFiles = [];
    setQueue(prev => {
      const existingPaths = new Set(prev.map(item => item.filePath));
      const uniqueNew = newItems.filter(item => !existingPaths.has(item.filePath));
      addedCount = uniqueNew.length;

      const currentFixMode = fixModeRef.current;
      uniqueNew.forEach(item => {
        if (!currentFixMode && item.isAlreadyProcessed) {
          debug('FileQueue', 'Skipping preprocessing (already processed, fix-mode OFF):', item.fileName);
          alreadyProcessedFiles.push(item);
          return;
        }
        if (preprocessingManager.current) {
          preprocessingManager.current.addToQueue(item.filePath);
        }
      });

      if (effectivePosition === 'start') {
        return [...uniqueNew, ...prev];
      } else if (effectivePosition === 'sorted' || effectivePosition === 'alphabetical') {
        const combined = [...prev, ...uniqueNew];
        return combined.sort(naturalSortCompare);
      }
      return [...prev, ...uniqueNew];
    });

    if (newItems.length > 0) {
      const dupeCount = newItems.length - addedCount;
      if (addedCount > 0) {
        let msg = `Added ${addedCount} file${addedCount !== 1 ? 's' : ''} to queue`;
        if (dupeCount > 0) {
          msg += ` (${dupeCount} already in queue)`;
        }
        showToast(msg, 'info', 3000);
      } else if (dupeCount > 0) {
        const msg = dupeCount === 1
          ? 'File already in queue'
          : `All ${dupeCount} files already in queue`;
        showToast(msg, 'info', 2500);
      }
    }

    debug('FileQueue', 'Added', newItems.length, 'files, mode:', effectivePosition);

    // Fetch face stats for already-processed files that weren't preprocessed
    if (alreadyProcessedFiles.length > 0 && api) {
      const filepaths = alreadyProcessedFiles.map(item => item.filePath);
      api.post('/api/v1/statistics/file-stats', { filepaths })
        .then(stats => {
          debug('FileQueue', 'Got file stats for', Object.keys(stats).length, 'files');
          setPreprocessingStatus(prev => {
            const updates = {};
            for (const item of alreadyProcessedFiles) {
              const stat = stats[item.fileName];
              if (stat) {
                updates[item.filePath] = {
                  status: PreprocessingStatus.COMPLETED,
                  faceCount: stat.face_count,
                  persons: stat.persons,
                };
              }
            }
            return { ...prev, ...updates };
          });
        })
        .catch(err => {
          debugWarn('FileQueue', 'Failed to fetch file stats:', err);
        });
    }
  }, [showToast, api]);

  // Sort existing queue alphabetically
  const sortQueue = useCallback(() => {
    setQueue(prev => [...prev].sort(naturalSortCompare));
    showToast('Queue sorted alphabetically', 'info', 2000);
  }, [showToast]);

  // Remove file from queue
  const removeFile = useCallback((id) => {
    // Find the file to get its path before removing
    const fileToRemove = queue.find(item => item.id === id);
    if (fileToRemove) {
      if (preprocessingManager.current) {
        preprocessingManager.current.removeFile(fileToRemove.filePath);
      }
      // Clear viewer if this was the active file
      if (fileToRemove.filePath === currentFileRef.current) {
        emit('clear-image');
        currentFileRef.current = null;
      }
    }

    setQueue(prev => prev.filter(item => item.id !== id));
    // Adjust currentIndex if needed
    setCurrentIndex(prev => {
      const removedIndex = queue.findIndex(item => item.id === id);
      if (removedIndex < prev) return prev - 1;
      if (removedIndex === prev) return -1;
      return prev;
    });
  }, [queue, emit]);

  // Clear all files
  const clearQueue = useCallback(() => {
    // Stop all preprocessing
    if (preprocessingManager.current) {
      preprocessingManager.current.stop();
    }
    // Clear viewer if there was an active file
    if (currentFileRef.current) {
      emit('clear-image');
      currentFileRef.current = null;
    }
    setQueue([]);
    setCurrentIndex(-1);
  }, [emit]);

  // Clear completed files
  // When fix-mode is OFF, also clear already-processed files (they're considered done)
  // When fix-mode is ON, keep already-processed files (they need reprocessing)
  const clearCompleted = useCallback(() => {
    const currentFixMode = fixModeRef.current;
    const currentQueue = queueRef.current;

    // Check if active file will be removed
    const activeFile = currentQueue.find(item => item.filePath === currentFileRef.current);
    const activeWillBeRemoved = activeFile && (
      activeFile.status === 'completed' ||
      (!currentFixMode && activeFile.isAlreadyProcessed)
    );

    if (activeWillBeRemoved) {
      emit('clear-image');
      currentFileRef.current = null;
    }

    setQueue(prev => prev.filter(item => {
      if (item.status === 'completed') return false;
      if (!currentFixMode && item.isAlreadyProcessed) return false;
      return true;
    }));
    setCurrentIndex(-1);
    setSelectedFiles(new Set());
  }, [emit]);

  // Clear selected files
  const clearSelected = useCallback(() => {
    const currentQueue = queueRef.current;

    // Check if active file is among selected
    const activeFile = currentQueue.find(item => item.filePath === currentFileRef.current);
    if (activeFile && selectedFiles.has(activeFile.id)) {
      emit('clear-image');
      currentFileRef.current = null;
    }

    setQueue(prev => prev.filter(item => !selectedFiles.has(item.id)));
    setCurrentIndex(-1);
    setSelectedFiles(new Set());
  }, [selectedFiles, emit]);

  // Select all files
  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(queue.map(item => item.id)));
  }, [queue]);

  // Deselect all files
  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  // Toggle file selection
  const toggleFileSelection = useCallback((id) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Track last selected index for shift-click range selection
  const lastSelectedIndexRef = useRef(-1);

  const loadFile = useCallback(async (index) => {
    const currentQueue = queueRef.current;
    debug('FileQueue', '>>> loadFile called', {
      index,
      queueLength: currentQueue.length,
      processedFilesLoaded: processedFilesLoadedRef.current,
      processedFilesSize: processedFiles.size,
      fixMode: fixModeRef.current
    });

    if (index < 0 || index >= currentQueue.length) {
      debug('FileQueue', 'loadFile: Invalid index', index, 'queue length:', currentQueue.length);
      return;
    }

    if (!processedFilesLoadedRef.current) {
      debug('FileQueue', 'loadFile: BLOCKED - processed files not loaded yet');
      return;
    }

    const item = currentQueue[index];
    const currentProcessedFiles = processedFilesRef.current;
    const inSetCheck = currentProcessedFiles.has(item.fileName);
    
    debug('FileQueue', '>>> loadFile checks', {
      fileName: item.fileName,
      'item.isAlreadyProcessed': item.isAlreadyProcessed,
      'processedFilesRef.current.has()': inSetCheck,
      'processedFilesRef.current.size': currentProcessedFiles.size,
      fixMode: fixModeRef.current
    });

    const fileIsProcessed = item.isAlreadyProcessed || inSetCheck;
    const skipAutoDetect = !fixModeRef.current && fileIsProcessed;
    
    debug('FileQueue', '>>> loadFile decision', {
      fileIsProcessed,
      skipAutoDetect,
      'will proceed': !skipAutoDetect
    });

    if (skipAutoDetect) {
      debug('FileQueue', 'loadFile: BLOCKED - file already processed, fix-mode OFF');
      showToast(`${item.fileName} already processed. Enable fix-mode or click 🔄 to reprocess.`, 'info', 5000);
      return;
    }

    const workspace = window.workspace;
    let hasImageViewer = false;

    if (workspace?.model) {
      workspace.model.visitNodes(node => {
        if (node.getComponent?.() === 'image-viewer') {
          hasImageViewer = true;
        }
      });
    }

    if (fixModeRef.current && item.isAlreadyProcessed) {
      try {
        debug('FileQueue', 'Undoing file for fix mode:', item.fileName);
        await api.post('/api/v1/management/undo-file', {
          filename_pattern: item.fileName
        });
        await loadProcessedFiles();
        showToast(`🔄 Undid ${item.fileName}`, 'info', 2500);
      } catch (err) {
        debugError('FileQueue', 'Failed to undo file:', err);
        showToast(`Failed to undo ${item.fileName}`, 'error', 3000);
      }
    }

    setQueue(prev => prev.map((q, i) => ({
      ...q,
      status: i === index ? 'active' : (q.status === 'active' ? 'pending' : q.status)
    })));

    setCurrentIndex(index);
    currentFileRef.current = item.filePath;

    debug('FileQueue', 'Emitting load-image for:', item.filePath, { skipAutoDetect });
    emit('load-image', { imagePath: item.filePath, skipAutoDetect });
    emitQueueStatus(index);
  }, [api, loadProcessedFiles, emit, showToast, emitQueueStatus]);

  loadFileRef.current = loadFile;

  // Force reprocess a file (when fix-mode is OFF but user wants to reprocess)
  const forceReprocess = useCallback(async (index) => {
    const currentQueue = queueRef.current;
    if (index < 0 || index >= currentQueue.length) return;

    const item = currentQueue[index];
    if (!item.isAlreadyProcessed) return;

    debug('FileQueue', 'Force reprocess requested for:', item.fileName);

    try {
      // 1. Undo the file in backend (remove from processed_files.jsonl)
      await api.post('/api/v1/management/undo-file', {
        filename_pattern: item.fileName
      });

      // 2. Clear from preprocessing completed cache
      if (preprocessingManager.current) {
        preprocessingManager.current.removeFile(item.filePath);
      }

      // 3. Refresh processed files list
      await loadProcessedFiles();

      // 4. Update queue item to not be marked as already processed
      setQueue(prev => prev.map((q, i) => 
        i === index ? { ...q, isAlreadyProcessed: false } : q
      ));

      // 5. Add to preprocessing queue with priority
      if (preprocessingManager.current) {
        preprocessingManager.current.addToQueue(item.filePath, { priority: true });
      }

      showToast(`🔄 Reprocessing ${item.fileName}`, 'info', 2500);

      // 6. Load the file
      loadFile(index);
    } catch (err) {
      debugError('FileQueue', 'Failed to force reprocess:', err);
      showToast(`Failed to reprocess ${item.fileName}`, 'error', 3000);
    }
  }, [api, loadProcessedFiles, loadFile, showToast]);

  // Handle file item click with modifier key support
  // Single click = select, Double click = load
  const handleItemClick = useCallback((index, event) => {
    const item = queue[index];
    if (!item) return;

    // Shift+Click: Select range
    if (event.shiftKey && lastSelectedIndexRef.current >= 0) {
      event.preventDefault(); // Prevent text selection
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      const rangeIds = queue.slice(start, end + 1).map(q => q.id);

      setSelectedFiles(prev => {
        const next = new Set(prev);
        rangeIds.forEach(id => next.add(id));
        return next;
      });
      // Don't update lastSelectedIndex on shift-click (keep anchor)
      return;
    }

    // Cmd/Ctrl+Click: Toggle selection without loading
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleFileSelection(item.id);
      lastSelectedIndexRef.current = index;
      return;
    }

    // Single click: Select the file (clear others, select this one)
    lastSelectedIndexRef.current = index;
    setSelectedFiles(new Set([item.id]));
  }, [queue, toggleFileSelection]);

  // Handle double-click to load file
  const handleItemDoubleClick = useCallback((index) => {
    loadFile(index);
  }, [loadFile]);

  // Execute pending auto-load (after loadFile is defined)
  useEffect(() => {
    if (pendingAutoLoad >= 0) {
      const indexToLoad = pendingAutoLoad;
      setPendingAutoLoad(-1); // Clear to prevent re-trigger

      // Wait for workspace to be ready - check immediately, then poll quickly
      const waitForWorkspace = () => {
        if (window.workspace?.openModule) {
          debug('FileQueue', 'Workspace ready, auto-loading file at index', indexToLoad);
          loadFile(indexToLoad);
        } else {
          setTimeout(waitForWorkspace, 50); // Fast polling
        }
      };

      // Start checking immediately (no initial delay)
      waitForWorkspace();
    }
  }, [pendingAutoLoad, loadFile]);

  const advanceToNext = useCallback(() => {
    const currentQueue = queueRef.current;
    const nextIndex = currentQueue.findIndex((item, i) => 
      i !== currentIndex && isFileEligible(item)
    );

    if (nextIndex >= 0) {
      loadFile(nextIndex);
    } else {
      debug('FileQueue', 'No more eligible files');
      setCurrentIndex(-1);
    }
  }, [currentIndex, loadFile, isFileEligible]);

  // Skip current file
  const skipCurrent = useCallback(() => {
    advanceToNext();
  }, [advanceToNext]);

  // Fetch rename preview from backend
  // Uses queueRef to always get current queue (avoids stale closure issues)
  const fetchRenamePreview = useCallback(async () => {
    // Include files eligible for rename:
    // - completed: reviewed this session
    // - isAlreadyProcessed (when fix-mode OFF): already in database, includes active files being re-viewed
    const currentQueue = queueRef.current;
    const currentFixMode = fixModeRef.current;
    const eligiblePaths = currentQueue
      .filter(q => q.status === 'completed' || (!currentFixMode && q.isAlreadyProcessed))
      .map(q => q.filePath);

    if (eligiblePaths.length === 0) {
      setPreviewData({});
      return;
    }

    // Show loading indicator for large batches
    if (eligiblePaths.length > 5) {
      showToast(`Generating name suggestions for ${eligiblePaths.length} files...`, 'info', 2000);
    }

    // Get rename config from preferences
    const renameConfig = getRenameConfig();

    try {
      const result = await api.post('/api/v1/files/rename-preview', {
        file_paths: eligiblePaths,
        config: renameConfig
      });

      // Build lookup: path -> { newName, status, persons, sidecars }
      const lookup = {};
      for (const item of result.items) {
        lookup[item.original_path] = {
          newName: item.new_name,
          status: item.status,
          persons: item.persons || [],
          sidecars: item.sidecars || []
        };
      }
      setPreviewData(lookup);
      debug('FileQueue', 'Fetched rename preview for', eligiblePaths.length, 'files');
    } catch (err) {
      debugError('FileQueue', 'Failed to fetch rename preview:', err);
      setPreviewData({});
    }
  }, [api, showToast]);

  // Ref to prevent double fetch on initial toggle
  const initialPreviewFetchedRef = useRef(false);

  // Handle preview toggle
  const handlePreviewToggle = useCallback(async (e) => {
    const show = e.target.checked;
    setShowPreviewNames(show);

    // Always fetch fresh preview when toggling on to avoid stale data
    if (show) {
      // Mark as fetched to prevent useEffect from also triggering fetch
      initialPreviewFetchedRef.current = true;
      await fetchRenamePreview();
    }
  }, [fetchRenamePreview]);

  // Fetch preview on startup if showPreviewNames was restored as true
  // Wait for preprocessing to complete so backend has the data
  useEffect(() => {
    // Only run once, when showPreviewNames is on and we have eligible files
    if (initialPreviewFetchedRef.current) return;
    if (!showPreviewNames) return;
    if (!isConnected) return;

    // Check if we have eligible files (completed or already-processed)
    const hasEligibleFiles = queue.some(q =>
      q.status === 'completed' || (!fixMode && q.isAlreadyProcessed)
    );
    if (!hasEligibleFiles) return;

    // Check if preprocessing is done for at least some files
    const hasPreprocessedFiles = queue.some(q =>
      preprocessingStatus[q.filePath]?.status === PreprocessingStatus.COMPLETED
    );
    if (!hasPreprocessedFiles && queue.length > 0) return; // Wait for preprocessing

    initialPreviewFetchedRef.current = true;
    debug('FileQueue', 'Fetching preview on startup (showPreviewNames was saved as true)');
    fetchRenamePreview();
  }, [showPreviewNames, isConnected, queue, fixMode, preprocessingStatus, fetchRenamePreview]);

  // Handle rename action
  const handleRename = useCallback(async () => {
    // Include both completed files AND already-processed files (when not in fix-mode)
    const currentFixMode = fixModeRef.current;
    const eligiblePaths = queue
      .filter(q => q.status === 'completed' || (!currentFixMode && q.isAlreadyProcessed))
      .map(q => q.filePath);

    if (eligiblePaths.length === 0) return;

    // Check if confirmation is required
    const requireConfirmation = getRequireRenameConfirmation();

    if (requireConfirmation) {
      // Show confirmation dialog
      const confirmed = window.confirm(
        `Rename ${eligiblePaths.length} file(s)?\n\n` +
        `This will rename files based on detected faces.\n` +
        `Check Preferences for rename format settings.`
      );
      if (!confirmed) return;
    }

    setRenameInProgress(true);

    // Show progress toast
    showToast(`Renaming ${eligiblePaths.length} file(s)...`, 'info', null);

    // Get rename config from preferences
    const renameConfig = getRenameConfig();

    try {
      const result = await api.post('/api/v1/files/rename', {
        file_paths: eligiblePaths,
        config: renameConfig
      });

      debug('FileQueue', 'Rename result:', result);

      const renamedCount = result.renamed?.length || 0;
      const skippedCount = result.skipped?.length || 0;
      const errorCount = result.errors?.length || 0;

      // Update queue with new filenames
      if (renamedCount > 0) {
        const renamedMap = {};
        for (const r of result.renamed) {
          renamedMap[r.original] = r.new;
        }

        setQueue(prev => prev.map(item => {
          if (renamedMap[item.filePath]) {
            const newPath = renamedMap[item.filePath];
            return {
              ...item,
              filePath: newPath,
              fileName: newPath.split('/').pop()
            };
          }
          return item;
        }));

        // Update preprocessingManager state for renamed files
        if (preprocessingManager.current) {
          for (const [oldPath, newPath] of Object.entries(renamedMap)) {
            const cachedData = preprocessingManager.current.getCachedData(oldPath);
            if (cachedData) {
              preprocessingManager.current.removeFile(oldPath);
              preprocessingManager.current.completed.set(newPath, cachedData);
            }
          }
        }

        // Update React preprocessingStatus state
        setPreprocessingStatus(prev => {
          const updated = { ...prev };
          for (const [oldPath, newPath] of Object.entries(renamedMap)) {
            if (updated[oldPath]) {
              updated[newPath] = updated[oldPath];
              delete updated[oldPath];
            }
          }
          return updated;
        });
      }

      // Refresh preview data to get updated info for renamed files
      setPreviewData(null);
      if (showPreviewNames) {
        // Re-fetch after delay to allow queue state to update
        setTimeout(() => fetchRenamePreview(), 300);
      }

      // Show toast notification
      let message = `Renamed ${renamedCount} file(s)`;
      if (skippedCount > 0) message += ` · ${skippedCount} skipped`;
      if (errorCount > 0) message += ` · ${errorCount} error(s)`;
      showToast(message, errorCount > 0 ? 'warning' : 'success');

    } catch (err) {
      debugError('FileQueue', 'Rename failed:', err);
      showToast(`Rename failed: ${err.message}`, 'error');
    } finally {
      setRenameInProgress(false);
    }
  }, [queue, api, showPreviewNames, fetchRenamePreview, showToast]);

  // Listen for review-complete event
  useModuleEvent('review-complete', useCallback(({ imagePath, success, reviewedFaces }) => {
    debug('FileQueue', 'Review complete:', imagePath, success, 'faces:', reviewedFaces?.length);

    if (success && preprocessingManager.current) {
      preprocessingManager.current.markDone(imagePath);
    }

    if (currentFileRef.current === imagePath) {
      const currentQueue = queueRef.current;
      const currentIdx = currentQueue.findIndex(item => item.filePath === imagePath);
      const fileName = imagePath.split('/').pop();
      const faceCount = reviewedFaces?.length || 0;

      const nextIdx = currentQueue.findIndex((item) => 
        item.filePath !== imagePath && isFileEligible(item)
      );

      debug('FileQueue', 'Current index:', currentIdx, 'Next index:', nextIdx, 'Queue length:', currentQueue.length);

      setQueue(prev => prev.map(item => {
        if (item.filePath === imagePath) {
          return {
            ...item,
            status: success ? 'completed' : 'error',
            reviewedFaces: reviewedFaces || []
          };
        }
        return item;
      }));

      const prevDone = currentQueue.filter(q => q.status === 'completed').length;
      const newDone = success ? prevDone + 1 : prevDone;
      emit('queue-status', {
        total: currentQueue.length,
        current: nextIdx >= 0 ? nextIdx : currentIdx,
        done: newDone,
        remaining: Math.max(0, currentQueue.length - newDone)
      });

      // Show toast for review result
      if (success) {
        showToast(`Saved review for ${fileName} (${faceCount} face${faceCount !== 1 ? 's' : ''})`, 'success', 2500);
      } else {
        showToast(`Failed to save review for ${fileName}`, 'error', 4000);
      }

      // Clear preview data when queue changes (force re-fetch)
      setPreviewData(null);

      // If showing preview names, re-fetch after a short delay
      if (showPreviewNames) {
        setTimeout(() => fetchRenamePreview(), 200);
      }

      // Refresh processed files list
      loadProcessedFiles();

      // Auto-advance to next
      if (autoAdvance && nextIdx >= 0) {
        debug('FileQueue', 'Auto-advancing to index:', nextIdx);
        setTimeout(() => loadFile(nextIdx), 300);
      } else if (nextIdx < 0) {
        debug('FileQueue', 'No more pending files (or all skipped due to fix-mode OFF)');
        setCurrentIndex(-1);
        // Show queue complete toast
        showToast('🎉 Queue complete - all files reviewed!', 'success', 4000);
      }
    }
  }, [autoAdvance, loadFile, loadProcessedFiles, showToast, emit, isFileEligible]));

  // Listen for faces-detected event to update face count for the detected file
  // This updates the face count when detection completes (not just from preprocessing)
  // Uses imagePath from event to avoid race conditions when user clicks another file during detection
  useModuleEvent('faces-detected', useCallback(({ faces, imagePath }) => {
    if (!imagePath) return;

    const faceCount = faces?.length ?? 0;
    debug('FileQueue', 'Faces detected for file:', imagePath, `(${faceCount} faces)`);

    // Update preprocessing status with actual detected face count
    setPreprocessingStatus(prev => ({
      ...prev,
      [imagePath]: {
        ...(prev[imagePath] || {}),
        status: PreprocessingStatus.COMPLETED,
        faceCount
      }
    }));
  }, []));

  // Open file dialog
  const openFileDialog = useCallback(async () => {
    try {
      // Try multi-file dialog first
      let filePaths = await window.bildvisareAPI?.invoke('open-multi-file-dialog');

      // Fall back to single file dialog
      if (!filePaths) {
        const singlePath = await window.bildvisareAPI?.invoke('open-file-dialog');
        if (singlePath) {
          filePaths = [singlePath];
        }
      }

      if (filePaths && filePaths.length > 0) {
        addFiles(filePaths);

        if (queue.length === 0 && filePaths.length > 0) {
          setTimeout(() => startNextEligible(), 100);
        }
      }
    } catch (err) {
      debugError('FileQueue', 'Failed to open file dialog:', err);
    }
  }, [addFiles, queue.length, loadFile]);

  // Open folder dialog
  const openFolderDialog = useCallback(async () => {
    try {
      const filePaths = await window.bildvisareAPI?.invoke('open-folder-dialog');

      if (filePaths && filePaths.length > 0) {
        addFiles(filePaths);

        if (queue.length === 0 && filePaths.length > 0) {
          setTimeout(() => startNextEligible(), 100);
        }
      }
    } catch (err) {
      debugError('FileQueue', 'Failed to open folder dialog:', err);
    }
  }, [addFiles, queue.length, loadFile]);

  useEffect(() => {
    const handleQueueFiles = ({ files, position, startQueue }) => {
      debug('FileQueue', `Received ${files.length} files from main process (position: ${position})`);
      addFiles(files, position || 'default');
      if (startQueue && files.length > 0) {
        setTimeout(() => startNextEligible(), 100);
      }
    };

    window.bildvisareAPI?.on('queue-files', handleQueueFiles);
  }, [addFiles, startNextEligible]);

  // Expose fileQueue API globally for programmatic access
  useEffect(() => {
    // Helper to expand glob patterns
    const expandAndAdd = async (pattern, position) => {
      if (pattern.includes('*') || pattern.includes('?')) {
        // It's a glob pattern - expand it
        const files = await window.bildvisareAPI?.invoke('expand-glob', pattern);
        if (files && files.length > 0) {
          addFiles(files, position);
          debug('FileQueue', `Expanded glob "${pattern}" to ${files.length} files`);
        } else {
          debugWarn('FileQueue', `No files matched pattern "${pattern}"`);
        }
      } else {
        // Direct path(s)
        addFiles(Array.isArray(pattern) ? pattern : [pattern], position);
      }
    };

    window.fileQueue = {
      add: (pattern, position = 'default') => expandAndAdd(pattern, position),
      addToStart: (pattern) => expandAndAdd(pattern, 'start'),
      addToEnd: (pattern) => expandAndAdd(pattern, 'end'),
      addSorted: (pattern) => expandAndAdd(pattern, 'sorted'),
      sort: sortQueue,
      clear: clearQueue,
      clearCompleted: clearCompleted,
      loadFile: loadFile,
      start: () => startNextEligible({ showToastIfNone: false }),
      getQueue: () => queueRef.current,
      getCurrentIndex: () => currentIndex
    };
    return () => { delete window.fileQueue; };
  }, [addFiles, sortQueue, clearQueue, clearCompleted, loadFile, startNextEligible, currentIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (currentIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector('.file-item.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Cmd/Ctrl+A - select all files (prevent text selection)
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        // Check if file-queue-module has focus or contains the active element
        const module = moduleRef.current;
        const hasFocus = module && (
          module === document.activeElement ||
          module.contains(document.activeElement)
        );
        if (hasFocus) {
          e.preventDefault();
          e.stopPropagation();
          if (selectedFiles.size === queue.length && queue.length > 0) {
            deselectAll();
          } else {
            selectAll();
          }
          return;
        }
      }

      // N - next file
      if (e.key === 'n' || e.key === 'N') {
        if (!e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          advanceToNext();
        }
      }

      // P - previous file
      if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const prevIndex = currentIndex - 1;
        if (prevIndex >= 0) {
          loadFile(prevIndex);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [advanceToNext, currentIndex, loadFile, queue, selectedFiles.size, selectAll, deselectAll]);

  // Calculate stats
  // When fix-mode is OFF, already-processed files count as "done" (they're skipped)
  // When fix-mode is ON, only actually completed files count
  const completedCount = queue.filter(q =>
    q.status === 'completed' || (!fixMode && q.isAlreadyProcessed)
  ).length;
  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const activeCount = queue.filter(q => q.status === 'active').length;

  const hasSelection = selectedFiles.size > 0;

  const displayOrder = useMemo(() => {
    return queue.map((item, i) => ({ item, originalIndex: i }));
  }, [queue]);

  const activeFile = currentIndex >= 0 ? queue[currentIndex] : null;

  return (
    <div ref={moduleRef} className={`module-container file-queue-module ${hasSelection ? 'has-selection' : ''}`} tabIndex={0}>
      {/* Header */}
      <div className="module-header">
        <span className="module-title">File Queue</span>
        <div className="file-queue-actions">
          <button
            className="btn-icon"
            onClick={openFileDialog}
            title="Add files"
          >
            <Icon name="plus" size={14} />
          </button>
          <button
            className="btn-icon"
            onClick={openFolderDialog}
            title="Add folder"
          >
            <Icon name="folder-plus" size={14} />
          </button>
          <button
            className="btn-icon"
            onClick={sortQueue}
            title="Sort queue alphabetically"
            disabled={queue.length < 2}
          >
            <Icon name="sort" size={14} />
          </button>
          <button
            className="btn-icon"
            onClick={() => setAutoAdvance(!autoAdvance)}
            title={autoAdvance ? 'Auto-advance ON' : 'Auto-advance OFF'}
          >
            <Icon name={autoAdvance ? 'play' : 'pause'} size={14} />
          </button>
        </div>
      </div>

      {/* Fix mode toggle */}
      <div className="file-queue-toolbar">
        <label className="fix-mode-toggle">
          <input
            type="checkbox"
            checked={fixMode}
            onChange={(e) => setFixMode(e.target.checked)}
          />
          <span>Fix mode</span>
        </label>
        {completedCount > 0 && (
          <label className="preview-toggle">
            <input
              type="checkbox"
              checked={showPreviewNames}
              onChange={handlePreviewToggle}
            />
            <span>Show new names</span>
          </label>
        )}
        {queue.length > 0 && (
          <>
            {selectedFiles.size > 0 && (
              <button
                className="btn-secondary"
                onClick={clearSelected}
                title="Clear selected files"
              >
                Clear selected
              </button>
            )}
            {completedCount > 0 && selectedFiles.size === 0 && (
              <button
                className="btn-secondary"
                onClick={clearCompleted}
                title="Clear completed files"
              >
                Clear done
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={clearQueue}
              title="Clear all files from queue"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Current file status bar */}
      {activeFile && (
        <div className="current-file-bar" onClick={() => {
          const activeEl = listRef.current?.querySelector('.file-item.active');
          activeEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}>
          <Icon name="play" size={12} />
          <span className="current-file-name">{activeFile.fileName}</span>
          <span className="current-file-hint">click to scroll</span>
        </div>
      )}

      {/* File list */}
      <div ref={listRef} className="module-body file-queue-list">
        {queue.length === 0 ? (
          <div className="empty-state">
            <p>No files in queue</p>
            <p className="hint">Click + to add files</p>
          </div>
        ) : (
          displayOrder.map(({ item, originalIndex }) => (
            <FileQueueItem
              key={item.id}
              item={item}
              index={originalIndex}
              isActive={originalIndex === currentIndex}
              isSelected={selectedFiles.has(item.id)}
              onClick={(e) => handleItemClick(originalIndex, e)}
              onDoubleClick={() => handleItemDoubleClick(originalIndex)}
              onToggleSelect={() => toggleFileSelection(item.id)}
              onRemove={() => removeFile(item.id)}
              onForceReprocess={() => forceReprocess(originalIndex)}
              fixMode={fixMode}
              preprocessingStatus={preprocessingStatus[item.filePath]}
              showPreview={showPreviewNames}
              previewInfo={previewData?.[item.filePath]}
            />
          ))
        )}
      </div>

      {/* Footer with progress */}
      {queue.length > 0 && (
        <div className="module-footer file-queue-footer">
          <div className="file-queue-progress">
            <span className="progress-text">
              {completedCount}/{queue.length}
            </span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(completedCount / queue.length) * 100}%` }}
              />
            </div>
          </div>
          {getNotificationPreference('showStatusIndicator') && (
            <div className="preprocessing-status">
              {preprocessingPaused ? (
                <span className="status-paused" title="Preprocessing paused - buffer full">
                  <Icon name="layers" size={12} /> Buffered
                </span>
              ) : queue.some(q => {
                const status = preprocessingStatus[q.filePath];
                return status && status.status !== PreprocessingStatus.COMPLETED &&
                       status.status !== PreprocessingStatus.ERROR &&
                       status.status !== PreprocessingStatus.FILE_NOT_FOUND;
              }) ? (
                <span className="status-active" title="Preprocessing in progress">
                  <Icon name="refresh" size={12} className="spinning" /> Processing
                </span>
              ) : (
                <span className="status-ready" title="All files preprocessed">
                  <Icon name="check" size={12} /> Ready
                </span>
              )}
            </div>
          )}
          <div className="file-queue-controls">
            {completedCount > 0 && (
              <button
                className="btn-secondary"
                onClick={handleRename}
                disabled={renameInProgress}
                title="Rename files based on detected faces"
              >
                {renameInProgress ? 'Renaming...' : `Rename (${completedCount})`}
              </button>
            )}
            {currentIndex >= 0 ? (
              <button className="btn-secondary" onClick={skipCurrent}>
                Skip <Icon name="skip-next" size={12} />
              </button>
            ) : queue.some(isFileEligible) ? (
              <button className="btn-action" onClick={() => startNextEligible({ showToastIfNone: false })}>
                Start <Icon name="play" size={12} />
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * FileQueueItem Component
 */
function FileQueueItem({ item, index, isActive, isSelected, onClick, onDoubleClick, onToggleSelect, onRemove, onForceReprocess, fixMode, preprocessingStatus, showPreview, previewInfo }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const itemRef = useRef(null);
  const tooltipTimerRef = useRef(null);

  const handleMouseEnter = (e) => {
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      setTooltipPos({ x: rect.left, y: rect.bottom + 4 });
    }
    tooltipTimerRef.current = setTimeout(() => setShowTooltip(true), 400);
  };

  const handleMouseLeave = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setShowTooltip(false);
  };

  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, []);
  const getStatusIcon = () => {
    switch (item.status) {
      case 'completed':
        return <span className="status-icon completed"><Icon name="check" size={12} /></span>;
      case 'active':
        return <span className="status-icon active"><Icon name="play" size={12} /></span>;
      case 'error':
        return <span className="status-icon error"><Icon name="close" size={12} /></span>;
      case 'missing':
        return <span className="status-icon missing" title="File not found"><Icon name="warning" size={12} /></span>;
      default:
        if (item.isAlreadyProcessed) {
          if (fixMode) {
            // Fix-mode ON: same icon as pending, but with green tint
            return <span className="status-icon pending-reprocess"><Icon name="circle" size={12} /></span>;
          } else {
            // Fix-mode OFF: checkmark to show "already done"
            return <span className="status-icon already-done"><Icon name="check" size={12} /></span>;
          }
        }
        return <span className="status-icon pending"><Icon name="circle" size={12} /></span>;
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case 'completed': return 'Done';
      case 'active': return 'Active';
      case 'error': return 'Error';
      case 'missing': return 'Not found';
      default:
        if (item.isAlreadyProcessed) {
          return fixMode ? 'Queued (reprocess)' : 'Processed';
        }
        return 'Queued';
    }
  };

  // Get preprocessing indicator
  // preprocessingStatus is now an object: { status, faceCount }
  const ppStatus = preprocessingStatus?.status || preprocessingStatus; // Handle both formats
  const ppFaceCount = preprocessingStatus?.faceCount;

  const getPreprocessingIndicator = () => {
    // No status recorded yet
    if (!ppStatus) {
      return null;
    }
    // Show checkmark for completed preprocessing
    if (ppStatus === PreprocessingStatus.COMPLETED) {
      return <Icon name="bolt" size={14} className="preprocess-indicator completed" title="Cached" />;
    }
    if (ppStatus === PreprocessingStatus.FILE_NOT_FOUND) {
      return null; // Status already shown in main icon
    }
    if (ppStatus === PreprocessingStatus.ERROR) {
      return <span className="preprocess-indicator error" title="Preprocessing failed">!</span>;
    }
    // Show spinner for any in-progress state
    return <Icon name="refresh" size={14} className="preprocess-indicator loading" title={`Preprocessing: ${ppStatus}`} />;
  };

  // Truncate filename for display (Unicode-safe, preserves extension)
  const truncateFilename = (name, maxLen = 25) => {
    const chars = [...name]; // Spread to handle multi-byte Unicode correctly
    if (chars.length <= maxLen) return name;
    const lastDotIndex = name.lastIndexOf('.');
    const hasExt = lastDotIndex !== -1;
    const ext = hasExt ? name.slice(lastDotIndex) : '';
    const base = hasExt ? name.slice(0, lastDotIndex) : name;
    const baseChars = [...base];
    const extLen = [...ext].length;
    const availableForBase = Math.max(0, maxLen - 3 - extLen);
    const truncatedBase = baseChars.slice(0, availableForBase).join('');
    return truncatedBase + '...' + ext;
  };

  // Show preview info if available (for completed or already-processed files)
  // Don't show if new name is identical to current name (nothing would change)
  const newName = previewInfo?.newName;
  const previewStatus = previewInfo?.status;
  const nameWouldChange = newName && newName !== item.fileName;
  const shouldShowPreview = showPreview && (item.status === 'completed' || item.isAlreadyProcessed) && previewInfo;

  // Face count priority: reviewedFaces (from review-complete) > ppFaceCount (from preprocessing)
  // Using || instead of ?? because ppFaceCount=0 might be stale (race with faces-detected)
  const reviewedCount = item.reviewedFaces?.length;
  const detectedFaceCount = reviewedCount > 0 ? reviewedCount : (ppFaceCount || null);
  const hasDetectedFaces = detectedFaceCount !== null;

  // Confirmed names: previewInfo (rename) > reviewedFaces (this session) > preprocessingStatus (from file stats)
  const ppPersons = preprocessingStatus?.persons;
  const confirmedNames = previewInfo?.persons || item.reviewedFaces?.map(f => f.personName).filter(Boolean) || ppPersons || [];
  const confirmedCount = confirmedNames.length;

  // Sidecars from rename preview
  const sidecars = previewInfo?.sidecars || [];
  const hasSidecars = sidecars.length > 0;

  return (
    <div
      ref={itemRef}
      className={`file-item ${item.status} ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''} ${item.isAlreadyProcessed ? 'already-processed' : ''} ${shouldShowPreview ? 'with-preview' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <input
        type="checkbox"
        className="file-select-checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        onClick={(e) => e.stopPropagation()}
      />
      {getStatusIcon()}
      {/* Wrapper for file name + preview to maintain consistent right-column alignment */}
      <div className="file-name-area">
        <span className="file-name">
          {truncateFilename(item.fileName)}
          {hasSidecars && shouldShowPreview && (
            <span className="sidecar-indicator" title={sidecars.map(s => s.split('/').pop()).join(', ')}>
              {/* Show extension badges for each sidecar */}
              {[...new Set(sidecars.map(s => s.split('.').pop().toLowerCase()))].map(ext => (
                <span key={ext} className="sidecar-badge">{ext}</span>
              ))}
            </span>
          )}
        </span>
        {/* Inline preview of new name (only if name would actually change) */}
        {shouldShowPreview && nameWouldChange && (
          <span className="inline-preview">
            <span className="arrow">→</span>
            <span className="new-name">{truncateFilename(newName, 30)}</span>
          </span>
        )}
        {shouldShowPreview && !newName && previewStatus && previewStatus !== 'ok' && (
          <span className={`inline-preview ${previewStatus === 'no_persons' || previewStatus === 'already_renamed' ? 'muted' : 'error'}`}>
            <span className="arrow">→</span>
            <span className={previewStatus === 'no_persons' || previewStatus === 'already_renamed' ? 'preview-muted' : 'preview-error'}>
              {previewStatus === 'no_persons' ? '(no persons)' :
               previewStatus === 'already_renamed' ? '(already renamed)' :
               previewStatus}
            </span>
          </span>
        )}
      </div>
      {/* Fixed-width columns for alignment */}
      <span className="preprocess-col">
        {getPreprocessingIndicator()}
      </span>
      <span className="face-count" title={confirmedNames.length > 0 ? `Confirmed: ${confirmedNames.join(', ')}` : (hasDetectedFaces ? `${detectedFaceCount} detected` : 'Not loaded')}>
        <Icon name="user" size={12} />{hasDetectedFaces ? detectedFaceCount : '–'}
      </span>
      <span className="file-status">{getStatusText()}</span>
      {!fixMode && item.isAlreadyProcessed ? (
        <button
          className="reprocess-btn"
          onClick={(e) => {
            e.stopPropagation();
            onForceReprocess();
          }}
          title="Reprocess this file"
        >
          <Icon name="refresh" size={12} />
        </button>
      ) : (
        <span className="reprocess-btn-placeholder" />
      )}
      <button
        className="remove-btn"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove from queue"
      >
        ×
      </button>

      {/* Unified tooltip */}
      {showTooltip && (
        <div
          className="file-tooltip"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="tooltip-row">
            <span className="tooltip-label">File:</span>
            <span className="tooltip-value">{item.fileName}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Folder:</span>
            <span className="tooltip-value tooltip-path">{item.filePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '')}</span>
          </div>
          {hasDetectedFaces && (
            <div className="tooltip-row">
              <span className="tooltip-label">Detected:</span>
              <span className="tooltip-value">{detectedFaceCount} face{detectedFaceCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {confirmedCount > 0 && (
            <div className="tooltip-row">
              <span className="tooltip-label">Confirmed ({confirmedCount}):</span>
              <span className="tooltip-value">{confirmedNames.join(', ')}</span>
            </div>
          )}
          {shouldShowPreview && nameWouldChange && (
            <div className="tooltip-row tooltip-newname">
              <span className="tooltip-label">New name:</span>
              <span className="tooltip-value">{newName}</span>
            </div>
          )}
          {shouldShowPreview && hasSidecars && (
            <div className="tooltip-row tooltip-sidecars">
              <span className="tooltip-label">Sidecars ({sidecars.length}):</span>
              <span className="tooltip-value">{sidecars.map(s => s.split('/').pop()).join(', ')}</span>
            </div>
          )}
          {shouldShowPreview && !newName && previewStatus && (
            <div className="tooltip-row tooltip-error">
              <span className="tooltip-label">Rename:</span>
              <span className="tooltip-value">{previewStatus}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FileQueueModule;
