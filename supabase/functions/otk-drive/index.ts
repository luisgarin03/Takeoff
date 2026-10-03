import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { cipher, CHUNK, DriveError, limitedBytes } from "../_shared/drive-security.js";
import { createDriveStore } from "../_shared/drive-store.js";
import { createDriveGoogle } from "../_shared/drive-google.js";
import { createDriveService } from "../_shared/drive-service.js";

const env = (key: string) => Deno.env.get(key) || "";
const origins = env("OTK_DRIVE_ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);
const configured = ["OTK_DRIVE_CLIENT_ID", "OTK_DRIVE_CLIENT_SECRET", "OTK_DRIVE_TOKEN_KEY", "OTK_DRIVE_CALLBACK_URL"].every((key) => !!env(key));
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const encryption = configured ? cipher(env("OTK_DRIVE_TOKEN_KEY")).catch(() => null) : Promise.resolve(null);
async function serviceForRequest() {
  const key = await encryption;
  if (!key) return null;
  // Bound the whole operation below the database lease, including multi-call folder setup.
  const deadline = AbortSignal.timeout(120000);
  const boundedFetch = (input: RequestInfo | URL, init: RequestInit = {}) => fetch(input, { ...init,
    signal: AbortSignal.any(init.signal ? [deadline, init.signal] : [deadline]) });
  return createDriveService({ store: createDriveStore(db), google: createDriveGoogle(boundedFetch), cipher: key, fetcher: boundedFetch,
    config: { clientId: env("OTK_DRIVE_CLIENT_ID"), clientSecret: env("OTK_DRIVE_CLIENT_SECRET"), callback: env("OTK_DRIVE_CALLBACK_URL"), origins,
      pickerKey: env("OTK_DRIVE_PICKER_KEY"), pickerAppId: env("OTK_DRIVE_PICKER_APP_ID"), shareAppUrl: env("OTK_SHARE_APP_URL") } });
}

// The OAuth callback cannot carry a Supabase JWT. Every other route explicitly
// verifies getUser(token); disabling the gateway check is NOT anonymous access.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const action = new URL(req.url).searchParams.get("action") || "unknown";
  const headers: Record<string, string> = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type", "Access-Control-Allow-Methods": "POST,OPTIONS" };
  if (origins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
  try {
    if (origin && !origins.includes(origin)) return json({ code: "OTK_ACCESS" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const url = new URL(req.url);
    if (req.method === "GET" && action === "callback") {
      const api = await serviceForRequest();
      if (!api) return json({ code: "OTK_DRIVE_SETUP" }, 503);
      return new Response(null, { status: 303, headers: { ...headers, Location: await api.callback(url.searchParams) } });
    }
    if (req.method !== "POST") return json({ code: "OTK_DRIVE_REQUEST" }, 405);
    const bearer = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
    if (!bearer) return json({ code: "OTK_AUTH" }, 401);
    const { data, error } = await db.auth.getUser(bearer);
    if (error || !data.user) return json({ code: "OTK_AUTH" }, 401);
    const user = data.user.id, api = await serviceForRequest();
    if (!api) return action === "status" ? json({ configured: false, connected: false }) : json({ code: "OTK_DRIVE_SETUP" }, 503);
    if (action === "status") return json(await api.status(user));
    if (action === "share-picker") return json(await api.picker(user));
    if (action.startsWith("share-")) {
      if (!data.user.email_confirmed_at) return json({ code: "OTK_AUTH" }, 401);
      const input = JSON.parse(new TextDecoder().decode(await limitedBytes(req, 16384)));
      if (action === "share-send") return json(await api.sharing.send(data.user, input));
      if (action === "share-files") return json(await api.sharing.files(data.user, input.id));
      if (action === "share-imported") return json(await api.sharing.imported(data.user, input.id));
      if (action === "share-revoke") return json(await api.sharing.revoke(data.user, input.id));
      if (action === "share-chunk") return new Response(await api.sharing.chunk(data.user, input), { headers: { ...headers, "Content-Type": "application/octet-stream" } });
      return json({ code: "OTK_DRIVE_REQUEST" }, 400);
    }
    if (action === "disconnect") return json(await api.disconnect(user));
    if (action === "connect") {
      const input = JSON.parse(new TextDecoder().decode(await limitedBytes(req, 8192)));
      return json(await api.connect(user, input.returnUrl));
    }
    const id = url.searchParams.get("projectId"), hash = url.searchParams.get("sha256");
    if (action === "folder-list" || action === "folder-chunk") {
      const input = JSON.parse(new TextDecoder().decode(await limitedBytes(req, 8192)));
      if (action === "folder-list") return json(await api.library.list(user, input.projectId, input.folderId));
      return new Response(await api.library.chunk(user, input.projectId, input.fileId, input.offset, input.expected), { headers: { ...headers, "Content-Type": "application/octet-stream" } });
    }
    if (action === "begin") return json(await api.begin(user, id, hash));
    if (action === "chunk") return json(await api.chunk(user, id, hash, Number(url.searchParams.get("offset")), await limitedBytes(req, CHUNK)));
    if (action === "info") return json(await api.info(user, id, hash));
    if (action === "download") return new Response(await api.download(user, id, hash, Number(url.searchParams.get("offset"))), { headers: { ...headers, "Content-Type": "application/octet-stream" } });
    if (action === "remove") return json(await api.remove(user, id, hash));
    return json({ code: "OTK_DRIVE_REQUEST" }, 400);
  } catch (error) {
    // Do not serialize Google responses, tokens, resumable URLs, or exception stacks.
    const details = error instanceof DriveError ? error.details : { layer: "edge_handler", errorName: error?.name || "Error" };
    console.error("otk-drive request failed", { action, code: error instanceof DriveError ? error.code : "OTK_DRIVE_TRANSFER", status: error instanceof DriveError ? error.status : 502, ...details });
    return json({ code: error instanceof DriveError ? error.code : "OTK_DRIVE_TRANSFER" }, error instanceof DriveError ? error.status : 502);
  }
});
