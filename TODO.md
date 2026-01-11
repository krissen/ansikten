# TODO - Hitta ansikten

Konsoliderad lista över planerade förbättringar, kända brister och teknisk skuld.

**Senast uppdaterad:** 2026-01-10

---

## Roadmap

### Nu

- [ ] Review-modulen: när jag trycker r för att redigera ett namn, så ändras inte färgen på input-boxen. Det borde den göra, så jag kan lita på att jag "hamnat rätt". Använd temafärger!
- [ ] Review och viewer-synkronisering: när ett namn korrigeras i review, ska det även justeras i viewers ansiktsutskrivning. När ett namnförslag har blivit bekräftat ska boundingboxen bli grön om det är ett namn; grå om det blivit ett ignore. Bakgrunden för "namnskylten" ska ändras på samma sätt. Vidare, använder vi nu en alltid gul linje för att binda samman bounding-box med namnskylt; den linjen ska istället använda samma färg som bbb- och namnskyltsbakgrunden. /plan på detta
- [ ] File-list-modulen. Då nya namn inte visas, finns det mycket outnyttjat utrymme, mellan filnamnet och blixtikonen. Vi ska fylla det med namn, på de som vi har info om bekräftade namn av. Vi ska anpassa vad som skrivs beroende på utrymme. Ska finnas lite lagom padding, alltid, dels mellan filnamnet; dels mellan det som är till högerst (blixt-ikon eller ansikts-antal). Ifall vi har mycket utrymme och t ex bara ett eller ett fåtal namn, kan vi skriva ut hela namnet på ansiktet i bilden, t ex "Arvid Wallentinsson, Elis Niemi". Ifall det inte ryms, tar vi bort efternamnet och (på liknande sätt som vid rename) ifall förnamnet är unikt; ifall förnamnet inte är unikt skriver vi ut initial för efternamnet så det blir unikt för de samlade namnen i setet, "Arvid W., Elis"; ifall det inte ryms skriver vi "ArvidW, Elis"; ifall det inte ryms för alla tar vi bort mellanslaget efter kommatecknet; ifall det inte ryms skriver vi ut initialer "AW, EN" osv.; lägg till bokstäver efter efternamnet så det blir unikt för setet, t ex "AW, ENi" osv. Omständligt, så du behöver göra en /plan för detta! Men du borde också ha stor hjälp av rename-biblioteket, som redan gör liknande grejer. När "Show new names" är TRUE så visas inte namnen på ansikten; det byts då ut mot info om nya filnamnet!

### Kort sikt

- [ ] Temat för ljust läge. Knappar (t ex clear done, clear all, rename etc. i fil-modulen), de syns fint när de inte är markerade. Men vid hover över borde förväntat utseende vara att de "markeras mera"/highlightas. Istället får de typ samma färg som modul-bakgrund. Det vill säga, de "blandar in sig" i bakgrunden istället för att utmärka sig mer än de andra knapparna. Justera ljusa temat. Beakta var knappar finns; vad som kan finnas i deras bakgrunder. Systematik behövs, alltså!
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
- [x] ~~Ingen progress-indikator för långsamma operationer~~ (ProgressBar-komponent, LoadingOverlay, temabara CSS-variabler)

---

## Teknisk skuld

### Backend

- [x] ~~`hitta_ansikten.py` är 2000+ rader - bör brytas upp~~ (uppdelad: cli_config.py, cli_image.py, cli_matching.py)
- [x] ~~Ingen typ-annotation i äldre Python-kod~~ (alla 18 backend-filer har nu moderna Python 3.10+ typ-annotationer)
- [x] ~~Inkonsekvent error-handling (print vs logging)~~ (alla CLI-verktyg använder nu logging + print för dubbel feedback)
- [x] ~~Preprocessing-cache kan växa obegränsat~~ (1GB limit med LRU, loggrotation vid startup)

### Frontend

- [x] ~~Vissa moduler har duplicerad state-hantering~~ (nya hooks: useOperationStatus, useFormState)
- [x] ~~WebSocket-reconnect~~ (förbättrad: max-cap 30s, jitter ±20%, disconnect-flag)
- [ ] Bundle-storlek (~450kb) kan minskas med tree-shaking
- [x] ~~`useEffect` utan cleanup~~ (verifierat: alla hooks har korrekt cleanup)

### Arkitektur

- [x] ~~Backend och frontend har ingen gemensam typdefinition~~ (JSON Schema i shared/schemas/, genererat från Pydantic)
- [x] ~~API-versioning saknas~~ (alla endpoints nu under /api/v1/)
- [x] ~~Ingen health-check endpoint~~ (förbättrad: /health returnerar komponentstatus)
- [x] ~~Loggning är inkonsekvent mellan backend/frontend~~ (konsoliderat: debug.js är enda loggningssystem, stöder fil-loggning via IPC)

---

## Slutfört (referens)

### 2026-01-10: Moduluppdelning och refaktorering

- [x] **hitta_ansikten.py uppdelad** - Extraherade moduler (2614 → 1669 rader, 36% reduktion)
  - cli_config.py (287 rader): konstanter, config, logging, attempt settings
  - cli_image.py (319 rader): RAW-läsning, preview-bilder, bildvisare
  - cli_matching.py (454 rader): tröskelvärden, matchning, labels
- [x] **Frontend state-konsolidering** - Nya återanvändbara hooks
  - useOperationStatus: isLoading/status/showSuccess/showError mönster
  - useFormState: Formulärstate med reset och isDirty
  - Refaktorerade: DatabaseManagement (-26 rader), RefineFacesModule

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

Projektet heter **Hitta ansikten**. "Bildvisare" var ett tidigare namn som inte längre används.

### Prioritering

- **P1** - Blockerar arbetsflöde
- **P2** - Förbättrar produktivitet
- **P3** - Nice-to-have

### Kontribuera

Se [docs/dev/contributing.md](docs/dev/contributing.md) för hur du bidrar.
