import { emptyAnnotations, localStore } from "./store.js";

const API = "/runpod/api/files";
const ANNOTATIONS = "workspace-annotations.json";

async function checked(response) {
  if (response.ok) return response;
  let detail = "";
  try { detail = (await response.json()).detail || ""; } catch { /* non-JSON response */ }
  throw new Error(detail || `RunPod storage request failed (HTTP ${response.status}).`);
}

const fileUrl = (name) => `${API}/${encodeURIComponent(name)}`;

// PDFs and annotations live on RunPod's mounted /workspace volume. Personal
// libraries and recovery snapshots intentionally remain browser-local.
export function createRunpodStore() {
  return {
    ...localStore,
    async listSheets() {
      const response = await checked(await fetch(API, { cache: "no-store" }));
      const body = await response.json();
      return (body.files || [])
        .filter((file) => file.name.toLowerCase().endsWith(".pdf"))
        .map((file) => ({ name: file.name, size: file.size, modified: file.modified }));
    },
    async loadPdfData(name) {
      const response = await checked(await fetch(fileUrl(name), { cache: "no-store" }));
      return new Uint8Array(await response.arrayBuffer());
    },
    async addPdf(file, compatibility = null, preparedBytes = null) {
      const body = preparedBytes instanceof Uint8Array
        ? preparedBytes
        : preparedBytes instanceof ArrayBuffer ? new Uint8Array(preparedBytes) : file;
      await checked(await fetch(fileUrl(file.name), {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body,
      }));
      await localStore.savePdfCompatibility(file.name, compatibility);
      return { name: file.name };
    },
    async removePdf(name) {
      await checked(await fetch(fileUrl(name), { method: "DELETE" }));
      await localStore.removePdf(name);
    },
    async loadAnnotations() {
      const response = await fetch(fileUrl(ANNOTATIONS), { cache: "no-store" });
      if (response.status === 404) return emptyAnnotations();
      await checked(response);
      const value = await response.json();
      return value && typeof value === "object" ? value : emptyAnnotations();
    },
    async saveAnnotations(payload) {
      await checked(await fetch(fileUrl(ANNOTATIONS), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
    },
  };
}
