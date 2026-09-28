import { fail, uploadUrl, validateFile, limitedBytes, CHUNK } from "./drive-security.js";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const fields = "id,size,mimeType,sha256Checksum,trashed";
const esc = (s) => String(s).replaceAll("\\", "\\\\").replaceAll("'", "\\'");

export function createDriveGoogle(fetcher = fetch) {
  async function request(url, token, init = {}) {
    const res = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    if (res.ok || res.status === 308) return res;
    if (res.status === 401) fail("OTK_DRIVE_CONNECT", 401);
    if (res.status === 404 || res.status === 410) fail("OTK_DRIVE_MISSING", 404);
    if (res.status === 403 || res.status === 429) {
      const text = await res.text();
      if (res.status === 429 || /quota|rateLimit|storageQuota/i.test(text)) fail("OTK_DRIVE_QUOTA", 429);
      fail("OTK_DRIVE_PERMISSION", 403);
    }
    fail("OTK_DRIVE_TRANSFER", 502);
  }
  async function metadata(token, id) { return (await request(`${API}/${encodeURIComponent(id)}?fields=${fields}`, token)).json(); }
  return {
    metadata,
    async id(token) { return (await (await request(`${API}/generateIds?count=1&space=drive&type=files`, token)).json()).ids[0]; },
    async folder(token, name, parent, key) {
      const q = `trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='otkFolder' and value='${esc(key)}' }${parent ? ` and '${esc(parent)}' in parents` : " and 'root' in parents"}`;
      const found = await (await request(`${API}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`, token)).json();
      if (found.files?.[0]) return found.files[0].id;
      return (await (await request(API, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent || "root"], appProperties: { otkFolder: key } }) })).json()).id;
    },
    async begin(token, file) {
      const res = await request(`${UPLOAD}?uploadType=resumable&fields=${fields}`, token, { method: "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": file.mime_type, "X-Upload-Content-Length": String(file.size) }, body: JSON.stringify({ id: file.provider_file_id, name: file.sha256, parents: [file.provider_folder_id], mimeType: file.mime_type, description: file.original_filename, appProperties: { otkProject: file.project_id, otkSha256: file.sha256 } }) });
      return uploadUrl(res.headers.get("Location"));
    },
    async transfer(token, session, file, offset, bytes) {
      const res = await request(uploadUrl(session), token, { method: "PUT", headers: { "Content-Type": file.mime_type, "Content-Range": bytes ? `bytes ${offset}-${offset + bytes.length - 1}/${file.size}` : `bytes */${file.size}` }, body: bytes || new Uint8Array() });
      if (res.status === 308) {
        const match = /^bytes=0-(\d+)$/.exec(res.headers.get("Range") || "");
        const next = match ? Number(match[1]) + 1 : 0;
        if (!Number.isSafeInteger(next) || next > Number(file.size)) fail("OTK_DRIVE_UPLOAD", 502);
        return { offset: next, done: false };
      }
      validateFile(file, await res.json());
      return { offset: Number(file.size), done: true };
    },
    async download(token, file, offset) {
      validateFile(file, await metadata(token, file.provider_file_id));
      const end = Math.min(Number(file.size), offset + CHUNK) - 1;
      const res = await request(`${API}/${encodeURIComponent(file.provider_file_id)}?alt=media`, token, { headers: { Range: `bytes=${offset}-${end}` } });
      if (res.status !== 206 || res.headers.get("Content-Range") !== `bytes ${offset}-${end}/${file.size}`) { await res.body?.cancel(); fail("OTK_DRIVE_RANGE", 502); }
      const bytes = await limitedBytes(res, end - offset + 1);
      if (bytes.length !== end - offset + 1) fail("OTK_DRIVE_TRANSFER", 502);
      return bytes;
    },
    async remove(token, id) {
      // Trash instead of permanently deleting a user's original. No arbitrary IDs from clients.
      try { await request(`${API}/${encodeURIComponent(id)}`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }); }
      catch (e) { if (e.code !== "OTK_DRIVE_MISSING") throw e; }
    },
  };
}
