import { emptyAnnotations, ReadOnlyLicenseError } from "./store.js";

// Preview PDFs live only in this tab. Opening them never overwrites a saved
// workspace, and every project-editing method remains blocked.
export function createExploreStore() {
  const files = new Map();
  const denied = async () => { throw new ReadOnlyLicenseError(); };
  return {
    async openViewPdf(file, compatibility, bytes) { files.set(file.name, { bytes: bytes || new Uint8Array(await file.arrayBuffer()), compatibility }); },
    async listSheets() { return [...files.keys()].map((name) => ({ name })); },
    async loadPdfData(name) { const row = files.get(name); if (!row) throw new Error("Preview PDF not found."); return row.bytes.slice(); },
    async loadPdfCompatibility(name) { return files.get(name)?.compatibility || null; },
    async loadAnnotations() { return emptyAnnotations(); },
    async loadTemplates() { return []; },
    async loadMaterialLibrary() { return []; },
    async loadStampLibrary() { return { stamps: [], sets: [] }; },
    async listSnapshots() { return []; },
    async getSnapshot() { return null; },
    saveAnnotations: denied, savePdfCompatibility: denied, addPdf: denied, removePdf: denied,
    saveTemplates: denied, saveMaterialLibrary: denied, saveStampLibrary: denied,
    saveSnapshot: denied, putSnapshot: denied, deleteSnapshot: denied,
  };
}
