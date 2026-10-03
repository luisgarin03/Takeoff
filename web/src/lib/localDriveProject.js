import { readProjectFile, MAX_PROJECT_FILE_BYTES, digest } from "./projectFile.js";
import { CloudError } from "./supabase/errors.js";
import { safeDriveSegment } from "./supabase/driveLibrary.js";
export const localDriveUnavailable = "OpenTakeoff could not locate your Google Drive folder on this computer. Make sure Google Drive for desktop is installed and signed in, then use Locate Google Drive Folder. On devices without folder access, use Project > Open project to select the synced .otk file.";
// A user-approved directory handle is the authority; no drive-letter guessing or API downloads.
/** @param {string|null} [expectedHash] */
export async function openLocalDriveProject(root, localPath, projectId, parse = readProjectFile, expectedHash = null) {
  if (!root) throw new CloudError("OTK_LOCAL_DRIVE", localDriveUnavailable);
  try {
    if (root.queryPermission && await root.queryPermission({ mode: "read" }) !== "granted") throw new Error("permission");
    const segments = localPath.map(safeDriveSegment);
    // Accept My Drive, the managed root, Projects, or the exact project folder.
    const start = segments.indexOf(root.name);
    let folder = root;
    for (const part of segments.slice(start >= 0 ? start + 1 : 0)) folder = await folder.getDirectoryHandle(part);
    const matches = [];
    for await (const entry of folder.values()) {
      if (entry.kind !== "file" || !/\.otk$/i.test(entry.name)) continue;
      const file = await entry.getFile(); // Drive for desktop hydrates through its filesystem.
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new CloudError("OTK_SIZE", "The synced project exceeds the supported .otk size.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const restored = await parse(bytes);
      if (restored.annotations.project_id === projectId) {
        if (expectedHash && await digest(bytes) !== expectedHash) throw new CloudError("OTK_LOCAL_DRIVE", "The synced .otk differs from the cloud project. Wait for Google Drive to finish syncing, then retry.");
        matches.push(restored);
      }
    }
    if (matches.length !== 1) throw new CloudError("OTK_LOCAL_DRIVE", "Select the correct synced project folder. Exactly one .otk matching this cloud project is required; allow Google Drive to finish syncing first.");
    return matches[0];
  } catch (e) { if (e instanceof CloudError) throw e; throw new CloudError("OTK_LOCAL_DRIVE", localDriveUnavailable); }
}

// Browsers expose file timestamps, not directory timestamps or filesystem editors.
export async function listLocalDirectory(directory, { recursiveDates = true } = {}) {
  let visited = 0;
  async function inspect(handle, depth = 0) {
    if (++visited > 20000 || depth > 64) return { modified: null, latest: null, incomplete: true };
    try {
      if (handle.kind === "file") {
        const file = await handle.getFile();
        return { modified: Number.isFinite(file.lastModified) ? file.lastModified : null, latest: file, incomplete: false };
      }
      if (!recursiveDates) return { modified: null, latest: null, incomplete: false };
      let result = { modified: null, latest: null, incomplete: false };
      for await (const child of handle.values()) {
        const value = await inspect(child, depth + 1);
        if (value.incomplete) result.incomplete = true;
        if (value.modified != null && (result.modified == null || value.modified > result.modified)) result = { ...result, modified: value.modified, latest: value.latest };
        if (visited > 20000) break;
      }
      return result.incomplete ? { modified: null, latest: null, incomplete: true } : result;
    } catch { return { modified: null, latest: null, incomplete: true }; }
  }
  try {
    const entries = [];
    for await (const handle of directory.values()) {
      const details = await inspect(handle);
      let modifiedBy = "Unknown";
      if (details.latest && /\.otk$/i.test(details.latest.name || handle.name)) {
        try {
          const metadata = await readLocalProjectMetadata(details.latest);
          modifiedBy = metadata?.lastModifiedByName || metadata?.lastModifiedByEmail || "Unknown";
        } catch { /* File remains listed even if its project metadata is unavailable. */ }
      }
      entries.push({ name: handle.name, kind: handle.kind, handle, modified: details.modified, modifiedBy });
    }
    const rank = (entry) => entry.kind === "file" && /\.otk$/i.test(entry.name) ? 0 : entry.kind === "directory" ? 1 : 2;
    return entries.sort((a, b) => rank(a) - rank(b) || (b.modified ?? -Infinity) - (a.modified ?? -Infinity) || a.name.localeCompare(b.name));
  } catch { throw new CloudError("OTK_LOCAL_DRIVE", "This folder cannot be read. Check Google Drive is available, then select the folder again."); }
}
// Inflate only the bounded manifest; never decode PDFs/assets for a listing.
/** @returns {Promise<{lastModifiedByName?: string, lastModifiedByEmail?: string}|null>} */
export async function readLocalProjectMetadata(file) {
  if (file.size > MAX_PROJECT_FILE_BYTES) return null;
  const { Unzip, UnzipInflate, UnzipPassThrough } = await import("fflate");
  let metadata = null, done = false, failure;
  const chunks = []; let size = 0;
  const unzip = new Unzip((entry) => {
    if (entry.name !== "project.json") {
      class SkipEntry { push() {} }
      SkipEntry.compression = entry.compression;
      unzip.register(SkipEntry); entry.ondata = () => {}; entry.start(); return;
    }
    unzip.register(UnzipPassThrough); unzip.register(UnzipInflate);
    if (entry.originalSize > 32 * 1024 * 1024) throw new Error("Project metadata too large");
    entry.ondata = (error, bytes, final) => {
      if (error) { failure = error; return; }
      size += bytes.length;
      if (size > 32 * 1024 * 1024) { failure = new Error("Project metadata too large"); entry.terminate(); return; }
      chunks.push(bytes);
      if (final) {
        const data = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
        const manifest = JSON.parse(new TextDecoder().decode(data));
        if (manifest.format === "opentakeoff.project") {
          const value = manifest.annotations?.project_metadata;
          metadata = Object.fromEntries(["lastModifiedByName", "lastModifiedByEmail"].filter((key) => typeof value?.[key] === "string").map((key) => [key, value[key].trim().slice(0, 254)]));
        }
        done = true;
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < file.size && !done; offset += 256 * 1024) {
    const bytes = new Uint8Array(await file.slice(offset, offset + 256 * 1024).arrayBuffer());
    unzip.push(bytes, offset + bytes.length >= file.size);
    if (failure) throw failure;
  }
  return metadata;
}
export async function readLocalProjectHandle(handle) {
  if (handle.kind !== "file" || !/\.otk$/i.test(handle.name)) throw new CloudError("OTK_FORMAT", "Choose an .otk project file.");
  const file = await handle.getFile();
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new CloudError("OTK_SIZE", "The synced project exceeds the supported .otk size.");
  return readProjectFile(new Uint8Array(await file.arrayBuffer()));
}


export const SOURCE_FOLDER_NAME = "Estimate save data";
function sourceFolderError(error) {
  if (error instanceof CloudError || error?.name === "AbortError") return error;
  const message = error?.name === "NotAllowedError" || error?.name === "SecurityError"
    ? "Permission denied. Allow folder access or choose a location where you can create folders."
    : error?.name === "NotFoundError" || error?.name === "NotReadableError"
      ? "The selected location is unavailable. Check Google Drive is connected on this computer, then choose the location again."
      : error?.name === "TypeMismatchError"
        ? "A file is using the name Estimate save data or Projects. Choose another location or resolve that name conflict."
        : "OpenTakeoff could not create or validate the source folder in this location. Check folder permissions and Google Drive availability, then retry.";
  return new CloudError("OTK_LOCAL_DRIVE", message);
}
// Only probe the exact child; never search the drive or invent a suffixed name.
export async function findLocalSourceFolder(parent) {
  try { return await parent.getDirectoryHandle(SOURCE_FOLDER_NAME); }
  catch (error) { if (error?.name === "NotFoundError") return null; throw sourceFolderError(error); }
}
export async function createLocalSourceFolder(parent, useExisting = false) {
  try {
    if (parent.requestPermission && await parent.requestPermission({ mode: "readwrite" }) !== "granted") throw new DOMException("Permission denied", "NotAllowedError");
    let handle = await findLocalSourceFolder(parent);
    if (handle && !useExisting) return { exists: true, handle };
    if (!handle && useExisting) throw new DOMException("Source folder unavailable", "NotFoundError");
    handle ||= await parent.getDirectoryHandle(SOURCE_FOLDER_NAME, { create: true });
    await handle.getDirectoryHandle("Projects", { create: true });
    return { exists: false, handle };
  } catch (error) { throw sourceFolderError(error); }
}
export async function localSourceFolderView(handle, browseProjects = false) {
  try {
    const trail = browseProjects ? [handle, await handle.getDirectoryHandle("Projects")] : [handle];
    // Creation/restoration only lists Projects' immediate children, not its subtree.
    const entries = await listLocalDirectory(trail.at(-1), { recursiveDates: !browseProjects });
    return { handle, trail, entries, browseProjects, key: crypto.randomUUID() };
  } catch (error) { throw sourceFolderError(error); }
}
