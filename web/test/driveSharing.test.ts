import { test } from "node:test";
import assert from "node:assert/strict";
import { createDriveSharing } from "../../supabase/functions/_shared/drive-sharing.js";
import { createDriveGoogle } from "../../supabase/functions/_shared/drive-google.js";
const sender = { id: "owner", email: "owner@example.com", email_confirmed_at: "2026-01-01" };
const recipient = { id: "recipient", email: "reader@example.com", email_confirmed_at: "2026-01-01" };
function fixture() {
  const rows = new Map<string, any>(), permissions: any[] = [], messages: string[] = [], calls: string[] = [];
  let owned = true, updated = "v1", removed = false, failGrant = false;
  const api = createDriveSharing({
    store: { invitation: async (id: string) => rows.get(id), reserveInvitation: async (row: any) => rows.set(row.id, { ...row, state: "draft", expires_at: "2099-01-01" }), patchInvitation: async (id: string, patch: any) => Object.assign(rows.get(id), patch) },
    token: async (id: string) => { calls.push(id); return "owner-token"; },
    google: {
      shareMetadata: async (token: string, id: string) => { assert.equal(token, "owner-token"); return { id, name: "project.otk", size: "3", mimeType: "application/octet-stream", owners: [{ me: owned }], capabilities: { canShare: true }, modifiedTime: updated }; },
      permissions: async () => removed ? [] : permissions,
      shareReader: async (_token: string, _id: string, email: string, message: string) => { if (failGrant) throw new Error("Denied"); permissions.push({ type: "user", emailAddress: email, role: "reader" }); messages.push(message); return { id: "permission" }; },
      readChunk: async () => new Uint8Array([1,2,3]),
    }, config: { shareAppUrl: "https://app.example.com/", origins: ["https://app.example.com"] },
  });
  return { api, rows, permissions, messages, calls, set owned(value: boolean) { owned = value; }, set updated(value: string) { updated = value; }, set removed(value: boolean) { removed = value; }, set failGrant(value: boolean) { failGrant = value; } };
}
test("sharing grants reader access on the original Drive file and creates an email/in-app invitation", async () => {
  const f = fixture();
  const result = await f.api.send(sender, { name: "Project", email: " Reader@Example.com ", fileIds: ["drive-file"] });
  assert.equal(result.emailSent, true);
  assert.equal(f.rows.get(result.id).state, "ready");
  assert.deepEqual(f.rows.get(result.id).files, [{ id: "drive-file", name: "project.otk" }]);
  assert.equal(f.permissions[0].role, "reader");
  assert.match(f.messages[0], /https:\/\/app.example.com\/\?sharedProject=/);
  const files = await f.api.files(recipient, result.id);
  assert.equal(files[0].id, "drive-file");
  assert.deepEqual(await f.api.chunk(recipient, { id: result.id, fileId: "drive-file", offset: 0, expected: { size: 3, modifiedTime: "v1" } }), new Uint8Array([1,2,3]));
  assert.ok(f.calls.every((id) => id === "owner"));
});
test("recipient verification, file allowlist, updates, revocation and external Drive permission removal are enforced", async () => {
  const f = fixture(); const { id } = await f.api.send(sender, { name: "Project", email: recipient.email, fileIds: ["drive-file"] });
  await assert.rejects(f.api.files({ ...recipient, email: "other@example.com" }, id), /OTK_ACCESS/);
  await assert.rejects(f.api.files({ ...recipient, email_confirmed_at: null }, id), /OTK_AUTH/);
  await assert.rejects(f.api.chunk(recipient, { id, fileId: "unshared", offset: 0 }), /OTK_ACCESS/);
  f.updated = "v2";
  await assert.rejects(f.api.chunk(recipient, { id, fileId: "drive-file", offset: 0, expected: { size: 3, modifiedTime: "v1" } }), /OTK_CONFLICT/);
  f.removed = true; await assert.rejects(f.api.files(recipient, id), /OTK_ACCESS/);
  f.removed = false; await f.api.revoke(sender, id);
  await assert.rejects(f.api.files(recipient, id), /OTK_ACCESS/);
});
test("sharing preserves existing editor access and refuses non-owned files or incomplete grants", async () => {
  const f = fixture(); f.owned = false;
  await assert.rejects(f.api.send(sender, { name: "Project", email: recipient.email, fileIds: ["drive-file"] }), /OTK_DRIVE_PERMISSION/);
  assert.equal(f.rows.size, 0);
  f.owned = true; f.permissions.push({ type: "user", emailAddress: recipient.email, role: "writer" });
  assert.equal((await f.api.send(sender, { name: "Project", email: recipient.email, fileIds: ["drive-file"] })).emailSent, false);
  assert.equal(f.permissions[0].role, "writer");
  f.permissions.length = 0; f.failGrant = true;
  await assert.rejects(f.api.send(sender, { name: "Project", email: recipient.email, fileIds: ["drive-file"] }), /OTK_SHARE_PARTIAL/);
  assert.equal([...f.rows.values()].at(-1).state, "draft");
});
test("Google sharing API requests email notification and reader permission", async () => {
  const google = createDriveGoogle(async (url, init) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.pathname, "/drive/v3/files/original/permissions");
    assert.equal(parsed.searchParams.get("sendNotificationEmail"), "true");
    assert.deepEqual(JSON.parse(String(init?.body)), { type: "user", role: "reader", emailAddress: recipient.email });
    return Response.json({ id: "permission" });
  });
  await google.shareReader("token", "original", recipient.email, "Invite");
});
