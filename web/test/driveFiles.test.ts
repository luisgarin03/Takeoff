import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createDriveFiles, DRIVE_CHUNK } from "../src/lib/supabase/driveFiles.js";
import { createDriveCache } from "../src/lib/supabase/driveCache.js";
import { createProjectFiles } from "../src/lib/supabase/projectFiles.js";
import { createCloudSync } from "../src/lib/supabase/sync.js";
import { digest } from "../src/lib/projectFile.js";
import { ANN_SCHEMA, createFileProjectStore, importFileProject } from "../src/lib/store.js";
import { bytesToBase64 } from "../src/lib/whiteboard.js";
import { driveReturnResult, isDriveDeepLink } from "../src/lib/supabase/driveConnection.js";

beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });
const id = "20000000-0000-0000-0000-000000000001";
async function fixture(size = 7) {
  const data = new Uint8Array(size).fill(42), hash = await digest(data), path = `${id}/${hash}`;
  const record = { project_id: id, sha256: hash, size, mime_type: "application/pdf", storage_provider: "google_drive", uploaded: true };
  const calls: string[] = [], offsets: number[] = []; let offset = 0, infoCalls = 0, interrupted = false, corrupt = false, denied = false, offline = false;
  const fetcher: any = async (url: string, options: any) => {
    const u = new URL(url), action = u.searchParams.get("action")!; calls.push(action);
    assert.equal(options.headers.Authorization, "Bearer session");
    assert.equal(options.headers.apikey, "publishable");
    if (offline) throw new TypeError("offline");
    if (denied) return Response.json({ code: "OTK_ACCESS" }, { status: 403 });
    if (action === "info") { infoCalls++; return Response.json({ sha256: hash, size, type: "application/pdf" }); }
    if (action === "download") {
      const start = Number(u.searchParams.get("offset")); offsets.push(start);
      if (interrupted && start >= DRIVE_CHUNK) return Response.json({ code: "OTK_DRIVE_TRANSFER" }, { status: 502 });
      return new Response(corrupt ? new Uint8Array(Math.min(DRIVE_CHUNK, size - start)) : data.slice(start, start + DRIVE_CHUNK));
    }
    if (action === "begin") return Response.json({ offset, done: offset === size });
    if (action === "chunk") {
      offset += options.body.length;
      if (interrupted) { interrupted = false; throw new TypeError("lost response"); }
      return Response.json({ offset, done: offset === size });
    }
    return Response.json({ connected: action !== "disconnect", configured: true });
  };
  const client: any = { auth: { getSession: async () => ({ data: { session: { access_token: "session", user: { id: "user" } } } }) } };
  const cache = createDriveCache("supabase/user");
  const files = createDriveFiles({ client, url: "https://test.supabase.co", key: "publishable", userId: "user", assertUser: async () => {}, fetcher, cache, wait: async () => {} });
  return { files, data, record, path, calls, offsets, cache,
    get infoCalls() { return infoCalls; }, set interrupted(v: boolean) { interrupted = v; }, set corrupt(v: boolean) { corrupt = v; },
    set denied(v: boolean) { denied = v; }, set offline(v: boolean) { offline = v; } };
}
test("file router keeps existing Supabase projects on Supabase and Drive projects on Drive", async () => {
  const events: string[] = [];
  const fake = (name: string): any => ({ upload: async () => events.push(`${name}:upload`), download: async () => events.push(`${name}:download`), remove: async () => events.push(`${name}:remove`) });
  const files = createProjectFiles(fake("supabase"), fake("drive"));
  await files.upload("p/h", {}, undefined); await files.download("p/h");
  await files.upload("p/h", {}, undefined, { provider: "google_drive" }); await files.download("p/h", { record: { storage_provider: "google_drive" } });
  await files.removeRecords([{ storage_provider: "google_drive", project_id: "p", sha256: "h" }, { storage_path: "p/h" }]);
  assert.deepEqual(events, ["supabase:upload", "supabase:download", "drive:upload", "drive:download", "drive:remove", "supabase:remove"]);
  assert.equal(files.limit("supabase"), 50_000_000); assert.equal(files.limit("google_drive"), 2147483648);
});
test("Drive provider reconnect/disconnect status stays separate from Supabase auth", async () => {
  const h = await fixture(); assert.equal((await h.files.status()).connected, true);
  assert.equal((await h.files.disconnect()).connected, false); assert.deepEqual(h.calls, ["status", "disconnect"]);
});
test("Drive download verifies bytes and reuses a verified IndexedDB copy when offline", async () => {
  const h = await fixture(); assert.deepEqual(await h.files.download(h.path, { record: h.record }), h.data);
  h.offline = true; assert.deepEqual(await h.files.download(h.path, { record: h.record }), h.data);
  assert.equal(h.infoCalls, 1); assert.deepEqual(h.offsets, [0]);
});
test("interrupted download retries skip chunks already cached, then verifies the entire file", async () => {
  const h = await fixture(DRIVE_CHUNK + 10); h.interrupted = true;
  await assert.rejects(h.files.download(h.path, { record: h.record }), /interrupted/);
  assert.equal(await h.cache.get(h.path, "verified"), undefined);
  h.interrupted = false; assert.deepEqual(await h.files.download(h.path, { record: h.record }), h.data);
  assert.equal(h.offsets.filter((n) => n === 0).length, 1);
});
test("hash mismatch clears partial cache and never publishes verified content", async () => {
  const h = await fixture(); h.corrupt = true;
  await assert.rejects(h.files.download(h.path, { record: h.record }), /identity/);
  assert.equal(await h.cache.get(h.path, 0), undefined); assert.equal(await h.cache.get(h.path, "verified"), undefined);
  h.corrupt = false; assert.deepEqual(await h.files.download(h.path, { record: h.record }), h.data);
});
test("interrupted upload probes the committed offset instead of sending duplicate bytes", async () => {
  const h = await fixture(DRIVE_CHUNK + 5); h.interrupted = true;
  await h.files.upload(h.path, { bytes: h.data, size: h.data.length }, () => {});
  assert.deepEqual(h.calls, ["begin", "chunk", "begin", "chunk"]);
});
test("cancellation stops transfers and access-denied responses are not retried", async () => {
  const h = await fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(h.files.download(h.path, { record: h.record, signal: controller.signal }), /canceled/);
  assert.equal(h.calls.length, 0);
  h.denied = true; await assert.rejects(h.files.download(h.path, { record: h.record }), /access was removed/);
  assert.deepEqual(h.calls, ["info"]);
});
test("native return accepts only the registered callback and never treats it as a login token", () => {
  assert.equal(isDriveDeepLink("com.opentakeoff.app://drive-auth?otkDrive=connected"), true);
  for (const bad of ["https://evil/drive-auth", "com.opentakeoff.app://drive-auth/other", "com.opentakeoff.app://user@drive-auth"]) assert.equal(isDriveDeepLink(bad), false);
  assert.deepEqual(driveReturnResult("https://app/?otkDrive=connected"), { error: "" });
  assert.match(driveReturnResult("https://app/?otkDrive=account")!.error, /same Google account/);
  assert.equal(driveReturnResult("https://app/?code=not-a-drive-return"), null);
});
test("second device restores Drive PDFs, marks, calibration, bookmarks, whiteboard and revisions; saves deduplicate", async () => {
  const h = await fixture();
  const payload: any = { schema: ANN_SCHEMA, project_id: id, project_name: "Drive round trip", units: "imperial", conditions: [],
    shapes: [{ id: "shape", sheet_id: "Plan.pdf#2", verts_norm: [[.1, .2], [.3, .4]] }],
    sheets: [{ sheet_id: "Plan.pdf#2", units_per_px: .123, scale_source: "calibrated" }],
    sheet_tabs: ["Plan.pdf#2"], sheet_bookmarks: ["Plan.pdf#2"], markups: [{ id: "m", text: "Keep", sheet_id: "Plan.pdf#2" }],
    whiteboard: { version: 1, assets: [{ id: "asset", name: "Board.pdf", type: "application/pdf", size: h.data.length, data: bytesToBase64(h.data) }],
      items: [{ id: "note", kind: "file", assetId: "asset", page: 1, x: 11, y: 22, w: 300, h: 200 }] } };
  const source: any = { listSheets: async () => [{ name: "Plan.pdf" }], loadPdfData: async () => h.data,
    listSnapshots: async () => [{ id: "rev" }], getSnapshot: async () => ({ id: "rev", ts: 123, payload }), saveAnnotations: async () => {}, loadAnnotations: async () => payload };
  let project: any, row: any, uploads = 0, providerChanges = 0;
  const bindings = new Map(), meta = { get: async (k: any) => bindings.get(k), put: async (k: any, v: any) => { bindings.set(k, v); } };
  const repository: any = { saveProject: async (_id: string, expected: number, state: any) => project = { ...project, id, version: expected + 1, project_state: state },
    setFileProvider: async (_id: string, value: string) => { providerChanges++; project.file_provider = value; return project; },
    loadProject: async () => project, listFiles: async () => row ? [row] : [],
    registerFile: async () => { row = { ...h.record, uploaded: false }; }, finishFile: async () => { throw new Error("Drive must not use Supabase finish"); } };
  const files: any = createProjectFiles({} as any, { ...h.files, upload: async (...args: any[]) => { uploads++; await (h.files.upload as any)(...args); row.uploaded = true; } });
  const sync = createCloudSync({ repository, files, local: source, meta, key: "owner" });
  assert.deepEqual((await sync.save(payload, { newProjectProvider: "google_drive" })).warnings, []);
  await sync.save(payload, { newProjectProvider: "supabase" }); assert.equal(uploads, 1); assert.equal(providerChanges, 1);
  const empty = createFileProjectStore(crypto.randomUUID());
  const second = createCloudSync({ repository, files, local: empty, meta, key: "viewer/device2" });
  const result = await second.load(id);
  assert.deepEqual(result.restored.annotations, payload); assert.deepEqual(result.restored.snapshots[0].payload, payload);
  assert.deepEqual(result.restored.pdfs, [{ name: "Plan.pdf", bytes: h.data }]); assert.equal(result.restored.missing.length, 0);
  const reopened = createFileProjectStore(await importFileProject(result.restored));
  assert.deepEqual(await reopened.loadAnnotations(), payload); assert.deepEqual(await reopened.loadPdfData("Plan.pdf"), h.data);
});


// Regression coverage for interrupted response bodies and stalled acknowledgements.
function transport(fetcher: any, session: any = { access_token: "session", user: { id: "user" } }) {
  return createDriveFiles({ client: { auth: { getSession: async () => ({ data: { session } }) } },
    url: "https://test.supabase.co", key: "publishable", userId: "user", assertUser: async () => {},
    fetcher, wait: async () => {}, cache: createDriveCache("regression/user") });
}

test("truncated upload reply probes the committed offset without resending the binary", async () => {
  let committed = 0; const calls: string[] = [], progress: number[] = [];
  const files = transport(async (url: string, init: any) => {
    const action = new URL(url).searchParams.get("action")!; calls.push(action);
    if (action === "begin") return Response.json({ offset: committed, done: committed === 3 });
    committed += init.body.length;
    return new Response('{"offset":'); // Headers arrived, but the JSON body was interrupted.
  });
  await files.upload(id + "/" + "a".repeat(64), { size: 3, bytes: new Uint8Array(3) }, (n: number) => progress.push(n));
  assert.deepEqual(calls, ["begin", "chunk", "begin"]); assert.equal(committed, 3); assert.equal(progress.at(-1), 1);
});

test("missing or changed Drive session fails as auth before any HTTP request", async () => {
  for (const session of [null, { access_token: "session", user: { id: "other-user" } }]) {
    let calls = 0;
    const files = transport(async () => { calls++; return Response.json({ configured: true }); }, session);
    await assert.rejects(files.status(), (e: any) => e.code === "OTK_AUTH"); assert.equal(calls, 0);
  }
});

test("repeated non-progress upload replies stop after a bounded number of probes", async () => {
  let chunks = 0;
  const files = transport(async (url: string) => {
    if (new URL(url).searchParams.get("action") === "chunk" && ++chunks > 5) throw new Error("unbounded transfer guard");
    return Response.json({ offset: 0, done: false });
  });
  await assert.rejects(files.upload(id + "/" + "a".repeat(64), { size: 3, bytes: new Uint8Array(3) }, undefined),
    (e: any) => e.code === "OTK_DRIVE_TRANSFER");
  assert.equal(chunks, 4);
});

test("an invalid completed upload acknowledgement cannot report success", async () => {
  let completed = false;
  const files = transport(async () => Response.json({ offset: 0, done: true }));
  await assert.rejects(files.upload(id + "/" + "a".repeat(64), { size: 3, bytes: new Uint8Array(3) },
    (n: number) => { if (n === 1) completed = true; }), (e: any) => e.code === "OTK_DRIVE_INTEGRITY");
  assert.equal(completed, false);
});

// HTTP/body boundaries must fail safely before a transfer can report success.
test("download rejects malformed metadata with an actionable integrity error", async () => {
  const files = transport(async () => Response.json(null));
  await assert.rejects(files.download(id + "/" + "a".repeat(64), {
    record: { sha256: "a".repeat(64), size: 3, mime_type: "application/pdf" },
  }), (e: any) => e.code === "OTK_DRIVE_INTEGRITY");
});

test("download cancellation during the final cache write cannot return bytes", async () => {
  const data = new Uint8Array([1, 2, 3]), hash = await digest(data), controller = new AbortController();
  const files = createDriveFiles({ client: {} as any, url: "https://test.supabase.co", key: "public", userId: "user",
    assertUser: async () => {}, cache: {
      get: async (_path: string, part: any) => part === "verified" ? { size: 3, type: "application/pdf" } : data,
      put: async () => { controller.abort(); }, clear: async () => {},
    } });
  await assert.rejects(files.download(`${id}/${hash}`, {
    record: { sha256: hash, size: 3, mime_type: "application/pdf" }, signal: controller.signal,
  }), (e: any) => e.code === "OTK_CANCELED");
});

test("download account changes during the final cache write cannot return bytes", async () => {
  const data = new Uint8Array([1, 2, 3]), hash = await digest(data); let changed = false;
  const files = createDriveFiles({ client: {} as any, url: "https://test.supabase.co", key: "public", userId: "user",
    assertUser: async () => { if (changed) throw Object.assign(new Error("OTK_AUTH"), { code: "OTK_AUTH" }); }, cache: {
      get: async (_path: string, part: any) => part === "verified" ? { size: 3, type: "application/pdf" } : data,
      put: async () => { changed = true; }, clear: async () => {},
    } });
  await assert.rejects(files.download(`${id}/${hash}`, {
    record: { sha256: hash, size: 3, mime_type: "application/pdf" },
  }), (e: any) => e.code === "OTK_AUTH");
});

test("malformed begin replies are rejected as integrity errors before reading upload state", async () => {
  for (const state of [null, false, {}, { done: true, offset: 0 }, { done: "true", offset: 3 }]) {
    let completed = false;
    const files = transport(async () => Response.json(state));
    await assert.rejects(files.upload(id + "/" + "a".repeat(64), { size: 3, bytes: new Uint8Array(3) },
      (n: number) => { if (n === 1) completed = true; }), (e: any) => e.code === "OTK_DRIVE_INTEGRITY");
    assert.equal(completed, false);
  }
});

test("gateway errors without app codes retain auth, access, size and quota classifications", async () => {
  for (const [status, code] of [[401, "OTK_AUTH"], [403, "OTK_ACCESS"], [413, "OTK_DRIVE_SIZE"], [429, "OTK_DRIVE_QUOTA"]] as const) {
    for (const body of ["", "null", "{}"] ) {
      const files = transport(async () => new Response(body, { status }));
      await assert.rejects(files.status(), (e: any) => e.code === code);
    }
  }
});

test("cancellation while parsing the final reply cannot report upload success", async () => {
  const controller = new AbortController(); let completed = false;
  const files = transport(async () => ({ ok: true, json: async () => {
    controller.abort(); return { done: true, offset: 3 };
  } }));
  await assert.rejects(files.upload(id + "/" + "a".repeat(64), { size: 3, bytes: new Uint8Array(3) },
    (n: number) => { if (n === 1) completed = true; }, { signal: controller.signal }),
  (e: any) => e.code === "OTK_CANCELED");
  assert.equal(completed, false);
});

test("an account change while parsing a reply is rejected before returning its payload", async () => {
  let changed = false;
  const files = createDriveFiles({
    client: { auth: { getSession: async () => ({ data: { session: { access_token: "test", user: { id: "user" } } } }) } },
    url: "https://test.supabase.co", key: "publishable", userId: "user",
    assertUser: async () => { if (changed) throw new Error("OTK_AUTH"); },
    fetcher: async () => ({ ok: true, json: async () => { changed = true; return { connected: true }; } }) as any,
  });
  await assert.rejects(files.status(), (e: any) => e.code === "OTK_AUTH");
});
