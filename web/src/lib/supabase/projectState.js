import { ANN_SCHEMA } from "../store.js";
import { validateAnnotations, digest } from "../projectFile.js";
import { base64ToBytes, bytesToBase64, validateWhiteboard } from "../whiteboard.js";
import { CloudError } from "./errors.js";

export const CLOUD_SCHEMA = "opentakeoff.cloud.v1";
export const FREE_FILE_LIMIT = 50_000_000;
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const HASH = /^[a-f0-9]{64}$/;
const invalid = () => { throw new CloudError("OTK_FORMAT", "Unsupported or damaged cloud project data."); };
export const jsonHash = (value) => digest(new TextEncoder().encode(JSON.stringify(value)));

// Reuse the existing archive/capture interfaces without creating a temporary
// IndexedDB workspace just to download or duplicate a cloud project.
export function restoredProjectSource(restored) {
  return {
    listSheets: async () => restored.pdfs.map(({ name }) => ({ name })),
    loadPdfData: async (name) => restored.pdfs.find((p) => p.name === name)?.bytes,
    listSnapshots: async () => restored.snapshots,
    getSnapshot: async (id) => restored.snapshots.find((s) => s.id === id),
  };
}

// This is a transport envelope, not a new portable file format. Annotation and
// revision payloads are the existing serializer's values, with binary data split out.
export async function captureCloudProject(source, payload, previousPlans = []) {
  const files = new Map();
  async function file(name, type, bytes) {
    const sha256 = await digest(bytes);
    const meta = { name, type, size: bytes.length, sha256 };
    files.set(sha256, { ...meta, bytes });
    return meta;
  }
  async function pack(input) {
    const a = structuredClone({ ...input, schema: ANN_SCHEMA, units: input.units || "imperial" });
    validateAnnotations(a);
    if (a.whiteboard) {
      validateWhiteboard(a.whiteboard);
      for (const asset of a.whiteboard.assets) {
        const info = asset.missing ? { sha256: asset.remote_sha256 } : await file(asset.name, asset.type, base64ToBytes(asset.data));
        delete asset.data; delete asset.missing; delete asset.remote_sha256;
        asset.sha256 = info.sha256;
      }
    }
    return a;
  }
  const plans = [];
  for (const { name } of await source.listSheets()) plans.push(await file(name, "application/pdf", await source.loadPdfData(name)));
  // A Local Only plan missing on this device must not disappear on the next save.
  for (const p of previousPlans) if (!plans.some((item) => item.name === p.name)) plans.push(p);
  const snapshots = [];
  for (const { id } of await source.listSnapshots()) {
    const s = await source.getSnapshot(id);
    if (!s) throw new CloudError("OTK_RETRY", "A revision changed during save. Please retry.");
    snapshots.push({ id: s.id, ts: s.ts, label: s.label, payload: await pack(s.payload) });
  }
  const state = { schema: CLOUD_SCHEMA, annotations: await pack(payload), plans, snapshots };
  validateCloudState(state);
  return { state, files, hash: await jsonHash(state) };
}

export function validateCloudState(state) {
  if (!state || state.schema !== CLOUD_SCHEMA || !UUID.test(state.annotations?.project_id) || !Array.isArray(state.plans) || !Array.isArray(state.snapshots)) invalid();
  if (new TextEncoder().encode(JSON.stringify(state)).length > 32 * 1024 * 1024) invalid();
  const names = new Set(), snapshots = new Set();
  for (const plan of state.plans) {
    if (!plan || typeof plan.name !== "string" || !plan.name.trim() || names.has(plan.name) || !HASH.test(plan.sha256) ||
      !Number.isSafeInteger(plan.size) || plan.size <= 0 || plan.type !== "application/pdf") invalid();
    names.add(plan.name);
  }
  const validatePayload = (payload) => {
    validateAnnotations(payload);
    if (!payload.whiteboard) return;
    const board = structuredClone(payload.whiteboard);
    if (!Array.isArray(board.assets)) invalid();
    board.assets = board.assets.map(({ sha256, ...asset }) => {
      if (!HASH.test(sha256) || Object.hasOwn(asset, "data")) invalid();
      return { ...asset, data: "", missing: true, remote_sha256: sha256 };
    });
    validateWhiteboard(board);
  };
  validatePayload(state.annotations);
  for (const s of state.snapshots) {
    if (!s || typeof s.id !== "string" || !s.id || snapshots.has(s.id) || !Number.isFinite(s.ts) || (s.label != null && typeof s.label !== "string")) invalid();
    snapshots.add(s.id); validatePayload(s.payload);
  }
  return state;
}

export function cloudFileReferences(state) {
  const refs = new Map(state.plans.map((p) => [p.sha256, p]));
  for (const a of [state.annotations, ...state.snapshots.map((s) => s.payload)]) {
    for (const asset of a.whiteboard?.assets || []) refs.set(asset.sha256, { name: asset.name, type: asset.type, size: asset.size, sha256: asset.sha256 });
  }
  return [...refs.values()];
}

export async function restoreCloudProject(state, getBytes) {
  validateCloudState(state);
  const missing = [], cache = new Map();
  async function bytesFor(ref) {
    if (!cache.has(ref.sha256)) {
      const bytes = await getBytes(ref);
      if (bytes && (bytes.length !== ref.size || await digest(bytes) !== ref.sha256)) invalid();
      cache.set(ref.sha256, bytes || null);
      if (!bytes) missing.push(ref);
    }
    return cache.get(ref.sha256);
  }
  const unpack = async (input) => {
    const a = structuredClone(input);
    for (const asset of a.whiteboard?.assets || []) {
      const data = await bytesFor(asset), hash = asset.sha256;
      delete asset.sha256;
      Object.assign(asset, data ? { data: bytesToBase64(data) } : { data: "", missing: true, remote_sha256: hash });
    }
    return a;
  };
  const pdfs = [];
  for (const plan of state.plans) {
    const bytes = await bytesFor(plan);
    if (bytes) pdfs.push({ name: plan.name, bytes });
  }
  const snapshots = [];
  for (const s of state.snapshots) snapshots.push({ ...s, payload: await unpack(s.payload) });
  return { annotations: await unpack(state.annotations), pdfs, snapshots, missing };
}
