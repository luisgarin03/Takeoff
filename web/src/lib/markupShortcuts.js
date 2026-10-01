import { MARKUP_TOOLS } from "./canvasConstants.js";

export const MARKUP_SHORTCUTS_KEY = "opentakeoff.markup-shortcuts";

const VALID_KEYS = /^[A-Z0-9]$/;

export function normalizeMarkupShortcutMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const validIds = new Set(MARKUP_TOOLS.map(({ id }) => id));
  const normalized = {};
  const claimed = new Set();
  for (const [id, rawKey] of Object.entries(value)) {
    const key = typeof rawKey === "string" ? rawKey.trim().toUpperCase() : "";
    if (!validIds.has(id) || !VALID_KEYS.test(key) || claimed.has(key)) continue;
    normalized[id] = key;
    claimed.add(key);
  }
  return normalized;
}

export function assignMarkupShortcut(shortcuts, toolId, rawKey) {
  const next = normalizeMarkupShortcutMap(shortcuts);
  const key = typeof rawKey === "string" ? rawKey.trim().toUpperCase() : "";
  if (!MARKUP_TOOLS.some(({ id }) => id === toolId) || !VALID_KEYS.test(key)) return next;
  for (const [id, assigned] of Object.entries(next)) {
    if (assigned === key && id !== toolId) delete next[id];
  }
  next[toolId] = key;
  return next;
}

export function clearMarkupShortcut(shortcuts, toolId) {
  const next = normalizeMarkupShortcutMap(shortcuts);
  delete next[toolId];
  return next;
}
