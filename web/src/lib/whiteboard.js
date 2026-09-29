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
export const emptyWhiteboard = () => ({ version: 1, items: [], assets: [], arrows: [] });

export function sanitizeWhiteboardArrows(board) {
  if (!board || !Object.hasOwn(board, "arrows")) return board;
  if (!Array.isArray(board.arrows)) return { ...board, arrows: [] };
  const colors = new Set(WHITEBOARD_FILE_HEADER_COLORS.map(({ value }) => value.toLowerCase()));
  const arrows = board.arrows.filter((arrow) => arrow &&
    Array.isArray(arrow.from) && arrow.from.length === 2 && arrow.from.every(Number.isFinite) &&
    Array.isArray(arrow.to) && arrow.to.length === 2 && arrow.to.every(Number.isFinite) &&
    Math.hypot(arrow.to[0] - arrow.from[0], arrow.to[1] - arrow.from[1]) > 0.01
  ).map((arrow) => ({ ...arrow, color: typeof arrow.color === "string" && colors.has(arrow.color.toLowerCase())
    ? WHITEBOARD_FILE_HEADER_COLORS.find(({ value }) => value.toLowerCase() === arrow.color.toLowerCase()).value
    : "#1f3fc7" }));
  if (arrows.length === board.arrows.length && arrows.every((arrow, index) => arrow === board.arrows[index])) return board;
  return { ...board, arrows };
}

export function appendWhiteboardArrow(board, from, to, color = "#1f3fc7") {
  if (!Array.isArray(from) || from.length !== 2 || !Array.isArray(to) || to.length !== 2 || [...from, ...to].some((value) => !Number.isFinite(value)) ||
    Math.hypot(to[0] - from[0], to[1] - from[1]) < 1) return board;
  const supported = WHITEBOARD_FILE_HEADER_COLORS.find(({ value }) => value.toLowerCase() === String(color).toLowerCase())?.value || "#1f3fc7";
  return { ...board, arrows: [...(Array.isArray(board.arrows) ? board.arrows : []), { id: crypto.randomUUID(), from: [...from], to: [...to], color: supported }] };
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
      item.w < 160 || item.h < 140 || item.w > 5000 || item.h > 5000) invalid();
    ids.add(item.id);
    if (item.kind === "note") {
      if (typeof item.text !== "string" || item.text.length > 100000 || !Object.hasOwn(NOTE_COLORS, item.color)) invalid();
    } else if (!assets.has(item.assetId) || !Number.isInteger(item.page) || item.page < 1 || item.page > 100000) invalid();
  }
  return sanitizeWhiteboardArrows(sanitizeWhiteboardFileHeaderColors(board));
}

export function removeBoardItem(board, id) {
  const items = board.items.filter((item) => item.id !== id);
  const used = new Set(items.map((item) => item.assetId));
  return { ...board, items, assets: board.assets.filter((asset) => used.has(asset.id)) };
}

export function zoomBoard(view, point, nextScale) {
  const scale = Math.min(4, Math.max(.15, nextScale));
  return { scale, x: point.x - (point.x - view.x) * scale / view.scale, y: point.y - (point.y - view.y) * scale / view.scale };
}

export function fitBoard(items, width, height) {
  if (!items.length) return { x: 0, y: 0, scale: 1 };
  const x = Math.min(...items.map((item) => item.x));
  const y = Math.min(...items.map((item) => item.y));
  const w = Math.max(...items.map((item) => item.x + item.w)) - x;
  const h = Math.max(...items.map((item) => item.y + item.h)) - y;
  const scale = Math.max(.15, Math.min(1, (width - 64) / w, (height - 64) / h));
  return { scale, x: (width - w * scale) / 2 - x * scale, y: (height - h * scale) / 2 - y * scale };
}

export function fitWhiteboard(board, width, height) {
  const arrows = Array.isArray(board?.arrows) ? board.arrows.map(({ from, to }) => ({
    x: Math.min(from[0], to[0]), y: Math.min(from[1], to[1]),
    w: Math.max(1, Math.abs(to[0] - from[0])), h: Math.max(1, Math.abs(to[1] - from[1])),
  })) : [];
  return fitBoard([...(board?.items || []), ...arrows], width, height);
}
