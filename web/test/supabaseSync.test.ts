import "fake-indexeddb/auto";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { localStore, ANN_SCHEMA, createFileProjectStore, importFileProject } from "../src/lib/store.js";
import { exportProjectFile, readProjectFile } from "../src/lib/projectFile.js";
import { bytesToBase64 } from "../src/lib/whiteboard.js";
import { captureCloudProject, restoreCloudProject, validateCloudState, FREE_FILE_LIMIT, restoredProjectSource } from "../src/lib/supabase/projectState.js";
import { createCloudSync } from "../src/lib/supabase/sync.js";
import { CloudError } from "../src/lib/supabase/errors.js";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const projectId = "20000000-0000-0000-0000-000000000001";
const pdf = new TextEncoder().encode("%PDF-1.7\noriginal bytes\n%%EOF");
function payload(): any {
  return { schema: ANN_SCHEMA, project_id: projectId, project_name: "Test project", units: "imperial",
    conditions: [{ id: "c1", name: "Tile", waste: 5 }],
    shapes: [{ id: "s1", sheet_id: "Plan.pdf#2", verts_norm: [[.1, .2], [.3, .4]], condition_id: "c1" }],
    markups: [{ id: "m1", type: "text", text: "Keep this", sheet_id: "Plan.pdf#2" }],
    sheets: [{ sheet_id: "Plan.pdf#2", units_per_px: .03125, scale_source: "calibrated" }],
    sheet_tabs: ["Plan.pdf#2"], sheet_bookmarks: ["Plan.pdf#2"], client_info: { name: "Client" },
    whiteboard: { version: 1, assets: [{ id: "a1", name: "Note.pdf", type: "application/pdf", size: pdf.length, data: bytesToBase64(pdf) }],
      items: [{ id: "i1", kind: "file", assetId: "a1", page: 1, x: 10, y: 20, w: 300, h: 400 }] } };
}
async function fixture() {
  await localStore.addPdf(new File([pdf], "Plan.pdf", { type: "application/pdf" }));
  await localStore.saveAnnotations(payload());
  await localStore.saveSnapshot("First", payload());
}
function harness() {
  let cloud: any = null, version = 0, uploads = 0, downloads = 0, failUpload = false, unavailable = false;
  const objects = new Map<string, Uint8Array>(), rows = new Map<string, any>(), bindings = new Map<string, any>(), events: string[] = [];
  const repository = {
    async saveProject(id: string, expected: number, state: any) {
      events.push("state");
      if (unavailable) throw new CloudError("OTK_NETWORK", "offline");
      if (expected !== version) throw new CloudError("OTK_CONFLICT", "conflict");
      cloud = { id, version: ++version, updated_at: new Date().toISOString(), project_state: structuredClone(state) }; return cloud;
    },
    async listFiles() { return [...rows.values()]; },
    async registerFile(_id: string, ref: any) { rows.set(ref.sha256, { ...ref, uploaded: rows.get(ref.sha256)?.uploaded || false }); },
    async finishFile(_id: string, hash: string) { rows.get(hash).uploaded = true; },
    async loadProject() { return structuredClone(cloud); },
  };
  const files = {
    async upload(path: string, file: any) { events.push("upload"); uploads++; if (failUpload) throw new Error("offline"); objects.set(path, file.bytes); },
    async download(path: string) { downloads++; return objects.get(path); },
  };
  const meta = { get: async (key: string) => bindings.get(key), put: async (key: string, value: any) => { bindings.set(key, value); } };
  const sync = (local: any = localStore, key = "account1:workspace1") => createCloudSync({ repository, files, local, meta, key });
  return { sync, meta, events, objects, rows, bindings, set failUpload(v: boolean) { failUpload = v; }, set offline(v: boolean) { unavailable = v; },
    get uploads() { return uploads; }, get downloads() { return downloads; }, get version() { return version; } };
}

test("cloud round-trip preserves takeoff math, original bytes, bookmarks, whiteboard, revisions and portable identity", async () => {
  await fixture(); const original = payload(), captured = await captureCloudProject(localStore, original);
  assert.deepEqual(original, payload());
  assert.equal(captured.files.size, 1); // Same PDF used on the plan and board/revision.
  let reads = 0;
  const restored = await restoreCloudProject(captured.state, async (ref: { sha256: string }) => { reads++; return captured.files.get(ref.sha256).bytes; });
  assert.equal(reads, 1);
  assert.deepEqual(restored.annotations, payload());
  assert.deepEqual(restored.snapshots[0].payload, payload());
  const portable = await readProjectFile(await exportProjectFile(restoredProjectSource(restored), restored.annotations));
  assert.deepEqual(portable.annotations, payload());
  assert.deepEqual(portable.pdfs[0].bytes, pdf);
  const opened = createFileProjectStore(await importFileProject(restored));
  assert.deepEqual(await opened.loadAnnotations(), payload());
});

test("repeated saves update one project, persist locally first, skip uploaded bytes and cache downloads", async () => {
  await fixture(); const h = harness(), sync = h.sync();
  assert.equal(await sync.status(payload()), "Local Only");
  assert.deepEqual((await sync.save(payload())).warnings, []);
  assert.deepEqual(h.events, ["state", "upload"]);
  assert.equal(await sync.status(payload()), "Synced");
  const edited = { ...payload(), project_name: "Changed" };
  assert.equal(await sync.status(edited), "Unsaved Changes");
  await sync.save(edited);
  assert.equal(h.version, 2); assert.equal(h.uploads, 1);
  assert.equal((await localStore.loadAnnotations()).project_name, "Changed");
  await sync.load(projectId); assert.equal(h.downloads, 0);
  const fresh = createFileProjectStore(crypto.randomUUID());
  const otherDevice = await h.sync(fresh, "device2").load(projectId);
  assert.equal(h.downloads, 1); assert.deepEqual(otherDevice.restored.annotations, edited);
});

test("partial upload retries retain version, preserve local originals and never duplicate cloud projects", async () => {
  await fixture(); const h = harness(), sync = h.sync(); h.failUpload = true;
  assert.equal((await sync.save(payload())).warnings.length, 1);
  assert.equal(await sync.status(payload()), "Files Local Only");
  assert.equal((await sync.metadata()).cloudVersion, 1);
  h.failUpload = false; await sync.save(payload());
  assert.equal(h.version, 2); assert.equal(await sync.status(payload()), "Synced");
  assert.deepEqual(await localStore.loadPdfData("Plan.pdf"), pdf);
});

test("stale device detects a conflict before upload; explicit Keep Local still checks the shown version", async () => {
  await fixture(); const h = harness(), first = h.sync(), stale = h.sync(localStore, "device2");
  await first.save(payload());
  await h.meta.put("device2", structuredClone(await first.metadata()));
  await first.save({ ...payload(), project_name: "PC" });
  await assert.rejects(stale.save({ ...payload(), project_name: "Phone" }), /conflict/);
  assert.equal(h.uploads, 1); assert.equal(h.version, 2);
  assert.equal((await localStore.loadAnnotations()).project_name, "Phone");
  await stale.save({ ...payload(), project_name: "Phone" }, { expectedVersion: 2 });
  assert.equal(h.version, 3);
  await assert.rejects(first.save(payload(), { expectedVersion: 2 }), /conflict/);
});

test("offline failures keep local edits, then reconnect uses the same project/version", async () => {
  await fixture(); const h = harness(), sync = h.sync(); await sync.save(payload()); h.offline = true;
  const edited = { ...payload(), project_name: "Offline edit" };
  await assert.rejects(sync.save(edited), /offline/);
  assert.deepEqual(await localStore.loadAnnotations(), edited);
  assert.equal((await sync.metadata()).cloudVersion, 1);
  h.offline = false; await sync.save(edited); assert.equal(h.version, 2); assert.equal(h.uploads, 1);
});

test("oversized PDF saves metadata but never uploads; unavailable plans survive a later save", async () => {
  const a = { ...payload(), whiteboard: undefined };
  const bytes = new Uint8Array(FREE_FILE_LIMIT + 1);
  const source = { listSheets: async () => [{ name: "Large.pdf" }], loadPdfData: async () => bytes, listSnapshots: async () => [],
    saveAnnotations: async () => {}, loadAnnotations: async () => a };
  const h = harness(), sync = h.sync(source);
  assert.match((await sync.save(a)).warnings[0], /over 50 MB/); assert.equal(h.uploads, 0);
  const fresh = createFileProjectStore(crypto.randomUUID()), remoteSync = h.sync(fresh, "device2");
  const loaded = await remoteSync.load(projectId);
  assert.equal(loaded.restored.missing.length, 1); assert.equal(loaded.restored.pdfs.length, 0);
  await h.meta.put("device2", loaded.binding);
  await remoteSync.save(loaded.restored.annotations);
  assert.equal((await remoteSync.load(projectId)).restored.missing.length, 1);
});

test("Local Only whiteboard placeholders preserve layout and cannot silently export an incomplete backup", async () => {
  await fixture(); const capture = await captureCloudProject(localStore, payload());
  const restored = await restoreCloudProject(capture.state, async () => null);
  assert.deepEqual(restored.annotations.whiteboard.items, payload().whiteboard.items);
  assert.equal(restored.annotations.whiteboard.assets[0].missing, true);
  await assert.rejects(exportProjectFile(restoredProjectSource(restored), restored.annotations), /Local Only/);
  const again = await captureCloudProject(restoredProjectSource(restored), restored.annotations, capture.state.plans);
  assert.deepEqual(again.state, capture.state);
});

test("malformed schemas, invalid assets and hash-mismatched downloads are rejected before import", async () => {
  await fixture(); const captured = await captureCloudProject(localStore, payload());
  assert.throws(() => validateCloudState({ ...captured.state, schema: "future-version" }), /Unsupported/);
  const invalid = structuredClone(captured.state); invalid.plans[0].sha256 = "bad";
  assert.throws(() => validateCloudState(invalid), /Unsupported/);
  await assert.rejects(restoreCloudProject(captured.state, async () => new Uint8Array(pdf.length)), /Unsupported/);
  assert.deepEqual(await localStore.loadAnnotations(), payload());
});
