import { createDriveLibrary } from "./drive-library.js";
import { createDriveSharing } from "./drive-sharing.js";
import { DRIVE_SCOPE, CHUNK, MAX_FILE, fail, randomToken, sha256, base64, returnUrl, assertAccess, validateFile } from "./drive-security.js";

const driveName = (value) => String(value || "Untitled project").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 100) || "Untitled project";

// Refresh credentials stay server-side. Only the account owner's short-lived
// access token can be returned to Google's Picker; recipients never receive it.
export function createDriveService({ store, google, cipher, config, fetcher = fetch }) {
  async function oauthToken(params) {
    const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(20000),
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }) });
    const data = await response.json();
    if (!response.ok || !data.access_token) fail(data.error === "invalid_grant" ? "OTK_DRIVE_CONNECT" : "OTK_DRIVE_TRANSFER", 502);
    return data;
  }
  async function token(owner) {
    const connection = await store.connection(owner);
    if (connection?.status !== "connected" || !connection.token_cipher) fail("OTK_DRIVE_CONNECT", 409);
    try {
      return (await oauthToken({ grant_type: "refresh_token", refresh_token: await cipher.open(connection.token_cipher, owner) })).access_token;
    } catch (e) {
      if (e.code === "OTK_DRIVE_CONNECT") await store.patchConnection(owner, { status: "revoked" });
      throw e;
    }
  }
  async function access(user, id, hash, operation) {
    if (!/^[0-9a-f-]{36}$/i.test(id || "") || !/^[0-9a-f]{64}$/.test(hash || "")) fail("OTK_ACCESS", 403);
    const project = await store.project(id);
    assertAccess(project, await store.member(id, user), user, operation);
    const file = await store.file(id, hash);
    if (project.file_provider !== "google_drive" || !file || file.storage_provider !== "google_drive" || file.provider_owner_id !== project.owner_id) fail("OTK_ACCESS", 403);
    if (!(Number(file.size) > 0 && Number(file.size) <= MAX_FILE)) fail("OTK_DRIVE_SIZE", 413);
    return { project, file };
  }
  async function leased(user, id, hash, operation, fn) {
    const lease = crypto.randomUUID();
    await access(user, id, hash, operation);
    if (!await store.lease(id, hash, lease)) fail("OTK_DRIVE_BUSY", 409);
    try { return await fn(await access(user, id, hash, operation)); }
    finally { await store.release(id, hash, lease); }
  }
  async function finish(user, file, result) {
    if (result.done) {
      // Membership/deletion may have changed while Google accepted the upload.
      await access(user, file.project_id, file.sha256, "write");
      await store.patchFile(file.project_id, file.sha256, { uploaded: true });
      await store.patchUpload(file.project_id, file.sha256, null);
    }
    return result;
  }
  return {
    library: createDriveLibrary({ store, google, token }),
    sharing: createDriveSharing({ store, google, token, config }),
    async picker(user) {
      if (!config.pickerKey || !config.pickerAppId) fail("OTK_SHARE_SETUP", 503);
      return { accessToken: await token(user), developerKey: config.pickerKey, appId: config.pickerAppId };
    },
    async status(user) {
      const row = await store.connection(user);
      return { configured: true, connected: row?.status === "connected", email: row?.email || "", status: row?.status || "disconnected" };
    },
    async connect(user, destination) {
      const state = randomToken(), verifier = randomToken();
      const challenge = base64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
      await store.startOAuth({ state_hash: await sha256(state), user_id: user, verifier_cipher: await cipher.seal(verifier, user),
        return_url: returnUrl(destination, config.origins), expires_at: new Date(Date.now() + 600000).toISOString() });
      return { url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback,
        response_type: "code", scope: `openid email ${DRIVE_SCOPE}`, access_type: "offline", prompt: "consent select_account",
        state, code_challenge: challenge, code_challenge_method: "S256" })}` };
    },
    async callback(params) {
      if (!params.get("state") || params.get("state").length > 256) fail("OTK_DRIVE_RETURN");
      const pending = await store.claimOAuth(await sha256(params.get("state")));
      if (!pending) fail("OTK_DRIVE_RETURN");
      const destination = new URL(pending.return_url);
      try {
        if (params.has("error") || !params.get("code")) fail("OTK_DRIVE_CONSENT");
        const grant = await oauthToken({ grant_type: "authorization_code", code: params.get("code"), redirect_uri: config.callback,
          code_verifier: await cipher.open(pending.verifier_cipher, pending.user_id) });
        if (!grant.scope?.split(" ").includes(DRIVE_SCOPE) || !grant.refresh_token) fail("OTK_DRIVE_CONSENT");
        const response = await fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
          signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${grant.access_token}` } });
        const identity = await response.json();
        if (!response.ok || !identity.sub || !identity.email_verified) fail("OTK_DRIVE_CONSENT");
        const old = await store.connection(pending.user_id);
        if (old?.google_sub && old.google_sub !== identity.sub) fail("OTK_DRIVE_ACCOUNT");
        const accepted = await store.completeOAuth(pending, { google_sub: identity.sub, email: identity.email,
          token_cipher: await cipher.seal(grant.refresh_token, pending.user_id), status: "connected", updated_at: new Date().toISOString() });
        if (!accepted) fail("OTK_DRIVE_RETURN");
        destination.searchParams.set("otkDrive", "connected");
      } catch (e) {
        destination.searchParams.set("otkDrive", e.code === "OTK_DRIVE_ACCOUNT" ? "account" : "failed");
      }
      return destination.href;
    },
    async disconnect(user) {
      const old = await store.connection(user);
      await store.cancelOAuth(user);
      // Clear server access before contacting Google, including if revocation is offline.
      await store.patchConnection(user, { token_cipher: null, status: "disconnected", oauth_nonce: null });
      let revoked = true;
      if (old?.token_cipher) {
        try {
          const response = await fetcher("https://oauth2.googleapis.com/revoke", { method: "POST", signal: AbortSignal.timeout(15000),
            body: new URLSearchParams({ token: await cipher.open(old.token_cipher, user) }) });
          revoked = response.ok;
        } catch { revoked = false; }
      }
      return { disconnected: true, revoked };
    },
    begin(user, id, hash) {
      return leased(user, id, hash, "write", async ({ project, file }) => {
        const auth = await token(project.owner_id);
        let replace = false;
        if (file.provider_file_id) {
          try {
            validateFile(file, await google.metadata(auth, file.provider_file_id));
            return await finish(user, file, { done: true, offset: Number(file.size) });
          } catch (e) {
            if (file.uploaded) throw e;
            if (e.code === "OTK_DRIVE_INTEGRITY" && file.file_kind === "archive") replace = true;
            else if (e.code !== "OTK_DRIVE_MISSING") throw e;
          }
        }
        const session = await store.upload(id, hash);
        if (session?.session_cipher) {
          try { return await finish(user, file, await google.transfer(auth, await cipher.open(session.session_cipher, `${id}/${hash}`), file, 0)); }
          catch (e) { if (e.code !== "OTK_DRIVE_MISSING") throw e; }
        }
        const root = await google.folder(auth, "Estimate save data", null, "root");
        const projects = await google.folder(auth, "Projects", root, "projects");
        // Reuse legacy folders by stable app identity; never duplicate on upgrade.
        const legacy = await google.findFolder(auth, id, root);
        const folder = await google.folder(auth, driveName(project.name), legacy ? root : projects, id);
        const subfolder = file.file_kind === "originals" ? "PDFs" : file.file_kind === "archive" ? "" : "Assets";
        file.provider_folder_id = subfolder ? await google.folder(auth, subfolder, folder, `${id}/${subfolder.toLowerCase()}`) : folder;
        file.provider_file_id ||= await google.id(auth);
        await access(user, id, hash, "write");
        // Persist the generated ID before starting: a lost HTTP response cannot create a second binary.
        await store.patchFile(id, hash, { provider_file_id: file.provider_file_id, provider_folder_id: file.provider_folder_id });
        const url = await google.begin(auth, file, replace);
        await store.patchUpload(id, hash, await cipher.seal(url, `${id}/${hash}`));
        return { done: false, offset: 0 };
      });
    },
    chunk(user, id, hash, offset, bytes) {
      return leased(user, id, hash, "write", async ({ project, file }) => {
        if (!Number.isSafeInteger(offset) || offset < 0 || !bytes.length || bytes.length > CHUNK || offset + bytes.length > Number(file.size)
          || (offset + bytes.length < Number(file.size) && bytes.length % (256 * 1024))) fail("OTK_DRIVE_RANGE");
        if (file.uploaded) return { done: true, offset: Number(file.size) };
        const session = await store.upload(id, hash);
        if (!session?.session_cipher) fail("OTK_DRIVE_RETRY", 409);
        return finish(user, file, await google.transfer(await token(project.owner_id), await cipher.open(session.session_cipher, `${id}/${hash}`), file, offset, bytes));
      });
    },
    async info(user, id, hash) {
      const { project, file } = await access(user, id, hash, "read");
      if (!file.uploaded) fail("OTK_DRIVE_MISSING", 404);
      validateFile(file, await google.metadata(await token(project.owner_id), file.provider_file_id));
      return { size: Number(file.size), type: file.mime_type, sha256: hash };
    },
    async download(user, id, hash, offset) {
      const { project, file } = await access(user, id, hash, "read");
      if (!file.uploaded) fail("OTK_DRIVE_MISSING", 404);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= Number(file.size) || offset % CHUNK) fail("OTK_DRIVE_RANGE");
      const bytes = await google.download(await token(project.owner_id), file, offset);
      await access(user, id, hash, "read");
      return bytes;
    },
    remove(user, id, hash) {
      return leased(user, id, hash, "delete", async ({ project, file }) => {
        if (file.provider_file_id) await google.remove(await token(project.owner_id), file.provider_file_id);
        await store.patchFile(id, hash, { provider_file_id: null, provider_folder_id: null, uploaded: false });
        await store.patchUpload(id, hash, null);
        return { deleted: true };
      });
    },
  };
}
