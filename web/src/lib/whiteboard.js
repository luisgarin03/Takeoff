export const WHITEBOARD_FILE_LIMIT = 25 * 1024 * 1024;
export const WHITEBOARD_TOTAL_LIMIT = 75 * 1024 * 1024;
export const WHITEBOARD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];
export const NOTE_COLORS = { yellow: "#fff0af", green: "#d8efdf", blue: "#dce9ff" };
export const WHITEBOARD_FILE_HEADER_COLORS = [
  { name: "Terracotta", value: "#C96442" },
  { name: "Green", value: "#2F7D54" },
  { name: "Blue", value: "#2563EB" },
  { name: "Purple", value: "#9333EA" },
  { name: "Gold", value: "#B8860B" },
  { name: "Teal", value: "#0D9488" },
  { name: "Magenta", value: "#BE185D" },
  { name: "Dark slate", value: "#1F2937" },
  { name: "Red", value: "#DC2626" },
  { name: "Cyan", value: "#0891B2" },
];
export const WHITEBOARD_MIN_CROP_SIZE = 0.01;
export const WHITEBOARD_SOW_COLORS = WHITEBOARD_FILE_HEADER_COLORS;
export const WHITEBOARD_SOW_DEFAULT_COLOR = WHITEBOARD_SOW_COLORS[0].value;
export const WHITEBOARD_SOW_MAX_TABS = 100;
export const WHITEBOARD_SOW_MAX_PANELS = 100;
export const WHITEBOARD_SOW_MAX_ENTRIES = 5000;
export const WHITEBOARD_SOW_MAX_TEXT = 100000;
export const WHITEBOARD_SOW_MAX_TAKEOFF_TITLE = 120;
export const WHITEBOARD_SOW_DEFAULT_TAKEOFF_TITLE = "FENCE TAKEOFF";
export const WHITEBOARD_SOW_MAX_SECTION_TITLE = 80;
export const WHITEBOARD_SOW_DEFAULT_SECTION_TITLE = "SOW";
export const WHITEBOARD_EXPORT_AREA_LIMIT = 200;
export const WHITEBOARD_EXPORT_PAGE_SIZES = ["match", "letter", "legal", "tabloid", "arch-d", "arch-e"];
export const WHITEBOARD_EXPORT_ORIENTATIONS = ["auto", "portrait", "landscape"];
export const WHITEBOARD_EXPORT_QUALITIES = ["standard", "high", "maximum"];
export const WHITEBOARD_EXPORT_FITS = ["fit", "actual"];
const SOW_COLOR = /^#[0-9a-f]{6}$/i;
const SOW_ENTRY_KINDS = new Set(["line", "title"]);

export const emptyWhiteboardSow = (id = "sow-1", tabId = "scope-1") => ({ id, x: 40, y: 40, w: 280, logoWidth: 128, takeoffTitle: WHITEBOARD_SOW_DEFAULT_TAKEOFF_TITLE,
  sectionTitle: WHITEBOARD_SOW_DEFAULT_SECTION_TITLE,
  activeTabId: tabId, tabs: [{ id: tabId, name: "Scope 1", entries: [] }] });
export const emptyWhiteboard = () => ({ version: 1, items: [], assets: [], arrows: [], rectangles: [], sows: [emptyWhiteboardSow()], exportAreas: [] });

const uniqueId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const sowColor = (value) => typeof value === "string" && SOW_COLOR.test(value) ? value.toUpperCase() : WHITEBOARD_SOW_DEFAULT_COLOR;

function normalizeWhiteboardExportArea(area, index = 0) {
  if (!area || typeof area !== "object" || Array.isArray(area) ||
    typeof area.id !== "string" || !area.id || area.id.length > 128 ||
    ![area.x, area.y, area.w, area.h].every(Number.isFinite) ||
    Math.abs(area.x) > 1e7 || Math.abs(area.y) > 1e7 || area.w < 4 || area.h < 4 || area.w > 1e7 || area.h > 1e7) return null;
  const pageSize = WHITEBOARD_EXPORT_PAGE_SIZES.includes(area.pageSize) ? area.pageSize : "match";
  const orientation = WHITEBOARD_EXPORT_ORIENTATIONS.includes(area.orientation) ? area.orientation : "auto";
  const quality = WHITEBOARD_EXPORT_QUALITIES.includes(area.quality) ? area.quality : "high";
  // Whiteboard coordinates do not currently carry a dependable physical
  // calibration. Preserve a future actual-scale choice when loading, but the
  // editor enables it only when a reliable calibration is available.
  const fit = WHITEBOARD_EXPORT_FITS.includes(area.fit) ? area.fit : "fit";
  const suppliedName = typeof area.name === "string" ? area.name.trim().slice(0, 120) : "";
  const order = Number.isInteger(area.order) && area.order >= 0 ? area.order : index;
  const sourceItemId = typeof area.sourceItemId === "string" && area.sourceItemId && area.sourceItemId.length <= 128 ? area.sourceItemId : null;
  const sourcePage = Number.isInteger(area.sourcePage) && area.sourcePage >= 1 && area.sourcePage <= 100000 ? area.sourcePage : null;
  return { id: area.id, name: suppliedName || `Area ${index + 1}`, x: area.x, y: area.y, w: area.w, h: area.h,
    order, pageSize, orientation, quality, fit,
    ...(sourceItemId && sourcePage ? { sourceItemId, sourcePage } : {}) };
}

export function sanitizeWhiteboardExportAreas(board) {
  if (!board || !Object.hasOwn(board, "exportAreas")) return board;
  if (!Array.isArray(board.exportAreas)) return { ...board, exportAreas: [] };
  const ids = new Set();
  const exportAreas = board.exportAreas.slice(0, WHITEBOARD_EXPORT_AREA_LIMIT)
    .map((area, index) => normalizeWhiteboardExportArea(area, index))
    .filter((area) => area && !ids.has(area.id) && ids.add(area.id))
    .sort((a, b) => a.order - b.order)
    .map((area, order) => ({ ...area, order }));
  return { ...board, exportAreas };
}

export function appendWhiteboardExportArea(board, rect, settings = {}) {
  const safe = sanitizeWhiteboardExportAreas(Object.hasOwn(board || {}, "exportAreas") ? board : { ...board, exportAreas: [] });
  if (safe.exportAreas.length >= WHITEBOARD_EXPORT_AREA_LIMIT || !rect ||
    ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w < 4 || rect.h < 4) return safe;
  const previous = safe.exportAreas.at(-1);
  const raw = { id: uniqueId("export-area"), name: `Area ${safe.exportAreas.length + 1}`, ...rect,
    pageSize: settings.pageSize ?? previous?.pageSize ?? "match",
    orientation: settings.orientation ?? previous?.orientation ?? "auto",
    quality: settings.quality ?? previous?.quality ?? "high",
    fit: settings.fit ?? previous?.fit ?? "fit", order: safe.exportAreas.length,
    ...(typeof settings.name === "string" ? { name: settings.name } : {}),
    ...(typeof settings.sourceItemId === "string" ? { sourceItemId: settings.sourceItemId } : {}),
    ...(Number.isInteger(settings.sourcePage) ? { sourcePage: settings.sourcePage } : {}) };
  const area = normalizeWhiteboardExportArea(raw, safe.exportAreas.length);
  return area ? { ...safe, exportAreas: [...safe.exportAreas, area] } : safe;
}

export function updateWhiteboardExportArea(board, id, changes) {
  if (typeof id !== "string" || !changes || typeof changes !== "object" || Array.isArray(changes)) return board;
  const safe = sanitizeWhiteboardExportAreas(Object.hasOwn(board || {}, "exportAreas") ? board : { ...board, exportAreas: [] });
  let changed = false;
  const exportAreas = safe.exportAreas.map((area, index) => {
    if (area.id !== id) return area;
    const normalized = normalizeWhiteboardExportArea({ ...area, ...changes, id: area.id, order: area.order }, index);
    if (!normalized) return area;
    changed = Object.keys(normalized).some((key) => normalized[key] !== area[key]);
    return normalized;
  });
  return changed ? { ...safe, exportAreas } : safe;
}

export function removeWhiteboardExportArea(board, id) {
  const safe = sanitizeWhiteboardExportAreas(Object.hasOwn(board || {}, "exportAreas") ? board : { ...board, exportAreas: [] });
  const exportAreas = safe.exportAreas.filter((area) => area.id !== id).map((area, order) => ({ ...area, order }));
  return exportAreas.length === safe.exportAreas.length ? safe : { ...safe, exportAreas };
}

export function moveWhiteboardExportArea(board, id, direction) {
  const safe = sanitizeWhiteboardExportAreas(Object.hasOwn(board || {}, "exportAreas") ? board : { ...board, exportAreas: [] });
  const from = safe.exportAreas.findIndex((area) => area.id === id);
  const to = direction === "up" ? from - 1 : direction === "down" ? from + 1 : Number(direction);
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= safe.exportAreas.length || to === from) return safe;
  const exportAreas = [...safe.exportAreas];
  const [area] = exportAreas.splice(from, 1); exportAreas.splice(to, 0, area);
  return { ...safe, exportAreas: exportAreas.map((entry, order) => ({ ...entry, order })) };
}

export function duplicateWhiteboardExportArea(board, id) {
  const safe = sanitizeWhiteboardExportAreas(Object.hasOwn(board || {}, "exportAreas") ? board : { ...board, exportAreas: [] });
  if (safe.exportAreas.length >= WHITEBOARD_EXPORT_AREA_LIMIT) return safe;
  const from = safe.exportAreas.findIndex((area) => area.id === id);
  if (from < 0) return safe;
  const source = safe.exportAreas[from];
  const duplicate = { ...source, id: uniqueId("export-area"), name: `${source.name} copy`.slice(0, 120),
    x: source.x + 24, y: source.y + 24, order: from + 1 };
  const exportAreas = [...safe.exportAreas]; exportAreas.splice(from + 1, 0, duplicate);
  return { ...safe, exportAreas: exportAreas.map((area, order) => ({ ...area, order })) };
}

export function clearWhiteboardExportAreas(board) {
  const safe = sanitizeWhiteboardExportAreas(Object.hasOwn(board || {}, "exportAreas") ? board : { ...board, exportAreas: [] });
  return safe.exportAreas.length ? { ...safe, exportAreas: [] } : safe;
}

function normalizeWhiteboardSow(value, strict = false) {
  const fail = () => { if (strict) throw new Error("Invalid whiteboard data in project."); return emptyWhiteboardSow(); };
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.tabs) ||
    !value.tabs.length || value.tabs.length > WHITEBOARD_SOW_MAX_TABS) return fail();
  const tabIds = new Set(), entryIds = new Set();
  let entryCount = 0;
  const tabs = [];
  for (const [tabIndex, tab] of value.tabs.entries()) {
    if (!tab || typeof tab !== "object" || Array.isArray(tab) || typeof tab.id !== "string" || !tab.id || tab.id.length > 128 ||
      tabIds.has(tab.id) || typeof tab.name !== "string" || !tab.name.trim() || tab.name.length > 80 || !Array.isArray(tab.entries)) return fail();
    tabIds.add(tab.id);
    const entries = [];
    for (const entry of tab.entries) {
      entryCount += 1;
      const kind = entry?.kind == null ? "line" : entry.kind;
      if (entryCount > WHITEBOARD_SOW_MAX_ENTRIES || !entry || typeof entry !== "object" || Array.isArray(entry) ||
        typeof entry.id !== "string" || !entry.id || entry.id.length > 128 || entryIds.has(entry.id) ||
        typeof entry.text !== "string" || entry.text.length > WHITEBOARD_SOW_MAX_TEXT || !SOW_ENTRY_KINDS.has(kind) ||
        (kind === "line" && (typeof entry.color !== "string" || !SOW_COLOR.test(entry.color)))) return fail();
      const measurementShapeId = typeof entry.measurementShapeId === "string" && entry.measurementShapeId && entry.measurementShapeId.length <= 128
        ? entry.measurementShapeId : null;
      const measurementConditionId = typeof entry.measurementConditionId === "string" && entry.measurementConditionId && entry.measurementConditionId.length <= 128
        ? entry.measurementConditionId : null;
      const measurementShapeIds = Array.isArray(entry.measurementShapeIds) && entry.measurementShapeIds.length <= WHITEBOARD_SOW_MAX_ENTRIES
        && entry.measurementShapeIds.every((id) => typeof id === "string" && id && id.length <= 128)
        && new Set(entry.measurementShapeIds).size === entry.measurementShapeIds.length
        ? entry.measurementShapeIds : null;
      if (strict && Object.hasOwn(entry, "measurementShapeId") && !measurementShapeId) return fail();
      if (strict && Object.hasOwn(entry, "measurementConditionId") && !measurementConditionId) return fail();
      if (strict && Object.hasOwn(entry, "measurementShapeIds") && !measurementShapeIds) return fail();
      if (strict && kind === "title" && (measurementShapeId || measurementConditionId || measurementShapeIds)) return fail();
      entryIds.add(entry.id);
      entries.push(kind === "title" ? { id: entry.id, kind: "title", text: entry.text } :
        { id: entry.id, text: entry.text, color: entry.color.toUpperCase(), ...(entry.kind === "line" ? { kind: "line" } : {}),
          ...(measurementShapeId ? { measurementShapeId } : {}),
          ...(measurementConditionId ? { measurementConditionId } : {}),
          ...(measurementShapeIds ? { measurementShapeIds: [...measurementShapeIds] } : {}) });
    }
    tabs.push({ id: tab.id, name: tab.name.trim() || `Scope ${tabIndex + 1}`, entries });
  }
  const activeTabId = typeof value.activeTabId === "string" && tabIds.has(value.activeTabId) ? value.activeTabId : tabs[0].id;
  const x = Number.isFinite(value.x) && Math.abs(value.x) <= 1e7 ? value.x : 40;
  const y = Number.isFinite(value.y) && Math.abs(value.y) <= 1e7 ? value.y : 40;
  const w = Number.isFinite(value.w) && value.w >= 240 && value.w <= 800 ? value.w : 280;
  const defaultLogoWidth = Math.min(128, Math.max(72, w - 128));
  const logoWidth = Number.isFinite(value.logoWidth)
    ? Math.max(72, Math.min(240, w - 128, value.logoWidth))
    : defaultLogoWidth;
  if (strict && Object.hasOwn(value, "logoWidth") && !Number.isFinite(value.logoWidth)) return fail();
  const takeoffTitle = typeof value.takeoffTitle === "string"
    ? value.takeoffTitle.slice(0, WHITEBOARD_SOW_MAX_TAKEOFF_TITLE)
    : WHITEBOARD_SOW_DEFAULT_TAKEOFF_TITLE;
  if (strict && Object.hasOwn(value, "takeoffTitle") && typeof value.takeoffTitle !== "string") return fail();
  const sectionTitle = typeof value.sectionTitle === "string"
    ? value.sectionTitle.slice(0, WHITEBOARD_SOW_MAX_SECTION_TITLE)
    : WHITEBOARD_SOW_DEFAULT_SECTION_TITLE;
  if (strict && Object.hasOwn(value, "sectionTitle") && typeof value.sectionTitle !== "string") return fail();
  const brandAssetId = typeof value.brandAssetId === "string" && value.brandAssetId && value.brandAssetId.length <= 128 ? value.brandAssetId : null;
  if (strict && Object.hasOwn(value, "brandAssetId") && !brandAssetId) return fail();
  return { x, y, w, logoWidth, takeoffTitle, sectionTitle, activeTabId, tabs, ...(brandAssetId ? { brandAssetId } : {}) };
}

function normalizedSowPanels(board, strict = false, includeDefault = true) {
  const fail = () => { if (strict) throw new Error("Invalid whiteboard data in project."); return includeDefault ? [emptyWhiteboardSow()] : []; };
  const isLegacy = !Array.isArray(board?.sows) && board?.sow && typeof board.sow === "object";
  const source = Array.isArray(board?.sows) ? board.sows : isLegacy ? [board.sow] : includeDefault ? [emptyWhiteboardSow()] : [];
  if (source.length > WHITEBOARD_SOW_MAX_PANELS) return fail();
  const panels = [], panelIds = new Set();
  for (const [panelIndex, raw] of source.entries()) {
    const normalized = normalizeWhiteboardSow(raw, strict);
    const suppliedId = typeof raw?.id === "string" && raw.id && raw.id.length <= 128 ? raw.id : null;
    if (strict && Object.hasOwn(raw || {}, "id") && !suppliedId) return fail();
    for (const [tabIndex, tab] of normalized.tabs.entries()) {
      if (panels.length >= WHITEBOARD_SOW_MAX_PANELS) return fail();
      let id = tabIndex ? `${suppliedId || `sow-${panelIndex + 1}`}-${tab.id}` : suppliedId || `sow-${panelIndex + 1}`;
      while (panelIds.has(id)) id = `${id}-copy`;
      panelIds.add(id);
      const offset = isLegacy && tabIndex ? tabIndex * 32 : 0;
      panels.push({ ...normalized, id, x: normalized.x + offset, y: normalized.y + offset,
        activeTabId: tab.id, tabs: [{ ...tab, name: tab.name || `Scope ${panels.length + 1}` }] });
    }
  }
  return panels;
}

/** Add a safe default to legacy/local boards without changing their other data. */
export function sanitizeWhiteboardSow(board) {
  if (!board || typeof board !== "object" || Array.isArray(board)) return board;
  const includeDefault = !Object.hasOwn(board, "sows") && !Object.hasOwn(board, "sow");
  const sows = normalizedSowPanels(board, false, includeDefault).map((sow) => {
    const branding = sow.brandAssetId && Array.isArray(board.assets) ? board.assets.find((asset) =>
      asset?.id === sow.brandAssetId && typeof asset.type === "string" && asset.type.startsWith("image/")) : null;
    return sow.brandAssetId && !branding ? (({ brandAssetId: _brandAssetId, ...rest }) => rest)(sow) : sow;
  });
  const next = { ...board, sows };
  delete next.sow;
  return next;
}

function withSow(board, update, sowId = null) {
  const safe = sanitizeWhiteboardSow(board);
  const index = sowId ? safe.sows.findIndex((sow) => sow.id === sowId) : 0;
  if (index < 0) return safe;
  const sow = update(safe.sows[index]);
  if (sow === safe.sows[index]) return safe;
  const sows = [...safe.sows]; sows[index] = sow;
  return { ...safe, sows };
}

export function addWhiteboardSowPanel(board, position = null) {
  const safe = sanitizeWhiteboardSow(board);
  if (safe.sows.length >= WHITEBOARD_SOW_MAX_PANELS) return safe;
  const previous = safe.sows.at(-1);
  const number = safe.sows.length + 1;
  const panel = emptyWhiteboardSow(uniqueId("sow"), uniqueId("scope"));
  panel.tabs[0].name = `Scope ${number}`;
  panel.x = Number.isFinite(position?.x) ? position.x : previous ? previous.x + 32 : 40;
  panel.y = Number.isFinite(position?.y) ? position.y : previous ? previous.y + 32 : 40;
  return { ...safe, sows: [...safe.sows, panel] };
}

export function duplicateWhiteboardSowPanel(board, sowId) {
  const safe = sanitizeWhiteboardSow(board);
  if (safe.sows.length >= WHITEBOARD_SOW_MAX_PANELS) return safe;
  const source = safe.sows.find((sow) => sow.id === sowId);
  if (!source) return safe;
  const tab = source.tabs[0];
  const duplicate = { ...source, id: uniqueId("sow"), x: source.x + 32, y: source.y + 32,
    activeTabId: uniqueId("scope"), tabs: [{ ...tab, id: "", name: `${tab.name} copy`.slice(0, 80),
      entries: tab.entries.map((entry) => {
        const { measurementShapeId: _measurementShapeId, measurementConditionId: _measurementConditionId,
          measurementShapeIds: _measurementShapeIds, ...copy } = entry;
        return { ...copy, id: uniqueId(entry.kind === "title" ? "sow-title" : "sow-entry") };
      }) }] };
  duplicate.tabs[0].id = duplicate.activeTabId;
  return { ...safe, sows: [...safe.sows, duplicate] };
}

export function removeWhiteboardSowPanel(board, sowId) {
  const safe = sanitizeWhiteboardSow(board);
  const sows = safe.sows.filter((sow) => sow.id !== sowId);
  if (sows.length === safe.sows.length) return safe;
  const used = new Set(safe.items.map((item) => item.assetId));
  for (const sow of sows) if (sow.brandAssetId) used.add(sow.brandAssetId);
  return { ...safe, sows, assets: safe.assets.filter((asset) => used.has(asset.id)) };
}

export function addWhiteboardSowTab(board, requestedName = "", sowId = null) {
  return withSow(board, (sow) => {
    if (sow.tabs.length >= WHITEBOARD_SOW_MAX_TABS) return sow;
    const used = new Set(sow.tabs.map((tab) => tab.name.toLowerCase()));
    let number = 1;
    while (used.has(`scope ${number}`)) number += 1;
    const name = String(requestedName || "").trim().slice(0, 80) || `Scope ${number}`;
    const tab = { id: uniqueId("scope"), name, entries: [] };
    return { ...sow, activeTabId: tab.id, tabs: [...sow.tabs, tab] };
  }, sowId);
}

export function setWhiteboardSowActiveTab(board, tabId, sowId = null) {
  return withSow(board, (sow) => sow.tabs.some((tab) => tab.id === tabId) && sow.activeTabId !== tabId ? { ...sow, activeTabId: tabId } : sow, sowId);
}

export function renameWhiteboardSowTab(board, tabId, name, sowId = null) {
  const nextName = String(name || "").trim().slice(0, 80);
  if (!nextName) return board;
  return withSow(board, (sow) => {
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId || tab.name === nextName) return tab;
      changed = true; return { ...tab, name: nextName };
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

export function removeWhiteboardSowTab(board, tabId, sowId = null) {
  return withSow(board, (sow) => {
    if (sow.tabs.length <= 1 || !sow.tabs.some((tab) => tab.id === tabId)) return sow;
    const tabs = sow.tabs.filter((tab) => tab.id !== tabId);
    return { ...sow, activeTabId: sow.activeTabId === tabId ? tabs[0].id : sow.activeTabId, tabs };
  }, sowId);
}

export function updateWhiteboardSowLayout(board, changes, sowId = null) {
  return withSow(board, (sow) => {
    const x = Number.isFinite(changes?.x) ? Math.max(-1e7, Math.min(1e7, changes.x)) : sow.x;
    const y = Number.isFinite(changes?.y) ? Math.max(-1e7, Math.min(1e7, changes.y)) : sow.y;
    const w = Number.isFinite(changes?.w) ? Math.max(240, Math.min(800, changes.w)) : sow.w;
    const requestedLogoWidth = Number.isFinite(changes?.logoWidth) ? changes.logoWidth : sow.logoWidth;
    const logoWidth = Math.max(72, Math.min(240, w - 128, requestedLogoWidth));
    return x === sow.x && y === sow.y && w === sow.w && logoWidth === sow.logoWidth ? sow : { ...sow, x, y, w, logoWidth };
  }, sowId);
}

export function whiteboardSowLogoWidth(sow) {
  const w = Number.isFinite(sow?.w) ? Math.max(240, Math.min(800, sow.w)) : 280;
  const requested = Number.isFinite(sow?.logoWidth) ? sow.logoWidth : Math.min(128, w - 128);
  return Math.max(72, Math.min(240, w - 128, requested));
}

export function updateWhiteboardSowTakeoffTitle(board, title, sowId = null) {
  const nextTitle = String(title ?? "").slice(0, WHITEBOARD_SOW_MAX_TAKEOFF_TITLE);
  return withSow(board, (sow) => sow.takeoffTitle === nextTitle ? sow : { ...sow, takeoffTitle: nextTitle }, sowId);
}

export function updateWhiteboardSowSectionTitle(board, title, sowId = null) {
  const nextTitle = String(title ?? "").slice(0, WHITEBOARD_SOW_MAX_SECTION_TITLE);
  return withSow(board, (sow) => sow.sectionTitle === nextTitle ? sow : { ...sow, sectionTitle: nextTitle }, sowId);
}

/** Wrap SOW copy at whitespace boundaries so screen and PDF never split words. */
export function wrapWhiteboardSowText(measureText, text, width) {
  const lines = [];
  for (const paragraph of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureText(candidate) > width) { lines.push(line); line = word; }
      else line = candidate;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

/**
 * @param {object} board
 * @param {string} tabId
 * @param {string} [text]
 * @param {string} [color]
 * @param {string} [id]
 * @param {string | null} [sowId]
 * @param {string | null} [measurementShapeId]
 */
export function addWhiteboardSowEntry(board, tabId, text = "", color = WHITEBOARD_SOW_DEFAULT_COLOR, id = uniqueId("sow-entry"), sowId = null, measurementShapeId = null) {
  const nextText = String(text).slice(0, WHITEBOARD_SOW_MAX_TEXT);
  const linkedShapeId = typeof measurementShapeId === "string" && measurementShapeId && measurementShapeId.length <= 128 ? measurementShapeId : null;
  return withSow(board, (sow) => {
    if (sow.tabs.reduce((sum, tab) => sum + tab.entries.length, 0) >= WHITEBOARD_SOW_MAX_ENTRIES ||
      sow.tabs.some((tab) => tab.entries.some((entry) => entry.id === id))) return sow;
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      changed = true;
      return { ...tab, entries: [...tab.entries, { id, text: nextText, color: sowColor(color), ...(linkedShapeId ? { measurementShapeId: linkedShapeId } : {}) }] };
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

export function addWhiteboardSowTitle(board, tabId, text = "", id = uniqueId("sow-title"), sowId = null) {
  const nextText = String(text).slice(0, WHITEBOARD_SOW_MAX_TEXT);
  return withSow(board, (sow) => {
    if (sow.tabs.reduce((sum, tab) => sum + tab.entries.length, 0) >= WHITEBOARD_SOW_MAX_ENTRIES ||
      sow.tabs.some((tab) => tab.entries.some((entry) => entry.id === id))) return sow;
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      changed = true;
      return { ...tab, entries: [...tab.entries, { id, kind: "title", text: nextText }] };
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

/** @param {object} board @param {object | null} [asset] */
export function setWhiteboardSowBranding(board, asset = null, sowId = null) {
  const safe = sanitizeWhiteboardSow(board);
  const index = sowId ? safe.sows.findIndex((sow) => sow.id === sowId) : 0;
  if (index < 0) return safe;
  const previousId = safe.sows[index].brandAssetId;
  if (asset && (!asset.id || !asset.type?.startsWith("image/") || !WHITEBOARD_TYPES.includes(asset.type) ||
    !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > WHITEBOARD_FILE_LIMIT || typeof asset.data !== "string")) return safe;
  if (!asset && !previousId) return safe;
  const usedElsewhere = (id) => safe.items.some((item) => item.assetId === id) || safe.sows.some((sow, sowIndex) => sowIndex !== index && sow.brandAssetId === id);
  let assets = safe.assets.filter((candidate) => candidate.id !== previousId || usedElsewhere(previousId));
  if (asset) assets = [...assets.filter((candidate) => candidate.id !== asset.id), asset];
  const sow = { ...safe.sows[index] };
  if (asset) sow.brandAssetId = asset.id;
  else delete sow.brandAssetId;
  const sows = [...safe.sows]; sows[index] = sow;
  return { ...safe, assets, sows };
}

export function updateWhiteboardSowEntry(board, tabId, entryId, changes, sowId = null) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return board;
  return withSow(board, (sow) => {
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      let tabChanged = false;
      const entries = tab.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const next = { ...entry };
        if (Object.hasOwn(changes, "text")) next.text = String(changes.text).slice(0, WHITEBOARD_SOW_MAX_TEXT);
        if (entry.kind !== "title" && Object.hasOwn(changes, "color") && typeof changes.color === "string" && SOW_COLOR.test(changes.color)) next.color = changes.color.toUpperCase();
        if (next.text === entry.text && next.color === entry.color) return entry;
        changed = true; tabChanged = true; return next;
      });
      return tabChanged ? { ...tab, entries } : tab;
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

export function removeWhiteboardSowEntry(board, tabId, entryId, sowId = null) {
  return withSow(board, (sow) => {
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const entries = tab.entries.filter((entry) => entry.id !== entryId);
      if (entries.length === tab.entries.length) return tab;
      changed = true; return { ...tab, entries };
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

export function duplicateWhiteboardSowEntry(board, tabId, entryId, id = uniqueId("sow-entry"), sowId = null) {
  return withSow(board, (sow) => {
    if (sow.tabs.reduce((sum, tab) => sum + tab.entries.length, 0) >= WHITEBOARD_SOW_MAX_ENTRIES) return sow;
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const index = tab.entries.findIndex((entry) => entry.id === entryId);
      if (index < 0) return tab;
      const entries = [...tab.entries];
      // A duplicate is an intentionally independent/manual row; keeping the
      // source measurement link would make both copies update or disappear.
      const { measurementShapeId: _measurementShapeId, measurementConditionId: _measurementConditionId,
        measurementShapeIds: _measurementShapeIds, ...copy } = tab.entries[index];
      entries.splice(index + 1, 0, { ...copy, id });
      changed = true; return { ...tab, entries };
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

/** @param {object} board @param {string} tabId @param {string} entryId @param {string | null} [targetId] */
export function moveWhiteboardSowEntry(board, tabId, entryId, targetId = null, sowId = null) {
  return withSow(board, (sow) => {
    let changed = false;
    const tabs = sow.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const from = tab.entries.findIndex((entry) => entry.id === entryId);
      if (from < 0 || targetId === entryId) return tab;
      const entries = [...tab.entries];
      const [entry] = entries.splice(from, 1);
      const to = targetId == null ? entries.length : entries.findIndex((candidate) => candidate.id === targetId);
      if (to < 0) return tab;
      entries.splice(to, 0, entry);
      if (entries.every((candidate, index) => candidate === tab.entries[index])) return tab;
      changed = true; return { ...tab, entries };
    });
    return changed ? { ...sow, tabs } : sow;
  }, sowId);
}

const drawingColor = (value) => WHITEBOARD_FILE_HEADER_COLORS.find(({ value: supported }) =>
  supported.toLowerCase() === String(value).toLowerCase())?.value || "#1f3fc7";

export function normalizeWhiteboardImageCrop(crop) {
  if (crop == null) return { x: 0, y: 0, w: 1, h: 1 };
  if (typeof crop !== "object" || Array.isArray(crop) ||
    ![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite) ||
    crop.x < 0 || crop.y < 0 || crop.w < WHITEBOARD_MIN_CROP_SIZE || crop.h < WHITEBOARD_MIN_CROP_SIZE ||
    crop.x >= 1 || crop.y >= 1 || crop.x + crop.w > 1 + 1e-9 || crop.y + crop.h > 1 + 1e-9) return null;
  // Absorb harmless floating-point drift at the right/bottom edge while still
  // rejecting genuinely out-of-range project data above.
  return { x: crop.x, y: crop.y, w: Math.min(crop.w, 1 - crop.x), h: Math.min(crop.h, 1 - crop.y) };
}

export function whiteboardImageCrop(item) {
  return normalizeWhiteboardImageCrop(item?.crop) || { x: 0, y: 0, w: 1, h: 1 };
}

export function setWhiteboardImageCrop(board, id, crop) {
  const normalized = normalizeWhiteboardImageCrop(crop);
  if (!normalized) return board;
  const assets = new Map((board.assets || []).map((asset) => [asset.id, asset]));
  let changed = false;
  const items = board.items.map((item) => {
    const asset = assets.get(item.assetId);
    if (item.id !== id || item.kind !== "file" || !asset?.type?.startsWith("image/")) return item;
    const current = whiteboardImageCrop(item);
    if (["x", "y", "w", "h"].every((key) => current[key] === normalized[key]) && Object.hasOwn(item, "crop")) return item;
    changed = true;
    return { ...item, crop: normalized };
  });
  return changed ? { ...board, items } : board;
}

export function sanitizeWhiteboardArrows(board) {
  if (!board || !Object.hasOwn(board, "arrows")) return board;
  if (!Array.isArray(board.arrows)) return { ...board, arrows: [] };
  const arrows = board.arrows.filter((arrow) => arrow &&
    Array.isArray(arrow.from) && arrow.from.length === 2 && arrow.from.every(Number.isFinite) &&
    Array.isArray(arrow.to) && arrow.to.length === 2 && arrow.to.every(Number.isFinite) &&
    Math.hypot(arrow.to[0] - arrow.from[0], arrow.to[1] - arrow.from[1]) > 0.01
  ).map((arrow) => ({ ...arrow, color: drawingColor(arrow.color) }));
  if (arrows.length === board.arrows.length && arrows.every((arrow, index) => arrow === board.arrows[index])) return board;
  return { ...board, arrows };
}

export function appendWhiteboardArrow(board, from, to, color = "#1f3fc7") {
  if (!Array.isArray(from) || from.length !== 2 || !Array.isArray(to) || to.length !== 2 || [...from, ...to].some((value) => !Number.isFinite(value)) ||
    Math.hypot(to[0] - from[0], to[1] - from[1]) < 1) return board;
  return { ...board, arrows: [...(Array.isArray(board.arrows) ? board.arrows : []), { id: crypto.randomUUID(), from: [...from], to: [...to], color: drawingColor(color) }] };
}

export function sanitizeWhiteboardRectangles(board) {
  if (!board || !Object.hasOwn(board, "rectangles")) return board;
  if (!Array.isArray(board.rectangles)) return { ...board, rectangles: [] };
  const ids = new Set();
  const rectangles = board.rectangles.filter((rectangle) => {
    if (!rectangle || typeof rectangle.id !== "string" || !rectangle.id || ids.has(rectangle.id) ||
      ![rectangle.x, rectangle.y, rectangle.w, rectangle.h].every(Number.isFinite) ||
      Math.abs(rectangle.x) > 1e7 || Math.abs(rectangle.y) > 1e7 ||
      rectangle.w < 1 || rectangle.h < 1 || rectangle.w > 1e7 || rectangle.h > 1e7 ||
      (rectangle.strokeWidth !== undefined && (!Number.isFinite(rectangle.strokeWidth) || rectangle.strokeWidth <= 0))) return false;
    ids.add(rectangle.id);
    return true;
  }).map((rectangle) => ({ ...rectangle, color: drawingColor(rectangle.color),
    ...(rectangle.strokeWidth === undefined ? {} : { strokeWidth: Math.min(64, Math.max(.25, rectangle.strokeWidth)) }) }));
  if (rectangles.length === board.rectangles.length && rectangles.every((rectangle, index) => rectangle === board.rectangles[index])) return board;
  return { ...board, rectangles };
}

export function appendWhiteboardRectangle(board, from, to, color = "#1f3fc7", strokeWidth = 2.5) {
  if (!Array.isArray(from) || from.length !== 2 || !Array.isArray(to) || to.length !== 2 ||
    [...from, ...to].some((value) => !Number.isFinite(value))) return board;
  const x = Math.min(from[0], to[0]), y = Math.min(from[1], to[1]);
  const w = Math.abs(to[0] - from[0]), h = Math.abs(to[1] - from[1]);
  if (w < 1 || h < 1) return board;
  const width = Number.isFinite(strokeWidth) ? Math.min(64, Math.max(.25, strokeWidth)) : 2.5;
  return { ...board, rectangles: [...(Array.isArray(board.rectangles) ? board.rectangles : []),
    { id: crypto.randomUUID(), x, y, w, h, color: drawingColor(color), strokeWidth: width }] };
}

function drawingCollection(kind) {
  if (kind === "arrow" || kind === "arrows") return "arrows";
  if (kind === "rectangle" || kind === "rect" || kind === "rectangles") return "rectangles";
  return null;
}

export function updateWhiteboardDrawing(board, kind, id, changes) {
  const collection = drawingCollection(kind);
  if (!collection || typeof id !== "string" || !changes || typeof changes !== "object" || Array.isArray(changes)) return board;
  const source = Array.isArray(board[collection]) ? board[collection] : [];
  let changed = false;
  const drawings = source.map((drawing) => {
    if (drawing.id !== id) return drawing;
    changed = true;
    return { ...drawing, ...changes, id: drawing.id };
  });
  if (!changed) return board;
  const next = { ...board, [collection]: drawings };
  return collection === "arrows" ? sanitizeWhiteboardArrows(next) : sanitizeWhiteboardRectangles(next);
}

export function removeWhiteboardDrawing(board, kind, id) {
  const collection = drawingCollection(kind);
  if (!collection || typeof id !== "string" || !Array.isArray(board[collection])) return board;
  const drawings = board[collection].filter((drawing) => drawing.id !== id);
  return drawings.length === board[collection].length ? board : { ...board, [collection]: drawings };
}

/** @param {object} drawing @param {string | null} [kind] */
export function whiteboardDrawingBounds(drawing, kind = null) {
  const collection = drawingCollection(kind) || (Array.isArray(drawing?.from) && Array.isArray(drawing?.to) ? "arrows" : "rectangles");
  if (collection === "arrows") {
    if (!drawing || !Array.isArray(drawing.from) || !Array.isArray(drawing.to) ||
      drawing.from.length !== 2 || drawing.to.length !== 2 || [...drawing.from, ...drawing.to].some((value) => !Number.isFinite(value))) return null;
    return { x: Math.min(drawing.from[0], drawing.to[0]), y: Math.min(drawing.from[1], drawing.to[1]),
      w: Math.max(1, Math.abs(drawing.to[0] - drawing.from[0])), h: Math.max(1, Math.abs(drawing.to[1] - drawing.from[1])) };
  }
  if (!drawing || ![drawing.x, drawing.y, drawing.w, drawing.h].every(Number.isFinite) || drawing.w <= 0 || drawing.h <= 0) return null;
  return { x: drawing.x, y: drawing.y, w: drawing.w, h: drawing.h };
}

export function whiteboardHasContent(board) {
  return !!(board && ((Array.isArray(board.items) && board.items.length) ||
    (Array.isArray(board.arrows) && board.arrows.length) || (Array.isArray(board.rectangles) && board.rectangles.length) ||
    // An explicit empty panel collection is meaningful: it records that the
    // user deleted the final SOW panel and must not be replaced on reload.
    Array.isArray(board.sows) || (board.sow && Array.isArray(board.sow.tabs) && board.sow.tabs.length)));
}

export function whiteboardFileHeaderColor(value) {
  if (typeof value !== "string") return null;
  return WHITEBOARD_FILE_HEADER_COLORS.find((color) => color.value.toLowerCase() === value.toLowerCase())?.value || null;
}

export function whiteboardFileHeaderTextColor(background) {
  const color = whiteboardFileHeaderColor(background);
  if (!color) return null;
  const channel = (hex) => {
    const value = parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = .2126 * channel(color.slice(1, 3)) + .7152 * channel(color.slice(3, 5)) + .0722 * channel(color.slice(5, 7));
  const blackContrast = (luminance + .05) / .05;
  const whiteContrast = 1.05 / (luminance + .05);
  return whiteContrast >= blackContrast ? "#ffffff" : "#111827";
}

export function setWhiteboardFileHeaderColor(board, id, value) {
  return setWhiteboardItemHeaderColor(board, id, value);
}

export function setWhiteboardItemHeaderColor(board, id, value) {
  const color = value == null ? null : whiteboardFileHeaderColor(value);
  if (value != null && !color) return board;
  let changed = false;
  const items = board.items.map((item) => {
    if (item.id !== id || item.headerColor === color) return item;
    changed = true;
    return { ...item, headerColor: color };
  });
  return changed ? { ...board, items } : board;
}

export function sanitizeWhiteboardFileHeaderColors(board) {
  if (!board || !Array.isArray(board.items)) return board;
  let changed = false;
  const items = board.items.map((item) => {
    if (!item) return item;
    let next = item;
    if (item.headerColor != null) {
      const color = whiteboardFileHeaderColor(item.headerColor);
      if (color !== item.headerColor) next = { ...next, headerColor: color };
    }
    if (item.kind === "note" && Object.hasOwn(item, "title") &&
      (typeof item.title !== "string" || item.title.length > 120)) {
      next = { ...next, title: typeof item.title === "string" ? item.title.slice(0, 120) : "Note" };
    }
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { ...board, items } : board;
}

export function whiteboardFileType(file) {
  if (WHITEBOARD_TYPES.includes(file.type)) return file.type;
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" })[ext] || null;
}

export function whiteboardClipboardContent(data) {
  if (!data) return { files: [], text: "" };
  const files = Array.from(data.items || [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile?.())
    .filter(Boolean);
  const fallback = files.length ? files : Array.from(data.files || []);
  // Image clipboard payloads commonly include a redundant HTML/plain-text
  // representation. Prefer the actual bytes so one paste creates one card.
  let text = "";
  if (!fallback.length) {
    try { text = data.getData?.("text/plain") || ""; } catch { /* unavailable clipboard flavor */ }
  }
  return { files: fallback, text };
}

export function whiteboardClipboardFileName(file, index = 0, now = new Date()) {
  if (String(file?.name || "").trim()) return file.name;
  const ext = ({ "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/bmp": "bmp" })[file?.type] || "bin";
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `Pasted ${file?.type?.startsWith("image/") ? "image" : "file"} ${stamp}${index ? ` ${index + 1}` : ""}.${ext}`;
}

export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

export function base64ToBytes(data) {
  return Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
}

// Only embedded, allowlisted file bytes are accepted. Never load arbitrary URLs
// or active HTML/SVG from an imported project into a whiteboard card.
export function validateWhiteboard(board) {
  const invalid = () => { throw new Error("Invalid whiteboard data in project."); };
  if (!board || board.version !== 1 || !Array.isArray(board.items) || !Array.isArray(board.assets) || board.items.length > 2000 || board.assets.length > 500) invalid();
  const assets = new Map();
  let total = 0;
  for (const asset of board.assets) {
    const missing = asset?.missing === true && asset.data === "" && /^[a-f0-9]{64}$/.test(asset.remote_sha256);
    if (!asset || typeof asset.id !== "string" || !asset.id || assets.has(asset.id) || typeof asset.name !== "string" ||
      !WHITEBOARD_TYPES.includes(asset.type) || typeof asset.data !== "string" || asset.data.length > Math.ceil(WHITEBOARD_FILE_LIMIT / 3) * 4 ||
      asset.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data) ||
      !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > WHITEBOARD_FILE_LIMIT ||
      (!missing && asset.size !== asset.data.length / 4 * 3 - (asset.data.endsWith("==") ? 2 : asset.data.endsWith("=") ? 1 : 0))) invalid();
    total += asset.size;
    assets.set(asset.id, asset);
  }
  if (total > WHITEBOARD_TOTAL_LIMIT) invalid();
  const ids = new Set();
  for (const item of board.items) {
    if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id) || !["note", "file"].includes(item.kind) ||
      ![item.x, item.y, item.w, item.h].every(Number.isFinite) || Math.abs(item.x) > 1e7 || Math.abs(item.y) > 1e7 ||
      item.w > 5000 || item.h > 5000) invalid();
    ids.add(item.id);
    if (item.kind === "note") {
      if (item.w < 160 || item.h < 140 || typeof item.text !== "string" || item.text.length > 100000 || !Object.hasOwn(NOTE_COLORS, item.color)) invalid();
    } else {
      const asset = assets.get(item.assetId);
      if (!asset || !Number.isInteger(item.page) || item.page < 1 || item.page > 100000) invalid();
      const hasCrop = Object.hasOwn(item, "crop");
      if (hasCrop && (!asset.type.startsWith("image/") || !normalizeWhiteboardImageCrop(item.crop))) invalid();
      if (item.w < (hasCrop ? 42 : 160) || item.h < (hasCrop ? 82 : 140)) invalid();
    }
  }
  let withValidatedSow = board;
  if (Object.hasOwn(board, "sows") || Object.hasOwn(board, "sow")) {
    const sows = normalizedSowPanels(board, true, false);
    withValidatedSow = { ...board, sows };
    delete withValidatedSow.sow;
    for (const sow of sows) {
      if (!sow.brandAssetId) continue;
      const branding = assets.get(sow.brandAssetId);
      if (!branding || !branding.type.startsWith("image/")) invalid();
    }
  }
  return sanitizeWhiteboardExportAreas(sanitizeWhiteboardRectangles(sanitizeWhiteboardArrows(sanitizeWhiteboardFileHeaderColors(withValidatedSow))));
}

export function removeBoardItem(board, id) {
  const items = board.items.filter((item) => item.id !== id);
  const used = new Set(items.map((item) => item.assetId));
  for (const sow of board.sows || (board.sow ? [board.sow] : [])) if (sow.brandAssetId) used.add(sow.brandAssetId);
  const exportAreas = Array.isArray(board.exportAreas) ? board.exportAreas.filter((area) => area.sourceItemId !== id)
    .map((area, order) => ({ ...area, order })) : board.exportAreas;
  return { ...board, items, assets: board.assets.filter((asset) => used.has(asset.id)), ...(exportAreas ? { exportAreas } : {}) };
}

export function zoomBoard(view, point, nextScale) {
  const scale = Math.min(4, Math.max(.15, nextScale));
  return { scale, x: point.x - (point.x - view.x) * scale / view.scale, y: point.y - (point.y - view.y) * scale / view.scale };
}

export function fitBoard(items, width, height, maxScale = 1) {
  if (!items.length) return { x: 0, y: 0, scale: 1 };
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const w = Math.max(...items.map((item) => item.x + item.w)) - x;
  const h = Math.max(...items.map((item) => item.y + item.h)) - y;
  const scale = Math.max(.15, Math.min(Math.max(.15, Math.min(4, maxScale)), (width - 64) / w, (height - 64) / h));
  return { scale, x: (width - w * scale) / 2 - x * scale, y: (height - h * scale) / 2 - y * scale };
}

export function fitWhiteboard(board, width, height) {
  const arrows = Array.isArray(board?.arrows) ? board.arrows.map((drawing) => whiteboardDrawingBounds(drawing, "arrow")).filter(Boolean) : [];
  const rectangles = Array.isArray(board?.rectangles) ? board.rectangles.map((drawing) => whiteboardDrawingBounds(drawing, "rectangle")).filter(Boolean) : [];
  const sows = (Array.isArray(board?.sows) ? board.sows : board?.sow ? [board.sow] : []).map((sow) => {
    const active = sow.tabs.find((tab) => tab.id === sow.activeTabId) || sow.tabs[0];
    const entriesHeight = (active?.entries || []).reduce((sum, entry) => {
      const isTitle = entry.kind === "title";
      const lines = wrapWhiteboardSowText((value) => value.length * 4, entry.text, sow.w - (isTitle ? 12 : 40)).length;
      return sum + (isTitle ? Math.max(16, lines * 11 + 3) : Math.max(20, lines * 10 + 5)) + 3;
    }, 0);
    const chromeHeight = active?.entries?.length ? 138 : 200;
    return { x: sow.x, y: sow.y, w: sow.w, h: chromeHeight + entriesHeight };
  });
  return fitBoard([...(board?.items || []), ...arrows, ...rectangles, ...sows], width, height);
}
