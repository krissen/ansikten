# Building Hitta ansikten

Guide for building distributable packages of Hitta ansikten.

---

## Overview

Bildvisare consists of two parts:
- **Frontend**: Electron app (JavaScript/React)
- **Backend**: FastAPI server (Python)

For distribution, the Python backend is bundled into a standalone executable using PyInstaller, then packaged together with the Electron app.

---

## Prerequisites

### All Platforms

- Node.js 20+
- Python 3.11+
- Git

### macOS

```bash
# Xcode Command Line Tools
xcode-select --install

# Homebrew packages (for face_recognition)
brew install cmake
```

### Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y cmake build-essential
```

### Windows

- Visual Studio Build Tools (for native dependencies)
- CMake

---

## Development Setup

### Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/macOS
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

### Running in Development

```bash
# Terminal 1: Frontend (auto-starts backend)
cd frontend
npm start
```

Or manually:

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
python -m uvicorn api.server:app --host 127.0.0.1 --port 5001

# Terminal 2: Frontend
cd frontend
npm run dev
```

---

## Building for Distribution

### Quick Build (Current Platform)

```bash
cd frontend
npm run build
```

Output in `frontend/dist/`.

### Platform-Specific Builds

```bash
# macOS (Intel + Apple Silicon)
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

### Full Build Process (Manual)

If you need more control over the build:

#### 1. Build Backend Executable

```bash
cd backend
source venv/bin/activate
pip install pyinstaller

# Build standalone executable
pyinstaller bildvisare-backend.spec

# Output: dist/bildvisare-backend (or .exe on Windows)
```

#### 2. Prepare Backend for Electron

```bash
# Copy to frontend resources
mkdir -p frontend/resources/backend
cp backend/dist/bildvisare-backend frontend/resources/backend/

# Make executable (Linux/macOS)
chmod +x frontend/resources/backend/bildvisare-backend
```

#### 3. Build Electron App

```bash
cd frontend
npm run build:workspace  # Build React components
npm run build            # Package with electron-builder
```

---

## Build Outputs

### macOS

| File | Description |
|------|-------------|
| `Bildvisare-{version}-arm64.dmg` | Apple Silicon installer |
| `Bildvisare-{version}-x64.dmg` | Intel installer |
| `Bildvisare-{version}-arm64-mac.zip` | Apple Silicon portable |
| `Bildvisare-{version}-x64-mac.zip` | Intel portable |

### Windows

| File | Description |
|------|-------------|
| `Bildvisare-Setup-{version}.exe` | NSIS installer |
| `Bildvisare-{version}.exe` | Portable executable |

### Linux

| File | Description |
|------|-------------|
| `Bildvisare-{version}.AppImage` | Universal package |
| `bildvisare_{version}_amd64.deb` | Debian/Ubuntu package |

---

## GitHub Releases

Releases are automated via GitHub Actions. To create a release:

```bash
# Tag the release
git tag v1.0.0
git push origin v1.0.0
```

The workflow will:
1. Build backend with PyInstaller on each platform
2. Bundle backend with Electron app
3. Create draft release with all artifacts

Then manually publish the draft release on GitHub.

---

## Troubleshooting

### PyInstaller Issues

**Missing modules at runtime:**

Add to `hiddenimports` in `bildvisare-backend.spec`:

```python
hiddenimports = [
    # ... existing
    'missing_module',
]
```

**Large executable size:**

Add unused modules to `excludes`:

```python
excludes=[
    'tkinter',
    'matplotlib',
    # ...
]
```

### Electron Builder Issues

**Code signing errors (macOS):**

For local builds without signing:

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build:mac
```

**Windows Defender blocks build:**

Add project folder to Windows Defender exclusions.

### InsightFace Installation

InsightFace is the face recognition backend. If installation fails:

```bash
# macOS
brew install cmake
pip install onnxruntime insightface

# Linux
sudo apt-get install cmake
pip install onnxruntime insightface
```

> **Note:** dlib/face_recognition is deprecated since January 2026. Use InsightFace instead.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BILDVISARE_PORT` | Backend server port | `5001` |
| `BILDVISARE_PYTHON` | Python path (dev only) | Auto-detect |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Disable code signing | - |

---

## Architecture Notes

### Development Mode

```
Electron App
    └── backend-service.js
            └── spawns: python -m uvicorn api.server:app
```

### Production Mode (Packaged)

```
Bildvisare.app/
├── Contents/
│   ├── MacOS/
│   │   └── Bildvisare          # Electron
│   └── Resources/
│       └── backend/
│           └── bildvisare-backend  # PyInstaller bundle
```

The Electron app detects if it's running packaged (`app.isPackaged`) and spawns the bundled backend executable instead of system Python.
