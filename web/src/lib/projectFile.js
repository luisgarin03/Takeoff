import { ANN_SCHEMA } from "./store.js";
import { base64ToBytes, bytesToBase64, validateWhiteboard } from "./whiteboard.js";
import { COMPACT_PROJECT_VERSION, compactPagesByFile, sanitizeCompactProject } from "./compactProject.js";
import { sanitizeProjectAssistant } from "./projectAssistant.js";

const FORMAT = "opentakeoff.project";
const VERSION = 2;
export const MAX_PROJECT_FILE_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 32 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message) => { throw new Error(message); };

export function validateAnnotations(a) {
  if (!object(a) || a.schema !== ANN_SCHEMA) fail("Unsupported project takeoff format.");
  for (const key of ["conditions", "shapes", "sheets", "markups", "rfis", "chain_link_fences", "ornamental_fences"]) {
    if (a[key] !== undefined && (!Array.isArray(a[key]) || !a[key].every(object))) fail(`Invalid project ${key}.`);
  }
  if (!Array.isArray(a.conditions) || !Array.isArray(a.shapes)) fail("Project takeoff data is missing.");
  if (a.project_name !== undefined && typeof a.project_name !== "string") fail("Invalid project name.");
  for (const key of ["sheet_tabs", "sheet_group", "last_group", "sheet_bookmarks", "file_bookmarks", "palette"]) {
    if (a[key] !== undefined && (!Array.isArray(a[key]) || !a[key].every((v) => typeof v === "string"))) fail(`Invalid project ${key}.`);
  }
  if (a.compact_project !== undefined && !sanitizeCompactProject(a.compact_project)) fail("Invalid compact-project recovery data.");
  if (a.project_assistant !== undefined) {
    const sanitized = sanitizeProjectAssistant(a.project_assistant);
    if (a.project_assistant?.version !== sanitized.version || typeof a.project_assistant?.persist !== "boolean" || !Array.isArray(a.project_assistant?.messages)) fail("Invalid ChatGPT Project Assistant history.");
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

async function compactPdfPages(bytes, includedPages, name) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  let source;
  try { source = await PDFDocument.load(bytes); }
  catch { fail(`Couldn't create a marked-pages-only copy of ${name}. The PDF may be protected or incompatible.`); }
  const sourcePages = source.getPages();
  const included = [...new Set(includedPages)].sort((a, b) => a - b);
  if (included.some((page) => page > sourcePages.length)) fail(`A saved mark points past the end of ${name}.`);
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);
  const copied = await output.copyPages(source, included.map((page) => page - 1));
  const copiedByPage = new Map(included.map((page, index) => [page, copied[index]]));
  for (let index = 0; index < sourcePages.length; index++) {
    const pageNumber = index + 1;
    if (copiedByPage.has(pageNumber)) {
      output.addPage(copiedByPage.get(pageNumber));
      continue;
    }
    const original = sourcePages[index];
    const { width, height } = original.getSize();
    const page = output.addPage([width, height]);
    page.setRotation(original.getRotation());
    const title = "Page not included in this compact project";
    const help = "Use Project > Import missing files to restore the original PDF.";
    page.drawText(title, { x: Math.max(24, (width - font.widthOfTextAtSize(title, 13)) / 2), y: height / 2 + 8, size: 13, font, color: rgb(.28, .3, .34) });
    page.drawText(help, { x: Math.max(24, (width - font.widthOfTextAtSize(help, 9)) / 2), y: height / 2 - 12, size: 9, font, color: rgb(.42, .44, .48) });
  }
  return { bytes: await output.save({ useObjectStreams: true }), pageCount: sourcePages.length };
}

/** @returns {Promise<Uint8Array>} */
export async function exportProjectFile(source, payload, { compact = false } = {}) {
  const { zip, strToU8 } = await import("fflate");
  // Autosave omits default units. A portable file must not inherit the next
  // browser's units preference when reopening an imperial project.
  let annotations = { ...payload, schema: ANN_SCHEMA, units: payload.units || "imperial" };
  validateAnnotations(annotations);
  const files = {};
  const plans = [];
  const attachments = new Map();
  let total = 0;
  async function packWhiteboard(payload) {
    if (payload.whiteboard === undefined) return payload;
    const board = validateWhiteboard(payload.whiteboard);
    const assets = [];
    for (const asset of board.assets) {
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
    return { ...payload, whiteboard: { ...board, assets } };
  }
  const snapshotRecords = [];
  for (const { id } of await source.listSnapshots()) {
    const record = await source.getSnapshot(id);
    if (!record) fail("A revision changed while saving. Please try again.");
    const savedPayload = { ...record.payload, schema: ANN_SCHEMA, units: record.payload.units || "imperial" };
    validateAnnotations(savedPayload);
    snapshotRecords.push({ id: record.id, ts: record.ts, label: record.label ?? null, payload: savedPayload });
  }
  const compactPages = compact ? compactPagesByFile([annotations, ...snapshotRecords.map((record) => record.payload)]) : null;
  const compactFiles = [];
  for (const { name } of await source.listSheets()) {
    const originalBytes = await source.loadPdfData(name);
    let bytes = originalBytes;
    const originalHash = compact ? await digest(originalBytes) : "";
    const includedPages = compactPages?.get(name) || [];
    let pageCount = null;
    if (compact) {
      if (includedPages.length) {
        const result = await compactPdfPages(originalBytes, includedPages, name);
        bytes = result.bytes;
        pageCount = result.pageCount;
      }
      compactFiles.push({ name, original_size: originalBytes.byteLength, sha256: originalHash, included_pages: includedPages, ...(pageCount ? { page_count: pageCount } : {}) });
      if (!includedPages.length) continue;
    }
    total += bytes.byteLength;
    if (total > MAX_PROJECT_FILE_BYTES) fail(compact
      ? "The marked and bookmarked pages still exceed the 512 MB portable file limit. Remove unnecessary page marks/bookmarks or split the project."
      : "Project exceeds the 512 MB portable file limit. Use “Save project with marked pages only…” instead.");
    const path = `plans/${plans.length}.pdf`;
    files[path] = [bytes, { level: 0 }]; // PDFs are already compressed.
    plans.push({ name, path, size: bytes.length, sha256: await digest(bytes) });
  }
  // A compact project may be compacted again without restoring its original
  // PDFs. Keep the original file hashes/sizes so recovery still accepts those
  // originals, while recording the pages included by this newest copy.
  const previousCompact = compact ? sanitizeCompactProject(annotations.compact_project) : null;
  const previousFiles = new Map((previousCompact?.files || []).map((file) => [file.name.toLowerCase(), file]));
  const compactNames = new Set(compactFiles.map((file) => file.name.toLowerCase()));
  const recoveryFiles = compactFiles.map((file) => {
    const previous = previousFiles.get(file.name.toLowerCase());
    return previous ? { ...previous, included_pages: file.included_pages } : file;
  }).concat((previousCompact?.files || []).filter((file) => !compactNames.has(file.name.toLowerCase())));
  const compactProject = recoveryFiles.length ? {
    version: COMPACT_PROJECT_VERSION,
    mode: "marked-pages-only",
    created_at: new Date().toISOString(),
    files: recoveryFiles,
  } : null;
  if (compactProject) annotations = { ...annotations, compact_project: compactProject };
  const snapshots = [];
  for (const record of snapshotRecords) {
    const snapshotPayload = compactProject ? { ...record.payload, compact_project: compactProject } : record.payload;
    snapshots.push({ id: record.id, ts: record.ts, label: record.label,
      payload: await packWhiteboard(snapshotPayload) });
  }
  const packed = await packWhiteboard(annotations);
  const manifest = strToU8(JSON.stringify({ format: FORMAT, version: VERSION, annotations: packed, plans, snapshots, attachments: [...attachments.values()] }));
  if (manifest.length > MAX_MANIFEST_BYTES || total + manifest.length > MAX_PROJECT_FILE_BYTES || plans.length + attachments.size + 1 > MAX_ENTRIES) {
    fail(compact
      ? "The marked-pages-only project still exceeds the portable file size limit."
      : "Project exceeds the portable file size limit. Use “Save project with marked pages only…” instead.");
  }
  files["project.json"] = manifest;
  const bytes = await new Promise((resolve, reject) => zip(files, { level: 6 }, (err, data) => err ? reject(err) : resolve(data)));
  if (bytes.length > MAX_PROJECT_FILE_BYTES) fail(compact
    ? "The marked-pages-only project still exceeds the 512 MB portable file limit."
    : "Project exceeds the 512 MB portable file limit. Use “Save project with marked pages only…” instead.");
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
    // Archive integrity belongs here; PDF compatibility belongs to the shared
    // pdf.js validation gate. Keeping those concerns separate lets a mixed
    // project open with compatible plans while reporting a renamed, protected,
    // or structurally invalid plan instead of rejecting the whole archive.
    if (!data || data.length !== plan.size || await digest(data) !== plan.sha256) {
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
    payload.whiteboard = validateWhiteboard(board);
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
