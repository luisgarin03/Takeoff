import { ANN_SCHEMA } from "./store.js";
import { base64ToBytes, bytesToBase64, validateWhiteboard } from "./whiteboard.js";

const FORMAT = "opentakeoff.project";
const VERSION = 2;
export const MAX_PROJECT_FILE_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message) => { throw new Error(message); };

export function validateAnnotations(a) {
  if (!object(a) || a.schema !== ANN_SCHEMA) fail("Unsupported project takeoff format.");
  for (const key of ["conditions", "shapes", "sheets", "markups", "rfis"]) {
    if (a[key] !== undefined && (!Array.isArray(a[key]) || !a[key].every(object))) fail(`Invalid project ${key}.`);
  }
  if (!Array.isArray(a.conditions) || !Array.isArray(a.shapes)) fail("Project takeoff data is missing.");
  if (a.project_name !== undefined && typeof a.project_name !== "string") fail("Invalid project name.");
  for (const key of ["sheet_tabs", "sheet_group", "last_group", "sheet_bookmarks", "palette"]) {
    if (a[key] !== undefined && (!Array.isArray(a[key]) || !a[key].every((v) => typeof v === "string"))) fail(`Invalid project ${key}.`);
  }
}

export async function digest(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function projectFolderName(name) {
  // eslint-disable-next-line no-control-regex -- Control characters are invalid in Windows filenames.
  const stem = String(name || "Untitled project").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 100);
  return stem || "Untitled project";
}

export function projectFilename(name) {
  return `${projectFolderName(name)}.otk`;
}

/** @returns {Promise<Uint8Array>} */
export async function exportProjectFile(source, payload) {
  const { zip, strToU8 } = await import("fflate");
  // Autosave omits default units. A portable file must not inherit the next
  // browser's units preference when reopening an imperial project.
  const annotations = { ...payload, schema: ANN_SCHEMA, units: payload.units || "imperial" };
  validateAnnotations(annotations);
  const files = {};
  const plans = [];
  const attachments = new Map();
  let total = 0;
  async function packWhiteboard(payload) {
    if (payload.whiteboard === undefined) return payload;
    validateWhiteboard(payload.whiteboard);
    const assets = [];
    for (const asset of payload.whiteboard.assets) {
      if (asset.missing) fail(`Whiteboard file is Local Only or unavailable: ${asset.name}. Restore it before exporting.`);
      const bytes = base64ToBytes(asset.data);
      const sha256 = await digest(bytes);
      const path = `attachments/${sha256}.bin`;
      // Revisions share immutable attachments; store each original only once.
      if (!attachments.has(path)) {
        total += bytes.length;
        if (total > MAX_PROJECT_FILE_BYTES) fail("Project exceeds the 512 MB portable file limit.");
        files[path] = [bytes, { level: 0 }];
        attachments.set(path, { path, size: bytes.length, sha256 });
      }
      const { data: _data, ...meta } = asset;
      assets.push({ ...meta, path });
    }
    return { ...payload, whiteboard: { ...payload.whiteboard, assets } };
  }
  for (const { name } of await source.listSheets()) {
    const bytes = await source.loadPdfData(name);
    total += bytes.byteLength;
    if (total > MAX_PROJECT_FILE_BYTES) fail("Project exceeds the 512 MB portable file limit.");
    const path = `plans/${plans.length}.pdf`;
    files[path] = [bytes, { level: 0 }]; // PDFs are already compressed.
    plans.push({ name, path, size: bytes.length, sha256: await digest(bytes) });
  }
  const snapshots = [];
  for (const { id } of await source.listSnapshots()) {
    const record = await source.getSnapshot(id);
    if (!record) fail("A revision changed while saving. Please try again.");
    const savedPayload = { ...record.payload, schema: ANN_SCHEMA, units: record.payload.units || "imperial" };
    validateAnnotations(savedPayload);
    snapshots.push({ id: record.id, ts: record.ts, label: record.label ?? null,
      payload: await packWhiteboard(savedPayload) });
  }
  const packed = await packWhiteboard(annotations);
  const manifest = strToU8(JSON.stringify({ format: FORMAT, version: VERSION, annotations: packed, plans, snapshots, attachments: [...attachments.values()] }));
  if (manifest.length > MAX_MANIFEST_BYTES || total + manifest.length > MAX_PROJECT_FILE_BYTES || plans.length + attachments.size + 1 > MAX_ENTRIES) {
    fail("Project exceeds the portable file size limit.");
  }
  files["project.json"] = manifest;
  const bytes = await new Promise((resolve, reject) => zip(files, { level: 6 }, (err, data) => err ? reject(err) : resolve(data)));
  if (bytes.length > MAX_PROJECT_FILE_BYTES) fail("Project exceeds the 512 MB portable file limit.");
  return bytes;
}

export async function readProjectFile(bytes) {
  if (bytes.byteLength > MAX_PROJECT_FILE_BYTES) fail("Project file exceeds the 512 MB limit.");
  const { unzip, strFromU8 } = await import("fflate");
  let budget = MAX_PROJECT_FILE_BYTES;
  const names = new Set();
  let invalid = "";
  const entries = await new Promise((resolve, reject) => unzip(bytes, {
    filter: (entry) => {
      if (names.has(entry.name) || names.size >= MAX_ENTRIES) invalid = "Duplicate or excessive project entries.";
      names.add(entry.name);
      if (entry.name !== "project.json" && !/^plans\/\d+\.pdf$/.test(entry.name) && !/^attachments\/[a-f0-9]{64}\.bin$/.test(entry.name)) invalid = "Unexpected file in project archive.";
      budget -= entry.originalSize;
      if (budget < 0 || (entry.name === "project.json" && entry.originalSize > MAX_MANIFEST_BYTES)) invalid = "Project archive is too large.";
      return !invalid;
    },
  }, (err, data) => err ? reject(new Error("Couldn't read project archive. The file may be damaged.")) : resolve(data)));
  if (invalid) fail(invalid);
  if (!entries["project.json"]) fail("This is not an OpenTakeoff project file.");
  let manifest;
  try { manifest = JSON.parse(strFromU8(entries["project.json"])); }
  catch { fail("Project metadata is damaged."); }
  if (!object(manifest) || manifest.format !== FORMAT || ![1, VERSION].includes(manifest.version)) fail("Unsupported project file version.");
  validateAnnotations(manifest.annotations);
  if (!Array.isArray(manifest.plans) || !Array.isArray(manifest.snapshots)) fail("Project contents are missing.");
  const usedNames = new Set();
  const usedPaths = new Set();
  const pdfs = [];
  for (const plan of manifest.plans) {
    if (!object(plan) || typeof plan.name !== "string" || !plan.name.trim() || usedNames.has(plan.name) ||
      typeof plan.path !== "string" || !/^plans\/\d+\.pdf$/.test(plan.path) || usedPaths.has(plan.path)) fail("Invalid or duplicate plan in project.");
    usedNames.add(plan.name); usedPaths.add(plan.path);
    const data = entries[plan.path];
    if (!data || data.length !== plan.size || !strFromU8(data.subarray(0, 1024)).includes("%PDF-") || await digest(data) !== plan.sha256) {
      fail(`Missing or damaged plan: ${plan.name}`);
    }
    pdfs.push({ name: plan.name, bytes: data });
  }
  const attachments = new Map();
  const records = manifest.version === 1 ? [] : manifest.attachments;
  if (!Array.isArray(records)) fail("Project attachments are missing.");
  for (const entry of records) {
    if (!object(entry) || typeof entry.path !== "string" || !/^attachments\/[a-f0-9]{64}\.bin$/.test(entry.path) || attachments.has(entry.path)) fail("Invalid project attachment.");
    const data = entries[entry.path];
    if (!data || data.length !== entry.size || await digest(data) !== entry.sha256 || entry.path !== `attachments/${entry.sha256}.bin`) fail("Missing or damaged whiteboard attachment.");
    attachments.set(entry.path, bytesToBase64(data));
  }
  if (Object.keys(entries).length !== pdfs.length + attachments.size + 1) fail("Project has unlisted files.");
  const referenced = new Set();
  function unpackWhiteboard(payload) {
    if (payload.whiteboard === undefined) return;
    const board = payload.whiteboard;
    if (!object(board) || !Array.isArray(board.assets)) fail("Invalid whiteboard data in project.");
    if (manifest.version === 2) board.assets = board.assets.map((asset) => {
      if (!object(asset) || !attachments.has(asset.path)) fail("Missing whiteboard attachment.");
      const { path, ...meta } = asset;
      referenced.add(path);
      return { ...meta, data: attachments.get(path) };
    });
    validateWhiteboard(board);
  }
  unpackWhiteboard(manifest.annotations);
  const ids = new Set();
  for (const snapshot of manifest.snapshots) {
    if (!object(snapshot) || typeof snapshot.id !== "string" || !snapshot.id || ids.has(snapshot.id) ||
      !Number.isFinite(snapshot.ts) || (snapshot.label !== null && typeof snapshot.label !== "string")) fail("Invalid project revision.");
    ids.add(snapshot.id);
    validateAnnotations(snapshot.payload);
    unpackWhiteboard(snapshot.payload);
  }
  if (referenced.size !== attachments.size) fail("Project has unreferenced whiteboard attachments.");
  return { annotations: manifest.annotations, pdfs, snapshots: manifest.snapshots };
}
