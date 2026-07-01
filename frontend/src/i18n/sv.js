/**
 * Swedish string catalog (the app's display language).
 *
 * CommonJS so both the Electron main process (menu.js, require) and the
 * esbuild-bundled renderer (import) can consume it. Keys are dotted namespaces;
 * look them up with `t()` from ./index.js.
 *
 * Growth plan: modules are migrated here one at a time (see ROADMAP "Svenskt
 * visningsspråk"). This foundation covers the workspace shell (module titles /
 * tab labels).
 */

module.exports = {
  // Shared strings reused across modules (buttons, common counters). Grows as
  // modules are migrated.
  common: {
    cancel: 'Avbryt',
    confirm: 'Bekräfta',
    save: 'Spara',
    reset: 'Återställ',
    // Plural example used by list "N selected" counters.
    selectedCount: { one: '{count} vald', other: '{count} valda' },
  },

  // Module display names — the single source of truth for tab labels
  // (MODULE_TITLES), layout template tab names, and menu entries that open a
  // module. Add a module's real UI strings under its own namespace as it's
  // migrated.
  // Application menu (frontend/src/main/menu.js). Module-open items reuse the
  // `modules.*` names (defined further down); only menu-specific labels live here.
  menu: {
    app: {
      about: 'Om Ansikten',
      aboutDetail:
        'Version: {version}\n\nVerktyg för ansiktsdetektering och -annotering för evenemangsfotografering.\n\nhttps://github.com/krissen/ansikten',
      preferences: 'Inställningar…',
      hide: 'Dölj Ansikten',
      hideOthers: 'Dölj andra',
      showAll: 'Visa alla',
      quit: 'Avsluta Ansikten',
    },
    edit: {
      title: 'Redigera',
      undoFaceAction: 'Ångra ansiktsåtgärd',
      // Explicit labels for the Electron role items so they're Swedish
      // regardless of the OS locale (roles otherwise render OS-localized).
      undo: 'Ångra',
      redo: 'Gör om',
      cut: 'Klipp ut',
      copy: 'Kopiera',
      paste: 'Klistra in',
      delete: 'Radera',
      selectAll: 'Markera allt',
    },
    file: {
      title: 'Arkiv',
      openImage: 'Öppna bild…',
      reloadDatabase: 'Ladda om databas',
      saveAll: 'Spara alla ändringar',
      discard: 'Kasta ändringar',
      openInLightroom: 'Öppna i Lightroom',
      quit: 'Avsluta',
    },
    view: {
      title: 'Visa',
      showBoxes: 'Visa ramar',
      showAllFaces: 'Visa alla ansikten',
      zoomIn: 'Zooma in',
      zoomOut: 'Zooma ut',
      resetZoom: 'Återställ zoom (1:1)',
      autoFit: 'Anpassa automatiskt',
      autoCenter: 'Centrera på ansikte',
      reviewProgress: 'Visa granskningsförlopp',
      openOriginalView: 'Öppna originalvy',
      openLogViewer: 'Öppna loggar',
      openReviewModule: 'Öppna Granska ansikten',
      toggleDevTools: 'Växla utvecklarverktyg',
      reload: 'Ladda om',
    },
    theme: {
      title: 'Tema',
      editor: 'Temaredigerare…',
      light: 'Ljust (Terminal Beige)',
      dark: 'Mörkt (CRT Phosphor)',
      followSystem: 'Följ system',
    },
    window: {
      title: 'Fönster',
      layoutTemplates: 'Layoutmallar',
      reviewMode: 'Granskningsläge',
      comparisonMode: 'Jämförelseläge',
      fullImage: 'Helbild',
      statsMode: 'Statistikläge',
      queueReviewMode: 'Köläge',
      gridPresets: 'Rutnätsförval',
      layout: 'Layout',
      addColumn: 'Lägg till kolumn',
      removeColumn: 'Ta bort kolumn',
      addRow: 'Lägg till rad',
      removeRow: 'Ta bort rad',
      moveLeft: 'Flytta panel till ny kolumn vänster',
      moveRight: 'Flytta panel till ny kolumn höger',
      moveAbove: 'Flytta panel till ny rad ovanför',
      moveBelow: 'Flytta panel till ny rad nedanför',
      resetLayout: 'Återställ layout',
      exportLayout: 'Exportera layout…',
      importLayout: 'Importera layout…',
      minimize: 'Minimera',
      close: 'Stäng',
      bringAllToFront: 'Lägg alla överst',
    },
    help: {
      title: 'Hjälp',
      keyboardShortcuts: 'Tangentbordsgenvägar',
      documentation: 'Dokumentation',
      userGuide: 'Användarguide',
      reportIssue: 'Rapportera problem',
      githubRepo: 'GitHub-repo',
    },
  },

  // Keyed by the module id (matches MODULE_COMPONENTS), so callers can do
  // t(`modules.${moduleId}`) — used by MODULE_TITLES and the layout tab names.
  modules: {
    'image-viewer': 'Bildvisare',
    'original-view': 'Originalvy',
    'log-viewer': 'Loggar',
    'statistics-dashboard': 'Statistik',
    'review-module': 'Granska ansikten',
    'database-management': 'Databashantering',
    'refine-faces': 'Förfina ansikten',
    'file-queue': 'Filkö',
    'theme-editor': 'Temaredigerare',
    'preferences': 'Inställningar',
    'player-count': 'Räkna spelare',
    'culling': 'Gallra spelare',
    'import': 'Importera',
    'rename-nef': 'Byt namn',
  },

  // PreferencesModule (frontend/src/renderer/components/PreferencesModule.jsx).
  // Sub-objects mirror the UI structure: sidebar sections, per-section headers,
  // field labels/hints, select options, dialogs and buttons. Save/Reset buttons
  // reuse common.save/common.reset.
  preferences: {
    sidebarTitle: 'Inställningar',

    // Sidebar section labels, keyed by section id.
    sections: {
      general: 'Allmänt',
      layout: 'Layout',
      'image-viewer': 'Bildvisare',
      review: 'Granska',
      files: 'Filer',
      preprocessing: 'Förbehandling',
      dashboard: 'Statistik',
      advanced: 'Avancerat',
    },

    dialogs: {
      resetConfirm: 'Återställ alla inställningar till standard?',
      clearCacheConfirm: 'Rensa all cachad förbehandlingsdata?',
    },

    buttons: {
      clearCache: 'Rensa förbehandlingscache',
      resetDebugCategories: 'Återställ felsökningskategorier till standard',
    },

    general: {
      backendHeader: 'Serverinställningar',
      autoStart: 'Starta servern automatiskt',
      port: { label: 'Serverport', hint: 'Standard: 5001. Kräver omstart av appen.' },
      pythonPath: { label: 'Python-sökväg', hint: 'Sökväg till Python-tolken. Kräver omstart av appen.' },
      uiHeader: 'Användargränssnitt',
      theme: {
        label: 'Tema',
        hint: 'Applikationens färgtema.',
        dark: 'Mörkt (CRT Phosphor)',
        light: 'Ljust (Terminal Beige)',
        system: 'Följ system',
      },
      defaultLayout: {
        label: 'Standardlayout',
        standard: 'Standard',
        compact: 'Kompakt (kommande)',
        reviewFocused: 'Granskningsfokuserad (kommande)',
      },
      showWelcome: 'Visa välkomstmeddelande vid start',
    },

    layout: {
      header: 'Standardlayout',
      template: {
        label: 'Standardmall för layout',
        hint: 'Layout som används vid återställning eller första start.',
        review: 'Granskningsläge',
        comparison: 'Jämförelseläge',
        fullImage: 'Helbild',
        stats: 'Statistikläge',
      },
      gridPreset: {
        label: 'Standardförval för rutnät',
        hint: 'Standardförhållande för panelstorlek i nya layouter.',
      },
      autoSave: {
        label: 'Spara layout automatiskt vid ändringar',
        hint: 'Spara panelpositioner och -storlekar automatiskt när de ändras.',
      },
      rememberSizes: {
        label: 'Kom ihåg panelstorlekar mellan sessioner',
        hint: 'Återställ exakta panelmått vid återöppning.',
      },
    },

    imageViewer: {
      header: 'Bildvisare',
      zoomSpeed: { label: 'Zoomhastighet', hint: 'Zoommultiplikator per steg (1.07 = 7 % per steg)' },
      maxZoom: 'Maximal zoom',
      minZoom: 'Minimal zoom',
      zoomMode: {
        label: 'Standardzoomläge',
        autoFit: 'Anpassa automatiskt (till fönster)',
        oneToOne: '1:1 (verklig storlek)',
      },
      smoothPan: 'Mjuk panoreringsanimering',
    },

    review: {
      header: 'Granskningsmodul',
      autoSave: 'Spara automatiskt när alla ansikten granskats',
      confirmBeforeSave: 'Fråga om bekräftelse innan sparande',
      action: {
        label: 'Åtgärd efter bekräftat ansikte',
        next: 'Gå till nästa ansikte',
        stay: 'Stanna på aktuellt ansikte',
      },
      showConfidence: 'Visa säkerhetspoäng',
      saveMode: {
        label: 'Sparläge',
        hint: 'Hur granskningsresultat skrivs till databasen',
        perImage: 'Per bild (spara alla ansikten för varje bild)',
        perFace: 'Per ansikte (spara varje ansikte direkt)',
      },
      matchAlternatives: {
        label: 'Matchningsalternativ',
        hint: 'Antal matchningsförslag att visa (1–9). Tryck på siffertangenter för att välja.',
      },
    },

    files: {
      cullingHeader: 'Gallring / Lightroom',
      rawRoot: {
        label: 'RAW-mapp (NEF)',
        hint: "Rot som söks rekursivt för original-NEF vid 'Öppna i Lightroom' (tangent L) i Gallra spelare. ~/ tillåtet.",
      },
      queueHeader: 'Filkö',
      autoLoad: {
        label: 'Ladda automatiskt från kön vid start',
        hint: 'Ladda automatiskt första väntande filen när appen startar',
      },
      autoRemove: {
        label: 'Ta bort saknade filer automatiskt',
        hint: 'Ta automatiskt bort filer ur kön om de inte längre finns',
      },
      insertMode: {
        label: 'Infogningsläge',
        hint: 'Hur nya filer läggs till i kön',
        alphabetical: 'Alfabetiskt (sorterat)',
        bottom: 'Sist i kön',
      },
      notificationsHeader: 'Aviseringar',
      toastDuration: {
        label: 'Aviseringens varaktighet',
        hint: 'Hur länge aviseringar visas',
        short: 'Kort (2 s)',
        normal: 'Normal (4 s)',
        long: 'Lång (6 s)',
        veryLong: 'Mycket lång (8 s)',
      },
      toastOpacity: {
        label: 'Aviseringens opacitet',
        hint: 'Aviseringarnas opacitet (0.5 = 50 %, 1.0 = 100 %)',
      },
      renameHeader: 'Namnbyte',
      requireConfirm: 'Kräv bekräftelse före namnbyte',
      allowAlreadyRenamed: 'Tillåt namnbyte av redan namnbytta filer',
      prefixSource: {
        label: 'Prefixkälla',
        hint: 'Var datum/tid till filnamnsprefixet hämtas',
        filename: 'Från filnamn (mönstret YYMMDD_HHMMSS)',
        exif: 'Från EXIF-metadata',
        filedate: 'Från filens ändringsdatum',
        none: 'Inget prefix (endast namn)',
      },
      nameSeparator: {
        label: 'Namnavgränsare',
        commaUnderscore: ',_ (Anna,_Bert)',
        underscore: '_ (Anna_Bert)',
        dash: '- (Anna-Bert)',
        och: '_och_ (Anna_och_Bert)',
      },
      useFirstName: {
        label: 'Använd endast förnamn',
        hint: 'Använd endast förnamn i stället för fullständigt namn',
      },
      removeDiacritics: {
        label: 'Ta bort diakritiska tecken',
        hint: 'Konvertera specialtecken (t.ex. é, ö) för säkrare filnamn',
      },
      sidecarHeader: 'Medföljande filer (sidecar)',
      renameSidecars: {
        label: 'Byt namn på medföljande filer',
        hint: 'Byt även namn på associerade filer (XMP m.m.) vid namnbyte av bilder',
      },
      sidecarExtensions: {
        label: 'Filändelser för medföljande filer',
        hint: 'Kommaseparerad lista (skiftlägesokänslig matchning)',
      },
      trashHeader: 'Papperskorg (Gallra)',
      autoEmpty: {
        label: 'Töm papperskorgen automatiskt efter (dagar)',
        hint: 'Radera gallrade filer äldre än detta permanent. 0 = behåll för alltid.',
      },
      cullingPlayerHeader: 'Gallra spelare',
      autoAdvance: {
        label: 'Gå vidare automatiskt efter namnbyte',
        hint: 'Gå till nästa fil efter namnbyte i gallringen (infogat namnbyte eller borttagning av namn med ⌘↵)',
      },
    },

    preprocessing: {
      backgroundHeader: 'Bakgrundsförbehandling',
      intro:
        'Förbehandla köade filer i bakgrunden för att snabba upp inläsningen. Obs: Namnmatchning förbehandlas INTE – den kräver den aktuella databasen.',
      enable: {
        label: 'Aktivera bakgrundsförbehandling',
        hint: 'Starta förbehandling när filer läggs till i kön',
      },
      workers: {
        label: 'Parallella arbetare',
        hint: 'Antal filer att förbehandla samtidigt (1–8)',
      },
      stepsHeader: 'Förbehandlingssteg',
      nefConversion: {
        label: 'NEF-konvertering',
        hint: 'Konvertera RAW-filer (NEF, CR2, ARW) till JPG',
      },
      faceDetection: {
        label: 'Ansiktsdetektering',
        hint: 'Detektera ansikten och ramar',
      },
      thumbnails: {
        label: 'Ansiktsminiatyrer',
        hint: 'Skapa miniatyrbilder för detekterade ansikten',
      },
      cacheHeader: 'Cacheinställningar',
      maxSize: {
        label: 'Maximal cachestorlek (MB)',
        hint: 'Cachen använder LRU-utrensning när denna gräns överskrids',
      },
      cache: {
        statusLabel: 'Cachestatus:',
        entries: { one: '{count} post', other: '{count} poster' },
      },
      rollingHeader: 'Rullande fönster',
      rollingIntro:
        'Styr hur många filer som förbehandlas i förväg. Förhindrar minnesproblem med stora köer.',
      maxReady: {
        label: 'Max antal klara objekt',
        hint: 'Maximalt antal förbehandlade filer att hålla klara (5–50)',
      },
      pauseBuffer: {
        label: 'Pausbuffert',
        hint: 'Pausa när så här många objekt är klara (bör vara märkbart mindre än Max antal klara objekt)',
      },
      resumeAfter: {
        label: 'Återuppta efter',
        hint: 'Återuppta förbehandling efter så här många genomförda granskningar (1–15)',
      },
      notificationsHeader: 'Aviseringar',
      statusIndicator: {
        label: 'Visa statusindikator',
        hint: 'Visa förbehandlingsstatus i filköns sidfot',
      },
      toastOnPause: {
        label: 'Avisering vid paus',
        hint: 'Visa avisering när förbehandlingen pausas',
      },
      toastOnResume: {
        label: 'Avisering vid återupptagning',
        hint: 'Visa avisering när förbehandlingen återupptas',
      },
    },

    dashboard: {
      sectionsHeader: 'Statistiksektioner',
      intro: 'Välj vilka sektioner som ska visas i statistikpanelen.',
      detectionStats: {
        label: 'Visa detekteringsstatistik',
        hint: 'Prestandatabell för detekteringsmotor',
      },
      topFaces: {
        label: 'Visa rutnät med toppansikten',
        hint: 'Oftast detekterade personer',
      },
      recentImages: {
        label: 'Visa senaste bilder',
        hint: 'Nyligen bearbetade bilder med detekterade namn',
      },
      recentLogs: {
        label: 'Visa senaste loggrader',
        hint: 'Senaste loggposter',
      },
      logLineCount: {
        label: 'Antal loggrader',
        hint: 'Hur många loggrader som ska visas (3–10)',
      },
      autoRefreshHeader: 'Automatisk uppdatering',
      autoRefresh: {
        label: 'Uppdatera automatiskt vid start',
        hint: 'Uppdatera statistik automatiskt när panelen öppnas',
      },
      refreshInterval: {
        label: 'Uppdateringsintervall',
        hint: 'Hur ofta statistiken uppdateras',
        s2: '2 sekunder',
        s5: '5 sekunder',
        s10: '10 sekunder',
        s30: '30 sekunder',
      },
    },

    advanced: {
      loggingHeader: 'Loggning',
      logLevel: {
        label: 'Loggnivå',
        hint: 'Lägsta allvarlighetsnivå för konsolutdata',
        debug: 'Debug (utförlig)',
        info: 'Info',
        warn: 'Varning',
        error: 'Fel',
      },
      debugHeader: 'Felsökningskategorier',
      debugIntro:
        'Aktivera/inaktivera felsökningsutdata per kategori. Varningar och fel visas alltid.',
    },
  },
};
