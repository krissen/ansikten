# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Bildvisare backend server.

Bundles the FastAPI backend into a standalone directory (--onedir mode).
This is MUCH faster to start than --onefile since no extraction is needed.

Run with: pyinstaller bildvisare-backend.spec
Output: dist/bildvisare-backend/ (directory with executable + dependencies)
"""

import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

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
    
    # Image processing
    'cv2',
    'PIL',
    'PIL.Image',
    'rawpy',
    'numpy',
    
    # Required by insightface (vis.py imports at package load)
    'matplotlib',
    'matplotlib.pyplot',
    'matplotlib.font_manager',
    
    # InsightFace and ONNX runtime
    'insightface',
    'onnxruntime',
    
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

datas = []

a = Analysis(
    ['run_server.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
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

# EXE without bundled binaries/data (they go in COLLECT)
exe = EXE(
    pyz,
    a.scripts,
    [],  # Don't bundle binaries here - let COLLECT handle them
    exclude_binaries=True,
    name='bildvisare-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # Disabled: UPX slows down startup due to decompression
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# COLLECT creates the output directory with all dependencies
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,  # Disabled for faster startup
    upx_exclude=[],
    name='bildvisare-backend',
)
