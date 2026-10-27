import { fail, CHUNK, MAX_FILE } from "./drive-security.js";
const idOK = (id) => typeof id === "string" && /^[\w-]{1,200}$/.test(id);
const emailOf = (user) => user?.email_confirmed_at ? user.email?.trim().toLowerCase() : null;
const permissionFor = (permissions, email) => permissions.find((p) => !p.deleted && p.type === "user" && p.emailAddress?.toLowerCase() === email && ["reader", "writer", "owner"].includes(p.role));

export function createDriveSharing({ store, google, token, config }) {
  async function invitationFor(user, id) {
    if (!idOK(id) || !emailOf(user)) fail("OTK_AUTH", 401);
    const row = await store.invitation(id);
    if (!row || row.state !== "ready" || Date.parse(row.expires_at) <= Date.now() || row.recipient_email !== emailOf(user)) fail("OTK_ACCESS", 403);
    return row;
  }
  async function currentFile(row, id, auth) {
    if (!row.files.some((f) => f.id === id)) fail("OTK_ACCESS", 403);
    const file = await google.shareMetadata(auth, id);
    if (file.trashed || !file.owners?.some((o) => o.me)) fail("OTK_DRIVE_MISSING", 404);
    if (file.mimeType?.startsWith("application/vnd.google-apps.") || !Number.isSafeInteger(Number(file.size)) || Number(file.size) < 0 || Number(file.size) > MAX_FILE) fail("OTK_DRIVE_EXPORT_TYPE", 409);
    // Honor removal of Drive access outside this app, on every download chunk.
    if (!permissionFor(await google.permissions(auth, id), row.recipient_email)) fail("OTK_ACCESS", 403);
    return { id: file.id, name: file.name, size: Number(file.size), modifiedTime: file.modifiedTime, sha256: file.sha256Checksum || null };
  }
  return {
    async send(user, input) {
      const sender = emailOf(user), email = input.email?.trim().toLowerCase();
      if (!sender) fail("OTK_AUTH", 401);
      if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === sender || typeof input.name !== "string" || !input.name.trim() || input.name.length > 200
        || !Array.isArray(input.fileIds) || !input.fileIds.length || input.fileIds.length > 30 || !input.fileIds.every(idOK) || new Set(input.fileIds).size !== input.fileIds.length) fail("OTK_SHARE_INPUT", 400);
      if (!config.shareAppUrl) fail("OTK_SHARE_SETUP", 503);
      const link = new URL(config.shareAppUrl);
      if (!config.origins.includes(link.origin)) fail("OTK_SHARE_SETUP", 503);
      const auth = await token(user.id), files = [];
      for (const id of input.fileIds) {
        const file = await google.shareMetadata(auth, id);
        if (file.trashed || !file.owners?.some((o) => o.me) || !file.capabilities?.canShare) fail("OTK_DRIVE_PERMISSION", 403);
        if (file.mimeType.startsWith("application/vnd.google-apps.") || !Number.isSafeInteger(Number(file.size)) || Number(file.size) > MAX_FILE) fail("OTK_DRIVE_EXPORT_TYPE", 409);
        files.push({ id: file.id, name: file.name });
      }
      if (!files.some((f) => /\.otk$/i.test(f.name))) fail("OTK_SHARE_INPUT", 400);
      const id = crypto.randomUUID(); link.searchParams.set("sharedProject", id);
      await store.reserveInvitation({ id, sender_id: user.id, sender_email: sender, recipient_email: email, project_name: input.name.trim(), files });
      let mailed = false;
      // Existing editor access is preserved. New grants are download/read only.
      try {
        for (const file of files) {
          if (!permissionFor(await google.permissions(auth, file.id), email)) {
            await google.shareReader(auth, file.id, email, `A project was shared with you. Open ${link.href} and sign in with ${email}. In Cloud, choose Import to my Drive and select the files to import.`);
            mailed = true;
          }
        }
        await store.patchInvitation(id, { state: "ready", email_sent_at: mailed ? new Date().toISOString() : null });
      } catch { fail("OTK_SHARE_PARTIAL", 502); }
      return { id, emailSent: mailed };
    },
    async files(user, id) {
      const row = await invitationFor(user, id), auth = await token(row.sender_id), files = [];
      for (const entry of row.files) files.push(await currentFile(row, entry.id, auth));
      return files;
    },
    async chunk(user, input) {
      const row = await invitationFor(user, input.id), auth = await token(row.sender_id);
      const file = await currentFile(row, input.fileId, auth), offset = input.offset;
      if (file.modifiedTime !== input.expected?.modifiedTime || file.size !== input.expected?.size) fail("OTK_CONFLICT", 409);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= file.size || offset % CHUNK) fail("OTK_DRIVE_RANGE", 400);
      const bytes = await google.readChunk(auth, file, offset);
      await invitationFor(user, input.id);
      const after = await currentFile(row, input.fileId, auth);
      if (after.modifiedTime !== file.modifiedTime || after.size !== file.size) fail("OTK_CONFLICT", 409);
      return bytes;
    },
    async imported(user, id) { await invitationFor(user, id); await store.patchInvitation(id, { imported_at: new Date().toISOString() }); return { imported: true }; },
    async revoke(user, id) {
      const row = idOK(id) && await store.invitation(id);
      if (!row || row.sender_id !== user.id) fail("OTK_ACCESS", 403);
      await store.patchInvitation(id, { state: "revoked" });
      // Do not remove pre-existing permissions or access shared by other invitations.
      return { revoked: true };
    },
  };
}
