export const WHITEBOARD_FILE_LIMIT = 25 * 1024 * 1024;
export const WHITEBOARD_TOTAL_LIMIT = 75 * 1024 * 1024;
export const WHITEBOARD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"];
export const NOTE_COLORS = { yellow: "#fff0af", green: "#d8efdf", blue: "#dce9ff" };
export const emptyWhiteboard = () => ({ version: 1, items: [], assets: [] });

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
  return board;
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
