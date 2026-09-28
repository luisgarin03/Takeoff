import { test } from "node:test";
import assert from "node:assert/strict";
import { cipher, sha256, DRIVE_SCOPE, returnUrl, NATIVE_RETURN, CHUNK, DriveError } from "../../supabase/functions/_shared/drive-security.js";
import { createDriveService } from "../../supabase/functions/_shared/drive-service.js";
import { createDriveGoogle } from "../../supabase/functions/_shared/drive-google.js";

const owner = "10000000-0000-0000-0000-000000000001", editor = "10000000-0000-0000-0000-000000000002";
const viewer = "10000000-0000-0000-0000-000000000003", outsider = "10000000-0000-0000-0000-000000000004";
const id = "20000000-0000-0000-0000-000000000001";
const encryption = () => cipher(btoa("a".repeat(32)));
async function fixture() {
  const crypt = await encryption(), hash = await sha256(new Uint8Array([1, 2, 3]));
  let connection: any = { user_id: owner, google_sub: "google-owner", email: "drive@example.com", status: "connected", token_cipher: await crypt.seal("refresh-secret", owner) };
  const project: any = { id, owner_id: owner, name: "Bitzell Fence", file_provider: "google_drive", deleted_at: null };
  const file: any = { project_id: id, sha256: hash, original_filename: "Plan.pdf", mime_type: "application/pdf", size: 3,
    storage_provider: "google_drive", provider_owner_id: owner, file_kind: "originals", uploaded: false };
  const members = new Map([[editor, { role: "editor" }], [viewer, { role: "viewer" }]]);
  const states = new Map<string, any>(), uploads: any = { session_cipher: null };
  let held: string | null = null, created = 0, transferred = 0, mediaReads = 0, remote: any = null, nextOffset = 0;
  let revoked = false, identity = "google-owner", revokeNetwork = false, failReply = false;
  const folders: Array<{ name: string, key: string }> = []; let replaceUpload = false;
  const store: any = {
    connection: async () => connection,
    patchConnection: async (_user: string, patch: any) => { connection = { ...connection, ...patch }; },
    startOAuth: async (row: any) => { states.clear(); states.set(row.state_hash, row); connection.oauth_nonce = row.state_hash; },
    claimOAuth: async (hash: string) => { const row = states.get(hash); states.delete(hash); return row; },
    completeOAuth: async (row: any, patch: any) => { if (connection.oauth_nonce !== row.state_hash) return false; connection = { ...connection, ...patch, oauth_nonce: null }; return true; },
    cancelOAuth: async () => states.clear(),
    project: async () => project, member: async (_id: string, user: string) => members.get(user), file: async () => file,
    patchFile: async (_id: string, _hash: string, patch: any) => Object.assign(file, patch),
    lease: async (_id: string, _hash: string, lease: string) => { if (held) return false; held = lease; return true; },
    release: async () => { held = null; }, upload: async () => uploads,
    patchUpload: async (_id: string, _hash: string, value: string) => { uploads.session_cipher = value; },
  };
  const metadata = () => ({ id: file.provider_file_id, size: String(file.size), mimeType: file.mime_type, sha256Checksum: hash });
  const google: any = {
    metadata: async () => { if (!remote) throw new DriveError("OTK_DRIVE_MISSING", 404); return remote; },
    folder: async (_token: string, name: string, _parent: string, key: string) => { folders.push({ name, key }); return `folder-${name}`; },
    id: async () => "stable-id",
    begin: async (_token: string, _file: any, replace: boolean) => { created++; replaceUpload = !!replace; return "https://www.googleapis.com/upload/drive/v3/files?upload_id=private"; },
    transfer: async (_token: string, _session: string, _file: any, offset: number, bytes: Uint8Array) => {
      if (!bytes) return { offset: nextOffset, done: !!remote };
      transferred++; nextOffset = offset + bytes.length;
      if (nextOffset === file.size) remote = metadata();
      if (failReply) { failReply = false; throw new DriveError("OTK_DRIVE_TRANSFER", 502); }
      return { offset: nextOffset, done: !!remote };
    },
    download: async () => { mediaReads++; return new Uint8Array([1, 2, 3]); },
    remove: async () => { remote = null; },
  };
  const fetcher: any = async (url: string, init: any) => {
    if (url.endsWith("/revoke")) { if (revokeNetwork) throw new Error("offline"); return new Response("{}"); }
    if (url.endsWith("/userinfo")) return Response.json({ sub: identity, email: "drive@example.com", email_verified: true });
    const refresh = init.body.get("grant_type") === "refresh_token";
    return revoked && refresh ? Response.json({ error: "invalid_grant" }, { status: 400 })
      : Response.json({ access_token: "private-access", refresh_token: "new-refresh", scope: `openid email ${DRIVE_SCOPE}` });
  };
  const api = createDriveService({ store, google, cipher: crypt, config: { clientId: "public-client", clientSecret: "server-only", callback: "https://test.supabase.co/functions/v1/otk-drive?action=callback", origins: ["http://localhost:5173", "https://example.vercel.app"] }, fetcher });
  return { api, file, hash, project, members, google, folders, states, store,
    get connection() { return connection; }, get created() { return created; }, get transferred() { return transferred; }, get mediaReads() { return mediaReads; }, get replaceUpload() { return replaceUpload; },
    set revoked(v: boolean) { revoked = v; }, set identity(v: string) { identity = v; }, set revokeNetwork(v: boolean) { revokeNetwork = v; },
    set failReply(v: boolean) { failReply = v; }, set remote(v: any) { remote = v; },
    upload: async () => { await api.begin(owner, id, hash); return api.chunk(owner, id, hash, 0, new Uint8Array([1, 2, 3])); } };
}

test("Drive credentials are encrypted, authenticated, and bound to their owner", async () => {
  const c = await encryption(), sealed = await c.seal("secret", owner);
  assert.ok(!sealed.includes("secret")); assert.equal(await c.open(sealed, owner), "secret");
  await assert.rejects(c.open(sealed, viewer)); await assert.rejects(cipher("bad"), /OTK_DRIVE_SETUP/);
});
test("OAuth returns allow only exact origins or the native callback", () => {
  assert.equal(returnUrl(NATIVE_RETURN, []), NATIVE_RETURN);
  assert.match(returnUrl("http://localhost:5173/?localProject=test&code=secret#token", ["http://localhost:5173"]), /localProject=test&otkDrive=1$/);
  for (const bad of ["https://evil.com", "http://example.com", "https://user:password@example.com", "com.opentakeoff.app://evil"]) assert.throws(() => returnUrl(bad, ["http://example.com", "https://example.com"]));
});
test("Drive connects separately with minimum scope, PKCE, single-use state; no tokens returned", async () => {
  const h = await fixture(), start = await h.api.connect(owner, "http://localhost:5173/?localProject=x");
  const u = new URL(start.url); assert.equal(u.searchParams.get("scope"), `openid email ${DRIVE_SCOPE}`);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256"); assert.ok(u.searchParams.get("code_challenge"));
  assert.ok(!start.url.includes("server-only"));
  const params = new URLSearchParams({ state: u.searchParams.get("state")!, code: "google-code" });
  assert.match(await h.api.callback(params), /otkDrive=connected/);
  await assert.rejects(h.api.callback(params), /OTK_DRIVE_RETURN/);
  assert.deepEqual(await h.api.status(owner), { configured: true, connected: true, email: "drive@example.com", status: "connected" });
});
test("wrong Google account cannot replace the owner of existing files", async () => {
  const h = await fixture(); h.identity = "different-google";
  const u = new URL((await h.api.connect(owner, NATIVE_RETURN)).url);
  assert.match(await h.api.callback(new URLSearchParams({ state: u.searchParams.get("state")!, code: "c" })), /otkDrive=account/);
  assert.equal(h.connection.google_sub, "google-owner");
});
test("disconnect denies file access even if Google revocation is offline, invalidates pending OAuth", async () => {
  const h = await fixture(); h.revokeNetwork = true;
  const u = new URL((await h.api.connect(owner, NATIVE_RETURN)).url);
  assert.deepEqual(await h.api.disconnect(owner), { disconnected: true, revoked: false });
  assert.equal((await h.api.status(owner)).connected, false); assert.equal(h.connection.token_cipher, null);
  await assert.rejects(h.api.begin(owner, id, h.hash), /OTK_DRIVE_CONNECT/);
  await assert.rejects(h.api.callback(new URLSearchParams({ state: u.searchParams.get("state")!, code: "c" })), /OTK_DRIVE_RETURN/);
});
test("upload creates content-addressed folders and publishes only completed files; repeated Save deduplicates", async () => {
  const h = await fixture(); await h.api.begin(owner, id, h.hash);
  assert.deepEqual(h.folders.map((f: any) => f.name), ["OpenTakeoff", "Bitzell Fence", "PDFs"]);
  assert.deepEqual(h.folders.map((f: any) => f.key), ["root", id, `${id}/pdfs`]); assert.equal(h.file.uploaded, false);
  await h.api.chunk(owner, id, h.hash, 0, new Uint8Array([1, 2, 3]));
  assert.equal(h.file.uploaded, true); assert.equal(h.file.provider_file_id, "stable-id");
  assert.equal((await h.api.begin(owner, id, h.hash)).done, true); assert.equal(h.created, 1); assert.equal(h.transferred, 1);
});
test("renaming reuses the stable project folder and replaces the single archive file", async () => {
  const h = await fixture(); h.project.name = "Renamed Project";
  Object.assign(h.file, { file_kind: "archive", original_filename: "Renamed Project.otk", mime_type: "application/octet-stream", provider_file_id: "stable-id", uploaded: false });
  h.remote = { id: "stable-id", size: "3", mimeType: "application/octet-stream", sha256Checksum: "f".repeat(64) };
  await h.api.begin(owner, id, h.hash);
  assert.deepEqual(h.folders.map((f: any) => f.name), ["OpenTakeoff", "Renamed Project"]);
  assert.equal(h.replaceUpload, true); assert.equal(h.file.provider_file_id, "stable-id");
});
test("lost upload response resumes by stable ID without duplicating the file", async () => {
  const h = await fixture(); h.failReply = true;
  await assert.rejects(h.upload(), /OTK_DRIVE_TRANSFER/); assert.equal(h.file.uploaded, false);
  assert.equal((await h.api.begin(owner, id, h.hash)).done, true); assert.equal(h.created, 1); assert.equal(h.file.uploaded, true);
});
test("shared viewer downloads without their own Google account but cannot upload", async () => {
  const h = await fixture(); await h.upload();
  assert.equal((await h.api.info(viewer, id, h.hash)).sha256, h.hash);
  assert.deepEqual(await h.api.download(viewer, id, h.hash, 0), new Uint8Array([1, 2, 3]));
  await assert.rejects(h.api.begin(viewer, id, h.hash), /OTK_READ_ONLY/);
});
test("editor can upload with owner storage but cannot delete active files", async () => {
  const h = await fixture(); await h.api.begin(editor, id, h.hash);
  await h.api.chunk(editor, id, h.hash, 0, new Uint8Array([1, 2, 3])); assert.equal(h.file.uploaded, true);
  await assert.rejects(h.api.remove(editor, id, h.hash), /OTK_ACCESS/);
});
test("outsider and revoked membership are denied before Google file access", async () => {
  const h = await fixture(); await h.upload();
  await assert.rejects(h.api.download(outsider, id, h.hash, 0), /OTK_ACCESS/);
  h.members.delete(viewer); await assert.rejects(h.api.download(viewer, id, h.hash, 0), /OTK_ACCESS/); assert.equal(h.mediaReads, 0);
});
test("revocation during download and deletion during upload prevent publishing", async () => {
  const h = await fixture(); await h.upload();
  h.google.download = async () => { h.members.delete(viewer); return new Uint8Array([1, 2, 3]); };
  await assert.rejects(h.api.download(viewer, id, h.hash, 0), /OTK_ACCESS/);
  const other = await fixture(); await other.api.begin(owner, id, other.hash);
  other.google.transfer = async () => { other.project.deleted_at = new Date().toISOString(); return { done: true, offset: 3 }; };
  await assert.rejects(other.api.chunk(owner, id, other.hash, 0, new Uint8Array([1, 2, 3])), /OTK_ACCESS/); assert.equal(other.file.uploaded, false);
});
test("revoked Drive authorization is actionable and never marks upload complete", async () => {
  const h = await fixture(); h.revoked = true;
  await assert.rejects(h.api.begin(owner, id, h.hash), /OTK_DRIVE_CONNECT/);
  assert.equal(h.connection.status, "revoked"); assert.equal(h.file.uploaded, false);
});
test("missing or mismatched Drive files fail closed, regardless of matching filename", async () => {
  const h = await fixture(); await h.upload(); h.remote = null;
  await assert.rejects(h.api.info(viewer, id, h.hash), /OTK_DRIVE_MISSING/);
  h.remote = { id: h.file.provider_file_id, size: "3", mimeType: "application/pdf", sha256Checksum: "f".repeat(64) };
  await assert.rejects(h.api.info(viewer, id, h.hash), /OTK_DRIVE_INTEGRITY/);
});
test("only a deleted project's owner can trash Drive files before purge", async () => {
  const h = await fixture(); await h.upload();
  await assert.rejects(h.api.remove(owner, id, h.hash), /OTK_ACCESS/);
  h.project.deleted_at = new Date().toISOString(); await h.api.remove(owner, id, h.hash);
  assert.equal(h.file.provider_file_id, null); assert.equal(h.file.uploaded, false);
});
test("Google transport uses bounded resumable chunks and private ranged downloads", async () => {
  const seen: any[] = [], data = new Uint8Array([1, 2, 3]), hash = await sha256(data);
  const file = { provider_file_id: "id", size: 3, mime_type: "application/pdf", sha256: hash };
  const google = createDriveGoogle(async (url: any, init: any) => {
    seen.push([String(url), init]);
    if (init.method === "PUT") return new Response(null, { status: 308, headers: { Range: "bytes=0-262143" } });
    if (String(url).includes("alt=media")) return new Response(data, { status: 206, headers: { "Content-Range": "bytes 0-2/3" } });
    return Response.json({ id: "id", size: "3", mimeType: "application/pdf", sha256Checksum: hash });
  });
  assert.deepEqual(await google.transfer("private", "https://www.googleapis.com/upload/drive/v3/files?upload_id=x", { ...file, size: CHUNK }, 0), { offset: 262144, done: false });
  assert.deepEqual(await google.download("private", file, 0), data);
  assert.equal(seen.at(-1)[1].headers.Range, "bytes=0-2");
  assert.ok(seen.every(([url]) => !url.includes("private")));
});


test("HTTP 429 remains a quota error even without a Google JSON error body", async () => {
  const google = createDriveGoogle(async () => new Response("", { status: 429 }));
  await assert.rejects(google.metadata("test-access", "file-id"), (e: any) => e.code === "OTK_DRIVE_QUOTA");
});

test("Google API 400 responses have a distinct non-retryable upload rejection code", async () => {
  const google = createDriveGoogle(async () => new Response('{"error":{"status":"INVALID_ARGUMENT"}}', { status: 400 }));
  await assert.rejects(google.metadata("test-access", "file-id"), (e: any) => e.code === "OTK_DRIVE_UPLOAD");
});
