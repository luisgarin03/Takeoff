import { projectFilename } from "./projectFile.js";

export function projectSaveFilename(name) {
  const title = String(name || "").trim().replace(/\.otk$/i, "");
  if (!title) throw new Error("Name the project before saving it.");
  return projectFilename(title);
}

export async function saveProjectArchive({ name, buildArchive, pickFile, download, existingHandle = null, saveAs = false }) {
  const filename = projectSaveFilename(name);
  let handle = saveAs ? null : existingHandle;
  if (!handle && pickFile) {
    try {
      // Pick before building the archive: the native dialog needs the click's
      // transient activation, which an async export can outlive.
      handle = await pickFile({
        id: "opentakeoff-project", suggestedName: filename,
        types: [{ description: "OpenTakeoff project", accept: { "application/octet-stream": [".otk"] } }],
        excludeAcceptAllOption: true,
      });
    } catch (error) {
      if (error.name === "AbortError") return { status: "cancelled" };
      throw error;
    }
  }
  const bytes = await buildArchive();
  if (!handle) {
    await download(filename, bytes, "application/octet-stream");
    return { status: "downloaded", filename };
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    // Do not commit a partial archive over an existing project on write failure.
    try { await writable.abort(); } catch { /* The stream may already be closed. */ }
    throw error;
  }
  return { status: "saved", filename: handle.name || filename, handle };
}
