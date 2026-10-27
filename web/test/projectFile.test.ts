import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { ANN_SCHEMA, localStore, createFileProjectStore, importFileProject } from "../src/lib/store.js";
import { digest, exportProjectFile, readProjectFile, projectFilename, projectFolderName } from "../src/lib/projectFile.js";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const pdf = (text: string) => new File([`%PDF-1.7\n${text}\n%%EOF`], "Plan.pdf", { type: "application/pdf" });
const payload = () => ({
  schema: ANN_SCHEMA, project_name: "Project A", units: "metric",
  client_info: { name: "Client A" }, conditions: [{ id: "c1", name: "Tile", waste: 7, materials: [{ id: "m1", name: "Tile" }] }],
  shapes: [{ id: "s1", sheet_id: "Plan.pdf#2", condition_id: "c1", type: "area", verts_norm: [[.1,.1],[.8,.1],[.8,.8]], area: 125.5, holes: [], origin: { kind: "human" } }],
  markups: [{ id: "mk1", sheet_id: "Plan.pdf#2", type: "text", text: "Verify" }],
  sheets: [{ sheet_id: "Plan.pdf#2", units_per_px: .0375, scale_source: "calibrated" }],
  rfis: [{ id: "rfi1", number: 1, subject: "Door" }], sheet_tabs: ["Plan.pdf#2", "Plan.pdf"],
  sheet_group: ["Plan.pdf#2", "Plan.pdf"], last_group: ["Plan.pdf#2", "Plan.pdf"],
  sheet_levels: { "Plan.pdf#2": "L2" }, sheet_bookmarks: ["Plan.pdf#2"], file_bookmarks: ["Plan.pdf"], palette: ["c1"], future_field: { preserve: true },
  fence_calculator: {
    version: 1,
    activeCalculatorId: "board-on-board",
    valuesByCalculator: { "board-on-board": { fenceLength: 128, postSpacing: 8 } },
  },
});

async function fixture() {
  await localStore.addPdf(pdf("original plan"));
  await localStore.saveAnnotations(payload());
  await localStore.saveSnapshot("Bid day", payload());
  return exportProjectFile(localStore, payload());
}

test("portable project round-trip retains original PDFs, exact takeoff data, scale, tabs, bookmarks and revisions", async () => {
  const bytes = await fixture();
  const project = await readProjectFile(bytes);
  assert.deepEqual(project.annotations, payload());
  assert.deepEqual(project.pdfs[0].bytes, new Uint8Array(await pdf("original plan").arrayBuffer()));
  assert.equal(project.snapshots[0].label, "Bid day");
  const id = await importFileProject(project);
  const opened = createFileProjectStore(id);
  assert.deepEqual(await opened.loadAnnotations(), payload());
  assert.deepEqual(await opened.loadPdfData("Plan.pdf"), project.pdfs[0].bytes);
  assert.deepEqual((await opened.getSnapshot(project.snapshots[0].id)).payload, payload());
  assert.deepEqual((await readProjectFile(await exportProjectFile(opened, await opened.loadAnnotations()))).annotations, payload());
});

test("opening different projects never replaces same-named PDFs, annotations or revisions", async () => {
  const project = await readProjectFile(await fixture());
  const first = createFileProjectStore(await importFileProject(project));
  const second = createFileProjectStore(await importFileProject(project));
  await second.addPdf(pdf("different bytes"));
  await second.saveAnnotations({ ...payload(), project_name: "Project B", shapes: [] });
  await second.deleteSnapshot(project.snapshots[0].id);
  assert.deepEqual(await first.loadAnnotations(), payload());
  assert.deepEqual(await localStore.loadAnnotations(), payload());
  assert.notDeepEqual(await second.loadPdfData("Plan.pdf"), await first.loadPdfData("Plan.pdf"));
  assert.deepEqual(await first.loadPdfData("Plan.pdf"), await localStore.loadPdfData("Plan.pdf"));
  assert.equal((await first.listSnapshots()).length, 1);
  assert.equal((await localStore.listSnapshots()).length, 1);
  assert.equal((await second.listSnapshots()).length, 0);
});

test("export captures live annotations, including edits not yet autosaved", async () => {
  await fixture();
  const current = { ...payload(), project_name: "Latest edit" };
  assert.deepEqual((await readProjectFile(await exportProjectFile(localStore, current))).annotations, current);
  assert.equal((await localStore.loadAnnotations()).project_name, "Project A");
});

test("empty projects can be saved and opened; global libraries are not exported or overwritten", async () => {
  const empty = { schema: ANN_SCHEMA, conditions: [], shapes: [], sheets: [] };
  const parsed = await readProjectFile(await exportProjectFile(localStore, empty));
  assert.equal(parsed.annotations.units, "imperial");
  assert.deepEqual(parsed.pdfs, []);
  const opened = createFileProjectStore(await importFileProject(parsed));
  assert.equal(opened.loadStampLibrary, localStore.loadStampLibrary);
  assert.equal(opened.loadTemplates, localStore.loadTemplates);
  assert.equal(opened.loadMaterialLibrary, localStore.loadMaterialLibrary);
  assert.deepEqual(await opened.listSheets(), []);
});

test("rejects missing, damaged, unlisted plans and unsupported archive versions before import", async () => {
  const original = unzipSync(await fixture());
  const manifest = JSON.parse(strFromU8(original["project.json"]));
  await assert.rejects(readProjectFile(zipSync({ "project.json": original["project.json"] })), /Missing or damaged plan/);
  await assert.rejects(readProjectFile(zipSync({ ...original, "plans/0.pdf": strToU8("%PDF-1.7\ncorrupt") })), /Missing or damaged plan/);
  await assert.rejects(readProjectFile(zipSync({ ...original, "plans/1.pdf": original["plans/0.pdf"] })), /unlisted/);
  await assert.rejects(readProjectFile(zipSync({ ...original, "project.json": strToU8(JSON.stringify({ ...manifest, version: 99 })) })), /version/);
  await assert.rejects(readProjectFile(strToU8("not a project")), /damaged/);
  assert.deepEqual(await localStore.loadAnnotations(), payload());
});

test("archive parsing preserves hash-valid plan bytes for the PDF compatibility gate", async () => {
  const original = unzipSync(await fixture());
  const manifest = JSON.parse(strFromU8(original["project.json"]));
  const disguised = strToU8("This is not actually a PDF");
  manifest.plans[0] = {
    ...manifest.plans[0],
    size: disguised.length,
    sha256: await digest(disguised),
  };
  const project = await readProjectFile(zipSync({
    ...original,
    "project.json": strToU8(JSON.stringify(manifest)),
    "plans/0.pdf": disguised,
  }));
  assert.deepEqual(project.pdfs[0].bytes, disguised);
});

test("rejects malformed annotation arrays, duplicate plans and unsafe archive paths", async () => {
  const original = unzipSync(await fixture());
  const manifest = JSON.parse(strFromU8(original["project.json"]));
  const pack = (value: unknown) => zipSync({ ...original, "project.json": strToU8(JSON.stringify(value)) });
  await assert.rejects(readProjectFile(pack({ ...manifest, annotations: { ...payload(), shapes: [null] } })), /Invalid project shapes/);
  await assert.rejects(readProjectFile(pack({ ...manifest, annotations: { ...payload(), sheet_bookmarks: [null] } })), /Invalid project sheet_bookmarks/);
  await assert.rejects(readProjectFile(pack({ ...manifest, annotations: { ...payload(), file_bookmarks: [null] } })), /Invalid project file_bookmarks/);
  await assert.rejects(readProjectFile(pack({ ...manifest, plans: [...manifest.plans, ...manifest.plans] })), /duplicate plan/);
  await assert.rejects(readProjectFile(zipSync({ ...original, "../other.pdf": strToU8("junk") })), /Unexpected file/);
});

test("failed import transaction preserves existing workspace data", async () => {
  await fixture();
  await assert.rejects(importFileProject({ annotations: payload(), pdfs: [{ name: "Bad.pdf", bytes: null }], snapshots: [] }));
  assert.deepEqual(await localStore.loadAnnotations(), payload());
  assert.equal((await localStore.listSheets()).length, 1);
});

test("portable filename and workspace IDs are safe", () => {
  assert.equal(projectFilename('A/B: Estimate?'), "A_B_ Estimate_.otk");
  assert.equal(projectFolderName("North Campus Bid"), "North Campus Bid");
  assert.equal(projectFilename(""), "Untitled project.otk");
  assert.throws(() => createFileProjectStore("../../opentakeoff"), /Invalid local project ID/);
});

test("exports every available PDF, not just the open tabs", async () => {
  for (let i = 0; i < 120; i++) await localStore.addPdf(new File([`%PDF-1.7\nPlan ${i}\n%%EOF`], `Plan ${i}.pdf`));
  const project = await readProjectFile(await exportProjectFile(localStore, { ...payload(), sheet_tabs: ["Plan 1.pdf"] }));
  assert.equal(project.pdfs.length, 120);
  const opened = createFileProjectStore(await importFileProject(project));
  assert.equal((await opened.listSheets()).length, 120);
  assert.deepEqual((await opened.loadAnnotations()).sheet_tabs, ["Plan 1.pdf"]);
});

test("marked-pages-only projects preserve page numbering, revision marks and exact recovery metadata", async () => {
  async function plan(name: string, pages: number) {
    const doc = await PDFDocument.create();
    for (let page = 1; page <= pages; page++) {
      const out = doc.addPage([612, 792]);
      out.drawText(`${name} source page ${page}`, { x: 48, y: 720, size: 14 });
    }
    return new Uint8Array(await doc.save());
  }
  const planBytes = await plan("Plan.pdf", 4);
  const omittedBytes = await plan("Unmarked.pdf", 2);
  const live = {
    ...payload(),
    shapes: [{ ...payload().shapes[0], sheet_id: "Plan.pdf#2" }],
    markups: [{ ...payload().markups[0], sheet_id: "Plan.pdf#2" }],
    sheet_bookmarks: ["Plan.pdf#3"],
  };
  const snapshotPayload = { ...live, shapes: [{ ...live.shapes[0], sheet_id: "Plan.pdf#4" }] };
  const source = {
    async listSheets() { return [{ name: "Plan.pdf" }, { name: "Unmarked.pdf" }]; },
    async loadPdfData(name: string) { return name === "Plan.pdf" ? planBytes : omittedBytes; },
    async listSnapshots() { return [{ id: "snap-1" }]; },
    async getSnapshot() { return { id: "snap-1", ts: 1, label: "Earlier", payload: snapshotPayload }; },
  };
  const archive = await exportProjectFile(source, live, { compact: true });
  const reopened = await readProjectFile(archive);
  assert.deepEqual(reopened.pdfs.map((item) => item.name), ["Plan.pdf"], "a fully unmarked PDF is represented only by recovery metadata");
  assert.deepEqual(reopened.annotations.compact_project.files.map((file: any) => ({ name: file.name, pages: file.included_pages })), [
    { name: "Plan.pdf", pages: [2, 3, 4] },
    { name: "Unmarked.pdf", pages: [] },
  ]);
  assert.equal(reopened.annotations.compact_project.files[0].original_size, planBytes.byteLength);
  assert.equal(reopened.annotations.compact_project.files[1].original_size, omittedBytes.byteLength);
  assert.match(reopened.annotations.compact_project.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(reopened.snapshots[0].payload.compact_project.files.length, 2, "restoring a revision retains the missing-file warning");
  assert.equal((await PDFDocument.load(reopened.pdfs[0].bytes)).getPageCount(), 4, "placeholder pages retain original page numbers");

  const compactPlan = reopened.pdfs[0];
  const compactSource = {
    async listSheets() { return [{ name: compactPlan.name }]; },
    async loadPdfData() { return compactPlan.bytes; },
    async listSnapshots() { return []; },
    async getSnapshot() { return null; },
  };
  const recompacted = await readProjectFile(await exportProjectFile(compactSource, reopened.annotations, { compact: true }));
  assert.deepEqual(recompacted.annotations.compact_project.files.map((file: any) => file.name), ["Plan.pdf", "Unmarked.pdf"], "missing source imports remain recoverable after recompacting");
  assert.equal(recompacted.annotations.compact_project.files[0].sha256, reopened.annotations.compact_project.files[0].sha256, "recompacting preserves the original source hash");
  assert.equal(recompacted.annotations.compact_project.files[1].sha256, reopened.annotations.compact_project.files[1].sha256, "metadata-only missing PDFs remain recoverable");
});
