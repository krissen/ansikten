# Release-guide

Guide för att skapa och publicera nya versioner av Hitta ansikten.

---

## Översikt

Releaser triggas automatiskt via GitHub Actions när en version-tag pushas.

```
git tag v1.0.0 → GitHub Actions → Bygg → Draft release
```

---

## Versioneringsstrategi

Projektet använder [Semantic Versioning](https://semver.org/):

| Typ | Beskrivning | Exempel |
|-----|-------------|---------|
| **Major** | Breaking changes | v2.0.0 |
| **Minor** | Nya funktioner | v1.1.0 |
| **Patch** | Buggfixar | v1.0.1 |

---

## Release-process

### 1. Förbered koden

```bash
# Säkerställ att du är på master med senaste ändringar
git checkout master
git pull origin master

# Verifiera att allt bygger lokalt
cd frontend
npm run build:workspace
npx electron .
```

### 2. Uppdatera changelog (valfritt)

Om du har en CHANGELOG.md, uppdatera den med ändringar sedan senaste release.

### 3. Skapa och pusha tag

```bash
# Skapa annoterad tag
git tag -a v1.0.1 -m "Release v1.0.1"

# Pusha tag till GitHub
git push origin v1.0.1
```

> **Viktigt:** Taggen måste börja med `v` (t.ex. `v1.0.1`, inte `1.0.1`).

### 4. Övervaka bygget

1. Gå till [GitHub Actions](https://github.com/krissen/hitta_ansikten/actions)
2. Klicka på "Release" workflow
3. Vänta på att alla tre byggjobb (macOS, Windows, Linux) blir gröna

Byggtider (ungefärliga):
- macOS: ~8 minuter
- Windows: ~10 minuter
- Linux: ~6 minuter

### 5. Publicera release

1. Gå till [GitHub Releases](https://github.com/krissen/hitta_ansikten/releases)
2. Hitta draft-releasen (skapad automatiskt)
3. Lägg till release notes
4. Klicka "Publish release"

---

## Byggartifakter

GitHub Actions genererar följande filer:

| Plattform | Filformat | Storlek (ca) |
|-----------|-----------|--------------|
| macOS | `.dmg`, `.zip` | ~500 MB |
| Windows | `.exe` (NSIS) | ~500 MB |
| Linux | `.deb`, `.AppImage` | ~500 MB |

---

## Felsökning

### Bygget misslyckas

**Python-beroenden:**
```bash
# Kontrollera att requirements.txt är uppdaterad
cd backend
pip install -r requirements.txt
pyinstaller bildvisare-backend.spec
```

**Node-beroenden:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build:workspace
```

### Ta bort och pusha om tag

Om du behöver göra en ny release med samma versionsnummer:

```bash
# Ta bort lokal tag
git tag -d v1.0.1

# Ta bort remote tag
git push origin :refs/tags/v1.0.1

# Skapa och pusha ny tag
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

### Rollback

Om en release har problem:

1. Ta bort releasen från GitHub Releases
2. Ta bort taggen (se ovan)
3. Fixa problemet
4. Skapa ny release

---

## Lokal testbygge

Testa byggprocessen lokalt innan du pushar:

```bash
# Backend
cd backend
pip install pyinstaller
pyinstaller bildvisare-backend.spec
ls dist/bildvisare-backend/

# Frontend
cd frontend
npm run build:workspace
npm run build:mac  # eller build:win, build:linux
```

---

## CI/CD-konfiguration

Workflow-filen: `.github/workflows/release.yml`

**Miljövariabler:**
- `NODE_VERSION`: 20
- `PYTHON_VERSION`: 3.11

**Hemliga nycklar:**
- `GITHUB_TOKEN`: Automatisk, används för att skapa release

**Caching:**
- pip-cache för Python-beroenden
- npm-cache för Node-beroenden
- Electron-cache för snabbare byggen

---

## Se även

- [Building](building.md) - Detaljerad byggdokumentation
- [Contributing](contributing.md) - Bidragsguide
