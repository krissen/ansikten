# ROADMAP - Ansikten

Framåtblickande lista över planerade förbättringar, kända brister och teknisk
skuld. Den är *inte* en logg över vad som gjorts — avklarade poster tas bort
efter merge (om de inte hänger ihop med pågående arbete); `CHANGELOG.md` är den
varaktiga posten över vad som skeppats.

**Senast uppdaterad:** 2026-07-01

---

## Roadmap

### Nu

- [x] **Rename bugfix — manuellt tillagda ansikten tappades ur filnamnet** (2026-06-29). Manuella ansikten sparades med `hash=None` i batch-confirm (GUI), och rename-uppslaget använde hash-indexet bara som fallback (inte union), så ett ansikte som var ankrat via endast en nyckel kunde tappas. Fix: ankra manuella ansikten på content-hash + union av basename-/hash-träffar i `collect_persons_for_files` (både GUI och legacy-CLI). Plan + diagnos: [RENAME_MANUAL_FACES_PLAN.md](RENAME_MANUAL_FACES_PLAN.md).
  - [x] **Följdspår: ordnings-/race-granskning av auto-save → rename** (2026-06-29) — granskning bekräftade att normalflödet redan är säkert (status blir `completed` först efter att `saveAllChanges` + `mark_review_complete` awaitats), och att rename bara triggas via knapp. Kvarvarande fönster: ett redan processat filobjekt kunde namnges medan en andra-spar pågick (`isAlreadyProcessed`-vägen var inte gateadd). Fix: Review-panelen signalerar `review-dirty` när det finns osparade ändringar, och fillistan håller dirty-filer utanför rename-preview/-exekvering tills sparningen är klar. Frontend-only; data-modellen orörd.

### Kort sikt

GUI-onboarding av CLI-skript (en PR per steg):

- [x] **Räkna spelare** — GUI för `rakna_spelare` (bilder per spelare, baseline/avvikelse, mapp/glob/datum, live-uppdatering) (#46)
- [x] **Gallra spelare** — culling-workspace (spelar/glob-filter, fillista + maximerad preview, snabbtangent-gallring med app-papperskorg + återställning); NEF/RAW-stöd via NEF→JPG-preview (#46/#47)
- [x] **Import-modul** — överför NEF från minneskort → målmapp + mata ut (flytta/kopiera väljbart); macOS `diskutil`.
- [x] **rename_nef → GUI** — EXIF `CreateDate` → `YYMMDD_HHMMSS.NEF` (+ `-NN` vid krock), preview + bekräfta.

CLI-paritet — launch-kommandot mot fler arbetsflöden:

- [x] **CLI-subkommandon `faces` / `culling`** (2026-06-30) — terminal-launchern (`ansikten`) väljer arbetsflöde via verb istället för att alltid köa till ansikten. `ansikten culling MAPP` öppnar/fokuserar Gallra spelare och laddar mappen; `faces` är standard (bakåtkompatibelt med `ansikten *.NEF`). `--clear`/`-c` nollställer arbetsmängden (ensam = töm). Launchern är nu skriptet `bin/ansikten` i repot (ersätter zsh-funktionen); parsing i `src/main/cli-args.js`, routing i `frontend/src/main/index.js` → IPC `open-culling` / `queue-files`.
  - [ ] **Import-subkommando** — `ansikten import [MÅL]` öppnar Import-modulen. PATH-semantiken skiljer sig (import tar en *destination*, källan är autodetekterat kort), så det kräver egen design. Lämnades utanför första PR:en.

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
- [x] **Duplicate cleanup tool** (2026-06-29) — "Find Duplicates" i Database Management hittar par av olika namn som troligen är samma person (centroid-cosinusavstånd ≤ justerbar tröskel), sorterade närmast först, och låter dig slå ihop dem med ett klick (Keep A / Keep B → merge-people). `GET /api/v1/management/find-duplicates`. Personer med enbart manuella ansikten (saknar embedding) hoppas över.
  - [x] **Tvilling-medveten detektion** (2026-06-30) — head-to-head-separerbarhet (1-NN LOO) per par flaggar "likely distinct" (olika personer som liknar varandra, t.ex. tvillingar Wilmer/Maximilian Björneholt) och sorterar dem sist; "Not a duplicate" persisterar paret i `distinct_pairs.json` (registry) så framtida scans hoppar över det, med ångra-lista. `GET/POST /api/v1/management/distinct-pair(s)`.
  - [x] **Igenkännings-disambiguering (PR B)** (2026-06-30) — `detection_service` bryter oavgjort med k-NN-röstning över parets bekräftade ansikten när topp-2 är ett registrerat bekräftat-olika par inom `twin_margin`; resultatet får ett `disambiguated`-fält och Review visar "Twin tie-break → namn". Config: `twin_margin`, `twin_knn_k`.
  - [x] **Inom-person-dedup (PR C)** (2026-06-30) — "Remove Redundant Encodings" i Database Management hittar/tar bort redundanta encodings inom en person (exakt byte-identiska, plus nära-identiska över justerbar tröskel; default 0 = bara exakta). Manuella ansikten tas aldrig bort; preview via `dry_run`. `GET /api/v1/management/redundant-encodings`, `POST /api/v1/management/dedup-people`.
- [ ] Utveckla smidigare stöd för terminal-interaktion med backend (synkat med frontend)
- [x] **Landningssida vid uppstart** (2026-06-29) — overlay-tomtläge i FlexLayout-arbetsytan med arbetsflödesknappar (Importera · Byt namn · Granska ansikten · Räkna spelare · Gallra spelare); Import villkoras av kortvolym (pollas), övriga alltid aktiva; försvinner när en modul öppnas eller en bild laddas. Knappar via `FlexLayoutWorkspace.openModule`. Ursprunglig spec:
  - Steg (ordning): **Importera · Byt namn · Granska ansikten** (File Queue/Review) **· Räkna spelare · Gallra spelare**.
  - **Aktiv/nedtonad:** Import-knappen aktiv endast när en kortvolym syns (`GET /api/v1/import/volumes` ≠ tom), annars nedtonad/inaktiv. Övriga steg nedtonas om en förutsättning saknas, annars aktiva. (Polla/uppdatera kortstatus så Import tänds när ett kort sätts i.)
  - **Single-instance/fokus:** de flesta vyer är singletons (`SINGLETON_MODULES`) — en knapp ska *fokusera* befintlig instans om den är öppen, annars öppna en ny. `FlexLayoutWorkspace.openModule` gör redan detta; återanvänd den + `handleMenuCommand`-kommandona (`open-import`, `open-rename-nef`, `open-file-queue`/`open-review-module`, `open-player-count`, `open-culling`).
  - **Var:** rendera som tomt-läge i FlexLayout-arbetsytan; försvinner när en modul öppnas eller filer laddas. Se befintlig uppstarts-/tomt-logik (StartupStatus, FlexLayoutWorkspace, ev. `get-initial-file`).
  - **Återanvänd:** modulregistret (`MODULE_COMPONENTS`/`MODULE_TITLES`) för steglistan, import-volym-endpointen för aktiv/nedtonad, ikon/knapp-stilarna från befintliga moduler.
  - Egen PR.
- [x] **Räkna spelare GUI: full paritet med CLI (`rakna_spelare.py`)** (2026-07-01) — alla CLI-parametrar går nu att styra i GUI:t (visualisering #73, alltid-exkluderade #70, per-match, samt options-rad + uteslutningseditor nedan). **Allt CLI gör finns nu i GUI:t.**
  - [x] **Visualisering** (#73, 2026-06-30) — per-spelare temporal "spark"/tidslinje (total + per match, från `timestamps[]`), `ΔN`-kolumn (absolut avvikelse) bredvid `Δ%`, och baslinje-relativ fördelnings-bar (baslinje = halva stapeln, med markör) istället för `count/maxCount`. Ren GUI-rendering; `binTimestamps` enhetstestad.
  - [x] **Alltid-exkluderade markörer `FBK`/`Klacken`** (#70, 2026-06-30) — behandlas alltid som grupp/publik (som `Laget`); `grupp` blev konfigurerbar (config `grupp` + `RAKNA_GRUPP`); delad `resolve_exclusion_sets` så CLI och GUI aldrig divergerar.
  - [x] **Saknade UI-kontroller** (2026-07-01) — options-rad under InputBar exponerar `gap_minutes` (matchgap), `baseline` (median/medel) och `min_images`, alla live. "Uteslutna"-panel redigerar `tranare`/`publik` per-request (förifylld från resolverad config), med "Spara som standard" som permanentar till `rakna_spelare.json`; `Laget`/`FBK`/`Klacken` visas låsta. Nya endpoints `GET`/`POST /api/v1/players/exclusions`.
  - [x] **`--add-tranare`/`--add-publik`-paritet i API:t** (2026-07-01) — subsumerad i GUI:t: editorn förifylls från den resolverade config-listan och skickar hela den redigerade listan som override, så redigering = config + tillägg/borttag. Ingen separat `add_*`-parameter behövdes.
  - [x] **Per-match komplett** (2026-07-01) — per-match-vyn renderar nu exkluderade hinkar (`m.excluded`: Tränare/Gruppbilder/Publik/Under tröskeln) och en info-rad (spelarantal · exkl. · `Baslinje (median): X`), i paritet med CLI:ns `print_section`. En match med enbart exkluderade personer redovisar dem istället för att se tom ut. Ren frontend (`MatchSections`); ingen backend-ändring. Render-test tillagt.
  - Ej tillämpligt (CLI-only): `--no-color`/`--color`/`--ascii`/`--bar-width`.
  - GUI är redan rikare på input (mappar, extension-preset, recursive, datumspann) — inte en lucka.
  - Egen PR för de kvarvarande kontrollerna.
- [x] **Retention på app-papperskorgen (Gallra)** (2026-06-29) — auto-rensar gallrade filer (NEF + JPEG + sidecars) äldre än `trash_retention_days` (default 30, `0` = behåll för alltid). Purge körs lazyt: vid backend-start och när papperskorgen öppnas (`GET /api/v1/culling/trash`). Tröskeln lagras i `config.json` och ställs in i Preferences → Files → Trash (Gallra). Nya endpoints `GET`/`POST /api/v1/culling/retention`.
- [ ] **Modulgenvägar bör villkoras på aktiv tabset, inte bara synlighet** — globala tangentlyssnare (t.ex. ReviewModule som bekräftar ansikte på `Enter`) gatar idag på `node.isVisible()`. I en delad layout med flera synliga paneler fångar då en *synlig men inaktiv* panel tangenter som hör till den aktiva. CullingModule försvarar sig redan (Enter-genväg på document i capture-fas + aktiv-tabset-gate + `stopImmediatePropagation`), men det generella mönstret kvarstår för övriga moduler. ReviewModule m.fl. bör gatas på aktiv tabset. **Varning:** måste inte bryta Reviews normala flöde där man klickar i bildvisaren och sedan trycker tangent (då blir bildvisarens tabset aktiv) — kräver genomtänkt fokus-/aktiv-modell, egen PR.
- [ ] **Arbetsflödes-layoutpresets** — spara flerfönsterkonfigurationer per uppgift (t.ex. NEF-culling = fillista vänster + maximal preview höger). De flesta vyer är single-instance: öppna inte flera, skifta fokus till befintlig.
- [ ] **Omfattande docs-uppdatering** — ROADMAP.md/övriga docs är inaktuella; genomgång + uppdatering (stort jobb, egen PR).
- [ ] **Lös namnkrock + tydliggör `ROADMAP.md` vs `docs/dev/roadmap.md`** — sedan `TODO.md` döpts om till `ROADMAP.md` finns två "roadmap"-filer. Definiera rollerna (`ROADMAP.md` = löpande, framåtblickande backlog/known issues/teknisk skuld per horisont; `docs/dev/roadmap.md` = release-scopad plan med sprintar/deliverables/DoD), korslänka dem, och uppdatera `docs/dev/roadmap.md` (inaktuell: scopar `v1.2.0` fast vi passerat 1.3.0) eller arkivera den som historik (ev. döp om den för att undvika förväxling). **När rollfördelningen fastställts: dokumentera den i CLAUDE.md (kanonisk) så den inte glöms.**

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
- [x] ~~Lokalisera ReviewModule match-case-etiketter till svenska~~ (2026-06-30) — `Manuellt tillagd`, `Trolig ignorering`, `Okänd`, `Tvilling-särskiljning` (kvar: `ign` som domän-förkortning).
- [x] **Svenskt visningsspråk — genomgående i18n-svep** (2026-07-01) — hela UI:t är nu svenska (projektkonvention). Audit (~800 strängar) → lättviktig egen i18n-katalog (`frontend/src/i18n/`, per-namnrymd-filer under `sv/`, CJS så main-processen och renderern delar den) + `t(key, vars)` med `{var}`-interpolation och `{one,other}`-plural. Genomfört per modul, PR #88–#99. Detaljerna i CHANGELOG.
  - **Kvar avsiktligt engelska** (teknik/egennamn): `Mahalanobis`, `InsightFace`, preset-namn (`Terminal Beige`/`CRT Phosphor`), `CLI`, `ign` (domän-förkortning), `HTTP {code}`-diagnostik, `Per match` (sportterm). "backend" tolkas i kontext: API-servern → "Servern", igenkänningsmotorn → "Motorer".
  - **Wording att syna** (centraliserat i `sv/`, en-rads-ändring vardera): flaggade i respektive PR (t.ex. `Bildvisare`, `Motorer` för backend-motorn, `Framgång`, `utfyllnad`/`ram` i ThemeEditor, `Detekteringsstatistik`).
- [x] ~~**Gallra spelare: piltangenter blockeras när ett namn-chip (checkbox) har fokus**~~ (#71, 2026-06-30) — enkeltangent-navigeringen ignorerar nu bara riktiga textfält (inte checkboxar), och fokus lämnas tillbaka till fillistan efter namnbyte/dropdown-val; markerad rad autoscrollar med ~3 raders marginal.
- [ ] **CLI launch: landing döljs vid sökväg som expanderar till tomt** — renderaren härleder landningssidans suppression från råa arg-antalet (`hasFiles`), men huvudprocessen skickar bara handoff efter sökvägsexpansion (`expandFolderPaths`/`expandFilePaths` → `length>0 || clear`). En syntaktiskt giltig men icke-matchande sökväg (t.ex. `ansikten culling /typo` eller en glob utan träffar) döljer landningen utan att öppna något → användaren hamnar i default-layouten istället. Ren fix: låt huvudprocessen beräkna post-expansion-villkoret och exponera den boolean:en som launch intent istället för att renderaren gissar från råa argument (kräver async-hantering för faces). Pre-existerande edge (user-error), icke-blockerande; flaggad i PR #67-granskningen.
- [ ] **Gallra spelare: `Cmd+R` (reload) bevarar inte fillistan** — en renderer-reload nollställer culling-modulens React-state (roots/glob/filter + laddad fillista), så arbetsmängden försvinner och användaren måste scanna om. Bör persista scan-scope + ev. laddad lista (t.ex. sessionStorage eller via `scanScope`-delningen) och återställa vid mount, så en omladdning inte tappar var man var. Gäller sannolikt även Räkna spelare.
- [ ] **Gallra spelare: `Enter` inte meny-medveten som `Esc`** — efter #81 bailar `Esc` när kontextmenyn är öppen, men `Enter` gör det inte: med menyn öppen startar `Enter` fortfarande rename/commit på `currentIndex` (menyn stängs på klick/scroll/`Esc`, inte på `Enter`). Pre-existerande, låg impact (menyn är musdriven, ingen tangentfokus; editerar `currentIndex`, inte menyns `menu.path`). Gate `Enter` på `menuRef` för symmetri om det tas upp. Noterat i Nagelfar-granskningen av #81.

---

## Teknisk skuld

### Backend

(Inget just nu)

### Frontend

- [x] ~~Bundle-storlek (~450kb) kan minskas med tree-shaking~~ (2026-01-11, analyzed: 504KB is optimal - React 173KB + FlexLayout 116KB + app code. Removed unused dockview dep)
- [ ] "Öppna i Lightroom" (`open-raw-in-lightroom`) läser hela RAW-roten rekursivt i minnet per tangenttryck och sorterar för deterministisk första-träff. Räcker för dagens per-match-mappar; för en stor RAW-rot, byt till en strömmande DFS-walk med tidig utgång (behåll deterministisk traverseringsordning) eller cachea filindexet.
- [ ] `ImageViewer.jsx` handrullar samma `file://`-kodning som nu finns i den delade `shared/fileUrl.js` (`toFileUrl`). Peka `ImageViewer` på hjälparen så kodningen bara finns på ett ställe (kräver test av face-review-bildladdningen).

### Arkitektur

(Inget just nu)

---

## Slutfört (referens)

### 2026-06-30 / 07-01: Culling- & Räkna spelare-svit (PR #67–#75)

- [x] **CLI-launch öppnar culling rent** (#67) — CLI-mål hoppar över landningssidan (ingen flash) och stänger Review-panelen istället för att docka bredvid; culling-tabben docka i den största tabseten. Live spelarräkning i vänsterkolumnen.
- [x] **Namn-bortbockning + `Cmd+⌫`** (#68) — overlay med namn-chips; `Cmd+Enter` döper om (filnamns-only borttagning via `,_`-split), `Cmd+Backspace` gallrar (Finder).
- [x] **Auto-advance efter namnbyte** (#69) — konfigurerbart (Preferences → Files → Gallra spelare, default på); advance-by-identity så filter-drop inte hoppar över; Windows-säker; race-säker mot mapp-watch-refresh.
- [x] **`FBK`/`Klacken` alltid exkluderade** (#70) — se Räkna-paritet ovan.
- [x] **Kontrast + tangentbordsfokus** (#71) — avvikelsefärger använder rätt tema-vars (`--color-*`); aktiv rad subtil accent istället för guldfyllnad (fixar "gul-på-gul"); fokus tillbaka till listan efter dropdown/namnbyte; enkeltangent-nav blockeras inte av chip-checkbox; autoscroll med 3 raders marginal; gallra-genväg ignoreras under laddning.
- [x] **Räkna ↔ culling delat fil-urval** (#72) — öppna den ena ärver den andras scan-scope (mappar/globbar/datum/rekursion/preset); in-memory, ingen live-loop; culling-specifikt spelarfilter speglas ej.
- [x] **Räkna spelare CLI-visualiseringsparitet** (#73) — se Räkna-paritet ovan (spark, ΔN, baslinje-bar).
- [x] **Culling overlay-cluster** (#74) — filnamnet visas en gång (live i fillistraden, orange medan osparat); dialog vid navigering med osparad ändring (`Cmd+Enter` spara / `Enter` kasta / `Esc` avbryt). Render-smoketest tillagt.
- [x] **Odefinierade CSS-vars → tema-vars** (#75) — `--border-color`/`--warning`/`--success`/`--error`/`--warning-bg`/`--warning-text` i ImportModule/RenameNefModule/ConnectionStatus/PlayerCountModule/InputBar.

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
