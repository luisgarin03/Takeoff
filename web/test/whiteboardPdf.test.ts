import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFDict, PDFRawStream, PDFName, PDFNumber, degrees, rgb } from "pdf-lib";
import { base64ToBytes, bytesToBase64 } from "../src/lib/whiteboard.js";
import { boardContentRect, boardNoteCardRect, boardPdfBounds, boardPdfPlacement, boardRectsIntersect, buildWhiteboardPdf, checkBoardRaster, whiteboardPdfFilename } from "../src/lib/whiteboardPdf.js";
import type { BoardPdfRenderer } from "../src/lib/whiteboardPdf.js";

const png = base64ToBytes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=");
const note = (extra = {}) => ({ id: "note", kind: "note", text: "Door dimensions", color: "yellow", x: 0, y: 0, w: 280, h: 220, ...extra });
const board = (items: Array<ReturnType<typeof note> | ReturnType<typeof file>> = [note()], assets: ReturnType<typeof asset>[] = []) => ({ version: 1, items, assets });
const renderer: BoardPdfRenderer = { renderNote: async () => png, readImage: async (bytes) => ({ bytes, width: 1, height: 1, type: "image/png" }) };
const asset = (bytes: Uint8Array, type = "application/pdf") => ({ id: "a", name: "Reference.pdf", type, size: bytes.length, data: bytesToBase64(bytes) });
const file = (extra = {}) => ({ id: "file", kind: "file", assetId: "a", page: 1, x: -400, y: 300, w: 402, h: 280, ...extra });
async function pdfBytes(rotation = 0) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  page.drawRectangle({ x: 0, y: 0, width: 600, height: 400, color: rgb(.2, .4, .8) });
  page.setCropBox(40, 20, 400, 200); page.setRotation(degrees(rotation));
  page.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
  return doc.save();
}
async function assertPage(result: Awaited<ReturnType<typeof buildWhiteboardPdf>>, width: number, height: number) {
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 1);
  const page = doc.getPage(0);
  for (const getBox of ["getMediaBox", "getCropBox", "getBleedBox", "getTrimBox", "getArtBox"] as const) {
    assert.deepEqual(page[getBox](), { x: 0, y: 0, width, height });
  }
  return page;
}

test("note export includes its title/header colors and complete card while rendering the colored body", async () => {
  const b = board();
  assert.deepEqual(boardContentRect(b.items[0]), { x: 1, y: 39, w: 278, h: 180 });
  assert.deepEqual(boardNoteCardRect(b.items[0]), { x: 0, y: 0, w: 280, h: 220 });
  let renderedRect: { x: number; y: number; w: number; h: number } | undefined;
  const result = await buildWhiteboardPdf(board([note({ title: "Field note", headerColor: "#2563EB", color: "green" })]), {
    renderer: { ...renderer, renderNote: async (_item, rect) => { renderedRect = rect; return png; } },
  });
  const page = await assertPage(result, 210, 165);
  assert.deepEqual(renderedRect, { x: 0, y: 0, w: 280, h: 220 });
  assert.ok(page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict).keys().length > 0, "complete note card is embedded in the PDF");
});

test("whiteboard arrows export over their own board bounds in the selected color", async () => {
  const b = { ...board([]), arrows: [{ id: "arrow-1", from: [10, 20], to: [80, 60], color: "#2563EB" }] };
  const result = await buildWhiteboardPdf(b, { renderer });
  assert.deepEqual(result.bounds, { minX: 10, minY: 20, maxX: 80, maxY: 60, width: 52.5, height: 30 });
  await assertPage(result, 52.5, 30);
});

test("whiteboard rectangles export as vector drawings and define rectangle-only board bounds", async () => {
  const b = { ...board([]), rectangles: [{ id: "rect-1", x: -20, y: 30, w: 200, h: 100, color: "#DC2626", strokeWidth: 4 }] };
  const result = await buildWhiteboardPdf(b, { renderer });
  assert.deepEqual(result.bounds, { minX: -20, minY: 30, maxX: 180, maxY: 130, width: 150, height: 75 });
  await assertPage(result, 150, 75);
});

test("selected export regions include intersecting rectangles and exclude distant ones", async () => {
  const b = { ...board([]), rectangles: [
    { id: "inside", x: 60, y: 60, w: 80, h: 40, color: "#2563EB" },
    { id: "outside", x: 500, y: 500, w: 100, h: 100, color: "#DC2626" },
  ] };
  const region = { x: 50, y: 50, w: 200, h: 100 };
  const result = await buildWhiteboardPdf(b, { region, renderer });
  assert.deepEqual(result.bounds, { minX: 50, minY: 50, maxX: 250, maxY: 150, width: 150, height: 75 });
  await assertPage(result, 150, 75);
});

test("selected export region sets exact PDF bounds and clips intersecting cards while skipping other cards", async () => {
  const seen: string[] = [];
  const items = [note({ x: 0, y: 0 }), note({ id: "outside", x: 500, y: 500 })];
  const region = { x: 50, y: 50, w: 200, h: 100 };
  const result = await buildWhiteboardPdf(board(items), { region, boardName: "Whiteboard selection", renderer: { ...renderer, renderNote: async (item) => { seen.push(item.id); return png; } } });
  await assertPage(result, 150, 75);
  assert.deepEqual(result.bounds, { minX: 50, minY: 50, maxX: 250, maxY: 150, width: 150, height: 75 });
  assert.deepEqual(seen, ["note"]);
  assert.equal(result.filename, "Untitled project - Whiteboard selection.pdf");
});

test("selection crops arrows to the requested area and can export blank selected space", async () => {
  const b = { ...board([note()]), arrows: [
    { id: "inside", from: [60, 60], to: [120, 90], color: "#2563EB" },
    { id: "outside", from: [500, 500], to: [600, 600], color: "#DC2626" },
  ] };
  const region = { x: 50, y: 50, w: 200, h: 100 };
  const result = await buildWhiteboardPdf(b, { region, renderer });
  await assertPage(result, 150, 75);
  const blank = await buildWhiteboardPdf(board([note()]), { region: { x: 700, y: 800, w: 80, h: 60 }, renderer });
  await assertPage(blank, 60, 45);
});

test("board rectangle intersection detects touching edges as outside", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(boardRectsIntersect(a, { x: 9, y: 9, w: 4, h: 4 }), true);
  assert.equal(boardRectsIntersect(a, { x: 10, y: 0, w: 2, h: 2 }), false);
});

test("example bounds are exactly 1400 x 800 world units and PDF y is inverted", () => {
  const a = { x: -200, y: 100, w: 100, h: 200 }, b = { x: 1000, y: 700, w: 200, h: 200 };
  const bounds = boardPdfBounds([a, b]);
  assert.deepEqual(bounds, { minX: -200, minY: 100, maxX: 1200, maxY: 900, width: 1050, height: 600 });
  assert.deepEqual(boardPdfPlacement(a, bounds), { x: 0, y: 450, width: 75, height: 150 });
  assert.deepEqual(boardPdfPlacement(b, bounds), { x: 900, y: 0, width: 150, height: 150 });
});

test("distant negative/offscreen notes retain the gap and stack order at any camera or DPR", async () => {
  const items = [note({ x: -201, y: 61, w: 102 + 160, h: 240 }), note({ id: "far", x: 999, y: 661, w: 202, h: 240 })];
  const b = board(items), seen: string[] = [];
  const draw: BoardPdfRenderer = { ...renderer, renderNote: async (item) => { seen.push(item.id); return png; } };
  const a = await buildWhiteboardPdf({ ...b, view: { x: 999, y: -70, scale: .15 }, selected: "far", devicePixelRatio: 2.625 }, { renderer: draw });
  const c = await buildWhiteboardPdf({ ...b, view: { x: -70, y: 999, scale: 3 }, selected: "note", devicePixelRatio: 1 }, { renderer: draw });
  assert.deepEqual(a.bounds, c.bounds);
  await assertPage(a, 1051.5, 630); await assertPage(c, 1051.5, 630);
  assert.deepEqual(seen, ["note", "far", "note", "far"]);
});

test("hidden/deleted objects are excluded; locked notes still export", async () => {
  const seen: string[] = [];
  const b = board([note({ locked: true }), note({ id: "hidden", x: -10000, hidden: true }), note({ id: "deleted", x: 10000, deleted: true }), note({ id: "invisible", visible: false })]);
  const result = await buildWhiteboardPdf(b, { renderer: { ...renderer, renderNote: async (item) => { seen.push(item.id); return png; } } });
  await assertPage(result, 210, 165);
  assert.deepEqual(seen, ["note"]);
});

test("rotated/cropped source PDF pages stay vector and preserve their displayed aspect ratio", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const result = await buildWhiteboardPdf(board([file()], [asset(await pdfBytes(rotation))]));
    const page = await assertPage(result, rotation % 180 ? 75 : 300, 150);
    const xobjects = page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    assert.equal(xobjects.keys().length, 1);
    const form = xobjects.lookup(xobjects.keys()[0]);
    assert.ok(form instanceof PDFRawStream);
    assert.equal(form.dict.get(PDFName.of("Subtype"))!.toString(), "/Form");
    assert.equal(form.dict.get(PDFName.of("BBox"))!.toString(), "[ 40 20 440 220 ]");
  }
});

test("selected PDF page is exported, and nonexistent pages fail clearly", async () => {
  const doc = await PDFDocument.create(); doc.addPage([100, 100]); doc.addPage([800, 400]);
  const a = asset(await doc.save());
  const result = await buildWhiteboardPdf(board([file({ page: 2 })], [a]));
  await assertPage(result, 300, 150);
  await assert.rejects(buildWhiteboardPdf(board([file({ page: 3 })], [a])), /Page 3 does not exist/);
});

test("PDF annotations use a complete page raster rather than disappearing during vector embedding", async () => {
  const doc = await PDFDocument.load(await pdfBytes());
  doc.getPage(0).node.set(PDFName.of("Annots"), doc.context.obj([doc.context.obj({ Subtype: "Text" })]));
  let rendered = 0;
  const result = await buildWhiteboardPdf(board([file()], [asset(await doc.save())]), { renderer: { ...renderer, renderPdfPage: async (_bytes, page, rect) => {
    rendered++; assert.equal(page, 1); assert.equal(rect.w, 400); return png;
  } } });
  assert.equal(rendered, 1); await assertPage(result, 300, 150);
});

test("image content bounds match contain sizing, not its letterboxed card or viewport", async () => {
  let receivedCrop: unknown = undefined;
  const result = await buildWhiteboardPdf(board([file()], [asset(png, "image/png")]), { renderer: {
    ...renderer, readImage: async (bytes, type, crop) => { receivedCrop = crop; return { bytes, width: 1, height: 1, type }; },
  } });
  await assertPage(result, .75, .75);
  assert.deepEqual(receivedCrop, { x: 0, y: 0, w: 1, h: 1 }, "legacy images use their complete original pixels");
  assert.deepEqual(boardContentRect(file(), { width: 800, height: 400 }), { x: -399, y: 339, w: 400, h: 200 });
});

test("image crops are passed to the renderer non-destructively and control exported aspect and bounds", async () => {
  const crop = { x: .25, y: .2, w: .5, h: .25 };
  const seen: unknown[] = [];
  const result = await buildWhiteboardPdf(board([file({ crop })], [asset(png, "image/png")]), { renderer: {
    ...renderer,
    readImage: async (bytes, type, received) => {
      seen.push(received);
      return { bytes, type, width: 400, height: 100 };
    },
  } });
  assert.deepEqual(seen, [crop]);
  assert.deepEqual(result.bounds, { minX: -399, minY: 389, maxX: 1, maxY: 489, width: 300, height: 75 });
  await assertPage(result, 300, 75);
});

test("image export cache distinguishes two crops of the same source asset", async () => {
  const calls: unknown[] = [];
  const crops = [{ x: 0, y: 0, w: .5, h: 1 }, { x: .5, y: 0, w: .5, h: 1 }];
  const items = [
    file({ id: "left", crop: crops[0] }),
    file({ id: "right", x: 100, crop: crops[1] }),
  ];
  await buildWhiteboardPdf(board(items, [asset(png, "image/png")]), { renderer: {
    ...renderer,
    readImage: async (bytes, type, crop) => { calls.push(crop); return { bytes, type, width: 100, height: 100 }; },
  } });
  assert.deepEqual(calls, crops);
});

test("future groups, card kinds, thick strokes and transforms fail explicitly instead of losing geometry", async () => {
  for (const extra of [{ kind: "group", children: [note()], rotation: 30, scale: 2 }, { kind: "arrow", strokeWidth: 50 }, { kind: "shape" }, { rotation: 45 }, { scaleX: 2 }, { stroke: "red" }, { opacity: .5 }]) {
    await assert.rejects(buildWhiteboardPdf(board([note(extra)]), { renderer }), /unsupported whiteboard type or effect/);
  }
});

test("empty, degenerate, corrupt and oversized content produce actionable errors", async () => {
  await assert.rejects(buildWhiteboardPdf(board([])), /Nothing to export/);
  assert.throws(() => boardPdfBounds([{ x: 0, y: 0, w: 0, h: 1 }]), /Invalid/);
  assert.throws(() => boardPdfBounds([{ x: 0, y: 0, w: .001, h: 1 }]), /too small/);
  assert.throws(() => checkBoardRaster(9000, 100), /8192/);
  assert.throws(() => checkBoardRaster(5000, 5000), /16-megapixel/);
  await assert.rejects(buildWhiteboardPdf(board([note({ w: 5000, h: 5000 })]), { renderer }), /16-megapixel/);
  await assert.rejects(buildWhiteboardPdf(board(Array.from({ length: 5 }, (_, i) => note({ id: String(i), w: 1300, h: 1300 }))), { renderer }), /64-megapixel/);
  await assert.rejects(buildWhiteboardPdf(board([note(), note({ id: "far", x: 30000 })]), { renderer }), /single-page PDF limit/);
  await assert.rejects(buildWhiteboardPdf(board([file()], [asset(new Uint8Array([1, 2, 3]))])), /Reference.pdf/);
  await assert.rejects(buildWhiteboardPdf(board(), { renderer: { ...renderer, renderNote: async () => { throw new Error("Enlarge the note"); } } }), /Enlarge the note/);
});

test("success, failure and adapter mutation cannot change the document, view, selection or undo state", async () => {
  const b = { ...board(), view: { x: 100, y: -20, scale: .3 }, selected: "note", history: [note({ text: "before" })] };
  const original = structuredClone(b);
  await buildWhiteboardPdf(b, { renderer: { ...renderer, renderNote: async (item) => { item.text = "changed"; return png; } } });
  assert.deepEqual(b, original);
  await assert.rejects(buildWhiteboardPdf(b, { renderer: { ...renderer, renderNote: async (item) => { item.text = "changed"; throw new Error("failure"); } } }), /failure/);
  assert.deepEqual(b, original);
});

test("export snapshots synchronously before asset awaits and honors cancellation", async () => {
  const b = { ...board(), items: [note()] }, seen: string[] = [];
  const promise = buildWhiteboardPdf(b, { renderer: { ...renderer, renderNote: async (item) => { seen.push(item.text); return png; } } });
  b.items[0].text = "Edited while exporting";
  await promise; assert.deepEqual(seen, ["Door dimensions"]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(buildWhiteboardPdf(b, { renderer, signal: controller.signal }), { name: "AbortError" });
});

test("download name includes sanitized project and current board names", () => {
  assert.equal(whiteboardPdfFilename('Job: A/B', 'Notes?'), "Job_ A_B - Notes_.pdf");
  assert.equal(whiteboardPdfFilename(""), "Untitled project - Whiteboard.pdf");
  assert.ok(whiteboardPdfFilename("A".repeat(200)).endsWith(" - Whiteboard.pdf"));
});
