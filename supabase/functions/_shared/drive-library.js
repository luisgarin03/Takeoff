import { assertAccess, fail, CHUNK, MAX_FILE } from "./drive-security.js";
export const FOLDER = "application/vnd.google-apps.folder";
// Read-only navigation never creates folders or accepts a client-supplied root.
export async function locateProjectFolder(google, auth, projectId) {
  const root = await google.findFolder(auth, "root", null);
  if (!root) fail("OTK_DRIVE_MISSING", 404);
  const projects = await google.findFolder(auth, "projects", root.id);
  let folder = projects && await google.findFolder(auth, projectId, projects.id);
  const path = [root.name];
  if (folder) path.push(projects.name);
  else folder = await google.findFolder(auth, projectId, root.id); // Existing pre-library projects.
  if (!folder) fail("OTK_DRIVE_MISSING", 404);
  return { folder, path: [...path, folder.name] };
}
export function createDriveLibrary({ store, google, token }) {
  async function scope(user, projectId, entryId) {
    if (!/^[0-9a-f-]{36}$/i.test(projectId || "")) fail("OTK_ACCESS", 403);
    const project = await store.project(projectId);
    assertAccess(project, await store.member(projectId, user), user, "read");
    if (project.file_provider !== "google_drive") fail("OTK_ACCESS", 403);
    const auth = await token(project.owner_id);
    const located = await locateProjectFolder(google, auth, projectId);
    let entry = located.folder;
    if (entryId && entryId !== entry.id) {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(entryId)) fail("OTK_ACCESS", 403);
      entry = await google.metadata(auth, entryId);
      let cursor = entry; const seen = new Set();
      for (let depth = 0; cursor.id !== located.folder.id; depth++) {
        if (depth >= 64 || seen.has(cursor.id) || cursor.trashed || cursor.parents?.length !== 1) fail("OTK_ACCESS", 403);
        seen.add(cursor.id); cursor = await google.metadata(auth, cursor.parents[0]);
      }
    }
    if (entry.trashed) fail("OTK_DRIVE_MISSING", 404);
    return { project, auth, entry, ...located };
  }
  return {
    async list(user, projectId, folderId) {
      const s = await scope(user, projectId, folderId);
      if (s.entry.mimeType !== FOLDER) fail("OTK_ACCESS", 403);
      const entries = await google.children(s.auth, s.entry.id);
      await scope(user, projectId, folderId);
      // Never follow shortcuts into another part of Drive.
      return { folder: s.entry, projectFolder: s.folder, localPath: s.path,
        entries: entries.map(({ id, name, mimeType, size, modifiedTime }) => ({ id, name, mimeType, size, modifiedTime })) };
    },
    async chunk(user, projectId, fileId, offset, expected) {
      const s = await scope(user, projectId, fileId), size = Number(s.entry.size);
      if (s.entry.mimeType.startsWith("application/vnd.google-apps.")) fail("OTK_DRIVE_EXPORT_TYPE", 409);
      if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE) fail("OTK_DRIVE_SIZE", 413);
      if (!expected || expected.modifiedTime !== s.entry.modifiedTime || Number(expected.size) !== size || expected.name !== s.entry.name) fail("OTK_CONFLICT", 409);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= size || offset % CHUNK) fail("OTK_DRIVE_RANGE");
      const bytes = await google.readChunk(s.auth, s.entry, offset);
      const current = await scope(user, projectId, fileId);
      if (current.entry.modifiedTime !== s.entry.modifiedTime || current.entry.size !== s.entry.size) fail("OTK_CONFLICT", 409);
      return bytes;
    }
  };
}
