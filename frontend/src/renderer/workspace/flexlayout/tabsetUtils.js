/**
 * Pure FlexLayout tabset helpers (no React / no side-effecting imports, so they
 * are unit-testable in isolation).
 */

/**
 * Choose which tabset a newly-opened module should dock into.
 *
 * Prefers the active tabset (where the user is working). When there is none —
 * e.g. right after a layout loads from the landing page, before the user has
 * clicked any tab — it falls back to the LARGEST tabset by rendered area so the
 * module lands in the main working area, not a narrow side column.
 *
 * Race guard: immediately after a layout loads, the render/measure pass may not
 * have run yet and every tabset rect is still 0. An area-only pick would then
 * land on the first-visited tabset (the narrow 15% Review column), opening the
 * module in a cramped side panel while the user watches the large Image Viewer —
 * so the switch appears to do nothing. When no area is measured yet, fall back
 * to the highest-WEIGHT tabset (the main area).
 *
 * @param {import('flexlayout-react').Model} model
 * @returns {import('flexlayout-react').TabSetNode | null}
 */
export function resolveTargetTabset(model) {
  const active = model.getActiveTabset();
  if (active) return active;

  let bestArea = 0;
  let bestWeight = -1;
  let byArea = null;
  let byWeight = null;
  model.visitNodes((node) => {
    if (node.getType() !== 'tabset') return;
    const rect = node.getRect?.();
    const area = rect ? rect.width * rect.height : 0;
    if (area > bestArea) { bestArea = area; byArea = node; }
    const weight = node.getWeight?.() ?? 0;
    if (weight > bestWeight) { bestWeight = weight; byWeight = node; }
  });
  return byArea || byWeight;
}
