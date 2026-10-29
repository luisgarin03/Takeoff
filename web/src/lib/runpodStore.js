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
export function createRunpodStore({ namespace = "", sourceStore = null } = {}) {
  const prefix = namespace ? `rp-${namespace}--` : "";
  const storedName = (name) => {
    const value = `${prefix}${name}`;
    if (value.length > 200) throw new Error(`RunPod storage name is too long: ${name}`);
    return value;
  };
  const annotationsName = namespace ? storedName(ANNOTATIONS) : ANNOTATIONS;
  const listRemote = async () => {
    const response = await checked(await fetch(API, { cache: "no-store" }));
    const body = await response.json();
    return body.files || [];
  };
  return {
    ...localStore,
    async prepare() {
      if (!sourceStore) return;
      const remote = await listRemote();
      if (remote.some((file) => file.name === annotationsName)) return;
      const sheets = await sourceStore.listSheets();
      const annotations = await sourceStore.loadAnnotations();
      await checked(await fetch(fileUrl(annotationsName), {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(annotations),
      }));
      const remoteNames = new Set(remote.map((file) => file.name));
      void (async () => {
        for (const sheet of sheets) {
          if (remoteNames.has(storedName(sheet.name))) continue;
          const bytes = await sourceStore.loadPdfData(sheet.name);
          await checked(await fetch(fileUrl(storedName(sheet.name)), {
            method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes,
          }));
        }
      })().catch((error) => console.warn("RunPod background migration paused:", error));
    },
    async listSheets() {
      const remoteSheets = (await listRemote())
        .filter((file) => (!prefix || file.name.startsWith(prefix)) && file.name.toLowerCase().endsWith(".pdf"))
        .map((file) => ({ name: prefix ? file.name.slice(prefix.length) : file.name, size: file.size, modified: file.modified }));
      if (!sourceStore) return remoteSheets;
      const byName = new Map(remoteSheets.map((sheet) => [sheet.name, sheet]));
      for (const sheet of await sourceStore.listSheets()) {
        if (!byName.has(sheet.name)) byName.set(sheet.name, sheet);
      }
      return [...byName.values()];
    },
    async loadPdfData(name) {
      const response = await fetch(fileUrl(storedName(name)), { cache: "no-store" });
      if (response.status === 404 && sourceStore) return sourceStore.loadPdfData(name);
      await checked(response);
      return new Uint8Array(await response.arrayBuffer());
    },
    async renderPdfPage(name, page, scale = 1) {
      const safePage = Math.max(1, Math.trunc(Number(page) || 1));
      const safeScale = Math.max(0.25, Math.min(4, Number(scale) || 1));
      const response = await checked(await fetch(
        `/runpod/api/pdf/${encodeURIComponent(storedName(name))}/pages/${safePage}/render?scale=${encodeURIComponent(safeScale)}`,
        { cache: "force-cache" },
      ));
      return response.blob();
    },
    async searchPdfText({ targets, terms }) {
      const response = await checked(await fetch("/runpod/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terms,
          targets: targets.map((target) => ({
            file: storedName(target.file),
            display_name: target.file,
            page: target.page ?? null,
          })),
        }),
      }));
      return response.json();
    },
    async searchPdfSymbols({ source, box, target, threshold, rotations, scales, limit = 250 }) {
      const response = await checked(await fetch("/runpod/api/symbol-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { file: storedName(source.file), display_name: source.file, page: source.page },
          box,
          target: { file: storedName(target.file), display_name: target.file, page: target.page },
          threshold,
          rotations,
          scales,
          limit,
        }),
      }));
      return response.json();
    },
    async addPdf(file, compatibility = null, preparedBytes = null) {
      const body = preparedBytes instanceof Uint8Array
        ? preparedBytes
        : preparedBytes instanceof ArrayBuffer ? new Uint8Array(preparedBytes) : file;
      await checked(await fetch(fileUrl(storedName(file.name)), {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body,
      }));
      await localStore.savePdfCompatibility(file.name, compatibility);
      return { name: file.name };
    },
    async removePdf(name) {
      await checked(await fetch(fileUrl(storedName(name)), { method: "DELETE" }));
      await localStore.removePdf(name);
    },
    async loadAnnotations() {
      const response = await fetch(fileUrl(annotationsName), { cache: "no-store" });
      if (response.status === 404) return emptyAnnotations();
      await checked(response);
      const value = await response.json();
      return value && typeof value === "object" ? value : emptyAnnotations();
    },
    async saveAnnotations(payload) {
      await checked(await fetch(fileUrl(annotationsName), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }));
    },
  };
}
