import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist";
import { buildMarkedSetPdf } from "../src/lib/markedset.js";
import { RENDER_SCALE } from "../src/lib/sheets.js";

const sheet = { key: "plans.pdf::2", file: "plans.pdf", page: 2, label: "A-102" };
const condition = { id: "c", finish_tag: "FLOOR-1", color: "#008800", fill: "none", hatch: "solid" };
const shape = { id: "s", sheet_id: sheet.key, condition_id: "c", measure_role: "floor_area", verts_norm: [[.2, .3], [.5, .3], [.5, .6], [.2, .6]], computed: { area_sf: 42 } };
const markup = { id: "m", sheet_id: sheet.key, type: "text", at: [.6, .7], text: "VERIFY DOOR", rfi_id: "r" };

async function fixture(rotation = 0) {
  const source = await PDFDocument.create();
  source.addPage([300, 200]).drawText("OTHER PAGE", { x: 20, y: 100, size: 12 });
  const page = source.addPage([600, 400]);
  page.drawText("CURRENT PAGE", { x: 60, y: 300, size: 12 });
  page.setCropBox(40, 20, 520, 360);
  page.setRotation(degrees(rotation));
  const bytes = await source.save();
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  const calls: Array<[string, number]> = [];
  return {
    pdf, calls,
    options: {
      projectName: "Test project", dark: false, singleSheet: true,
      sheets: [sheet], shapes: [shape], markups: [markup],
      conditions: [condition], rfis: [{ id: "r", number: "RFI-007", subject: "Door", status: "open" }],
      company: undefined, clientInfo: undefined,
      getPage: async (file: string, number: number) => { calls.push([file, number]); return pdf.getPage(number); },
      loadPdfData: async () => bytes.slice(),
    },
  };
}

async function inspect(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
  try {
    const text: string[] = [], positioned: Array<{ str: string; y: number }> = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const items = (await page.getTextContent()).items;
      text.push(items.map((item) => "str" in item ? item.str : "").join(" "));
      for (const item of items) if ("str" in item) positioned.push({ str: item.str, y: item.transform[5] });
    }
    return { count: pdf.numPages, text: text.join("\n"), positioned };
  } finally { await pdf.destroy(); }
}

test("page download includes current-page takeoffs, markups and RFI labels, without report pages", async () => {
  const f = await fixture();
  try {
    const options = {
      ...f.options,
      shapes: [shape, { ...shape, id: "foreign", sheet_id: "plans.pdf::1", condition_id: "other" }],
      markups: [markup, { ...markup, sheet_id: "plans.pdf::1", text: "OTHER NOTE" }],
      conditions: [condition, { ...condition, id: "other", finish_tag: "OTHER CONDITION" }],
    };
    const before = JSON.stringify(options);
    const result = await buildMarkedSetPdf(options);
    assert.equal(JSON.stringify(options), before);
    assert.equal(result.filename, "Test project - A-102 - marked page.pdf");
    assert.deepEqual(f.calls, [["plans.pdf", 2]]);
    const output = await inspect(result.bytes);
    assert.equal(output.count, 1);
    assert.match(output.text, /CURRENT PAGE/);
    assert.match(output.text, /FLOOR-1.*42 SF/);
    assert.match(output.text, /RFI-007 VERIFY DOOR/);
    assert.doesNotMatch(output.text, /OTHER PAGE|OTHER NOTE|OTHER CONDITION|RFI SCHEDULE|marked set|BY SHEET/);
  } finally { await f.pdf.destroy(); }
});

test("an unmarked current page still downloads in full", async () => {
  const f = await fixture();
  try {
    const result = await buildMarkedSetPdf({ ...f.options, shapes: [], markups: [], rfis: [] });
    const output = await inspect(result.bytes);
    assert.equal(output.count, 1);
    assert.equal(output.text.trim(), "CURRENT PAGE");
  } finally { await f.pdf.destroy(); }
});

test("page download burns current-page Find hits in as vector rectangles across page rotations", async () => {
  const countOp = async (bytes: Uint8Array, op: number) => {
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    try {
      const list = await (await pdf.getPage(1)).getOperatorList();
      return list.fnArray.filter((fn) => fn === op).length;
    } finally { await pdf.destroy(); }
  };

  for (const rotation of [0, 90, 180, 270]) {
    const f = await fixture(rotation);
    try {
      const empty = { ...f.options, shapes: [], markups: [], rfis: [] };
      const baseline = await buildMarkedSetPdf(empty);
      const highlighted = await buildMarkedSetPdf({
        ...empty,
        findHighlights: [
          { key: sheet.key, x: .16, y: .24, w: .22, h: .06, active: true },
          { key: "plans.pdf::1", x: .1, y: .1, w: .2, h: .05, active: true },
        ],
      });
      assert.equal(
        await countOp(highlighted.bytes, OPS.constructPath),
        await countOp(baseline.bytes, OPS.constructPath) + 1,
        `one vector highlight is added at ${rotation}° while the foreign-page hit is ignored`,
      );
    } finally { await f.pdf.destroy(); }
  }
});

test("long markup captions wrap without losing words and use one backing rectangle across page rotations", async () => {
  const note = "Verify corridor transition expansion joint alignment before flooring installation and retain every word in this exported construction note";
  const expectedWords = note.split(/\s+/);
  const countConstructPaths = async (bytes: Uint8Array) => {
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    try {
      const list = await (await pdf.getPage(1)).getOperatorList();
      return list.fnArray.filter((fn) => fn === OPS.constructPath).length;
    } finally { await pdf.destroy(); }
  };

  for (const rotation of [0, 90, 180, 270]) {
    const f = await fixture(rotation);
    try {
      const empty = { ...f.options, shapes: [], markups: [], rfis: [] };
      const baseline = await buildMarkedSetPdf(empty);
      const annotated = await buildMarkedSetPdf({
        ...empty,
        markups: [{ ...markup, rfi_id: undefined, at: [.1, .22], text: note }],
      });
      const output = await inspect(annotated.bytes);
      const captionLines = output.positioned
        .map((item) => item.str.trim())
        .filter((text) => text && text !== "CURRENT PAGE");

      assert.ok(captionLines.length > 1, `caption wraps onto multiple lines at ${rotation}°`);
      assert.deepEqual(
        captionLines.flatMap((line) => line.split(/\s+/)),
        expectedWords,
        `wrapping retains every word at ${rotation}°`,
      );
      assert.equal(
        await countConstructPaths(annotated.bytes),
        await countConstructPaths(baseline.bytes) + 1,
        `wrapped caption uses one backing path at ${rotation}°`,
      );
    } finally { await f.pdf.destroy(); }
  }
});

test("page download can omit condition and quantity labels while retaining notes", async () => {
  const f = await fixture();
  try {
    const result = await buildMarkedSetPdf({ ...f.options, includeShapeLabels: false });
    const output = await inspect(result.bytes);
    assert.match(output.text, /CURRENT PAGE/);
    assert.match(output.text, /RFI-007 VERIFY DOOR/);
    assert.doesNotMatch(output.text, /FLOOR-1|42 SF/);
  } finally { await f.pdf.destroy(); }
});

test("linear quantity chips sit closer to their line without touching it", async () => {
  const f = await fixture();
  try {
    const linear = { ...shape, measure_role: "linear", verts_norm: [[.2, .5], [.8, .5]], computed: { perimeter_lf: 12.9 } };
    const result = await buildMarkedSetPdf({ ...f.options, shapes: [linear], markups: [], rfis: [] });
    const output = await inspect(result.bytes);
    const chip = output.positioned.find((item) => item.str.includes("12.9 LF"));
    assert.ok(chip, "export contains the linear quantity chip");

    const sourcePage = await f.pdf.getPage(2);
    const sourceViewport = sourcePage.getViewport({ scale: RENDER_SCALE });
    const [, lineY] = sourceViewport.convertToPdfPoint(0, sourceViewport.height * .5);
    assert.ok(Math.abs((chip.y - lineY) - 7.5) < .1, `chip baseline is 7.5pt above the line; measured ${chip.y - lineY}pt (${lineY}, ${chip.y}; ${chip.str})`);
  } finally { await f.pdf.destroy(); }
});

test("single-page export preserves PDF page size, crop box and rotation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const f = await fixture(rotation);
    try {
      const { bytes } = await buildMarkedSetPdf(f.options);
      const output = await PDFDocument.load(bytes);
      const page = output.getPage(0);
      assert.equal(output.getPageCount(), 1);
      assert.deepEqual(page.getSize(), { width: 600, height: 400 });
      assert.deepEqual(page.getCropBox(), { x: 40, y: 20, width: 520, height: 360 });
      assert.equal(page.getRotation().angle, rotation);
      assert.match((await inspect(bytes)).text, /VERIFY DOOR/);
    } finally { await f.pdf.destroy(); }
  }
});

test("single-page export refuses zero or multiple requested sheets", async () => {
  const f = await fixture();
  try {
    await assert.rejects(buildMarkedSetPdf({ ...f.options, sheets: [] }), /Choose one current sheet/);
    await assert.rejects(buildMarkedSetPdf({ ...f.options, sheets: [sheet, sheet] }), /Choose one current sheet/);
    assert.deepEqual(f.calls, []);
  } finally { await f.pdf.destroy(); }
});

test("existing full marked-set export retains its cover, RFI schedule and sheet stamp", async () => {
  const f = await fixture();
  try {
    const { singleSheet: _singleSheet, ...options } = f.options;
    const result = await buildMarkedSetPdf(options);
    const output = await inspect(result.bytes);
    assert.equal(result.filename, "Test project - marked set.pdf");
    assert.equal(output.count, 3);
    assert.match(output.text, /BY SHEET/);
    assert.match(output.text, /RFI SCHEDULE/);
    assert.match(output.text, /A-102.*marked set/);
    await assert.rejects(buildMarkedSetPdf({ ...options, shapes: [], markups: [], rfis: [] }), /Nothing to export/);
  } finally { await f.pdf.destroy(); }
});
