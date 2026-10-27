import { digest, projectFolderName, readProjectFile } from "./projectFile.js";
import { checked, CloudError } from "./supabase/errors.js";



const fail = (message) => { throw new CloudError("OTK_SHARE", message); };
export function sharePath(path) {
  if (typeof path !== "string" || path.length > 1024 || path.split("/").some((part) => !part || part === "." || part === ".." || /[\\<>:"|?*]/.test(part) || [...part].some((c) => c.charCodeAt(0) < 32) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) fail("A file name cannot be copied safely. Rename it before sharing.");
  return path;
}

export function createProjectInvitations(client, userId, assertUser, drive) {
  return {
    async list() {
      await assertUser();
      const result = await checked(client.from("otk_project_invitations").select("*").order("created_at", { ascending: false }).limit(200));
      await assertUser(); return result;
    },
    send: (name, email, files) => drive.shareSend({ name, email, fileIds: files.map((f) => f.id) }),
    async files(id) {
      const files = await drive.shareFiles(id);
      // Names may have changed in Drive. Validate the current names before importing.
      const seen = new Set();
      return files.map((f) => {
        const path = sharePath(f.name);
        if (seen.has(path.toLowerCase())) fail("Two shared files have the same name. Ask the sender to rename one in Drive.");
        seen.add(path.toLowerCase());
        return { ...f, path };
      });
    },
    async download(id, file) {
      await assertUser();
      if (file.size > 512 * 1024 * 1024) fail("Import supports files up to 512 MB. Download larger files directly from Google Drive.");
      const bytes = new Uint8Array(file.size);
      for (let offset = 0; offset < file.size; offset += 4 * 1024 * 1024) {
        const chunk = await drive.shareChunk({ id, fileId: file.id, offset, expected: { size: file.size, modifiedTime: file.modifiedTime } });
        if (chunk.length !== Math.min(4 * 1024 * 1024, file.size - offset)) fail("The Drive download was incomplete. Try again.");
        bytes.set(chunk, offset);
      }
      await assertUser();
      if (file.sha256 && await digest(bytes) !== file.sha256) fail("The shared file changed during download. Try again.");
      return bytes;
    },
    imported: (id) => drive.shareImported(id),
    revoke: (invitation) => drive.shareRevoke(invitation.id),
  };
}
// Never overwrite an existing project. Each import receives a new child folder.
export async function importSharedFiles(api, invitation, selected, projectPath, parent, progress = () => {}) {
  if (!selected.length || !selected.includes(projectPath) || !/\.otk$/i.test(projectPath)) fail("Select an .otk project to open and include it in the import.");
  const files = selected.map((path) => invitation.files.find((f) => f.path === sharePath(path)));
  if (files.some((f) => !f)) fail("A selected file is not part of this invitation.");
  if (new Set(files.map((f) => f.path.toLowerCase())).size !== files.length) fail("Duplicate import paths.");
  const project = files.find((f) => f.path === projectPath);
  progress("Checking shared project…");
  const projectBytes = await api.download(invitation.id, project);
  await readProjectFile(projectBytes); // Reject corrupt archives before creating a destination.
  const folderName = `${projectFolderName(invitation.project_name)} - imported ${crypto.randomUUID().slice(0, 8)}`;
  try { await parent.getDirectoryHandle(folderName); fail("Import folder already exists. Please try again."); } catch (error) { if (error.name !== "NotFoundError") throw error; }
  const folder = await parent.getDirectoryHandle(folderName, { create: true });
  let projectHandle;
  try {
    for (const file of files) {
      progress(`Importing ${file.path}…`);
      const bytes = file === project ? projectBytes : await api.download(invitation.id, file);
      const parts = sharePath(file.path).split("/"); let target = folder;
      for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true });
      const handle = await target.getFileHandle(parts.at(-1), { create: true });
      const writer = await handle.createWritable();
      try { await writer.write(bytes); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
      if (file === project) projectHandle = handle;
    }
  } catch (error) {
    throw new CloudError("OTK_SHARE_IMPORT", `Import stopped. Partial files may remain in “${folderName}”. No project was opened. ${error.message || "Try again."}`);
  }
  return projectHandle;
}
