import { parseSheetKey } from "./sheets";

export const COMPACT_PROJECT_VERSION = 1;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function addSheetKey(byFile, value) {
  if (typeof value !== "string" || !value.trim()) return;
  const { file, page } = parseSheetKey(value);
  if (!file || !Number.isSafeInteger(page) || page < 1) return;
  if (!byFile.has(file)) byFile.set(file, new Set());
  byFile.get(file).add(page);
}

// Compact archives keep every page that carries live takeoff geometry, a
// markup/note, or an explicit page bookmark. Revisions participate too, so
// restoring an older snapshot never reveals a blank page behind its geometry.
export function compactPagesByFile(payloads) {
  const byFile = new Map();
  for (const payload of Array.isArray(payloads) ? payloads : []) {
    if (!object(payload)) continue;
    for (const shape of Array.isArray(payload.shapes) ? payload.shapes : []) addSheetKey(byFile, shape?.sheet_id);
    for (const markup of Array.isArray(payload.markups) ? payload.markups : []) addSheetKey(byFile, markup?.sheet_id);
    for (const fence of Array.isArray(payload.chain_link_fences) ? payload.chain_link_fences : []) addSheetKey(byFile, fence?.sheet_id);
    for (const fence of Array.isArray(payload.ornamental_fences) ? payload.ornamental_fences : []) addSheetKey(byFile, fence?.sheet_id);
    for (const rfi of Array.isArray(payload.rfis) ? payload.rfis : []) addSheetKey(byFile, rfi?.sheet_id);
    for (const key of Array.isArray(payload.sheet_bookmarks) ? payload.sheet_bookmarks : []) addSheetKey(byFile, key);
  }
  return new Map([...byFile].map(([file, pages]) => [file, [...pages].sort((a, b) => a - b)]));
}

export function sanitizeCompactProject(value) {
  if (!object(value) || value.version !== COMPACT_PROJECT_VERSION || value.mode !== "marked-pages-only" || !Array.isArray(value.files)) return null;
  const names = new Set();
  const files = [];
  for (const file of value.files) {
    const nameKey = typeof file?.name === "string" ? file.name.toLowerCase() : "";
    if (!object(file) || typeof file.name !== "string" || !file.name.trim() || names.has(nameKey) ||
      !Number.isSafeInteger(file.original_size) || file.original_size < 0 ||
      typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Array.isArray(file.included_pages) || !file.included_pages.every((page) => Number.isSafeInteger(page) && page > 0)) return null;
    const included_pages = [...new Set(file.included_pages)].sort((a, b) => a - b);
    const page_count = Number.isSafeInteger(file.page_count) && file.page_count > 0 ? file.page_count : null;
    if (page_count && included_pages.some((page) => page > page_count)) return null;
    names.add(nameKey);
    files.push({ name: file.name, original_size: file.original_size, sha256: file.sha256, included_pages, ...(page_count ? { page_count } : {}) });
  }
  if (!files.length) return null;
  return {
    version: COMPACT_PROJECT_VERSION,
    mode: "marked-pages-only",
    files,
    ...(typeof value.created_at === "string" && value.created_at ? { created_at: value.created_at } : {}),
  };
}

export function removeRestoredCompactFiles(value, restoredNames) {
  const compact = sanitizeCompactProject(value);
  if (!compact) return null;
  const restored = new Set(Array.from(restoredNames || [], (name) => String(name).toLowerCase()));
  return sanitizeCompactProject({ ...compact, files: compact.files.filter((file) => !restored.has(file.name.toLowerCase())) });
}
