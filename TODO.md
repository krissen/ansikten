# TODO - Ansikten

Konsoliderad lista över planerade förbättringar, kända brister och teknisk skuld.

**Senast uppdaterad:** 2026-01-11

---

## Roadmap

### Nu

- [ ] Rename bugfix. Jag kan ha fel, men jag *tror* att rename inte beaktar manuellt tillagda ansikten/namn? Exempelvis filen ~/Pictures/nerladdat/260111_080910_Aryan.NEF. Den har döpts om enligt ovan. Aryan är ett hittat och bekräftat ansikte---men manuellt har även Elis lagts till. Ändå blir det nya filnamnet endast Aryan; inte Elis. Något är fel! Undersök vad och åtgärda buggen! /plan deepthink Skriv ner planen i en .md för ändamålet i reporoten.

### Kort sikt

(Inga uppgifter just nu)

### Mellan sikt

- [x] Rebrand till "Ansikten" (2026-01-11)
  - [x] Ersätt nuvarande "Hitta ansikten" och ännu äldre "Bildvisare"
    - [x] App
    - [x] Docs
  - [ ] Repo-flytt
    - [ ] Be användaren flytta repot, och ange vad nu adressen är
    - [ ] Ändra referenser i .git/ (remote): `git remote set-url origin https://github.com/krissen/ansikten.git`
    - [x] Uppdatera docs, ifall referenser till gitrepot finns
  - [ ] Lokal mapp-flytt (manuellt: `hitta_ansikten/` → `ansikten/`)
- [ ] **Backend distance-optimering** - Optimera distansberäkningar för bättre prestanda
- [ ] **Duplicate cleanup tool** - Verktyg för att hitta och hantera duplicerade ansikten i databasen
- [ ] Utveckla smidigare stöd för terminal-interaktion med backend (synkat med frontend)

### Lång sikt

- [ ] **Plugin-system** - Utökningsbart system för tredjepartsmoduler
- [ ] **Tab maximization** - Möjlighet att maximera en tab tillfälligt
- [ ] **Floating windows** - Stöd för fristående fönster för moduler

---

## Kända brister

### Dokumentation

- [x] ~~Inkonsistent språk (svenska/engelska) i kodbas och docs~~ (2026-01-11, UI strings → English)

### Funktionalitet

- [x] ~~Ingen testsvit - enhets- och integrationstester saknas helt~~ (2026-01-11, pytest + vitest setup with example tests)
- [x] ~~Saknas felhantering vid nätverksavbrott mot backend~~ (2026-01-11)

### UI/UX

- [x] ~~Inga visuella indikatorer för tangentbordsgenvägar i UI~~ (2026-01-11, ? shows shortcuts with active module highlighted)
- [x] ~~Saknas undo/redo för ansiktsbekräftelser~~ (2026-01-11, Cmd+Z undo, ESC cancels detection)

---

## Teknisk skuld

### Backend

(Inget just nu)

### Frontend

- [x] ~~Bundle-storlek (~450kb) kan minskas med tree-shaking~~ (2026-01-11, analyzed: 504KB is optimal - React 173KB + FlexLayout 116KB + app code. Removed unused dockview dep)

### Arkitektur

(Inget just nu)

---

## Slutfört (referens)

### 2026-01-10: Moduluppdelning och refaktorering

- [x] **hitta_ansikten.py uppdelad** - Extraherade moduler (2614 → 1669 rader, 36% reduktion)
  - cli_config.py (287 rader): konstanter, config, logging, attempt settings
  - cli_image.py (319 rader): RAW-läsning, preview-bilder, extern bildvisare
  - cli_matching.py (454 rader): tröskelvärden, matchning, labels
- [x] **Frontend state-konsolidering** - Nya återanvändbara hooks
  - useOperationStatus: isLoading/status/showSuccess/showError mönster
  - useFormState: Formulärstate med reset och isDirty
  - Refaktorerade: DatabaseManagement (-26 rader), RefineFacesModule

### 2026-01-11: Review & FileQueue UI-förbättringar

- [x] **Review input-box fokus-styling** - Färgändring vid redigering (r)
  - focus-state med temafärger och box-shadow
- [x] **Review/Viewer-synkronisering** - Visuell feedback vid bekräftelse
  - Bounding box + label blir grön vid bekräftat namn
  - Bounding box + label blir grå vid ignore
  - Anslutningslinje matchar nu box-färgen (ersätter fast gul)
  - Nya temafärger: --face-confirmed-color, --face-ignored-color
- [x] **File-list namn-display** - Visar bekräftade namn i fillistan
  - nameFormatter.js utility med 7 förkortningsnivåer
  - ResizeObserver för dynamisk anpassning
  - Port av Pythons resolve_fornamn_dubletter()-algoritm
- [x] **File-list dynamisk trunkering** - Show new names utnyttjar hela bredden
  - Tar bort fast pre-trunkering, låter CSS text-overflow hantera det
  - Original max 45%, nytt namn får resten
- [x] **Ljust tema knapp-hover** - Knappar framträder vid hover istället för att försvinna
  - Nya CSS-variabler: --btn-secondary-hover-bg, --btn-icon-hover-bg
  - Ljust läge: hover ljusnar (#e8d8b0) istället för mörknar
  - Border- och box-shadow-förbättringar
- [x] **Drag-and-drop stöd** - Dra och släpp filer i fillistan
  - Stöd för NEF, CR2, ARW, JPG, JPEG, PNG, TIFF
  - Visuell feedback med färgad overlay
  - Automatisk start om kön var tom

### 2026-01-11: Typ-annotationer i backend

- [x] **Alla 18 Python-filer annoterade** - Moderna Python 3.10+ typ-annotationer
  - ~120 funktioner fick typ-annotationer (parametrar + return types)
  - Använder `list[str]` istället för `List[str]`, `X | None` istället för `Optional[X]`
  - TYPE_CHECKING-importer för att undvika cirkulära beroenden
  - Redan typade: rename_nef.py, filer2mappar.py (inga ändringar behövdes)
  - Flest ändringar: hitta_ansikten.py (31), analysera_ansikten.py (15), hantera_ansikten.py (15), rakna_spelare.py (14)

### 2026-01-10: Loggning och arkitektur

- [x] **Konsoliderad frontend-loggning** - Sammanfogade logger.js in i debug.js
- [x] **Fil-loggning via IPC** - debug.js skickar loggar till main-process om aktiverat
- [x] **Migrerade console.log-anrop** - Alla moduler använder nu debug/debugWarn/debugError
- [x] Ta bort oanvänd logger.js
- [x] **API-versioning** - Alla endpoints nu under /api/v1/, förbereder för framtida versioner
- [x] **Konsekvent error-handling i CLI** - Alla CLI-verktyg (hitta_ansikten, forfina_ansikten, rename_nef) använder nu logging + print för dubbel feedback (loggfil + CLI)

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

Projektet heter **Ansikten**. "Hitta ansikten" och "Bildvisare" var tidigare namn som inte längre används.
CLI-filen heter fortfarande `hitta_ansikten.py` (legacy).

### Prioritering

- **P1** - Blockerar arbetsflöde
- **P2** - Förbättrar produktivitet
- **P3** - Nice-to-have

### Kontribuera

Se [docs/dev/contributing.md](docs/dev/contributing.md) för hur du bidrar.
