export const PROJECT_FILE_AUTOSAVE_QUIET_MS = 30_000;
export const PROJECT_FILE_AUTOSAVE_MAX_MS = 120_000;

export function projectFileHandleStorageKey(projectId) {
  const id = String(projectId || "").trim();
  return id ? `portable-project-file-handle:${id}` : "";
}

// Wait for a short editing pause, but never postpone the portable-file backup
// forever during a continuous tracing session. Browser/IndexedDB recovery saves
// remain much faster; this delay only governs rebuilding the larger .otk archive.
export function projectFileAutosaveDelay(now, firstDirtyAt, quietMs = PROJECT_FILE_AUTOSAVE_QUIET_MS, maxMs = PROJECT_FILE_AUTOSAVE_MAX_MS) {
  const current = Number.isFinite(now) ? now : Date.now();
  const first = Number.isFinite(firstDirtyAt) && firstDirtyAt > 0 ? firstDirtyAt : current;
  const quietAt = current + Math.max(0, quietMs);
  const forcedAt = first + Math.max(0, maxMs);
  return Math.max(0, Math.min(quietAt, forcedAt) - current);
}

// File System Access handles may outlive a page, but background writes must not
// open a permission prompt. A deliberate Save action can request permission;
// automatic saves only proceed when permission is already granted.
export async function canAutosaveProjectFile(handle) {
  if (!handle || typeof handle.createWritable !== "function") return false;
  if (typeof handle.queryPermission !== "function") return true;
  try { return await handle.queryPermission({ mode: "readwrite" }) === "granted"; }
  catch { return false; }
}
