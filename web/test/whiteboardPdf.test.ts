import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFDict, PDFRawStream, PDFName, PDFNumber, decodePDFRawStream, degrees, rgb } from "pdf-lib";
import { base64ToBytes, bytesToBase64 } from "../src/lib/whiteboard.js";
import { boardArrowPaintBounds, boardContentRect, boardNoteCardRect, boardPdfBounds, boardPdfPlacement, boardRectanglePaintBounds, boardRectsIntersect, buildWhiteboardPdf, checkBoardRaster, whiteboardPdfFilename } from "../src/lib/whiteboardPdf.js";
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

function assertPageBoxes(page: ReturnType<PDFDocument["getPage"]>, width: number, height: number) {
  for (const getBox of ["getMediaBox", "getCropBox", "getBleedBox", "getTrimBox", "getArtBox"] as const) {
    assert.deepEqual(page[getBox](), { x: 0, y: 0, width, height });
  }
}

function pageContent(doc: PDFDocument, page: ReturnType<PDFDocument["getPage"]>) {
  const contents = page.node.Contents();
  if (!contents) return "";
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs.map((ref) => {
    const stream = doc.context.lookup(ref);
    assert.ok(stream instanceof PDFRawStream);
    return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  }).join("\n");
}

function pageXObjectCount(page: ReturnType<PDFDocument["getPage"]>) {
  const resources = page.node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xobjects?.keys().length || 0;
}

function assertPrintableClip(doc: PDFDocument, page: ReturnType<PDFDocument["getPage"]>) {
  assert.match(pageContent(doc, page), /18 18 756 576 re\s+W\s+n/, "page content is clipped to the 18pt printable margin");
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
  const painted = boardArrowPaintBounds(b.arrows[0])!;
  assert.deepEqual(result.bounds, { minX: painted.x, minY: painted.y, maxX: painted.x + painted.w, maxY: painted.y + painted.h,
    width: painted.w * .75, height: painted.h * .75 });
  await assertPage(result, painted.w * .75, painted.h * .75);
});

test("arrow paint bounds retain a horizontal shaft and complete arrowhead", () => {
  const bounds = boardArrowPaintBounds({ from: [100, 100], to: [200, 100] })!;
  assert.deepEqual({ x: bounds.x, y: bounds.y, w: bounds.w }, { x: 98.75, y: 94.12, w: 101.25 });
  assert.ok(Math.abs(bounds.h - 11.76) < 1e-10);
});

test("whiteboard rectangles export as vector drawings and define rectangle-only board bounds", async () => {
  const b = { ...board([]), rectangles: [{ id: "rect-1", x: -20, y: 30, w: 200, h: 100, color: "#DC2626", strokeWidth: 4 }] };
  const result = await buildWhiteboardPdf(b, { renderer });
  assert.deepEqual(boardRectanglePaintBounds(b.rectangles[0]), { x: -22, y: 28, w: 204, h: 104 });
  assert.deepEqual(result.bounds, { minX: -22, minY: 28, maxX: 182, maxY: 132, width: 153, height: 78 });
  await assertPage(result, 153, 78);
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

test("selected regions include drawing ink even when the centerline is outside", async () => {
  const b = { ...board([]), rectangles: [{ id: "edge", x: 101, y: 20, w: 40, h: 40, color: "#2563EB", strokeWidth: 4 }] };
  const result = await buildWhiteboardPdf(b, { region: { x: 0, y: 0, w: 100, h: 100 }, renderer });
  const page = await assertPage(result, 75, 75);
  assert.ok(page.node.Contents(), "the visible half-stroke is exported into the selected area");
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

test("paged export uses fixed Letter pages and reports sparse tiles in row-major order", async () => {
  const result = await buildWhiteboardPdf(board([
    note({ id: "top-left", x: 0, y: 0 }),
    note({ id: "top-right", x: 2200, y: 0 }),
    note({ id: "lower-left", x: 0, y: 850 }),
  ]), { pageMode: "pages", projectName: "Job: A/B", boardName: "Whiteboard pages", renderer });
  const doc = await PDFDocument.load(result.bytes);

  assert.equal(doc.getPageCount(), 3, "blank tiles are omitted instead of becoming empty PDF pages");
  for (const page of doc.getPages()) {
    assertPageBoxes(page, 792, 612);
    assertPrintableClip(doc, page);
    assert.equal(pageXObjectCount(page), 1, "each occupied tile contains its one note card");
  }
  assert.deepEqual((result as any).pages, [
    { row: 0, col: 0, bounds: { x: 0, y: 0, w: 1008, h: 768 } },
    { row: 0, col: 2, bounds: { x: 2016, y: 0, w: 1008, h: 768 } },
    { row: 1, col: 0, bounds: { x: 0, y: 768, w: 1008, h: 768 } },
  ]);
  assert.equal(result.filename, "Job_ A_B - Whiteboard pages.pdf");
});

test("paged export assigns a boundary touch once and repeats only content that crosses it", async () => {
  const calls: string[] = [];
  const draw: BoardPdfRenderer = { ...renderer, renderNote: async (item) => { calls.push(item.id); return png; } };
  const exact = await buildWhiteboardPdf(board([
    note({ id: "anchor", x: 0, y: 0 }),
    note({ id: "edge", x: 1008, y: 0 }),
  ]), { pageMode: "pages", renderer: draw });
  const exactDoc = await PDFDocument.load(exact.bytes);
  assert.deepEqual((exact as any).pages.map(({ row, col }: any) => [row, col]), [[0, 0], [0, 1]]);
  assert.deepEqual(exactDoc.getPages().map(pageXObjectCount), [1, 1], "touching the tile edge does not duplicate a card");
  assert.deepEqual(calls, ["anchor", "edge"], "each note is rendered once before page placement");

  calls.length = 0;
  const crossing = await buildWhiteboardPdf(board([
    note({ id: "anchor", x: 0, y: 0 }),
    note({ id: "crossing", x: 1007, y: 0 }),
  ]), { pageMode: "pages", renderer: draw });
  const crossingDoc = await PDFDocument.load(crossing.bytes);
  assert.deepEqual(crossingDoc.getPages().map(pageXObjectCount), [2, 1], "a card with painted area on both sides continues on both pages");
  for (const page of crossingDoc.getPages()) assertPrintableClip(crossingDoc, page);
  assert.deepEqual(calls, ["anchor", "crossing"], "a crossing card is rasterized once and reused");
});

test("paged export supports sparse boards beyond the single-page size limit", async () => {
  const distant = board([
    note({ id: "origin", x: 0, y: 0 }),
    note({ id: "distant", x: 20160, y: 0 }),
  ]);
  await assert.rejects(buildWhiteboardPdf(distant, { renderer }), /single-page PDF limit/);

  const calls: string[] = [];
  const result = await buildWhiteboardPdf(distant, { pageMode: "pages", renderer: {
    ...renderer, renderNote: async (item) => { calls.push(item.id); return png; },
  } });
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 2);
  assert.deepEqual((result as any).pages.map(({ row, col }: any) => [row, col]), [[0, 0], [0, 20]]);
  assert.deepEqual(calls, ["origin", "distant"], "empty columns do not cause repeated note rendering");
});

test("long paged exports yield so cancellation can stop page construction", async () => {
  const controller = new AbortController();
  const b = { ...board([note()]), rectangles: [
    { id: "long", x: 0, y: 300, w: 1008 * 10 - 10, h: 100, color: "#2563EB", strokeWidth: 4 },
  ] };
  await assert.rejects(buildWhiteboardPdf(b, { pageMode: "pages", signal: controller.signal, renderer: {
    ...renderer,
    renderNote: async () => {
      setTimeout(() => controller.abort(), 0);
      return png;
    },
  } }), { name: "AbortError" });
});

test("paged export keeps multi-page drawings as vectors", async () => {
  const b = { ...board([]), rectangles: [
    { id: "wide", x: 0, y: 0, w: 1100, h: 100, color: "#DC2626", strokeWidth: 4 },
  ] };
  const result = await buildWhiteboardPdf(b, { pageMode: "pages", renderer });
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 2);
  for (const page of doc.getPages()) {
    assertPageBoxes(page, 792, 612);
    assertPrintableClip(doc, page);
    assert.equal(pageXObjectCount(page), 0, "rectangle paths stay vector instead of becoming images");
    assert.match(pageContent(doc, page), /\bRG\b[\s\S]*\bS\b/, "the rectangle stroke is drawn on every intersected tile");
  }
});

test("paged export reuses vector PDF content at exact positions across page edges", async () => {
  const source = await PDFDocument.create();
  source.addPage([1200, 100]).drawRectangle({ x: 0, y: 0, width: 1200, height: 100, color: rgb(.2, .4, .8) });
  const item = file({ x: 0, y: 0, w: 1202, h: 280 });
  const result = await buildWhiteboardPdf(board([item], [asset(await source.save())]), { pageMode: "pages" });
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 2);
  const translations = [[18, 518.7857142857143], [-738, 518.7857142857143]];
  doc.getPages().forEach((page, index) => {
    const xobjects = page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
    const forms = xobjects.keys().map((key) => xobjects.lookup(key)).filter((value) => value instanceof PDFRawStream
      && value.dict.get(PDFName.of("Subtype"))?.toString() === "/Form");
    assert.equal(forms.length, 1, "the source PDF remains a reusable vector Form XObject");
    const [x, y] = translations[index];
    assert.match(pageContent(doc, page), new RegExp(`1 0 0 1 ${x} ${y} cm`));
  });
});

test("paged export omits blank interior tiles for hollow rectangles", async () => {
  const b = { ...board([]), rectangles: [
    { id: "outline", x: 0, y: 0, w: 2200, h: 1700, color: "#2563EB", strokeWidth: 4 },
  ] };
  const result = await buildWhiteboardPdf(b, { pageMode: "pages", renderer });
  assert.deepEqual((result as any).pages.map(({ row, col }: any) => [row, col]), [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ]);
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 8);
  for (const page of doc.getPages()) assert.match(pageContent(doc, page), /\bRG\b[\s\S]*\bS\b/);
});

test("paged export follows a long diagonal arrow without blank bounding-box pages", async () => {
  const b = { ...board([]), arrows: [
    { id: "diagonal", from: [0, 0], to: [2200, 1700], color: "#DC2626" },
  ] };
  const result = await buildWhiteboardPdf(b, { pageMode: "pages", renderer });
  assert.deepEqual((result as any).pages.map(({ row, col }: any) => [row, col]), [
    [0, 0], [1, 0], [1, 1], [2, 1], [2, 2],
  ]);
  const doc = await PDFDocument.load(result.bytes);
  assert.equal(doc.getPageCount(), 5);
  for (const page of doc.getPages()) assert.match(pageContent(doc, page), /\bm\b[\s\S]*\bl\b/);
});

test("single-page mode keeps its existing custom-size behavior", async () => {
  const b = board([
    note({ id: "left", x: 0, y: 0 }),
    note({ id: "right", x: 1100, y: 0 }),
  ]);
  const single = await buildWhiteboardPdf(b, { renderer });
  await assertPage(single, 1035, 165);
  assert.equal(single.filename, "Untitled project - Whiteboard.pdf");

  const paged = await buildWhiteboardPdf(b, { pageMode: "pages", boardName: "Whiteboard pages", renderer });
  const doc = await PDFDocument.load(paged.bytes);
  assert.equal(doc.getPageCount(), 2);
  for (const page of doc.getPages()) assertPageBoxes(page, 792, 612);
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

test("small PDF pages use the same logical contain size in full and selected-area exports", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 50]);
  const pdf = asset(await doc.save());
  const item = file({ x: 10, y: 20, w: 402, h: 280 });
  const full = await buildWhiteboardPdf(board([item], [pdf]));
  assert.deepEqual(full.bounds, { minX: 111, minY: 109, maxX: 311, maxY: 209, width: 150, height: 75 });
  await assertPage(full, 150, 75);

  const annotated = await PDFDocument.load(await doc.save());
  annotated.getPage(0).node.set(PDFName.of("Annots"), annotated.context.obj([annotated.context.obj({ Subtype: "Text" })]));
  let renderedRect: { x: number; y: number; w: number; h: number } | undefined;
  const region = { x: 50, y: 50, w: 200, h: 100 };
  await buildWhiteboardPdf(board([item], [asset(await annotated.save())]), { region, renderer: {
    ...renderer, renderPdfPage: async (_bytes, _page, rect) => { renderedRect = rect; return png; },
  } });
  assert.deepEqual(renderedRect, { x: 111, y: 109, w: 200, h: 100 });
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

test("fractional image crops keep their live logical size instead of shifting after raster rounding", async () => {
  const crop = { x: 0, y: 0, w: .5, h: 1 };
  const result = await buildWhiteboardPdf(board([file({ x: 10, y: 20, w: 402, h: 500, crop })], [asset(png, "image/png")]), { renderer: {
    ...renderer,
    readImage: async (bytes, type) => ({ bytes, type, width: 201, height: 301, layoutWidth: 200.5, layoutHeight: 301 }),
  } });
  assert.deepEqual(result.bounds, { minX: 110.75, minY: 118.5, maxX: 311.25, maxY: 419.5, width: 150.375, height: 225.75 });
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
  await assert.rejects(buildWhiteboardPdf({ ...board([]), rectangles: [
    { id: "too-many-pages", x: 0, y: 0, w: 1008 * 501, h: 100, color: "#2563EB", strokeWidth: 4 },
  ] }, { pageMode: "pages", renderer }), /500 pages/);
  await assert.rejects(buildWhiteboardPdf(board(), { pageMode: "pages", region: { x: 0, y: 0, w: 100, h: 100 }, renderer }), /single-page PDF format/);
  await assert.rejects(buildWhiteboardPdf(board(), { pageMode: "unknown" as any, renderer }), /Unknown whiteboard PDF page mode/);
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
