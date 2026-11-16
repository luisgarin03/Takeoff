import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { adaptFenceRuns } from "../src/features/fence3d/source.js";
import { buildFenceLayout } from "../src/features/fence3d/layout.js";
import { buildFenceFittings, tensionBandHeights } from "../src/features/fence3d/fittings.js";
import { readFenceCalibration } from "../src/features/fence3d/calibration.js";
import { emptyFence3d, METERS_PER_FOOT as FT, normalizeFence3d } from "../src/features/fence3d/settings.js";
import { applyShapeCommand } from "../src/lib/shapeCommands.js";
import { createChainLinkFence } from "../src/lib/chainLinkFence.js";

const sheetId = "plan.pdf";
const calibration = { width: 2000, height: 1000, feetPerPixel: .1 };
const shape = (points: number[][], length: number, id = "fence", sheet = sheetId) => ({
  id, sheet_id: sheet, measure_role: "linear", condition_id: "chain", label: id,
  verts_norm: points.map(([x, y]) => [x / 200, y / 100]), computed: { perimeter_lf: length, area_sf: 0 },
});
const settings = (run: Record<string, unknown> = {}) => normalizeFence3d({ ...emptyFence3d(), runs: { fence: { ...run, type: "chain-link" } } });
const input = (shapes: any[], config = settings(), fences: any[] = []) => ({ shapes, settings: config, sheetId, calibration, fences });
const generate = (shapes: any[], config = settings(), fences: any[] = []) => buildFenceLayout(adaptFenceRuns(input(shapes, config, fences)));
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test("100 and 150 foot calibrated straight runs generate the correct posts", () => {
  for (const feet of [100, 150]) {
    const source = shape([[0, 0], [feet, 0]], feet);
    const layout = generate([source]);
    assert.equal(layout.issues.length, 0);
    near(layout.totals.path / FT, feet);
    assert.equal(layout.posts.length, feet / 10 + 1);
    assert.equal(layout.totals.end, 2);
    assert.equal(layout.totals.line, feet / 10 - 1);
    near(layout.totals.area / FT ** 2, feet * 6);
    assert.ok(layout.posts.every((post: any) => post.point.every(Number.isFinite)));
  }
});

test("90 degree and irregular corners retain coordinates, connected lengths and angles", () => {
  const lShape = shape([[0, 40], [100, 40], [100, 100]], 160);
  const layout = generate([lShape]);
  assert.equal(layout.issues.length, 0);
  assert.equal(layout.totals.corner, 1);
  near(layout.runs[0].corners[0].angle, 90);
  near(layout.runs[0].segments[0].length / FT, 100);
  near(layout.runs[0].segments[1].length / FT, 60);
  assert.deepEqual(layout.runs[0].segments[0].b, layout.runs[0].segments[1].a);
  const irregular = generate([shape([[0, 0], [50, 0], [80, 30]], 92.43)]);
  near(irregular.runs[0].corners[0].angle, 135);
  assert.equal(irregular.issues.length, 0);
});

test("closed loops have one post per corner and preserve a disconnected run", () => {
  const perimeter = shape([[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]], 80);
  const disconnected = shape([[50, 0], [54, 0]], 4, "other");
  const layout = generate([perimeter, disconnected], settings(), [createChainLinkFence(disconnected)]);
  assert.equal(layout.runs.length, 2);
  assert.equal(layout.totals.corner, 4);
  assert.equal(layout.totals.end, 2);
  near(layout.totals.path / FT, 84);
  assert.equal(layout.runs[1].posts.length, 2);
  assert.equal(layout.issues.length, 0);
});

test("shared junction IDs merge only coincident posts, keeping unrelated paths separate", () => {
  const a = shape([[0, 0], [100, 0]], 100);
  const b = shape([[50, 0], [50, 20]], 20, "b");
  const c = shape([[50, 0], [50, 30]], 30, "c");
  const first = { ...createChainLinkFence(a, () => "a")!, markers: [{ id: "mid", path_t: .5, type: "corner" }], shared_posts: { mid: "join" } };
  const second = { ...createChainLinkFence(b, () => "b")!, shared_posts: { "b-start": "join" } };
  const layout = generate([a, b, c], settings(), [first, second, createChainLinkFence(c)]);
  assert.equal(layout.totals.junction, 1);
  assert.equal(layout.totals.end, 5);
  assert.equal(layout.issues.length, 0);
  const disagree = generate([a, shape([[51, 0], [51, 20]], 20, "b")], settings(), [first, second]);
  assert.equal(disagree.totals.junction, 0);
  assert.equal(disagree.totals.end, 4);
  assert.equal(disagree.issues.length, 0);
});

test("gates create exact openings, independent infill, and deduplicated gate posts", () => {
  const s = shape([[0, 0], [100, 0]], 100);
  const config = settings({ gates: [
    { id: "first", type: "single", start: 20, width: 4, height: 6 },
    { id: "second", type: "double", start: 40, width: 12, height: 8 },
    { id: "third", type: "cantilever", start: 70, width: 8, height: 7, tail: 6 },
  ] });
  const layout = generate([s], config);
  assert.equal(layout.issues.length, 0);
  assert.equal(layout.totals.gate, 7);
  near(layout.totals.opening / FT, 24);
  near(layout.totals.fabric / FT, 76);
  near(layout.totals.gateArea / FT ** 2, 176);
  for (const gate of layout.runs[0].gates) {
    near((gate.end - gate.start) / FT, gate.width);
    assert.ok(layout.runs[0].spans.every((span: any) => span.start >= gate.end - 1e-6 || span.end <= gate.start + 1e-6));
    assert.ok(layout.posts.every((post: any) => post.at <= gate.start + 1e-6 || post.at >= gate.end - 1e-6));
  }
  const invalid = generate([s], settings({ gates: [{ id: "over", start: 99, width: 4 }] }));
  assert.equal(invalid.runs[0].gates.length, 0);
  near(invalid.totals.fabric / FT, 100);
  assert.match(invalid.issues[0], /clear straight segment/);
});

test("post spacing strategy, height, and frame options ignore legacy manual overrides", () => {
  const source = shape([[0, 0], [25, 0]], 25);
  const before = structuredClone(source);
  Object.freeze(source);
  Object.freeze(source.computed);
  const layout = generate([source], settings({ spec: { height: 8, spacing: 9, strategy: "maximum", bottomWire: true, topRail: false } }));
  assert.deepEqual(layout.posts.map((post: any) => Math.round(post.at / FT)), [0, 9, 18, 25]);
  near(layout.totals.area / FT ** 2, 200);
  near(layout.totals.wire / FT, 25);
  near(layout.totals.rail, 0);
  const override = generate([source], settings({ spec: { height: 8, spacing: 9, strategy: "maximum", bottomWire: true, topRail: false }, posts: [{ id: "remove", sourceId: "line-1-1", action: "remove" }] }));
  assert.equal(override.totals.totalPosts, layout.totals.totalPosts);
  assert.deepEqual(override.posts.map((post: any) => post.at), layout.posts.map((post: any) => post.at));
  assert.doesNotMatch(override.issues.join(" "), /exceeds configured spacing/);
  assert.deepEqual(source, before);
});

test("source changes, deletion, undo and redo derive new layouts from the same takeoff", () => {
  const source = shape([[0, 0], [100, 0]], 100);
  const update = shape([[0, 0], [150, 0]], 150);
  const before = structuredClone(source);
  const change = applyShapeCommand([source], { type: "geom", editKind: "vertex", ...update });
  near(generate(change.shapes).totals.path / FT, 150);
  const undo = applyShapeCommand(change.shapes, change.inverse);
  near(generate(undo.shapes).totals.path / FT, 100);
  near(generate(applyShapeCommand(undo.shapes, undo.inverse).shapes).totals.path / FT, 150);
  assert.equal(generate(applyShapeCommand(change.shapes, { type: "delete", ids: [source.id] }).shapes).runs.length, 0);
  assert.deepEqual(source, before);
});

test("rotated PDF uses viewport dimensions, correct calibration and stable source units", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([1000, 500]).setRotation(degrees(90));
  const source = await getDocument({ data: await pdf.save(), useSystemFonts: true }).promise;
  try {
    const page = await readFenceCalibration({ key: sheetId, scales: { [sheetId]: .1 }, images: {}, renderScales: new Map(), getDocument: async () => source });
    assert.deepEqual(page, { width: 1000, height: 2000, feetPerPixel: .1 });
    const line = { ...shape([], 100), verts_norm: [[0, .5], [1, .5]] };
    const layout = buildFenceLayout(adaptFenceRuns({ ...input([line]), calibration: page }));
    near(layout.totals.path / FT, 100);
    assert.equal(layout.issues.length, 0);
    const unscaled = adaptFenceRuns({ ...input([line]), calibration: null });
    assert.match(unscaled.issues[0], /needs a calibrated PDF/);
    assert.equal(unscaled.runs.length, 0);
  } finally { await source.destroy(); }
});

test("terminal and corner fittings follow the installed legs and tension bar height", () => {
  const line = shape([[0, 0], [30, 0], [30, 40]], 70);
  const fittings = buildFenceFittings(generate([line], settings({ spec: { barLength: 6 } })));
  assert.equal(fittings.counts.tensionBars, 4);
  assert.equal(fittings.counts.tensionBands, 20);
  assert.equal(fittings.counts.railEnds, 4);
  assert.equal(fittings.counts.braceBands, 4);
  assert.equal(fittings.counts.bandBolts, 24);
  assert.equal(fittings.counts.caps, 3);
  assert.equal(fittings.counts.railSleeves, 2);
  assert.deepEqual(tensionBandHeights(6), [1, 2, 3, 4, 5].map((feet) => feet * FT));
  const corner = generate([line]).runs[0].posts.find((post: any) => post.type === "corner")!;
  const cups = fittings.partsByRun.get("fence")!.filter((piece: any) => piece.kind === "railEnds" &&
    Math.hypot(piece.at[0] - corner.point[0], piece.at[2] - corner.point[1]) < .2);
  assert.equal(cups.length, 2);
  near(cups[0].axis[1], 0);
  near(cups[1].axis[1], 0);
  near(cups[0].axis[0] * cups[1].axis[0] + cups[0].axis[2] * cups[1].axis[2], 0);
});

test("component options and gate styles drive fittings without crossing gate openings", () => {
  const line = shape([[0, 0], [100, 0]], 100);
  const layout = generate([line], settings({
    spec: { tensionBands: false, bottomWire: true, barbedWire: true, railStock: "swaged" },
    gates: [{ id: "double", type: "double", start: 16, width: 12 }, { id: "slide", type: "cantilever", start: 70, width: 8, tail: 6 }],
  }));
  const fittings = buildFenceFittings(layout);
  assert.equal(fittings.counts.tensionBars, 6);
  assert.equal(fittings.counts.tensionBands, 0);
  assert.equal(fittings.counts.railEnds, 6);
  assert.equal(fittings.counts.railSleeves, 0);
  assert.equal(fittings.counts.gateHinges, 4);
  assert.equal(fittings.counts.gateDropRods, 1);
  assert.equal(fittings.counts.gateRollers, 4);
  assert.ok(fittings.counts.hogRings > 0);
  near(fittings.barbedLength / FT, 80 * 3);
  const strands = fittings.partsByRun.get("fence")!.filter((piece: any) => piece.kind === "barbedWire" && piece.diameter === .0056);
  const x = layout.runs[0].segments[0].a[0];
  for (const piece of strands) {
    const start = piece.a[0] - x, end = piece.b[0] - x;
    assert.ok(layout.runs[0].gates.every((gate: any) => end <= gate.start + 1e-6 || start >= gate.end - 1e-6));
  }
});
