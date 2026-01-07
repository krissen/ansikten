#!/usr/bin/env node
/**
 * Build backend executable with PyInstaller
 * 
 * Builds the Python backend into a standalone executable and copies it
 * to resources/backend/ for inclusion in the Electron app.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '../../backend');
const RESOURCES_DIR = path.join(__dirname, '../resources/backend');
const IS_WIN = process.platform === 'win32';
const EXEC_NAME = IS_WIN ? 'bildvisare-backend.exe' : 'bildvisare-backend';

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...options });
}

function main() {
  console.log('=== Building Backend ===\n');

  // Check if PyInstaller spec exists
  const specFile = path.join(BACKEND_DIR, 'bildvisare-backend.spec');
  if (!fs.existsSync(specFile)) {
    console.error('Error: bildvisare-backend.spec not found in backend/');
    process.exit(1);
  }

  // Build with PyInstaller
  console.log('Building with PyInstaller...');
  try {
    run('pyinstaller bildvisare-backend.spec --noconfirm', { cwd: BACKEND_DIR });
  } catch (err) {
    console.error('\nPyInstaller build failed.');
    console.error('Make sure you have activated your Python environment and installed dependencies:');
    console.error('  pip install -r requirements.txt pyinstaller\n');
    process.exit(1);
  }

  // Check output exists
  const builtExec = path.join(BACKEND_DIR, 'dist', EXEC_NAME);
  if (!fs.existsSync(builtExec)) {
    console.error(`Error: Expected output not found: ${builtExec}`);
    process.exit(1);
  }

  // Ensure resources directory exists
  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  // Copy to resources
  const targetExec = path.join(RESOURCES_DIR, EXEC_NAME);
  console.log(`\nCopying ${EXEC_NAME} to resources/backend/`);
  fs.copyFileSync(builtExec, targetExec);

  // Make executable (Unix)
  if (!IS_WIN) {
    fs.chmodSync(targetExec, 0o755);
  }

  console.log('\n=== Backend build complete ===\n');
}

main();
