# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Bildvisare backend server.

Bundles the FastAPI backend into a standalone executable.
Run with: pyinstaller bildvisare-backend.spec

Output: dist/bildvisare-backend (or .exe on Windows)
"""

import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all submodules for packages that need runtime discovery
hiddenimports = [
    # FastAPI and dependencies
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'pydantic',
    'pydantic_core',
    
    # Face recognition
    'face_recognition',
    'face_recognition_models',
    'dlib',
    
    # Image processing
    'cv2',
    'PIL',
    'PIL.Image',
    'rawpy',
    'numpy',
    
    # Optional: InsightFace (may not be installed)
    # 'insightface',
    # 'onnxruntime',
    
    # API modules
    'api',
    'api.server',
    'api.routes',
    'api.routes.detection',
    'api.routes.status',
    'api.routes.database',
    'api.routes.statistics',
    'api.routes.management',
    'api.routes.preprocessing',
    'api.routes.files',
    'api.websocket',
    'api.websocket.progress',
    'api.services',
    'api.services.detection_service',
    'api.services.db_service',
    
    # Local modules
    'faceid_db',
    'face_backends',
]

# Collect data files needed at runtime
datas = [
    # face_recognition_models data
]

# Try to collect face_recognition_models data
try:
    datas += collect_data_files('face_recognition_models')
except Exception:
    print("Warning: Could not collect face_recognition_models data")

a = Analysis(
    ['run_server.py'],  # Entry point wrapper (avoids relative import issues)
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude unnecessary modules to reduce size
        'tkinter',
        'matplotlib',  # Only needed for CLI visualization
        'IPython',
        'jupyter',
        'notebook',
        'pytest',
        'sphinx',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='bildvisare-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # Compress executable
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for logging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
