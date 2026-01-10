/**
 * API Client
 *
 * HTTP and WebSocket client for communicating with the FastAPI backend.
 * Provides methods for REST API calls and WebSocket event streaming.
 */

import { debug, debugWarn, debugError } from './debug.js';

export class APIClient {
  constructor(baseUrl = 'http://127.0.0.1:5001') {
    this.baseUrl = baseUrl;
    this.ws = null;
    this.wsHandlers = new Map();
    this.connectionListeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000; // Cap at 30 seconds
    this.isConnecting = false;
    this._connected = false;
    this._shouldReconnect = true; // Flag to prevent reconnection on intentional disconnect
  }

  addConnectionListener(callback) {
    this.connectionListeners.add(callback);
    callback(this._connected);
  }

  removeConnectionListener(callback) {
    this.connectionListeners.delete(callback);
  }

  _notifyConnectionListeners(connected) {
    this._connected = connected;
    this.connectionListeners.forEach(cb => {
      try {
        cb(connected);
      } catch (e) {
        debugError('APIClient', 'Connection listener error:', e);
      }
    });
  }

  /**
   * HTTP GET request
   * @param {string} path - API path (e.g., '/api/v1/status/image.jpg')
   * @param {object} params - Query parameters
   * @returns {Promise<any>}
   */
  async get(path, params = {}) {
    const url = new URL(path, this.baseUrl);

    // Add query parameters
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      debugError('Backend', `GET ${path} failed:`, err);
      throw err;
    }
  }

  /**
   * HTTP POST request
   * @param {string} path - API path (e.g., '/api/v1/detect-faces')
   * @param {object} body - Request body
   * @returns {Promise<any>}
   */
  async post(path, body = {}) {
    const url = new URL(path, this.baseUrl);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      debugError('Backend', `POST ${path} failed:`, err);
      throw err;
    }
  }

  /**
   * Check backend health
   * @returns {Promise<boolean>}
   */
  async health() {
    try {
      const response = await this.get('/health');
      return response.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   * @returns {Promise<void>}
   */
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      debug('WebSocket', 'WebSocket already connected');
      return Promise.resolve();
    }

    if (this.isConnecting) {
      debug('WebSocket', 'WebSocket connection already in progress');
      return Promise.resolve();
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      const url = `${wsUrl}/ws/progress`;

      debug('WebSocket', 'Connecting to WebSocket:', url);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        debug('WebSocket', 'WebSocket connected');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this._shouldReconnect = true; // Re-enable reconnection on successful connect
        this.isConnecting = false;
        this._notifyConnectionListeners(true);
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { event: eventName, data } = message;

          // Trigger all registered handlers for this event
          if (this.wsHandlers.has(eventName)) {
            this.wsHandlers.get(eventName).forEach(callback => {
              try {
                callback(data);
              } catch (err) {
                debugError('WebSocket', `Error in WebSocket handler for ${eventName}:`, err);
              }
            });
          }
        } catch (err) {
          debugError('WebSocket', 'Error parsing WebSocket message:', err);
        }
      };

      this.ws.onerror = (error) => {
        debugError('WebSocket', 'WebSocket error:', error);
        this.isConnecting = false;
        reject(error);
      };

      this.ws.onclose = () => {
        debug('WebSocket', 'WebSocket disconnected');
        this.isConnecting = false;
        this._notifyConnectionListeners(false);

        // Don't reconnect if intentionally disconnected
        if (!this._shouldReconnect) {
          debug('WebSocket', 'Reconnection disabled');
          return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;

          // Exponential backoff with cap and jitter
          let delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
          delay = Math.min(delay, this.maxReconnectDelay); // Cap at max

          // Add ±20% jitter to prevent thundering herd
          const jitter = delay * 0.2 * (Math.random() * 2 - 1);
          delay = Math.round(delay + jitter);

          debug('WebSocket', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

          setTimeout(() => {
            this.connectWebSocket().catch(err => {
              debugError('WebSocket', 'Reconnection failed:', err);
            });
          }, delay);
        } else {
          debugError('WebSocket', 'Max reconnection attempts reached');
        }
      };
    });
  }

  /**
   * Subscribe to WebSocket event
   * @param {string} eventName - Event name (e.g., 'log-entry', 'face-detected')
   * @param {Function} callback - Callback function
   */
  onWSEvent(eventName, callback) {
    if (!this.wsHandlers.has(eventName)) {
      this.wsHandlers.set(eventName, new Set());
    }
    this.wsHandlers.get(eventName).add(callback);
  }

  /**
   * Unsubscribe from WebSocket event
   * @param {string} eventName - Event name
   * @param {Function} callback - Callback function
   */
  offWSEvent(eventName, callback) {
    if (this.wsHandlers.has(eventName)) {
      this.wsHandlers.get(eventName).delete(callback);
    }
  }

  /**
   * Disconnect WebSocket
   * @param {boolean} allowReconnect - Whether to allow automatic reconnection after disconnect.
   *   - false (default): Disconnect permanently, no auto-reconnect
   *   - true: Disconnect but allow auto-reconnect (e.g., for temporary network issues)
   */
  disconnectWebSocket(allowReconnect = false) {
    this._shouldReconnect = allowReconnect;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if WebSocket is connected
   * @returns {boolean}
   */
  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Detect faces in an image
   * @param {string} imagePath - Path to image file
   * @param {boolean} forceReprocess - Force reprocessing even if cached
   * @returns {Promise<object>}
   */
  async detectFaces(imagePath, forceReprocess = false) {
    return await this.post('/api/v1/detect-faces', {
      image_path: imagePath,
      force_reprocess: forceReprocess
    });
  }

  /**
   * Confirm face identity
   * @param {string} faceId - Face identifier
   * @param {string} personName - Person name
   * @param {string} imagePath - Source image path
   * @returns {Promise<object>}
   */
  async confirmIdentity(faceId, personName, imagePath) {
    return await this.post('/api/v1/confirm-identity', {
      face_id: faceId,
      person_name: personName,
      image_path: imagePath
    });
  }

  /**
   * Ignore/reject a face
   * @param {string} faceId - Face identifier
   * @param {string} imagePath - Source image path
   * @returns {Promise<object>}
   */
  async ignoreFace(faceId, imagePath) {
    return await this.post('/api/v1/ignore-face', {
      face_id: faceId,
      image_path: imagePath
    });
  }

  /**
   * Get image processing status
   * @param {string} imagePath - Path to image file
   * @returns {Promise<object>}
   */
  async getImageStatus(imagePath) {
    // Encode path for URL
    const encodedPath = encodeURIComponent(imagePath);
    return await this.get(`/api/status/${encodedPath}`);
  }

  /**
   * Get list of people in database
   * @returns {Promise<Array>}
   */
  async getPeople() {
    return await this.get('/api/v1/database/people');
  }

  /**
   * Get list of person names (for autocomplete)
   * @returns {Promise<Array<string>>}
   */
  async getPeopleNames() {
    return await this.get('/api/v1/database/people/names');
  }

  // ============================================================================
  // Preprocessing API
  // ============================================================================

  /**
   * Get preprocessing cache status
   * @returns {Promise<object>}
   */
  async getCacheStatus() {
    return await this.get('/api/v1/preprocessing/cache/status');
  }

  /**
   * Update cache settings
   * @param {object} settings - Settings to update
   * @returns {Promise<object>}
   */
  async updateCacheSettings(settings) {
    return await this.post('/api/v1/preprocessing/cache/settings', settings);
  }

  /**
   * Clear preprocessing cache
   * @returns {Promise<object>}
   */
  async clearCache() {
    const url = new URL('/api/v1/preprocessing/cache', this.baseUrl);
    const response = await fetch(url.toString(), { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Delete multiple cache entries by hash
   * @param {string[]} fileHashes - Array of file hashes to delete
   * @returns {Promise<object>}
   */
  async batchDeleteCache(fileHashes) {
    return await this.post('/api/v1/preprocessing/cache/batch-delete', { file_hashes: fileHashes });
  }

  /**
   * Set priority hashes for cache eviction (files in queue evicted last)
   * @param {string[]} fileHashes - Array of file hashes to prioritize
   * @returns {Promise<object>}
   */
  async setPriorityCacheHashes(fileHashes) {
    return await this.post('/api/v1/preprocessing/cache/priority', { file_hashes: fileHashes });
  }

  /**
   * Compute file hash
   * @param {string} filePath - Path to file
   * @returns {Promise<object>}
   */
  async computeFileHash(filePath) {
    return await this.post('/api/v1/preprocessing/hash', { file_path: filePath });
  }

  /**
   * Check what's cached for a file
   * @param {string} fileHash - File hash
   * @returns {Promise<object>}
   */
  async checkCache(fileHash) {
    return await this.post('/api/v1/preprocessing/check', { file_hash: fileHash });
  }

  /**
   * Preprocess file (all steps)
   * @param {string} filePath - Path to file
   * @param {string[]} steps - Optional: specific steps to run
   * @returns {Promise<object>}
   */
  async preprocessFile(filePath, steps = null) {
    return await this.post('/api/v1/preprocessing/all', {
      file_path: filePath,
      steps: steps
    });
  }
}

// Singleton instance
export const apiClient = new APIClient();
