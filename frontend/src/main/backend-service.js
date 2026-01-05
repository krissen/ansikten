/**
 * Backend Service Manager
 *
 * Manages the FastAPI backend server lifecycle:
 * - Auto-start on app launch
 * - Health check polling
 * - Graceful shutdown
 *
 * In development: Uses system Python with uvicorn
 * In production (packaged): Uses bundled PyInstaller executable
 */

const { spawn } = require('child_process');
const { app } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DEBUG = true;

class BackendService {
  constructor() {
    this.process = null;
    this.port = parseInt(process.env.BILDVISARE_PORT || '5001');
    this.host = '127.0.0.1';
    this.maxRetries = 30;
    this.retryDelay = 1000;
    this.onStatusUpdate = null;
  }

  _updateStatus(message, progress = null) {
    if (typeof this.onStatusUpdate === 'function') {
      this.onStatusUpdate(message, progress);
    }
  }

  /**
   * Get the path to the backend executable or Python
   * @returns {{ executable: string, args: string[], cwd: string, env: object }}
   */
  getBackendConfig() {
    const isPackaged = app.isPackaged;

    if (isPackaged) {
      // Production: Use bundled PyInstaller executable
      const resourcesPath = process.resourcesPath;
      const execName = process.platform === 'win32' ? 'bildvisare-backend.exe' : 'bildvisare-backend';
      const backendPath = path.join(resourcesPath, 'backend', execName);

      console.log('[BackendService] Running in packaged mode');
      console.log('[BackendService] Backend path:', backendPath);

      if (!fs.existsSync(backendPath)) {
        throw new Error(`Bundled backend not found at: ${backendPath}`);
      }

      return {
        executable: backendPath,
        args: [
          '--host', this.host,
          '--port', this.port.toString()
        ],
        cwd: path.dirname(backendPath),
        env: {
          ...process.env,
          BILDVISARE_PORT: this.port.toString()
        }
      };
    } else {
      // Development: Use system Python with uvicorn
      const backendDir = path.join(__dirname, '../../../backend');

      // Try to find Python in common locations
      const pythonPaths = [
        process.env.BILDVISARE_PYTHON,  // Custom path via env var
        '/Users/krisniem/.local/share/miniforge3/envs/hitta_ansikten/bin/python3',  // Dev default
        'python3',  // System Python
        'python',   // Fallback
      ].filter(Boolean);

      let pythonPath = pythonPaths[0];
      for (const p of pythonPaths) {
        try {
          if (p.includes('/') && fs.existsSync(p)) {
            pythonPath = p;
            break;
          }
        } catch (e) {
          // Continue to next
        }
      }

      console.log('[BackendService] Running in development mode');
      console.log('[BackendService] Python path:', pythonPath);

      return {
        executable: pythonPath,
        args: [
          '-m', 'uvicorn',
          'api.server:app',
          '--host', this.host,
          '--port', this.port.toString(),
          '--log-level', 'info'
        ],
        cwd: backendDir,
        env: {
          ...process.env,
          PYTHONPATH: backendDir,
          BILDVISARE_PORT: this.port.toString()
        }
      };
    }
  }

  /**
   * Start the FastAPI backend server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.process) {
      console.log('[BackendService] Server already running');
      return;
    }

    console.log('[BackendService] Starting FastAPI backend...');

    const config = this.getBackendConfig();

    // Spawn backend process
    this.process = spawn(
      config.executable,
      config.args,
      {
        cwd: config.cwd,
        env: config.env,
        stdio: 'pipe'
      }
    );

    // Forward stdout/stderr to console (with filtering)
    this.process.stdout.on('data', (data) => {
      if (DEBUG) {
        const output = data.toString().trim();
        // Skip noisy polling endpoints (only successful GET requests)
        // Format: INFO: 127.0.0.1:PORT - "GET /api/statistics/summary HTTP/1.1" 200 OK
        if (output.includes('GET /api/statistics/summary') && output.includes('200')) {
          return;
        }
        console.log(`[Backend] ${output}`);
      }
    });

    this.process.stderr.on('data', (data) => {
      console.error(`[Backend] ${data.toString().trim()}`);
    });

    this.process.on('error', (err) => {
      console.error('[BackendService] Failed to start server:', err);
    });

    this.process.on('exit', (code, signal) => {
      console.log(`[BackendService] Server exited (code: ${code}, signal: ${signal})`);
      this.process = null;
    });

    // Wait for server to be ready
    await this.waitForReady();
    console.log('[BackendService] Backend server ready');
  }

  /**
   * Wait for backend server to be ready by polling /health endpoint
   * @returns {Promise<void>}
   */
  async waitForReady() {
    console.log('[BackendService] Starting backend server, please wait...');
    this._updateStatus('Initierar Python...', 10);

    await new Promise(resolve => setTimeout(resolve, 2000));

    for (let i = 0; i < this.maxRetries; i++) {
      const isHealthy = await this.checkHealth();
      if (isHealthy) {
        console.log(`[BackendService] Backend server ready! (took ${(i + 1) * this.retryDelay / 1000}s)`);
        this._updateStatus('Backend redo!', 80);
        return;
      }

      const progress = Math.min(10 + (i / this.maxRetries) * 60, 70);
      if (i === 0) {
        this._updateStatus('Laddar Python-moduler...', progress);
      } else if (i === 3) {
        this._updateStatus('Startar FastAPI...', progress);
      } else if (i === 6) {
        this._updateStatus('Startar webbserver...', progress);
      } else if (i > 10) {
        this._updateStatus('Väntar på backend...', progress);
      }

      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    }

    throw new Error('Backend server failed to start within timeout');
  }

  /**
   * Check if backend server is healthy
   * @returns {Promise<boolean>}
   */
  checkHealth() {
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          path: '/health',
          method: 'GET',
          timeout: 2000, // Increased timeout
          headers: {
            'Connection': 'close' // Ensure connection closes
          }
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              const isHealthy = json.status === 'ok';
              // Don't log every successful health check during startup
              resolve(isHealthy);
            } catch (err) {
              // Invalid JSON during startup is expected (server not ready yet)
              resolve(false);
            }
          });
        }
      );

      req.on('error', (err) => {
        // Don't log connection refused errors during startup (expected)
        // Only log other errors or if server takes too long
        if (DEBUG && err.code !== 'ECONNREFUSED') {
          console.log('[BackendService] Health check error:', err.message);
        }
        resolve(false);
      });

      req.on('timeout', () => {
        // Timeouts during startup are expected, don't log
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Stop the backend server gracefully
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.process) {
      console.log('[BackendService] Server not running');
      return;
    }

    console.log('[BackendService] Stopping backend server...');

    return new Promise((resolve) => {
      this.process.on('exit', () => {
        console.log('[BackendService] Server stopped');
        this.process = null;
        resolve();
      });

      // Send SIGTERM for graceful shutdown
      this.process.kill('SIGTERM');

      // Force kill after 5 seconds if not stopped
      setTimeout(() => {
        if (this.process) {
          console.warn('[BackendService] Force killing server');
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  /**
   * Get backend server URL
   * @returns {string}
   */
  getUrl() {
    return `http://${this.host}:${this.port}`;
  }
}

module.exports = { BackendService };
