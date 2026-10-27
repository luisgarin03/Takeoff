import { fail, uploadUrl, validateFile, limitedBytes, CHUNK } from "./drive-security.js";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const fields = "id,name,size,mimeType,sha256Checksum,trashed,parents,appProperties,modifiedTime";
const esc = (s) => String(s).replaceAll("\\", "\\\\").replaceAll("'", "\\'");

export function createDriveGoogle(fetcher = fetch) {
  async function request(url, token, init = {}) {
    let res;
    try {
      res = await fetcher(url, { ...init, redirect: "error", signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    } catch (error) {
      // Keep provider URLs, resumable-session IDs, and exception messages out of logs.
      fail("OTK_DRIVE_TRANSFER", 502, { layer: "google_transport", host: new URL(url).hostname, errorName: error?.name || "Error" });
    }
    if (res.ok || res.status === 308) return res;
    if (res.status === 401) fail("OTK_DRIVE_CONNECT", 401);
    if (res.status === 404 || res.status === 410) fail("OTK_DRIVE_MISSING", 404);
    if (res.status === 403 || res.status === 429) {
      const text = await res.text();
      if (res.status === 429 || /quota|rateLimit|storageQuota/i.test(text)) fail("OTK_DRIVE_QUOTA", 429);
      fail("OTK_DRIVE_PERMISSION", 403);
    }
    // Keep transient Google failures retryable, but distinguish a rejected upload
    // request from a network timeout so the UI can tell the user what to do.
    if (res.status >= 500) fail("OTK_DRIVE_TRANSFER", 502, { layer: "google_http", upstreamStatus: res.status });
    if (res.status === 400 || res.status === 409) fail("OTK_DRIVE_UPLOAD", 502, { layer: "google_http", upstreamStatus: res.status });
    fail("OTK_DRIVE_TRANSFER", 502);
  }
  async function metadata(token, id) { return (await request(`${API}/${encodeURIComponent(id)}?fields=${fields}`, token)).json(); }
  return {
    metadata,
    async shareMetadata(token, id) {
      return (await request(`${API}/${encodeURIComponent(id)}?fields=id,name,size,mimeType,modifiedTime,trashed,owners(me),capabilities(canShare),sha256Checksum`, token)).json();
    },
    async permissions(token, id) {
      const all = []; let pageToken = "";
      do {
        const data = await (await request(`${API}/${encodeURIComponent(id)}/permissions?${new URLSearchParams({ fields: "nextPageToken,permissions(id,type,emailAddress,role,deleted)", pageSize: "100", ...(pageToken ? { pageToken } : {}) })}`, token)).json();
        all.push(...(data.permissions || [])); pageToken = data.nextPageToken || "";
      } while (pageToken);
      return all;
    },
    async shareReader(token, id, email, message) {
      return (await request(`${API}/${encodeURIComponent(id)}/permissions?${new URLSearchParams({ sendNotificationEmail: "true", emailMessage: message, fields: "id" })}`, token, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }),
      })).json();
    },
    async findFolder(token, key, parent) {
      const q = `trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='otkFolder' and value='${esc(key)}' } and '${esc(parent || "root")}' in parents`;
      const data = await (await request(`${API}?${new URLSearchParams({ q, fields: `files(${fields})`, pageSize: "2" })}`, token)).json();
      if (data.files?.length > 1) fail("OTK_DRIVE_INTEGRITY", 409);
      return data.files?.[0] || null;
    },
    async children(token, parent) {
      const files = []; let pageToken = "";
      do {
        const data = await (await request(`${API}?${new URLSearchParams({ q: `trashed=false and '${esc(parent)}' in parents`, fields: `nextPageToken,files(${fields})`, pageSize: "1000", ...(pageToken ? { pageToken } : {}) })}`, token)).json();
        files.push(...(data.files || [])); pageToken = data.nextPageToken || "";
        if (files.length > 20000) fail("OTK_DRIVE_SIZE", 413);
      } while (pageToken);
      return files;
    },
    async readChunk(token, file, offset) {
      const size = Number(file.size), end = Math.min(size, offset + CHUNK) - 1;
      const res = await request(`${API}/${encodeURIComponent(file.id)}?alt=media`, token, { headers: { Range: `bytes=${offset}-${end}` } });
      if (res.status !== 206 || res.headers.get("Content-Range") !== `bytes ${offset}-${end}/${size}`) { await res.body?.cancel(); fail("OTK_DRIVE_RANGE", 502); }
      const bytes = await limitedBytes(res, end - offset + 1);
      if (bytes.length !== end - offset + 1) fail("OTK_DRIVE_TRANSFER", 502);
      return bytes;
    },
    async id(token) { return (await (await request(`${API}/generateIds?count=1&space=drive&type=files`, token)).json()).ids[0]; },
    async folder(token, name, parent, key) {
      const q = `trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='otkFolder' and value='${esc(key)}' }${parent ? ` and '${esc(parent)}' in parents` : " and 'root' in parents"}`;
      const found = await (await request(`${API}?${new URLSearchParams({ q, fields: "files(id,name)", pageSize: "1" })}`, token)).json();
      if (found.files?.[0]) {
        if (found.files[0].name !== name) await request(`${API}/${encodeURIComponent(found.files[0].id)}?fields=id`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        return found.files[0].id;
      }
      return (await (await request(API, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parent || "root"], appProperties: { otkFolder: key } }) })).json()).id;
    },
    async begin(token, file, replace = false) {
      const url = replace ? `${UPLOAD}/${encodeURIComponent(file.provider_file_id)}?uploadType=resumable&fields=${fields}` : `${UPLOAD}?uploadType=resumable&fields=${fields}`;
      const res = await request(url, token, { method: replace ? "PATCH" : "POST", headers: { "Content-Type": "application/json", "X-Upload-Content-Type": file.mime_type, "X-Upload-Content-Length": String(file.size) }, body: JSON.stringify({ ...(replace ? {} : { id: file.provider_file_id, parents: [file.provider_folder_id] }), name: file.original_filename, mimeType: file.mime_type, description: `OpenTakeoff ${file.file_kind}`, appProperties: { otkProject: file.project_id, otkSha256: file.sha256, otkKind: file.file_kind } }) });
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
