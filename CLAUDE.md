# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Ansikten** - Face recognition for event photography.

- **Backend**: FastAPI server (`backend/api/`)
- **Frontend**: Electron + React with FlexLayout (`frontend/`)
- **Legacy CLI**: `hitta_ansikten.py` (batch processing, not used by GUI)
- **Data**: `~/.local/share/faceid/`

---

## Critical Rules

### Git Workflow

- **master is protected** - all changes via PR
- **dev is main branch** - feature branches from dev
- **Never commit to master directly**
- **Never delete master or dev**

```bash
git checkout dev
git checkout -b feature/my-feature
# ... work ...
git commit -m "(scope) description"
git push origin feature/my-feature
# Create PR to dev
```

### Commit Messages

- **NO Claude references** in commits or PRs
- **Never** add "Generated with Claude" footers
- **Never** add "Co-Authored-By: Claude"

Format: `(scope) description`
- `(filename)` for single file
- `(feature)` for multi-file feature
- `(type)` for general changes (fix, docs, refactor)

---

## Quick Commands

### Frontend (primary development)

```bash
cd frontend
npm install
npm run build:workspace                    # Build React workspace
npm run watch:workspace                    # Watch mode for development
npx electron .                             # Run app (auto-starts backend on :5001)
```

### Backend API

```bash
cd backend
pip install -r requirements.txt
python -m api.server                       # Run API server standalone
```

### Legacy CLI

```bash
cd backend
./hitta_ansikten.py 2024*.NEF              # Batch process images
./hitta_ansikten.py --simulate *.NEF       # Dry-run (no writes)
```

### Utility Scripts

```bash
cd backend
./rakna_spelare.py 250601*.jpg             # Player photo statistics
./rakna_spelare.py -p 250601*.jpg          # Per-match breakdown
./filer2mappar.py ./photos                 # Organize files into folders
```

### Building for Distribution

```bash
cd backend
pip install pyinstaller
pyinstaller ansikten-backend.spec          # Creates dist/ansikten-backend/

cd frontend
npm run build:mac                          # macOS .dmg
npm run build:win                          # Windows .exe
npm run build:linux                        # Linux .AppImage/.deb
```

---

## Architecture

### Backend (FastAPI on port 5001)

```
backend/api/
├── server.py              # FastAPI app entry, CORS, startup
├── routes/
│   ├── detection.py       # /api/detect-faces, /api/confirm-identity
│   ├── management.py      # /api/management/rename-person, merge, delete
│   ├── database.py        # /api/database/people, names
│   ├── files.py           # /api/files/rename, rename-preview
│   ├── refinement.py      # /api/refinement/outliers, update
│   ├── statistics.py      # /api/statistics
│   ├── preprocessing.py   # /api/preprocessing
│   ├── startup.py         # /api/startup/status
│   └── status.py          # /api/status
├── services/
│   ├── detection_service.py    # Core detection logic, face matching
│   ├── management_service.py   # Database operations (rename, merge)
│   ├── refinement_service.py   # Outlier detection, centroid refinement
│   ├── rename_service.py       # File rename logic
│   ├── statistics_service.py   # Processing statistics
│   └── startup_service.py      # Backend startup coordination
└── websocket/
    └── progress.py        # ws://localhost:5001/ws/progress
```

Core modules (shared with legacy CLI):
- `faceid_db.py` - Database layer (encodings.pkl, processed_files.jsonl)
- `face_backends.py` - InsightFace abstraction

### Frontend (Electron + React)

```
frontend/
├── main.js → src/main/index.js    # Electron main process
├── src/main/
│   ├── index.js                   # Window management, IPC, file watching
│   └── backend-service.js         # Auto-starts FastAPI server
├── src/renderer/
│   ├── workspace/flexlayout/
│   │   └── FlexLayoutWorkspace.jsx  # Main workspace component
│   ├── components/                # React module components
│   │   ├── ImageViewer.jsx        # Canvas rendering with zoom/pan
│   │   ├── ReviewModule.jsx       # Face review UI (keyboard nav, autocomplete)
│   │   ├── FileQueueModule.jsx    # File queue management
│   │   ├── RefineFacesModule.jsx  # Outlier detection, centroid refinement
│   │   ├── DatabaseManagement.jsx # Database admin
│   │   └── ...
│   ├── shared/
│   │   └── api-client.js          # HTTP + WebSocket client (singleton)
│   └── context/
│       └── ModuleAPIContext.jsx   # Inter-module communication
```

### Module Communication

```javascript
// Inter-module events
api.emit('image-loaded', { path });
api.on('face-selected', callback);

// Backend HTTP
const result = await api.http.post('/api/detect-faces', { image_path });

// WebSocket
api.ws.on('progress', callback);
```

---

## Key Concepts

### Face Recognition Backends

| Backend | Encoding | Threshold | Status |
|---------|----------|-----------|--------|
| InsightFace | 512-dim | ~0.4 | Primary |
| dlib | 128-dim | ~0.54 | Legacy |

Config in `~/.local/share/faceid/config.json`:
```json
{
  "backend": { "type": "insightface" }
}
```

### Data Files

| File | Purpose |
|------|---------|
| `encodings.pkl` | Known faces database |
| `processed_files.jsonl` | Files already processed |
| `attempt_stats.jsonl` | Review attempt log |

---

## Gotchas

- RAW files are `.NEF` (Nikon)
- Filename format: `YYMMDD_HHMMSS[-N][_names].NEF`
- SHA1 hash used for file identity
- Encodings only compared against same backend type
- Backend auto-starts with Electron; use `python -m api.server` for standalone
- DetectionService caches results by file hash (check cache when debugging)
- GitHub Actions releases triggered by `v*` tags (e.g., `v1.0.1`)

---

## Code Principles

- **KISS** - Simple, readable solutions
- **DRY** - Extract common logic
- **YAGNI** - No speculative features
- Comments and docs in English
- User-facing strings in Swedish

### Testing

No automated test suite. Manual testing:
- Run `npx electron .` and test modules in both light/dark themes
- Check DevTools console for errors
- Legacy CLI: `./hitta_ansikten.py --simulate *.NEF`

### Documentation Maintenance

**Always assess if code changes require documentation updates.**

- Bug fixes: Usually no doc update needed
- API/feature changes: Update relevant docs
- **MINIMUM**: Note gaps in [TODO.md](TODO.md)
- **IDEAL**: Update docs alongside code

---

## Related Docs

- [Architecture](docs/dev/architecture.md)
- [API Reference](docs/dev/api-reference.md)
- [Database](docs/dev/database.md)
- [Theming](docs/dev/theming.md)
- [Contributing](docs/dev/contributing.md)
