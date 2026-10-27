import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocument, OPS } from "pdfjs-dist";
import { buildMarkedSetPdf } from "../src/lib/markedset.js";
import { base64ToBytes } from "../src/lib/whiteboard.js";

const png = base64ToBytes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8ioAAAAASUVORK5CYII=");

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
    pdf, calls, sourceBytes: bytes,
    options: {
      projectName: "Test project", dark: false, singleSheet: true,
      sheets: [sheet], shapes: [shape], markups: [markup],
      conditions: [condition], rfis: [{ id: "r", number: "RFI-007", subject: "Door", status: "open" }],
      company: undefined, clientInfo: undefined,
      getPage: async (file: string, number: number) => { calls.push([file, number]); return pdf.getPage(number); },
      renderPage: async () => ({ bytes: png, type: "image/png" }),
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
    assert.doesNotMatch(output.text, /CURRENT PAGE/, "source PDF text and OCR are flattened out of the distribution copy");
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
    assert.equal(output.text.trim(), "", "an unmarked page retains no searchable source text or OCR");
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
        .filter(Boolean);

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

test("text-note leader arrows are retained in marked-page PDF output", async () => {
  const countConstructPaths = async (bytes: Uint8Array) => {
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    try {
      const list = await (await pdf.getPage(1)).getOperatorList();
      return list.fnArray.filter((fn) => fn === OPS.constructPath).length;
    } finally { await pdf.destroy(); }
  };

  const f = await fixture();
  try {
    const options = { ...f.options, shapes: [], rfis: [], markups: [{ ...markup, rfi_id: undefined }] };
    const plain = await buildMarkedSetPdf(options);
    const led = await buildMarkedSetPdf({ ...options, markups: [{ ...markup, rfi_id: undefined, target: [.25, .3] }] });
    assert.ok(
      await countConstructPaths(led.bytes) >= await countConstructPaths(plain.bytes) + 2,
      "the exported leader contributes a line and arrowhead in addition to the text box",
    );
  } finally { await f.pdf.destroy(); }
});

test("page download can omit condition and quantity labels while retaining notes", async () => {
  const f = await fixture();
  try {
    const result = await buildMarkedSetPdf({ ...f.options, includeShapeLabels: false });
    const output = await inspect(result.bytes);
    assert.doesNotMatch(output.text, /CURRENT PAGE/);
    assert.match(output.text, /RFI-007 VERIFY DOOR/);
    assert.doesNotMatch(output.text, /FLOOR-1|42 SF/);
  } finally { await f.pdf.destroy(); }
});

test("count marks export as the same square used on the Takeoff canvas", async () => {
  const squarePathCount = async (bytes: Uint8Array) => {
    const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: true }).promise;
    try {
      const list = await (await pdf.getPage(1)).getOperatorList();
      return list.fnArray.reduce((count, fn, index) => {
        if (fn !== OPS.constructPath) return count;
        const pathOps = list.argsArray[index]?.[0];
        const square = Array.isArray(pathOps)
          && pathOps.length === 5
          && pathOps[0] === OPS.moveTo
          && pathOps.slice(1, 4).every((op) => op === OPS.lineTo)
          && pathOps[4] === OPS.closePath;
        return count + (square ? 1 : 0);
      }, 0);
    } finally { await pdf.destroy(); }
  };

  const f = await fixture();
  try {
    const emptyOptions = { ...f.options, shapes: [], markups: [], rfis: [], includeShapeLabels: false };
    const baseline = await buildMarkedSetPdf(emptyOptions);
    const counted = await buildMarkedSetPdf({
      ...emptyOptions,
      shapes: [{ ...shape, id: "count-1", measure_role: "count", verts_norm: [[.45, .55]], computed: { count: 1 } }],
    });
    assert.equal(await squarePathCount(counted.bytes), await squarePathCount(baseline.bytes) + 1);
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

    const exported = await PDFDocument.load(result.bytes);
    const lineY = exported.getPage(0).getHeight() / 2;
    assert.ok(Math.abs((chip.y - lineY) - 7.5) < .1, `chip baseline is 7.5pt above the line; measured ${chip.y - lineY}pt (${lineY}, ${chip.y}; ${chip.str})`);
  } finally { await f.pdf.destroy(); }
});

test("single-page export flattens the visible crop and rotation into a lightweight page", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const f = await fixture(rotation);
    try {
      const { bytes } = await buildMarkedSetPdf(f.options);
      const output = await PDFDocument.load(bytes);
      const page = output.getPage(0);
      assert.equal(output.getPageCount(), 1);
      const expected = rotation % 180 ? { width: 360, height: 520 } : { width: 520, height: 360 };
      assert.deepEqual(page.getSize(), expected);
      assert.deepEqual(page.getCropBox(), { x: 0, y: 0, ...expected });
      assert.equal(page.getRotation().angle, 0);
      assert.match((await inspect(bytes)).text, /VERIFY DOOR/);
      assert.doesNotMatch((await inspect(bytes)).text, /CURRENT PAGE/);
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

test("single-page export passes the selected raster quality to its page renderer", async () => {
  const f = await fixture();
  try {
    let received;
    await buildMarkedSetPdf({
      ...f.options,
      quality: "hd",
      renderPage: async (_page, _dark, quality) => { received = quality; return { bytes: png, type: "image/png" }; },
    });
    assert.equal(received, "hd");
  } finally { await f.pdf.destroy(); }
});

test("Whiteboard import preserves the original current PDF page before adding overlays", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const f = await fixture(rotation);
    try {
      const result = await buildMarkedSetPdf({
        ...f.options,
        preserveSourcePdf: true,
        loadPdfData: async () => f.sourceBytes,
        renderPage: async () => { throw new Error("the preserved import must not rasterize first"); },
      });
      const output = await inspect(result.bytes);
      assert.equal(output.count, 1);
      assert.match(output.text, /CURRENT PAGE/, `source vectors and text survive at ${rotation}°`);
      assert.match(output.text, /RFI-007 VERIFY DOOR/, `markup survives at ${rotation}°`);
      assert.doesNotMatch(output.text, /OTHER PAGE/, `only the open page is copied at ${rotation}°`);
      const preserved = await PDFDocument.load(result.bytes);
      assert.deepEqual(preserved.getPage(0).getCropBox(), { x: 40, y: 20, width: 520, height: 360 });
      assert.equal(preserved.getPage(0).getRotation().angle, rotation);
      const rendered = await getDocument({ data: result.bytes.slice(), useSystemFonts: true }).promise;
      try {
        const renderedPage = await rendered.getPage(1), viewport = renderedPage.getViewport({ scale: 1 });
        const item = (await renderedPage.getTextContent()).items.find((entry) => "str" in entry && entry.str.includes("VERIFY DOOR"));
        assert.ok(item && "str" in item);
        const [a, b, c, d, e, g] = viewport.transform, x = item.transform[4], y = item.transform[5];
        assert.ok(Math.abs((a * x + c * y + e) / viewport.width - .6) < .001, `markup x stays aligned at ${rotation}°`);
        assert.ok(Math.abs((b * x + d * y + g) / viewport.height - .7) < .001, `markup y stays aligned at ${rotation}°`);
        const visualDx = a * item.transform[0] + c * item.transform[1];
        const visualDy = b * item.transform[0] + d * item.transform[1];
        assert.ok(visualDx > 0 && Math.abs(visualDy) / Math.hypot(visualDx, visualDy) < .001, `markup text stays horizontal at ${rotation}°`);
      } finally { await rendered.destroy(); }
    } finally { await f.pdf.destroy(); }
  }
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
