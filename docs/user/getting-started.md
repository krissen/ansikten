# Kom igång med Hitta ansikten

Guide för att installera och köra Hitta ansikten.

> **Tips:** Letar du efter färdigbyggda installerare? Se [Installation](installation.md) för nedladdning av `.dmg`, `.exe` eller `.deb`.

---

## Systemkrav (utveckling)

### Backend (Python)
- Python 3.9+
- InsightFace + ONNX Runtime
- ~2GB RAM för bearbetning
- SSD rekommenderas för cache

### Frontend (Electron)
- Node.js 18+
- npm 9+
- macOS, Linux eller Windows

---

## Installation

### 1. Klona repot

```bash
git clone https://github.com/krissen/hitta_ansikten.git
cd hitta_ansikten
```

### 2. Backend-beroenden

```bash
# Skapa virtuell miljö (rekommenderas)
python -m venv venv
source venv/bin/activate  # Linux/macOS
# eller: venv\Scripts\activate  # Windows

# Installera beroenden
pip install -r requirements.txt
```

#### Face Recognition Backend

InsightFace används för ansiktsigenkänning:

```bash
pip install insightface onnxruntime
```

> **Not:** Äldre versioner använde dlib, men detta är deprecated sedan januari 2026. Om du har befintliga dlib-encodings kommer de att tas bort automatiskt vid serverstart.

### 3. Frontend-beroenden

```bash
cd frontend
npm install
```

---

## Första körningen

### CLI (Backend)

```bash
# Bearbeta bilder
./hitta_ansikten.py /path/to/*.NEF

# Visa hjälp
./hitta_ansikten.py --help
```

### Workspace (Frontend)

```bash
cd frontend

# Bygg och starta
npm run build:workspace
npx electron .
```

Backend-servern startar automatiskt på port 5001.

---

## Datalagring

All data sparas i `~/.local/share/faceid/`:

| Fil | Beskrivning |
|-----|-------------|
| `encodings.pkl` | Kända ansikten |
| `ignored.pkl` | Ignorerade ansikten |
| `processed_files.jsonl` | Bearbetade filer |
| `attempt_stats.jsonl` | Bearbetningshistorik |
| `config.json` | Användarinställningar |

---

## Nästa steg

- [Installation](installation.md) - Ladda ner färdigbyggd app
- [CLI-referens](cli-reference.md) - Alla kommandon
- [Workspace-guide](workspace-guide.md) - Använda gränssnittet
- [Tangentbordsgenvägar](keyboard-shortcuts.md) - Alla genvägar
