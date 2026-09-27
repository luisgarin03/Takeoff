import { test } from "node:test";
import assert from "node:assert/strict";
import { cloudConfig, assertPublicCloudEnv } from "../src/lib/supabase/config.js";

const url = "https://example.supabase.co";
const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;

test("Supabase is optional and reads only the requested public environment variables", () => {
  assert.deepEqual(cloudConfig({}), { configured: false });
  assert.deepEqual(cloudConfig({ VITE_SUPABASE_URL: ` ${url}/ `, VITE_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_placeholder " }),
    { configured: true, url, key: "sb_publishable_placeholder" });
  assert.equal(cloudConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt("anon") }).configured, false);
  assert.equal(cloudConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: jwt("anon") }).configured, true);
});

test("secret keys fail both runtime configuration and pre-bundle validation without leaking values", () => {
  for (const key of ["sb_secret_do_not_expose_this", jwt("service_role")]) {
    const env = { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key };
    assert.equal(cloudConfig(env).configured, false);
    assert.ok(!cloudConfig(env).error?.includes(key));
    assert.throws(() => assertPublicCloudEnv(env), /Only the public publishable key/);
  }
  assert.throws(() => assertPublicCloudEnv({ VITE_SUPABASE_SECRET_KEY: "anything" }), /secret/);
  assert.doesNotThrow(() => assertPublicCloudEnv({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public" }));
});

test("incomplete, malformed and insecure Supabase configuration stays disabled", () => {
  for (const env of [
    { VITE_SUPABASE_URL: url },
    { VITE_SUPABASE_URL: "http://example.com", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_public" },
    { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" },
    { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: "not-a-key" },
  ]) assert.equal(cloudConfig(env).configured, false);
});
