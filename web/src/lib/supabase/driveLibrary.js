import { Zip, ZipPassThrough } from "fflate";
import { CloudError } from "./errors.js";
import { DRIVE_CHUNK } from "./driveFiles.js";
const FOLDER = "application/vnd.google-apps.folder";
export const isDriveFolder = (entry) => entry.mimeType === FOLDER;
export function safeDriveSegment(name) {
  if (typeof name !== "string" || !name || name === "." || name === ".." || (name.includes("/") || name.includes("\\") || [...name].some((c) => c.charCodeAt(0) < 32))) throw new CloudError("OTK_PATH", "A Drive name cannot be represented safely in this folder export. Rename it in Drive before retrying.");
  return name;
}
export async function collectDriveTree(drive, projectId, signal) {
  const root = await drive.listFolder(projectId, null, signal);
  const entries = [], seen = new Set(), paths = new Set(); let total = 0;
  async function visit(folder, prefix, depth, loaded) {
    if (signal?.aborted) throw new CloudError("OTK_CANCELED", "Export canceled.");
    if (depth > 64 || seen.has(folder.id) || entries.length > 20000) throw new CloudError("OTK_TREE", "Project folder is too deep or contains repeated folders.");
    seen.add(folder.id);
    const path = `${prefix}${safeDriveSegment(folder.name)}/`;
    if (paths.has(path.slice(0, -1).toLowerCase())) throw new CloudError("OTK_TREE", "Duplicate Drive paths cannot be preserved safely in one ZIP.");
    paths.add(path.slice(0, -1).toLowerCase()); entries.push({ ...folder, path });
    const data = loaded || await drive.listFolder(projectId, folder.id, signal);
    for (const entry of data.entries) {
      if (isDriveFolder(entry)) { await visit(entry, path, depth + 1); continue; }
      if (entry.mimeType.startsWith("application/vnd.google-apps.")) throw new CloudError("OTK_DRIVE_EXPORT_TYPE", "A Google-native document or shortcut cannot be included as an original file. Export it to a regular file in Drive first; no incomplete ZIP was saved.");
      const filePath = path + safeDriveSegment(entry.name), size = Number(entry.size);
      if (!Number.isSafeInteger(size) || size < 0 || size > 2 * 1024 ** 3 || total + size >= 4 * 1024 ** 3 - 16 * 1024 ** 2) throw new CloudError("OTK_SIZE", "This project exceeds the supported ZIP size (under 4 GiB total, 2 GiB per file).");
      if (paths.has(filePath.toLowerCase())) throw new CloudError("OTK_TREE", "Duplicate Drive paths cannot be preserved safely in one ZIP.");
      paths.add(filePath.toLowerCase()); total += size; entries.push({ ...entry, path: filePath });
      if (entries.length > 20000) throw new CloudError("OTK_TREE", "Project has more than 20,000 entries.");
    }
  }
  await visit(root.projectFolder, "", 0, root);
  return { entries, total, name: root.projectFolder.name };
}
// Sequential Drive reads + ZIP pass-through avoid duplicating entire PDFs in RAM.
/** @param {{signal?: AbortSignal, onProgress?: (message: string) => void}} [options] */
export async function writeDriveZip(drive, projectId, tree, write, options = {}) {
  const { signal, onProgress = () => {} } = options;
  let queue = Promise.resolve(), error, completed = 0;
  const zip = new Zip((err, data) => {
    if (err) error = err;
    else queue = queue.then(() => write(data));
  });
  try {
    for (const entry of tree.entries) {
      if (signal?.aborted) throw new CloudError("OTK_CANCELED", "Export canceled.");
      const file = new ZipPassThrough(entry.path); zip.add(file);
      const size = isDriveFolder(entry) ? 0 : Number(entry.size);
      if (!size) file.push(new Uint8Array(), true);
      for (let offset = 0; offset < size; offset += DRIVE_CHUNK) {
        const bytes = await drive.folderChunk(projectId, entry, offset, signal);
        if (bytes.length !== Math.min(DRIVE_CHUNK, size - offset)) throw new CloudError("OTK_DRIVE_INTEGRITY", "Incomplete Drive response; no ZIP was saved.");
        file.push(bytes, offset + bytes.length === size);
        await queue; if (error) throw error;
        completed += bytes.length; onProgress(`Downloading ${entry.name}: ${Math.round(completed / Math.max(1, tree.total) * 100)}%`);
      }
      await queue;
    }
    zip.end(); await queue; if (error) throw error;
  } catch (e) { zip.terminate(); throw e; }
}
export async function downloadDriveFolder({ drive, project, pickFile, download, signal, onProgress }) {
  let handle, writer;
  if (pickFile) {
    try { handle = await pickFile({ suggestedName: `${project.name}.zip`, types: [{ description: "Complete project folder", accept: { "application/zip": [".zip"] } }] }); }
    catch (e) { if (e.name === "AbortError") return; throw e; }
  }
  onProgress?.("Reading Google Drive project folders...");
  const tree = await collectDriveTree(drive, project.id, signal);
  if (!handle && tree.total > 512 * 1024 ** 2) throw new CloudError("OTK_SIZE", "Use a desktop browser with Save File support to export a project larger than 512 MiB.");
  const parts = [];
  try {
    if (handle) writer = await handle.createWritable();
    await writeDriveZip(drive, project.id, tree, writer ? (part) => writer.write(part) : (part) => parts.push(part), { signal, onProgress });
    if (signal?.aborted) throw new CloudError("OTK_CANCELED", "Export canceled.");
    if (writer) await writer.close();
    else await download(`${tree.name}.zip`, new Blob(parts, { type: "application/zip" }));
  } catch (e) { await writer?.abort().catch(() => {}); throw e; }
}
