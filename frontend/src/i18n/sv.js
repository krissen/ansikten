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
};
