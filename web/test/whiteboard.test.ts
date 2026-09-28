import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { emptyWhiteboard, bytesToBase64, base64ToBytes, validateWhiteboard, removeBoardItem, zoomBoard, fitBoard, whiteboardClipboardContent, whiteboardClipboardFileName, whiteboardFileType } from "../src/lib/whiteboard.js";
import { localStore, createFileProjectStore, importFileProject, ANN_SCHEMA } from "../src/lib/store.js";
import { exportProjectFile, readProjectFile } from "../src/lib/projectFile.js";
import { WHITEBOARD_PDF_PREVIEW_MAX_PIXELS, whiteboardPdfPreviewScale } from "../src/lib/whiteboardPdfPreview.js";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const pdf = strToU8("%PDF-1.7\nwhiteboard reference\n%%EOF");
const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
function board() {
  return { version: 1, assets: [
    { id: "pdf", name: "Reference.pdf", type: "application/pdf", size: pdf.length, data: bytesToBase64(pdf) },
    { id: "img", name: "Site.png", type: "image/png", size: png.length, data: bytesToBase64(png) },
  ], items: [
    { id: "note", kind: "note", text: "Verify door dimensions", color: "yellow", x: -125, y: 200, w: 300, h: 220 },
    { id: "p", kind: "file", assetId: "pdf", page: 3, x: 300, y: -90, w: 440, h: 520 },
    { id: "i", kind: "file", assetId: "img", page: 1, x: 800, y: 30, w: 300, h: 220 },
  ] };
}
const payload = () => ({ schema: ANN_SCHEMA, conditions: [{id: "c"}], shapes: [{id: "s", verts_norm: [[.1,.2],[.3,.4]]}],
  sheets: [{sheet_id: "Plan.pdf", units_per_px: .25}], units: "imperial", whiteboard: board() });

test("whiteboard files, notes, page selection and layout round-trip in portable projects without becoming plans", async () => {
  await localStore.saveAnnotations(payload());
  const saved = await exportProjectFile(localStore, payload());
  const files = unzipSync(saved);
  const manifest = JSON.parse(strFromU8(files["project.json"]));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.attachments.length, 2);
  assert.equal(manifest.annotations.whiteboard.assets[0].data, undefined);
  assert.deepEqual(files[manifest.annotations.whiteboard.assets[0].path], pdf);
  const project = await readProjectFile(saved);
  assert.deepEqual(project.annotations, payload());
  assert.deepEqual(project.pdfs, []);
  const reopened = createFileProjectStore(await importFileProject(project));
  assert.deepEqual((await reopened.loadAnnotations()).whiteboard, board());
  assert.equal((await reopened.listSheets()).length, 0);
  assert.deepEqual((await readProjectFile(await exportProjectFile(reopened, await reopened.loadAnnotations()))).annotations, payload());
});

test("revision-only attachments are retained and repeated files are deduplicated", async () => {
  await localStore.saveSnapshot("Before deletion", payload());
  const current = { ...payload(), whiteboard: removeBoardItem(board(), "p") };
  const saved = await exportProjectFile(localStore, current);
  const manifest = JSON.parse(strFromU8(unzipSync(saved)["project.json"]));
  assert.equal(manifest.attachments.length, 2);
  const parsed = await readProjectFile(saved);
  assert.deepEqual(parsed.annotations, current);
  assert.deepEqual(parsed.snapshots[0].payload, payload());
});

test("legacy version 1 files still open with no whiteboard", async () => {
  const legacy = { format: "opentakeoff.project", version: 1, annotations: { schema: ANN_SCHEMA, conditions: [], shapes: [] }, plans: [], snapshots: [] };
  assert.deepEqual((await readProjectFile(zipSync({"project.json": strToU8(JSON.stringify(legacy))}))).annotations, legacy.annotations);
});

test("missing, corrupted and unreferenced board assets are rejected before importing", async () => {
  const files = unzipSync(await exportProjectFile(localStore, payload()));
  const manifest = JSON.parse(strFromU8(files["project.json"]));
  const path = manifest.attachments[0].path;
  await assert.rejects(readProjectFile(zipSync({...files, [path]: strToU8("corrupt")})), /damaged whiteboard/);
  const missing = {...files}; delete missing[path];
  await assert.rejects(readProjectFile(zipSync(missing)), /damaged whiteboard/);
  const changed = structuredClone(manifest);
  changed.annotations.whiteboard = emptyWhiteboard();
  await assert.rejects(readProjectFile(zipSync({...files, "project.json": strToU8(JSON.stringify(changed))})), /unreferenced/);
  changed.annotations.whiteboard = manifest.annotations.whiteboard;
  changed.annotations.whiteboard.items[1].assetId = "missing";
  await assert.rejects(readProjectFile(zipSync({...files, "project.json": strToU8(JSON.stringify(changed))})), /Invalid whiteboard/);
});

test("whiteboard validation rejects remote/active files, duplicate IDs and invalid geometry", () => {
  assert.equal(validateWhiteboard(board()).items.length, 3);
  assert.deepEqual(validateWhiteboard(emptyWhiteboard()), emptyWhiteboard());
  const invalids = [
    { ...board(), assets: [{ ...board().assets[0], data: "https://example.com/file.pdf" }] },
    { ...board(), assets: [{ ...board().assets[0], type: "image/svg+xml" }] },
    { ...board(), assets: [board().assets[0], board().assets[0]] },
    { ...board(), items: [{ ...board().items[0], x: Infinity }] },
    { ...board(), items: [{ ...board().items[0], w: 0 }] },
    { ...board(), items: [{ ...board().items[0], color: "url(attack)" }] },
    { ...board(), items: [{ ...board().items[1], page: 0 }] },
  ];
  for (const b of invalids) assert.throws(() => validateWhiteboard(b), /Invalid whiteboard/);
});

test("removal prunes only unused attachments and never mutates the undo snapshot", () => {
  const original = board();
  const reduced = removeBoardItem(original, "p");
  assert.equal(reduced.assets.length, 1);
  assert.equal(reduced.assets[0].id, "img");
  assert.equal(original.assets.length, 2);
  const shared = { ...original, items: [...original.items, {...original.items[1], id: "p2"}] };
  assert.equal(removeBoardItem(shared, "p").assets.length, 2);
});

test("board zoom preserves the pointed-to position, clamps scale and fits negative coordinates", () => {
  const view = { x: -300, y: 200, scale: 1.4 }, point = {x: 110, y: 180};
  const next = zoomBoard(view, point, .2);
  assert.ok(Math.abs((point.x - view.x) / view.scale - (point.x - next.x) / next.scale) < 1e-10);
  assert.ok(Math.abs((point.y - view.y) / view.scale - (point.y - next.y) / next.scale) < 1e-10);
  assert.equal(zoomBoard(view, point, 0).scale, .15);
  assert.equal(zoomBoard(view, point, 99).scale, 4);
  const fit = fitBoard(board().items, 1200, 800);
  for (const item of board().items) {
    assert.ok(fit.x + item.x * fit.scale >= 31);
    assert.ok(fit.y + item.y * fit.scale >= 31);
    assert.ok(fit.x + (item.x + item.w) * fit.scale <= 1169);
    assert.ok(fit.y + (item.y + item.h) * fit.scale <= 769);
  }
});

test("file type allowlist and base64 preserve original bytes", () => {
  const bytes = Uint8Array.from({length: 70000}, (_, i) => i % 256);
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes);
  assert.equal(whiteboardFileType({name: "notes.PDF", type: ""}), "application/pdf");
  assert.equal(whiteboardFileType({name: "photo.jpeg", type: ""}), "image/jpeg");
  assert.equal(whiteboardFileType({name: "index.html", type: "text/html"}), null);
});

test("PDF preview resolution increases detail but caps canvas pixel area", () => {
  const standardPage = { width: 612, height: 792 };
  const normal = whiteboardPdfPreviewScale(standardPage.width, standardPage.height, 1);
  const high = whiteboardPdfPreviewScale(standardPage.width, standardPage.height, 2);
  assert.ok(high > normal);
  const huge = whiteboardPdfPreviewScale(10000, 14000, 3);
  assert.ok(10000 * huge * 14000 * huge <= WHITEBOARD_PDF_PREVIEW_MAX_PIXELS + 1);
  assert.equal(whiteboardPdfPreviewScale(0, 792, 3), 1);
});

test("clipboard content accepts files or plain text without duplicating image fallback text", () => {
  const image = { name: "", type: "image/png", size: 8 };
  const imageClipboard = { items: [{ kind: "file", getAsFile: () => image }], files: [], getData: () => "redundant image URL" };
  assert.deepEqual(whiteboardClipboardContent(imageClipboard), { files: [image], text: "" });
  assert.deepEqual(whiteboardClipboardContent({ items: [], files: [], getData: (type: string) => type === "text/plain" ? "Door schedule\nLevel 2" : "" }), { files: [], text: "Door schedule\nLevel 2" });
  assert.deepEqual(whiteboardClipboardContent(null), { files: [], text: "" });
});

test("unnamed clipboard images receive a readable stable filename", () => {
  const date = new Date("2026-09-28T14:30:15.123Z");
  assert.equal(whiteboardClipboardFileName({ name: "", type: "image/png" }, 0, date), "Pasted image 2026-09-28T14-30-15-123Z.png");
  assert.equal(whiteboardClipboardFileName({ name: "Detail Sheet.PDF", type: "application/pdf" }, 0, date), "Detail Sheet.PDF");
});
