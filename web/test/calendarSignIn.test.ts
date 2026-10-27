import { test } from "node:test";
import assert from "node:assert/strict";
import { createDriveService } from "../../supabase/functions/_shared/drive-service.js";
import { CALENDAR_SCOPES } from "../../supabase/functions/_shared/project-calendar.js";

test("initial sign-in verifies Calendar scopes and linked Google identity before storing encrypted grant", async () => {
  let scope = CALENDAR_SCOPES, sub = "linked-google", saved: any, metadata: any;
  const api = createDriveService({ store: { connection: async () => null, putConnection: async (row: any) => { saved = row; } }, google: {},
    cipher: { seal: async (value: string, owner: string) => `encrypted:${owner}:${value}` },
    config: { clientId: "our-client", clientSecret: "server-secret", onGoogleConnected: async (...args: any[]) => { metadata = args; } },
    fetcher: async (input: any, options: any) => {
      const url = String(input);
      if (url.endsWith("/token")) {
        assert.equal(options.body.get("client_id"), "our-client");
        assert.equal(options.body.get("grant_type"), "refresh_token");
        return Response.json({ access_token: "short-lived", scope });
      }
      return Response.json({ sub, email_verified: true, email: "user@example.com" });
    } });
  const user = { id: "owner", identities: [{ provider: "google", identity_data: { sub: "linked-google" } }] };
  assert.deepEqual(await api.importCalendarSignIn(user, "refresh"), { connected: true });
  assert.equal(saved.token_cipher, "encrypted:owner:refresh");
  assert.equal(metadata[0], "owner");
  saved = null; scope = "openid email";
  await assert.rejects(api.importCalendarSignIn(user, "refresh")); assert.equal(saved, null);
  scope = CALENDAR_SCOPES; sub = "someone-else";
  await assert.rejects(api.importCalendarSignIn(user, "refresh")); assert.equal(saved, null);
});
