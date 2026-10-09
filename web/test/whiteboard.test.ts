import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { emptyWhiteboard, bytesToBase64, base64ToBytes, validateWhiteboard, appendWhiteboardArrow, appendWhiteboardRectangle, sanitizeWhiteboardArrows, sanitizeWhiteboardRectangles, removeBoardItem, removeWhiteboardDrawing, updateWhiteboardDrawing, setWhiteboardFileHeaderColor, setWhiteboardItemHeaderColor, sanitizeWhiteboardFileHeaderColors, setWhiteboardImageCrop, normalizeWhiteboardImageCrop, whiteboardImageCrop, whiteboardHasContent, whiteboardDrawingBounds, WHITEBOARD_FILE_HEADER_COLORS, whiteboardFileHeaderColor, whiteboardFileHeaderTextColor, zoomBoard, fitBoard, fitWhiteboard, whiteboardClipboardContent, whiteboardClipboardFileName, whiteboardFileType } from "../src/lib/whiteboard.js";
import { localStore, createFileProjectStore, importFileProject, ANN_SCHEMA } from "../src/lib/store.js";
import { exportProjectFile, readProjectFile } from "../src/lib/projectFile.js";
import { WHITEBOARD_PDF_PREVIEW_MAX_PIXELS, whiteboardPdfLayoutSize, whiteboardPdfPreviewScale } from "../src/lib/whiteboardPdfPreview.js";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const pdf = strToU8("%PDF-1.7\nwhiteboard reference\n%%EOF");
const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
function board() {
  return { version: 1, assets: [
    { id: "pdf", name: "Reference.pdf", type: "application/pdf", size: pdf.length, data: bytesToBase64(pdf) },
    { id: "img", name: "Site.png", type: "image/png", size: png.length, data: bytesToBase64(png) },
  ], items: [
    { id: "note", kind: "note", title: "Field note", text: "Verify door dimensions", color: "yellow", x: -125, y: 200, w: 300, h: 220, headerColor: "#0D9488" },
    { id: "p", kind: "file", assetId: "pdf", page: 3, x: 300, y: -90, w: 440, h: 520, headerColor: "#C96442" },
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
  assert.equal(project.annotations.whiteboard.items[0].title, "Field note");
  assert.equal(project.annotations.whiteboard.items[0].headerColor, "#0D9488");
  assert.deepEqual(project.pdfs, []);
  const reopened = createFileProjectStore(await importFileProject(project));
  assert.deepEqual((await reopened.loadAnnotations()).whiteboard, board());
  assert.equal((await reopened.listSheets()).length, 0);
  assert.deepEqual((await readProjectFile(await exportProjectFile(reopened, await reopened.loadAnnotations()))).annotations, payload());
  const reset = setWhiteboardFileHeaderColor(board(), "p", null);
  const reopenedReset = await readProjectFile(await exportProjectFile(localStore, { ...payload(), whiteboard: reset }));
  assert.equal(reopenedReset.annotations.whiteboard.items[1].headerColor, null, "reset-to-default is persisted in portable files");
});

test("note titles and independent header colors persist, can reset, and leave the note fill unchanged", async () => {
  const original = board();
  const colored = setWhiteboardItemHeaderColor(original, "note", "#9333EA");
  const titled = { ...colored, items: colored.items.map((item: any) => item.id === "note" ? { ...item, title: "Dimensions" } : item) };
  assert.equal(titled.items[0].headerColor, "#9333EA");
  assert.equal(titled.items[0].title, "Dimensions");
  assert.equal(titled.items[0].color, original.items[0].color, "changing its header keeps the sticky-note fill color");
  assert.equal(titled.items[1].headerColor, original.items[1].headerColor, "changing one item does not affect another");
  const reset = setWhiteboardItemHeaderColor(titled, "note", null);
  assert.equal(reset.items[0].headerColor, null, "null restores the original note header appearance");
  assert.equal(reset.items[1].headerColor, original.items[1].headerColor);

  const saved = await exportProjectFile(localStore, { ...payload(), whiteboard: titled });
  const reopened = await readProjectFile(saved);
  assert.equal(reopened.annotations.whiteboard.items[0].title, "Dimensions");
  assert.equal(reopened.annotations.whiteboard.items[0].headerColor, "#9333EA");
  assert.equal(reopened.annotations.whiteboard.items[0].color, "yellow");

  const invalid = { ...original, items: original.items.map((item) => item.id === "note" ? { ...item, title: {}, headerColor: "not-a-color" } : item) };
  const safe = validateWhiteboard(invalid).items[0];
  assert.equal(safe.title, "Note");
  assert.equal(safe.headerColor, null);
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

test("file header colors use the supplied palette, remain per-file, and reset to the original default", () => {
  assert.deepEqual(WHITEBOARD_FILE_HEADER_COLORS.map(({ name, value }) => [name, value]), [
    ["Terracotta", "#C96442"], ["Green", "#2F7D54"], ["Blue", "#2563EB"], ["Purple", "#9333EA"], ["Gold", "#B8860B"],
    ["Teal", "#0D9488"], ["Magenta", "#BE185D"], ["Dark slate", "#1F2937"], ["Red", "#DC2626"], ["Cyan", "#0891B2"],
  ]);
  const original = board();
  const changed = setWhiteboardFileHeaderColor(original, "p", "#2563EB");
  assert.equal(changed.items[1].headerColor, "#2563EB");
  assert.equal(changed.items[2], original.items[2]);
  assert.equal(changed.items[0], original.items[0]);
  assert.equal(Object.prototype.hasOwnProperty.call(changed.items[2], "headerColor"), false);
  const reset = setWhiteboardFileHeaderColor(changed, "p", null);
  assert.equal(reset.items[1].headerColor, null);
  assert.equal(whiteboardFileHeaderColor(reset.items[1].headerColor), null);
  assert.equal(setWhiteboardFileHeaderColor(reset, "i", "red"), reset, "unsupported UI values are ignored");
  assert.equal(whiteboardFileHeaderColor("#c96442"), "#C96442", "supported hex input is canonicalized");
  for (const { value } of WHITEBOARD_FILE_HEADER_COLORS) {
    assert.equal(setWhiteboardFileHeaderColor(original, "p", value).items[1].headerColor, value, `${value} can be selected`);
    const foreground = whiteboardFileHeaderTextColor(value);
    if (foreground == null) throw new Error(`No readable foreground for ${value}`);
    assert.ok(["#ffffff", "#111827"].includes(foreground));
    const luminance = (hex: string) => {
      const channel = (pair: string) => {
        const value = parseInt(pair, 16) / 255;
        return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      };
      return .2126 * channel(hex.slice(1, 3)) + .7152 * channel(hex.slice(3, 5)) + .0722 * channel(hex.slice(5, 7));
    };
    const contrast = (Math.max(luminance(foreground), luminance(value)) + .05) / (Math.min(luminance(foreground), luminance(value)) + .05);
    assert.ok(contrast >= 4.5, `${value} has readable text contrast ${contrast}`);
  }
});

test("legacy or invalid header colors safely normalize to the unchanged default style", () => {
  const legacy = board();
  delete legacy.items[1].headerColor;
  delete legacy.items[0].headerColor;
  delete legacy.items[0].title;
  assert.equal(Object.prototype.hasOwnProperty.call(validateWhiteboard(legacy).items[1], "headerColor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(validateWhiteboard(legacy).items[0], "headerColor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(validateWhiteboard(legacy).items[0], "title"), false);
  const invalid = board();
  invalid.items[1].headerColor = "url(javascript:alert(1))";
  const safe = validateWhiteboard(invalid);
  assert.equal(safe.items[1].headerColor, null);
  assert.equal(invalid.items[1].headerColor, "url(javascript:alert(1))", "normalization does not mutate the source");
  assert.equal(sanitizeWhiteboardFileHeaderColors({ items: [{ id: "new", kind: "file" }] }).items[0].headerColor, undefined);
});

test("whiteboard arrows persist with supported colors and legacy boards without arrows remain valid", () => {
  const legacy = emptyWhiteboard();
  delete (legacy as any).arrows;
  assert.equal(validateWhiteboard(legacy).arrows, undefined, "older board data does not need an arrows field");
  const arrow = appendWhiteboardArrow(legacy, [10, 20], [180, 75], "#2563EB");
  assert.equal(arrow.arrows.length, 1);
  assert.deepEqual(arrow.arrows[0].from, [10, 20]);
  assert.equal(arrow.arrows[0].color, "#2563EB");
  assert.equal(validateWhiteboard(arrow).arrows[0].color, "#2563EB");
  assert.notDeepEqual(fitWhiteboard(arrow, 800, 600), { x: 0, y: 0, scale: 1 }, "Fit includes board-level arrows even when the board has no cards");
  assert.equal(appendWhiteboardArrow(legacy, [1, 1], [1, 1]), legacy, "zero-length arrows are ignored");
  const malformed = sanitizeWhiteboardArrows({ ...arrow, arrows: [{ from: [0, 0], to: [1, 1], color: "red" }, { from: [NaN, 0], to: [1, 1] }] });
  assert.equal(malformed.arrows.length, 1, "bad coordinates are discarded");
  assert.equal(malformed.arrows[0].color, "#1f3fc7", "invalid colors safely use the legacy ink color");
  assert.deepEqual(sanitizeWhiteboardArrows({ ...legacy, arrows: {} }).arrows, [], "a malformed optional field normalizes safely");
});

test("rectangles normalize every drag direction, sanitize safely and participate in fit", () => {
  const expected = { x: 10, y: 20, w: 100, h: 100 };
  for (const [from, to] of [
    [[10, 20], [110, 120]], [[110, 20], [10, 120]],
    [[10, 120], [110, 20]], [[110, 120], [10, 20]],
  ] as const) {
    const next = appendWhiteboardRectangle(emptyWhiteboard(), from, to, "#2563eb");
    assert.deepEqual({ x: next.rectangles[0].x, y: next.rectangles[0].y, w: next.rectangles[0].w, h: next.rectangles[0].h }, expected);
    assert.equal(next.rectangles[0].color, "#2563EB");
    assert.equal(next.rectangles[0].strokeWidth, 2.5);
  }
  const original = emptyWhiteboard();
  assert.equal(appendWhiteboardRectangle(original, [1, 1], [1, 10]), original, "zero-width rectangles are ignored");
  const safe = sanitizeWhiteboardRectangles({ ...original, rectangles: [
    { id: "good", x: -20, y: 30, w: 50, h: 60, color: "unsupported", strokeWidth: 100 },
    { id: "bad", x: 0, y: 0, w: -1, h: 20 },
    { id: "good", x: 5, y: 5, w: 20, h: 20 },
  ] });
  assert.equal(safe.rectangles.length, 1);
  assert.equal(safe.rectangles[0].color, "#1f3fc7");
  assert.equal(safe.rectangles[0].strokeWidth, 64);
  assert.deepEqual(whiteboardDrawingBounds(safe.rectangles[0], "rectangle"), { x: -20, y: 30, w: 50, h: 60 });
  assert.notDeepEqual(fitWhiteboard(safe, 800, 600), { x: 0, y: 0, scale: 1 });
  const legacy = emptyWhiteboard(); delete (legacy as any).rectangles;
  assert.equal(validateWhiteboard(legacy).rectangles, undefined, "older boards need no rectangles field");
});

test("drawing updates and removal are immutable and work across arrow and rectangle collections", () => {
  const withArrow = appendWhiteboardArrow(emptyWhiteboard(), [10, 20], [40, 50], "#2563EB");
  const arrowId = withArrow.arrows[0].id;
  const movedArrow = updateWhiteboardDrawing(withArrow, "arrow", arrowId, { from: [30, 40], to: [60, 70] });
  assert.deepEqual(movedArrow.arrows[0].from, [30, 40]);
  assert.deepEqual(withArrow.arrows[0].from, [10, 20]);
  const withRectangle = appendWhiteboardRectangle(movedArrow, [0, 0], [20, 30], "#2F7D54");
  const rectangleId = withRectangle.rectangles[0].id;
  const resized = updateWhiteboardDrawing(withRectangle, "rectangle", rectangleId, { x: 5, y: 6, w: 40, h: 50 });
  assert.deepEqual(whiteboardDrawingBounds(resized.rectangles[0]), { x: 5, y: 6, w: 40, h: 50 });
  assert.equal(whiteboardHasContent(resized), true);
  const noRectangle = removeWhiteboardDrawing(resized, "rectangle", rectangleId);
  assert.equal(noRectangle.rectangles.length, 0);
  const empty = removeWhiteboardDrawing(noRectangle, "arrows", arrowId);
  assert.equal(whiteboardHasContent(empty), false);
  assert.equal(removeWhiteboardDrawing(empty, "arrow", "missing"), empty);
  assert.equal(updateWhiteboardDrawing(empty, "unknown", "missing", { x: 1 }), empty);
});

test("image crops default to the full source, validate normalized bounds and permit compact cropped cards", () => {
  const original = board();
  assert.deepEqual(whiteboardImageCrop(original.items[2]), { x: 0, y: 0, w: 1, h: 1 });
  const crop = { x: .1, y: .2, w: .6, h: .5 };
  const cropped = setWhiteboardImageCrop(original, "i", crop);
  assert.deepEqual(cropped.items[2].crop, crop);
  assert.equal(Object.prototype.hasOwnProperty.call(original.items[2], "crop"), false, "crop commits do not mutate undo snapshots");
  assert.equal(setWhiteboardImageCrop(cropped, "p", crop), cropped, "PDF cards cannot be cropped");
  assert.equal(setWhiteboardImageCrop(cropped, "i", { x: .9, y: 0, w: .2, h: 1 }), cropped, "invalid crops do not replace a valid crop");
  assert.equal(normalizeWhiteboardImageCrop({ x: 0, y: 0, w: .009, h: 1 }), null);
  assert.equal(normalizeWhiteboardImageCrop({ x: 0, y: 0, w: 1, h: 1 })?.w, 1);
  const compact = { ...cropped, items: cropped.items.map((item: any) => item.id === "i" ? { ...item, w: 42, h: 82 } : item) };
  assert.equal(validateWhiteboard(compact).items[2].w, 42);
  for (const bad of [
    { ...compact, items: compact.items.map((item: any) => item.id === "i" ? { ...item, w: 41 } : item) },
    { ...cropped, items: cropped.items.map((item: any) => item.id === "i" ? { ...item, crop: { x: -.1, y: 0, w: 1, h: 1 } } : item) },
    { ...cropped, items: cropped.items.map((item: any) => item.id === "p" ? { ...item, crop } : item) },
  ]) assert.throws(() => validateWhiteboard(bad), /Invalid whiteboard/);
  const uncroppedCompact = { ...original, items: original.items.map((item: any) => item.id === "i" ? { ...item, w: 42, h: 82 } : item) };
  assert.throws(() => validateWhiteboard(uncroppedCompact), /Invalid whiteboard/);
});

test("rectangle and non-destructive image crop metadata round-trip through portable projects and revisions", async () => {
  let whiteboard = appendWhiteboardRectangle(board(), [700, 500], [450, 250], "#DC2626", 4);
  whiteboard = setWhiteboardImageCrop(whiteboard, "i", { x: .125, y: .25, w: .5, h: .6 });
  const current = { ...payload(), whiteboard };
  await localStore.saveAnnotations(current);
  await localStore.saveSnapshot("Before crop adjustment", current);
  const saved = await exportProjectFile(localStore, current);
  const reopened = await readProjectFile(saved);
  assert.deepEqual(reopened.annotations.whiteboard, whiteboard);
  assert.deepEqual(reopened.snapshots[0].payload.whiteboard, whiteboard);
  const imported = createFileProjectStore(await importFileProject(reopened));
  assert.deepEqual((await imported.loadAnnotations()).whiteboard, whiteboard);
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
  assert.deepEqual(whiteboardPdfLayoutSize(100, 50), { width: 200, height: 100 }, "logical layout preserves the legacy 2x upscaling cap");
  assert.deepEqual(whiteboardPdfLayoutSize(standardPage.width, standardPage.height), {
    width: Math.ceil(standardPage.width * normal), height: Math.ceil(standardPage.height * normal),
  }, "logical layout stays fixed while backing detail changes");
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
