export const PROJECT_STATUSES = ["Ongoing", "Needs revision", "Done"];

export const EMPTY_PROJECT_METADATA = Object.freeze({
  name: "",
  submissionDate: "",
  status: "Ongoing",
  createdAt: "",
  lastModifiedAt: "",
});

const isoInstant = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

const isoDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";

export function validateProjectDraft(draft = {}) {
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  const submissionDate = isoDate(draft.submissionDate || "");
  const status = PROJECT_STATUSES.includes(draft.status) ? draft.status : "Ongoing";
  return {
    valid: !!name && (!draft.submissionDate || !!submissionDate),
    errors: {
      name: name ? "" : "Project name is required.",
      submissionDate: draft.submissionDate && !submissionDate ? "Enter a valid date." : "",
    },
    value: { name, submissionDate, status },
  };
}

export function createProjectMetadata(draft, now = new Date().toISOString()) {
  const checked = validateProjectDraft(draft);
  if (!checked.valid) throw new Error(checked.errors.name || checked.errors.submissionDate || "Invalid project metadata.");
  const stamp = new Date(now).toISOString();
  return { ...checked.value, createdAt: stamp, lastModifiedAt: stamp };
}

export function normalizeProjectMetadata(payload = {}) {
  const raw = payload?.project_metadata && typeof payload.project_metadata === "object" && !Array.isArray(payload.project_metadata)
    ? payload.project_metadata : {};
  const name = typeof raw.name === "string" ? raw.name.trim() : (typeof payload.project_name === "string" ? payload.project_name.trim() : "");
  return {
    name,
    ...Object.fromEntries(["authorId", "authorName", "authorEmail", "lastModifiedById", "lastModifiedByName", "lastModifiedByEmail"].filter((key) => typeof raw[key] === "string" && raw[key].trim()).map((key) => [key, raw[key].trim().slice(0, 254)])),
    submissionDate: isoDate(raw.submissionDate || raw.submission_date || ""),
    status: PROJECT_STATUSES.includes(raw.status) ? raw.status : "Ongoing",
    createdAt: isoInstant(raw.createdAt || raw.created_at),
    lastModifiedAt: isoInstant(raw.lastModifiedAt || raw.last_modified_at),
  };
}

export function touchProjectMetadata(metadata, now = new Date().toISOString()) {
  const stamp = new Date(now).toISOString();
  const normalized = normalizeProjectMetadata({ project_metadata: metadata, project_name: metadata?.name });
  return { ...normalized, createdAt: normalized.createdAt || stamp, lastModifiedAt: stamp };
}

export function metadataPayload(metadata) {
  const normalized = normalizeProjectMetadata({ project_metadata: metadata, project_name: metadata?.name });
  return {
    ...normalized,
    name: normalized.name,
    submissionDate: normalized.submissionDate,
    status: normalized.status,
    createdAt: normalized.createdAt,
    lastModifiedAt: normalized.lastModifiedAt,
  };
}

const KNOWN_PROJECT_KEYS = new Set([
  "schema", "project_id", "project_name", "project_metadata", "units", "client_info", "whiteboard", "sheets", "conditions",
  "condition_columns", "shape_labels", "palette", "shapes", "markups", "rfis", "sheet_group",
  "last_group", "sheet_tabs", "sheet_bookmarks", "sheet_levels", "provenance_counters", "pinned",
]);

export function preserveUnknownProjectFields(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !KNOWN_PROJECT_KEYS.has(key)));
}

export function formatProjectDate(value, options = {}) {
  if (!value) return "Not set";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : new Intl.DateTimeFormat(undefined, options).format(date);
}

// Author is portable project metadata, independent of who last edits the project.
export function withProjectAuthor(metadata, user, profileName = "") {
  if (metadata?.authorId || metadata?.authorName || metadata?.authorEmail || !user?.id) return metadata;
  const authorName = profileName || user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Unknown";
  return { ...metadata, authorId: user.id, authorName, ...(user.email ? { authorEmail: user.email } : {}) };
}
export function cloudStatusLabel({ ready, user, driveConnected, offline, status }) {
  if (offline) return "Offline";
  if (user && status && !["Local Only", "Synced"].includes(status)) return status;
  return ready && user && driveConnected ? "" : "Local Only";
}

export function withProjectEditor(metadata, user, profileName = "") {
  return { ...metadata, lastModifiedById: user?.id || "", lastModifiedByName: user ? profileName || user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || "Unknown" : "", lastModifiedByEmail: user?.email || "" };
}
