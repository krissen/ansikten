// Shared "scan scope" so Gallra spelare (culling) and Räkna spelare mirror the
// same file selection: each module publishes its scope when it runs a query and
// adopts the shared scope when it opens, so switching between them shows the
// same files instead of an empty panel.
//
// Only the SCAN fields are shared (roots, path-globs, recursion, date span,
// extension preset) — not culling's player/name_glob filter, which Räkna spelare
// doesn't use. Session-lived and in-memory (resets on app restart); deliberately
// not persisted. No subscription is exposed: modules adopt on mount (FlexLayout
// unmounts hidden tabs, so opening a tab re-runs mount), which keeps the two in
// sync without a live cross-update loop.

let current = null;

/**
 * The last scan scope, or null if none set this session.
 * Shape: { roots, globs, recursive, date_from, date_to, extension_preset }.
 */
export function getScanScope() {
  return current;
}

/** Publish a scan scope (a shallow copy is stored). */
export function setScanScope(scope) {
  current = scope ? { ...scope } : null;
}

/** True if the scope actually selects something (a folder or a path-glob). */
export function scanScopeHasSelection(scope) {
  return !!scope && (
    (Array.isArray(scope.roots) && scope.roots.length > 0) ||
    (Array.isArray(scope.globs) && scope.globs.length > 0)
  );
}
