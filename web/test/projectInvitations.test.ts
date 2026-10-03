import { test } from "node:test";
import assert from "node:assert/strict";
import { sharePath, importSharedFiles, createProjectInvitations } from "../src/lib/projectInvitations.js";
import { exportProjectFile } from "../src/lib/projectFile.js";

test("import paths cannot escape the selected folder", () => {
  for (const path of ["../a.otk", "/a.otk", "x\\a.otk", "x/CON", "x/a. ", "x//a.otk"]) assert.throws(() => sharePath(path));
  assert.equal(sharePath("Plans/Floor 1.pdf"), "Plans/Floor 1.pdf");
});
test("invalid shared archives never create a destination folder", async () => {
  const invitation = { id: "test", files: [{ path: "project.otk", size: 3 }], project_name: "Test" };
  let touched = false;
  const parent = { getDirectoryHandle: async () => { touched = true; } };
  await assert.rejects(importSharedFiles({}, invitation, [], "project.otk", parent), /Select an .otk/);
  await assert.rejects(importSharedFiles({ download: async () => new Uint8Array([1,2,3]) }, invitation, ["project.otk"], "project.otk", parent));
  assert.equal(touched, false);
});
test("selective import writes only checked files and returns the project only after all writes finish", async () => {
  const bytes = await exportProjectFile({ listSheets: async () => [], listSnapshots: async () => [] }, { conditions: [], shapes: [], project_name: "Test" });
  const downloads: string[] = [], closed: string[] = [];
  const api = { download: async (_id: string, file: any) => { downloads.push(file.path); return bytes; } };
  const files = ["project.otk", "extra.pdf"].map((path) => ({ path }));
  const parent = { getDirectoryHandle: async (_name: string, options: any) => {
    if (!options?.create) throw new DOMException("missing", "NotFoundError");
    return { getFileHandle: async (name: string) => ({ name, createWritable: async () => ({ write: async () => {}, close: async () => { closed.push(name); }, abort: async () => {} }) }) };
  } };
  const handle = await importSharedFiles(api, { id: "invite", files, project_name: "Test" }, ["project.otk"], "project.otk", parent);
  assert.deepEqual(downloads, ["project.otk"]); assert.deepEqual(closed, ["project.otk"]); assert.equal(handle.name, "project.otk");
});
test("chunked downloads reject truncated data and account changes", async () => {
  let changed = false;
  const api = createProjectInvitations({}, "user", async () => { if (changed) throw new Error("account changed"); }, { shareChunk: async () => new Uint8Array([1]) });
  await assert.rejects(api.download("invite", { id: "file", size: 3, modifiedTime: "v1" }), /incomplete/);
  changed = true;
  await assert.rejects(api.download("invite", { id: "file", size: 3 }), /account changed/);
});
