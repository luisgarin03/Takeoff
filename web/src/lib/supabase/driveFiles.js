import { cloudError } from "./errors.js";
import { digest } from "../projectFile.js";
import { createDriveCache } from "./driveCache.js";

export const DRIVE_CHUNK = 4 * 1024 * 1024;
export const DRIVE_FILE_LIMIT = 2 * 1024 * 1024 * 1024;
const raise = (code) => { throw cloudError(new Error(code)); };
const canceled = (signal) => { if (signal?.aborted) raise("OTK_CANCELED"); };
const retryable = (e) => ["OTK_DRIVE_TRANSFER", "OTK_DRIVE_BUSY", "OTK_DRIVE_RETRY", "OTK_NETWORK"].includes(e.code);

export function createDriveFiles({ client, url, key, userId, assertUser, fetcher = fetch, cache = createDriveCache(`${url}/${userId}`), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  async function request(action, { path, offset, bytes, body, signal, binary = false } = {}) {
    canceled(signal); await assertUser();
    const { data: { session }, error } = await client.auth.getSession();
    if (error || session?.user?.id !== userId || !session?.access_token) raise("OTK_AUTH");
    const query = new URLSearchParams({ action });
    if (path) { const [id, hash] = path.split("/"); query.set("projectId", id); query.set("sha256", hash); }
    if (offset != null) query.set("offset", String(offset));
    try {
      const response = await fetcher(`${url}/functions/v1/otk-drive?${query}`, { method: "POST", signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: key, "Content-Type": bytes ? "application/octet-stream" : "application/json" },
        body: bytes || (body ? JSON.stringify(body) : undefined) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const fallback = { 401: "OTK_AUTH", 403: "OTK_ACCESS", 404: "OTK_DRIVE_SETUP", 413: "OTK_DRIVE_SIZE", 429: "OTK_DRIVE_QUOTA" };
        raise(/^OTK_[A-Z_]+$/.test(data?.code) ? data.code : fallback[response.status] || "OTK_DRIVE_TRANSFER");
      }
      await assertUser(); canceled(signal);
      // Await body parsing here so truncated replies enter the same safe retry path.
      const result = binary ? new Uint8Array(await response.arrayBuffer()) : await response.json();
      // Reading the body can outlive cancellation or a sign-out/account switch.
      await assertUser(); canceled(signal);
      return result;
    } catch (e) { canceled(signal); if (action === "status" && e instanceof TypeError) raise("OTK_DRIVE_SETUP"); throw cloudError(e); }
  }
  async function retry(fn, signal) {
    for (let attempt = 0; ; attempt++) {
      try { return await fn(); }
      catch (e) { canceled(signal); if (attempt >= 3 || !retryable(e)) throw e; await wait(1000 * (attempt + 1)); }
    }
  }
  function validateUploadState(state, size) {
    if (typeof state?.done !== "boolean" || !Number.isSafeInteger(state.offset) || state.offset < 0
      || (state.done ? state.offset !== size : state.offset >= size)) raise("OTK_DRIVE_INTEGRITY");
  }
  return {
    listFolder: (projectId, folderId, signal) => request("folder-list", { body: { projectId, folderId }, signal }),
    folderChunk: (projectId, entry, offset, signal) => retry(() => request("folder-chunk", { body: { projectId, fileId: entry.id, offset, expected: { size: entry.size, modifiedTime: entry.modifiedTime, name: entry.name } }, binary: true, signal }), signal),
    status: () => request("status"),
    sharePicker: () => request("share-picker"),
    shareSend: (body) => request("share-send", { body }),
    shareFiles: (id) => request("share-files", { body: { id } }),
    shareImported: (id) => request("share-imported", { body: { id } }),
    shareRevoke: (id) => request("share-revoke", { body: { id } }),
    shareChunk: (body) => request("share-chunk", { body, binary: true }),
    connect: (returnUrl) => request("connect", { body: { returnUrl } }),
    disconnect: () => request("disconnect"),
    async upload(path, file, progress, { signal } = {}) {
      if (file.size > DRIVE_FILE_LIMIT) raise("OTK_DRIVE_SIZE");
      let state = await retry(() => request("begin", { path, signal }), signal), failures = 0;
      for (;;) {
        canceled(signal);
        validateUploadState(state, file.size);
        if (state.done) break;
        progress?.(state.offset / file.size);
        try {
          const next = await request("chunk", { path, offset: state.offset, bytes: file.bytes.subarray(state.offset, state.offset + DRIVE_CHUNK), signal });
          validateUploadState(next, file.size);
          // A successful HTTP reply without forward progress must not loop forever.
          if (!next.done && next.offset <= state.offset) raise("OTK_DRIVE_TRANSFER");
          state = next; failures = 0;
        } catch (e) {
          canceled(signal);
          if (++failures > 3 || !retryable(e)) throw e;
          await wait(failures * 1000);
          // Probe Google via the server: never blindly replay a chunk whose response was lost.
          state = await retry(() => request("begin", { path, signal }), signal);
        }
      }
      validateUploadState(state, file.size);
      progress?.(1);
    },
    async download(path, { record, signal, onProgress } = {}) {
      const expected = { sha256: record.sha256, size: Number(record.size), type: record.mime_type };
      if (!(expected.size > 0 && expected.size <= DRIVE_FILE_LIMIT)) raise("OTK_DRIVE_SIZE");
      await assertUser();
      const complete = await cache.get(path, "verified");
      if (!complete || complete.size !== expected.size || complete.type !== expected.type) {
        const info = await retry(() => request("info", { path, signal }), signal);
        if (info?.sha256 !== expected.sha256 || info.size !== expected.size || info.type !== expected.type) raise("OTK_DRIVE_INTEGRITY");
      }
      const bytes = new Uint8Array(expected.size);
      for (let offset = 0; offset < expected.size; offset += DRIVE_CHUNK) {
        canceled(signal); await assertUser();
        let part = await cache.get(path, offset);
        const length = Math.min(DRIVE_CHUNK, expected.size - offset);
        if (!(part instanceof Uint8Array) || part.length !== length) {
          part = await retry(() => request("download", { path, offset, signal, binary: true }), signal);
          if (part.length !== length) raise("OTK_DRIVE_INTEGRITY");
          await cache.put(path, offset, part);
        }
        bytes.set(part, offset); onProgress?.((offset + length) / expected.size);
      }
      if (await digest(bytes) !== expected.sha256) { await cache.clear(path); raise("OTK_DRIVE_INTEGRITY"); }
      canceled(signal); await assertUser();
      await cache.put(path, "verified", expected);
      // IndexedDB can finish after cancellation or a sign-out/account switch.
      await assertUser(); canceled(signal);
      return bytes;
    },
    remove: (path) => retry(() => request("remove", { path })),
  };
}
