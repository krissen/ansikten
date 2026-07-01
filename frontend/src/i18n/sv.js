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
