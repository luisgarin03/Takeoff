import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocument } from "pdfjs-dist";
import { buildMarkedSetPdf } from "../src/lib/markedset.js";

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
    const text: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      text.push((await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return { count: pdf.numPages, text: text.join("\n") };
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
