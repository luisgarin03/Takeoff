export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const CHUNK = 4 * 1024 * 1024;
export const MAX_FILE = 2 * 1024 * 1024 * 1024;
export const NATIVE_RETURN = "com.opentakeoff.app://drive-auth";
export class DriveError extends Error {
  constructor(code, status = 400, details = undefined) { super(code); this.code = code; this.status = status; this.details = details; }
}
export const fail = (code, status = 400, details = undefined) => { throw new DriveError(code, status, details); };
export const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256 = async (value) => hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? new TextEncoder().encode(value) : value));
export const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
export const randomToken = () => base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export async function cipher(secret) {
  let raw;
  try { raw = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)); } catch { fail("OTK_DRIVE_SETUP", 503); }
  if (raw.length !== 32) fail("OTK_DRIVE_SETUP", 503);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return {
    async seal(value, owner) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) }, key, new TextEncoder().encode(value));
      return `${base64(iv)}.${base64(body)}`;
    },
    async open(value, owner) {
      const [iv, data] = value.split(".").map((s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(owner) }, key, data));
    },
  };
}
export function returnUrl(value, origins) {
  if (value === NATIVE_RETURN) return value;
  let url;
  try { url = new URL(value); } catch { fail("OTK_DRIVE_RETURN"); }
  if (!origins.includes(url.origin) || url.username || url.password || value.length > 2048) fail("OTK_DRIVE_RETURN");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) fail("OTK_DRIVE_RETURN");
  url.hash = "";
  for (const key of ["code", "state", "access_token", "refresh_token", "error", "error_description", "otkGoogle"]) url.searchParams.delete(key);
  url.searchParams.set("otkDrive", "1");
  return url.href;
}
export function assertAccess(project, member, user, operation) {
  if (!project) fail("OTK_ACCESS", 403);
  const owner = project.owner_id === user;
  if (operation === "delete") { if (!owner || !project.deleted_at) fail("OTK_ACCESS", 403); return; }
  if (project.deleted_at || (!owner && !["editor", "viewer"].includes(member?.role))) fail("OTK_ACCESS", 403);
  if (operation === "write" && !owner && member?.role !== "editor") fail("OTK_READ_ONLY", 403);
}
export function validateFile(file, metadata) {
  if (metadata.trashed) fail("OTK_DRIVE_MISSING", 404);
  if (metadata.id !== file.provider_file_id || Number(metadata.size) !== Number(file.size) || metadata.mimeType !== file.mime_type || metadata.sha256Checksum !== file.sha256) fail("OTK_DRIVE_INTEGRITY", 409);
}
export function uploadUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "www.googleapis.com" || !url.pathname.startsWith("/upload/drive/v3/files")) fail("OTK_DRIVE_UPLOAD", 502);
  return url.href;
}
export async function limitedBytes(response, max) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > max) fail("OTK_DRIVE_SIZE", 413);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
