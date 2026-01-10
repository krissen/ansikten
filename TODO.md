# TODO - Hitta ansikten

Konsoliderad lista över planerade förbättringar, kända brister och teknisk skuld.

**Senast uppdaterad:** 2026-01-10

---

## Roadmap

### Nu

*(Inga pågående prioriterade uppgifter)*

### Kort sikt

- [ ] **Drag-and-drop polish** - Förbättra DnD-upplevelsen i FileQueueModule

### Mellan sikt

- [ ] **Backend distance-optimering** - Optimera distansberäkningar för bättre prestanda
- [ ] **Duplicate cleanup tool** - Verktyg för att hitta och hantera duplicerade ansikten i databasen
- [ ] Utveckla smidigare stöd för terminal-interaktion med backend (synkat med frontend)
- [ ] Rebrand till "Ansikten"
  - [ ] Ersätt nuvarande "Hitta ansikten" och ännu äldre "Bildvisare"
    - [ ] App
    - [ ] Docs
  - [ ] Repo-flytt
  - [ ] Lokal mapp -flytt

### Lång sikt

- [ ] **Plugin-system** - Utökningsbart system för tredjepartsmoduler
- [ ] **Tab maximization** - Möjlighet att maximera en tab tillfälligt
- [ ] **Floating windows** - Stöd för fristående fönster för moduler

---

## Kända brister

### Dokumentation

- [x] ~~SESSION_SUMMARY.md refereras men finns inte~~ (fixad i doc-overhaul)
- [x] ~~WebSocket var dokumenterad som "Future"~~ (verifierat: redan korrekt i api-reference.md)
- [x] ~~Saknas komplett lista över keyboard shortcuts~~ (skapad: docs/user/keyboard-shortcuts.md)
- [ ] Inkonsistent språk (svenska/engelska) i kodbas och docs

### Funktionalitet

- [ ] Ingen testsvit - enhets- och integrationstester saknas helt
- [x] ~~Ingen deployment-guide~~ (skapad: docs/dev/release-guide.md, docs/user/installation.md)
- [ ] Saknas felhantering vid nätverksavbrott mot backend
- [x] ~~Preview-bilder cachas inte effektivt~~ (disk-cache, frontend blob-cache, 30 min TTL)

### UI/UX

- [ ] Inga visuella indikatorer för tangentbordsgenvägar i UI
- [ ] Saknas undo/redo för ansiktsbekräftelser
- [x] ~~Toast-meddelanden kan inte klickas bort manuellt~~ (klickbar dismiss med cursor-feedback)
- [ ] Ingen progress-indikator för långsamma operationer

---

## Teknisk skuld

### Backend

- [ ] `hitta_ansikten.py` är 2000+ rader - bör brytas upp
- [ ] Ingen typ-annotation i äldre Python-kod
- [ ] Inkonsekvent error-handling (print vs logging)
- [ ] Preprocessing-cache kan växa obegränsat

### Frontend

- [ ] Vissa moduler har duplicerad state-hantering
- [x] ~~WebSocket-reconnect~~ (förbättrad: max-cap 30s, jitter ±20%, disconnect-flag)
- [ ] Bundle-storlek (~450kb) kan minskas med tree-shaking
- [x] ~~`useEffect` utan cleanup~~ (verifierat: alla hooks har korrekt cleanup)

### Arkitektur

- [ ] Backend och frontend har ingen gemensam typdefinition
- [ ] API-versioning saknas
- [x] ~~Ingen health-check endpoint~~ (förbättrad: /health returnerar komponentstatus)
- [ ] Loggning är inkonsekvent mellan backend/frontend

---

## Slutfört (referens)

### 2026-01-10: Rename UX-förbättringar

- [x] **Filkön töms inte längre efter rename** - Blockerar file-deleted events under rename
- [x] **Ingen "backend disconnected" toast** - Ignorerar WebSocket-disconnect under rename
- [x] **Progress-toast vid rename** - Visar "Renaming X file(s)..." medan operationen pågår
- [x] **Loading-toast vid namnförslag** - Visar feedback när namn genereras (>5 filer)
- [x] Logganalys genomförd - bekräftade att disconnect är normalt beteende

### 2026-01-09: dlib deprecated & RefineFaces förbättringar

- [x] **dlib backend avvecklat** - InsightFace är nu det enda stödda backend
- [x] Automatisk borttagning av dlib-encodings vid serverstart
- [x] RefineFacesModule: Mahalanobis outlier-detektion
- [x] RefineFacesModule: Förbättrad centroid-beräkning (normaliserad på enhetssfär)
- [x] RefineFacesModule: Statistik i preview (min/max/mean/std för avstånd)
- [x] RefineFacesModule: Ta bort backend-dropdown (endast InsightFace)
- [x] Deprecation warning i face_backends.py om dlib konfigureras

### 2026-01-05: UX-förbättringar och rakna_spelare

- [x] ReviewModule autocomplete: portal-positionering, pil-förval, bättre highlight
- [x] View > Show Review Progress menyval (Shift+I)
- [x] DatabaseManagement: fuzzy-sök för namnlistan
- [x] Bekräftelsedialog vid avvikelse från >75% matchning
- [x] rakna_spelare.py: bar, spark, färg, tränare/publik-config, Δ%-sortering

### 2026-01-02: Styling och tema-system

- [x] `theme.css` med CSS-variabler (light/dark mode)
- [x] `theme-manager.js` för tema-byte (light/dark/system)
- [x] Alla CSS-filer migrerade till CSS-variabler
- [x] ThemeEditor-modul med preset-bibliotek
- [x] PreferencesModule som FlexLayout-modul
- [x] Icon-komponent med SVG-ikoner (ersätter emoji)
- [x] Fix `--text-inverse` kontrastproblem

### 2026-01-01: Database Management

- [x] Komplett paritet med `hantera_ansikten.py`
- [x] Rename/Merge/Delete person
- [x] Move to/from ignored
- [x] Undo file processing
- [x] Purge encodings

### 2025-12: Match Alternatives

- [x] Backend returnerar top-N matchningsalternativ
- [x] Siffertangenter 1-N väljer alternativ
- [x] Ignore-matchningar i alternativlistan
- [x] Konfigurerbart antal alternativ

### 2025-12: File Queue

- [x] FileQueueModule med status-indikatorer
- [x] Auto-advance efter review
- [x] Fix-mode för re-review
- [x] Preprocessing-pipeline
- [x] Rename-funktionalitet

---

## Anteckningar

### DEPRECATED: dlib backend

dlib-backend är borttaget. InsightFace är det enda stödda backend.

- Alla befintliga dlib-encodings raderas automatiskt vid serverstart
- Legacy-scriptet (hitta_ansikten.py) tvingar insightface om dlib konfigureras
- Encoding-shape är alltid (512,) för InsightFace

### Projektnamnbyte

Projektet heter **Hitta ansikten**. "Bildvisare" var ett tidigare namn som inte längre används.

### Prioritering

- **P1** - Blockerar arbetsflöde
- **P2** - Förbättrar produktivitet
- **P3** - Nice-to-have

### Kontribuera

Se [docs/dev/contributing.md](docs/dev/contributing.md) för hur du bidrar.
