import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync } from "fflate";
import { collectDriveTree, writeDriveZip, safeDriveSegment } from "../src/lib/supabase/driveLibrary.js";
import { openLocalDriveProject } from "../src/lib/localDriveProject.js";
import { cloudStatusLabel, withProjectAuthor, metadataPayload } from "../src/lib/projectMetadata.js";
import { createDriveLibrary, FOLDER } from "../../supabase/functions/_shared/drive-library.js";
const id = "20000000-0000-0000-0000-000000000001";
const root = { id: "project", name: "Estimate", mimeType: FOLDER };
const asset = { id: "file", name: "plan.pdf", size: "3", mimeType: "application/pdf", modifiedTime: "today" };
test("connection label hides only idle connected status", () => {
  const state = { ready: true, user: { id }, driveConnected: false, offline: false, status: "Local Only" };
  assert.equal(cloudStatusLabel(state), "Local Only");
  assert.equal(cloudStatusLabel({ ...state, driveConnected: true }), "");
  assert.equal(cloudStatusLabel({ ...state, driveConnected: true, status: "Downloading" }), "Downloading");
});
test("author survives portable metadata and subsequent editors", () => {
  const authored = withProjectAuthor({ name: "Estimate" }, { id, email: "a@example.com" }, "Author");
  assert.equal(Reflect.get(metadataPayload(authored), "authorName"), "Author");
  assert.equal(withProjectAuthor(authored, { id: "other" }, "Editor").authorName, "Author");
  assert.equal(withProjectAuthor({}, { id, email: "a@example.com" }).authorName, "a@example.com");
  assert.equal(Reflect.get(metadataPayload({ name: "Old" }), "authorName"), undefined);
});
test("complete ZIP includes nested assets and empty directories with exact bytes", async () => {
  const folder = { id: "nested", name: "PDFs", mimeType: FOLDER };
  const empty = { id: "empty", name: "Empty", mimeType: FOLDER };
  const drive = { listFolder: async (_p: string, f: string) => ({ projectFolder: root, entries: !f ? [folder, empty] : f === "nested" ? [asset] : [] }), folderChunk: async () => new Uint8Array([1,2,3]) };
  const tree = await collectDriveTree(drive, id, undefined);
  const parts: Uint8Array[] = [];
  await writeDriveZip(drive, id, tree, (p: Uint8Array) => parts.push(p));
  const bytes = new Uint8Array(parts.reduce((n,p) => n+p.length,0)); let offset=0;
  for (const part of parts) { bytes.set(part,offset); offset+=part.length; }
  const files = unzipSync(bytes);
  assert.deepEqual(Object.keys(files), ["Estimate/", "Estimate/PDFs/", "Estimate/PDFs/plan.pdf", "Estimate/Empty/"]);
  assert.deepEqual(files["Estimate/PDFs/plan.pdf"], new Uint8Array([1,2,3]));
});
test("export rejects unsafe paths, native documents and duplicate names", async () => {
  for (const name of ["..", "a/b", "a\\b", "a\u0000"]) assert.throws(() => safeDriveSegment(name));
  for (const entries of [[{ ...asset, mimeType: "application/vnd.google-apps.document" }], [asset,asset]]) {
    await assert.rejects(collectDriveTree({ listFolder: async () => ({ projectFolder: root, entries }) }, id, undefined));
  }
});
test("local open walks the selected synced folder and matches project identity without network", async () => {
  const visited: string[] = [];
  const folder: any = { name: "My Drive", getDirectoryHandle: async (name: string) => { visited.push(name); return folder; }, async *values() { yield { kind: "file", name: "Estimate.otk", getFile: async () => new Blob([new Uint8Array([1])]) }; } };
  const result = await openLocalDriveProject(folder, ["Estimate save data", "Projects", "Estimate"], id, async () => ({ annotations: { project_id: id }, pdfs: [], snapshots: [] }));
  assert.equal(result.annotations.project_id,id);
  assert.deepEqual(visited, ["Estimate save data", "Projects", "Estimate"]);
  await assert.rejects(openLocalDriveProject(null, [], id), /could not locate/);
  await assert.rejects(openLocalDriveProject(folder, [], "other", async () => ({ annotations: { project_id: id }, pdfs: [], snapshots: [] })), /Exactly one/);
});
test("server library confines reads to authorized managed project descendants", async () => {
  const nodes: any = { file: { ...asset, parents: ["project"] }, outside: { ...asset, id: "outside", parents: ["personal"] }, personal: { id: "personal", parents: [] }, project: root };
  let reads = 0;
  const google = { findFolder: async (_a: string, key: string) => key === "root" ? { id: "managed", name: "Estimate save data" } : key === "projects" ? { id: "projects", name: "Projects" } : root,
    metadata: async (_a: string, file: string) => nodes[file], children: async () => [asset], readChunk: async () => { reads++; return new Uint8Array([1,2,3]); } };
  const api = createDriveLibrary({ google, token: async () => "token", store: { project: async () => ({ id, owner_id: "owner", file_provider: "google_drive" }), member: async () => null } });
  assert.deepEqual((await api.list("owner", id, null)).localPath, ["Estimate save data", "Projects", "Estimate"]);
  await assert.rejects(api.list("outsider", id, null));
  await assert.rejects(api.chunk("owner", id, "outside", 0, asset));
  assert.equal(reads,0);
  assert.equal((await api.chunk("owner", id, "file", 0, asset)).length,3);
  await assert.rejects(api.chunk("owner", id, "file", 0, { ...asset, size: "4" }));
});
test("ZIP stops on a truncated chunk instead of returning a partial successful export", async () => {
  await assert.rejects(writeDriveZip({ folderChunk: async () => new Uint8Array([1]) }, id,
    { total: 3, entries: [{ ...asset, path: "Estimate/plan.pdf" }] }, () => {}), /Incomplete Drive/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(writeDriveZip({}, id, { total: 0, entries: [root] }, () => {}, { signal: controller.signal }), /canceled/);
});
test("local open rejects denied access and stale archive content", async () => {
  await assert.rejects(openLocalDriveProject({ queryPermission: async () => "denied" }, [], id), /could not locate/);
  const folder: any = { name: "Estimate", async *values() { yield { kind: "file", name: "Estimate.otk", getFile: async () => new Blob([new Uint8Array([1])]) }; } };
  await assert.rejects(openLocalDriveProject(folder, ["Estimate"], id,
    async () => ({ annotations: { project_id: id }, pdfs: [], snapshots: [] }), "0".repeat(64)), /differs from the cloud/);
});
