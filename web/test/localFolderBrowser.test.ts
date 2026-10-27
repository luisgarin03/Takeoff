import { test } from "node:test";
import assert from "node:assert/strict";
import { listLocalDirectory, readLocalProjectHandle, readLocalProjectMetadata } from "../src/lib/localDriveProject.js";
import { exportProjectFile } from "../src/lib/projectFile.js";
import { emptyAnnotations } from "../src/lib/store.js";

test("selected-folder listing puts OTK first and keeps inaccessible entries visible", async () => {
  const children = [{ name: "Plan.pdf", kind: "file", getFile() { throw new Error("must not hydrate while listing"); } }, { name: "Revisions", kind: "directory" }, { name: "Estimate.otk", kind: "file" }];
  const result = await listLocalDirectory({ async *values() { yield* children; } });
  assert.deepEqual(result.map((e) => e.name), ["Estimate.otk", "Revisions", "Plan.pdf"]);
  assert.equal(result[1].handle, children[1]);
  assert.deepEqual(await listLocalDirectory({ async *values() {} }), []);
});
test("unavailable selected folder gives an actionable error", async () => {
  await assert.rejects(listLocalDirectory({ values() { throw new Error("permission denied"); } }), /select the folder again/);
});
test("selected local .otk opens through the real portable reader; other file types are not launched", async () => {
  const annotations = { ...emptyAnnotations(), project_name: "Selected folder project" };
  const source = { listSheets: async () => [], listSnapshots: async () => [] };
  const bytes = await exportProjectFile(source, annotations);
  const restored = await readLocalProjectHandle({ kind: "file", name: "Project.otk", getFile: async () => ({ size: bytes.length, arrayBuffer: async () => bytes.buffer }) });
  assert.equal(restored.annotations.project_name, annotations.project_name);
  await assert.rejects(readLocalProjectHandle({ kind: "file", name: "Plan.pdf" }), /Choose an .otk/);
  await assert.rejects(readLocalProjectHandle({ kind: "directory", name: "Project.otk" }), /Choose an .otk/);
});

test("folder dates use newest nested file and project files sort ahead of folders", async () => {
  const file = (name: string, modified: number) => ({ name, kind: "file", getFile: async () => ({ name, lastModified: modified }) });
  const folder = (name: string, children: any[]) => ({ name, kind: "directory", async *values() { yield* children; } });
  const entries = await listLocalDirectory(folder("Root", [folder("Old", [file("old.pdf", 100)]), folder("Newest", [folder("nested", [file("new.pdf", 300)])]), file("estimate.otk", 50), folder("Empty", [])]));
  assert.deepEqual(entries.map((e) => e.name), ["estimate.otk", "Newest", "Old", "Empty"]);
  assert.equal(entries[1].modified, 300); assert.equal(entries[1].modifiedBy, "Unknown");
  assert.equal(entries[3].modified, null);
});
test("listing reads saved editor from manifest without decoding archive assets", async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const bytes = zipSync({ "assets/large.bin": new Uint8Array(1024*1024), "project.json": strToU8(JSON.stringify({ format: "opentakeoff.project", annotations: { project_metadata: { authorName: "Original", lastModifiedByName: "Editor" } } })) });
  const file = new File([bytes], "Estimate.otk", { lastModified: 1234 });
  assert.equal((await readLocalProjectMetadata(file))?.lastModifiedByName, "Editor");
  const rows = await listLocalDirectory({ async *values() { yield { name: file.name, kind: "file", getFile: async () => file }; } });
  assert.equal(rows[0].modifiedBy, "Editor"); assert.equal(rows[0].modified, 1234);
});
