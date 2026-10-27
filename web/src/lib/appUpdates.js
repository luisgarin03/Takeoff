export const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const PHASES = new Set(["idle", "checking", "current", "available", "downloading", "ready", "installing", "error"]);

/** @param {Record<string, any>|null|undefined} value */
export function normalizeDesktopUpdateState(value) {
  const phase = PHASES.has(value?.phase) ? value.phase : "idle";
  return {
    supported: value?.supported === true,
    currentVersion: String(value?.currentVersion || APP_VERSION),
    phase,
    availableVersion: String(value?.availableVersion || ""),
    releaseName: String(value?.releaseName || ""),
    releaseDate: String(value?.releaseDate || ""),
    releaseNotes: String(value?.releaseNotes || ""),
    percent: Math.max(0, Math.min(100, Number(value?.percent) || 0)),
    transferred: Math.max(0, Number(value?.transferred) || 0),
    total: Math.max(0, Number(value?.total) || 0),
    bytesPerSecond: Math.max(0, Number(value?.bytesPerSecond) || 0),
    error: String(value?.error || ""),
  };
}

export function formatUpdateBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** @param {any} scope */
export function desktopUpdateApi(scope = globalThis) {
  const api = scope?.desktopUpdates;
  if (!api || typeof api.getState !== "function" || typeof api.onState !== "function") return null;
  return api;
}
