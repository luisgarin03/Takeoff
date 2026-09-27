import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuth, googleRedirectUrl, googleSignInUnavailable, restoreGoogleReturn } from "../src/lib/supabase/auth.js";
import { createClient } from "@supabase/supabase-js";
import { createProjectRepository } from "../src/lib/supabase/projects.js";
import { cloudError } from "../src/lib/supabase/errors.js";

test("auth adapter supports password accounts, email-code recovery, sessions and local sign-out", async () => {
  const calls: any[] = []; let listener: any, unsubscribed = false;
  const operation = (name: string) => async (...args: any[]) => { calls.push([name, ...args]); return { data: { session: { user: { id: "user" } } }, error: null }; };
  const auth = createAuth({ auth: {
    getSession: operation("session"), signInWithPassword: operation("signin"), signUp: operation("signup"),
    signOut: operation("signout"), resetPasswordForEmail: operation("forgot"), verifyOtp: operation("code"), updateUser: operation("password"),
    onAuthStateChange(fn: any) { listener = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
  } });
  assert.equal((await auth.session()).session.user.id, "user");
  await auth.signUp("user@example.com", "password", "Name");
  await auth.signIn("user@example.com", "password");
  await auth.forgotPassword("user@example.com");
  await auth.verifyCode("user@example.com", "123456", "recovery");
  await auth.updatePassword("replacement"); await auth.signOut();
  assert.deepEqual(calls.at(-1), ["signout", { scope: "local" }]);
  assert.deepEqual(calls[4], ["code", { email: "user@example.com", token: "123456", type: "recovery" }]);
  let observed; const off = auth.subscribe((s: any) => { observed = s; });
  listener("SIGNED_IN", { user: "account" }); assert.deepEqual(observed, { user: "account" });
  off(); assert.equal(unsubscribed, true);
});

test("repository stops a pending operation if the signed-in account changed", async () => {
  let requested = false;
  const repository = createProjectRepository({ auth: { getSession: async () => ({ data: { session: { user: { id: "other" } } } }) },
    rpc: () => { requested = true; } }, "original");
  await assert.rejects(repository.deleteProject("id", 1), /account changed/);
  assert.equal(requested, false);
});

test("cloud failures expose safe actionable messages, not raw database details", () => {
  assert.equal(cloudError({ message: "OTK_CONFLICT" }).code, "OTK_CONFLICT");
  assert.equal(cloudError({ status: 403, message: "raw internal details" }).code, "OTK_ACCESS");
  assert.equal(cloudError({ code: "invalid_credentials" }).code, "OTK_LOGIN");
  assert.ok(!cloudError({ message: "raw internal details" }).message.includes("raw internal"));
});

test("Google redirects stay on localhost or the current HTTPS deployment and preserve the workspace", () => {
  for (const origin of ["http://localhost:5173", "http://127.0.0.1:5174", "http://[::1]:5173", "https://takeoff.example.com", "https://takeoff-preview.vercel.app"]) {
    const url = new URL(googleRedirectUrl(`${origin}/?localProject=workspace&code=old&error=old#access_token=secret`, false));
    assert.equal(url.origin, origin);
    assert.equal(url.searchParams.get("localProject"), "workspace");
    assert.equal(url.searchParams.get("otkGoogle"), "1");
    assert.equal(url.searchParams.has("code"), false);
    assert.equal(url.searchParams.has("error"), false);
    assert.equal(url.hash, "");
  }
  assert.match(googleSignInUnavailable("https://localhost/", true), /Android app build/);
  assert.throws(() => googleRedirectUrl("https://localhost/", true), /email and password/);
  for (const url of ["file:///app/index.html", "capacitor://localhost/", "http://public.example.com/", "not a URL"]) {
    assert.ok(googleSignInUnavailable(url, false));
    assert.throws(() => googleRedirectUrl(url, false), /HTTPS/);
  }
});

test("Google auth delegates only provider and redirect to Supabase, with safe initiation errors", async () => {
  let request: any;
  const auth = createAuth({ auth: { signInWithOAuth: async (args: any) => { request = args; return { data: { provider: "google", url: "https://auth.example.com/authorize" }, error: null }; } } });
  await auth.signInWithGoogle("http://localhost:5173/?localProject=workspace");
  assert.deepEqual(request, { provider: "google", options: { redirectTo: "http://localhost:5173/?localProject=workspace&otkGoogle=1" } });
  const failure = createAuth({ auth: { signInWithOAuth: async () => ({ error: { message: "private provider internals" } }) } });
  await assert.rejects(failure.signInWithGoogle("https://takeoff.example.com/"), (e: any) => e.code === "OTK_NETWORK" && !e.message.includes("private"));
});

test("OAuth callback exchanges once across concurrent/remounted consumers and scrubs its URL", async () => {
  let exchanges = 0, finish: any;
  const cleaned: string[] = [];
  const client = { auth: { exchangeCodeForSession: async (code: string) => {
    assert.equal(code, "one-use-code"); exchanges++;
    return new Promise((resolve) => { finish = resolve; });
  } } };
  const href = "http://localhost:5173/?localProject=workspace&otkGoogle=1&code=one-use-code#provider_token=private";
  const first = restoreGoogleReturn(client, href, (url: string) => { cleaned.push(url); });
  const second = restoreGoogleReturn(client, href, () => assert.fail("must not clean twice"));
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(exchanges, 1);
  assert.deepEqual(cleaned, ["/?localProject=workspace"]);
  finish({ data: { session: { user: { id: "google-user" } } }, error: null });
  assert.deepEqual(await first, { error: "" });
  assert.deepEqual(await restoreGoogleReturn(client, "http://localhost:5173/?localProject=workspace"), { error: "" });
  assert.equal(exchanges, 1);
});

test("ordinary loads and other auth URLs do not trigger a Google exchange or URL rewrite", async () => {
  const client = { auth: { exchangeCodeForSession: () => assert.fail("not a Google return") } };
  for (const href of ["https://takeoff.example.com/?localProject=workspace", "https://takeoff.example.com/?code=other-flow", "https://takeoff.example.com/#sheet"]) {
    assert.equal(await restoreGoogleReturn(client, href, () => assert.fail("must preserve URL")), null);
  }
});

test("OAuth cancellation/provider errors are sanitized and never exchange a code", async () => {
  for (const suffix of ["#error=access_denied&error_description=private", "&error=server_error&error_description=private", "#error_code=failed&error_description=private"]) {
    let cleaned = "";
    const client = { auth: { exchangeCodeForSession: () => assert.fail("must not exchange") } };
    const result = await restoreGoogleReturn(client, `https://takeoff.example.com/?localProject=workspace&otkGoogle=1${suffix}`, (url: string) => { cleaned = url; });
    assert.match(result.error, /Google sign-in/);
    assert.equal(result.error.includes("private"), false);
    assert.equal(cleaned, "/?localProject=workspace");
  }
});

test("missing/expired PKCE codes leave local mode intact and return retry instructions", async () => {
  let calls = 0;
  const missing = await restoreGoogleReturn({ auth: { exchangeCodeForSession: () => { calls++; } } }, "https://takeoff.example.com/?otkGoogle=1", () => {});
  assert.match(missing.error, /redirect URL settings/);
  assert.equal(calls, 0);
  for (const exchangeCodeForSession of [async () => ({ error: { message: "sensitive token error" } }), async () => { throw new Error("private network error"); }, async () => ({ data: { session: null } })]) {
    const result = await restoreGoogleReturn({ auth: { exchangeCodeForSession } }, "https://takeoff.example.com/?otkGoogle=1&code=expired", () => {});
    assert.match(result.error, /same browser/);
    assert.equal(result.error.includes("private"), false);
    assert.equal(result.error.includes("sensitive"), false);
  }
});

test("real Supabase SDK completes PKCE after reload and persists/restores the same session", async () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v); }, removeItem: (k: string) => { saved.delete(k); } };
  const requests: any[] = [];
  const user = { id: "12345678-1234-4234-8234-123456789abc", email: "google@example.com", aud: "authenticated", app_metadata: { provider: "google" }, user_metadata: { full_name: "Test User" }, created_at: new Date().toISOString() };
  const jwt = [ { alg: "HS256", typ: "JWT" }, { sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" } ].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).concat("signature").join(".");
  const options = { auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: "pkce" as const }, global: { fetch: async (url: any, init: any) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ access_token: jwt, refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer", user }), { status: 200, headers: { "Content-Type": "application/json" } });
  } } };
  const before = createClient("https://unit-test.supabase.co", "sb_publishable_test", options);
  const started = await createAuth(before).signInWithGoogle("https://takeoff.example.com/?localProject=workspace");
  const authorize = new URL(started.url!);
  assert.equal(authorize.searchParams.get("provider"), "google");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
  assert.ok(authorize.searchParams.get("code_challenge"));
  const after = createClient("https://unit-test.supabase.co", "sb_publishable_test", options);
  const events: string[] = [];
  const off = createAuth(after).subscribe((session: any) => { if (session?.user) events.push(session.user.id); });
  assert.deepEqual(await restoreGoogleReturn(after, `${authorize.searchParams.get("redirect_to")}&code=single-code`, () => {}), { error: "" });
  assert.equal(requests.length, 1);
  assert.ok(requests[0].url.endsWith("/auth/v1/token?grant_type=pkce"));
  assert.equal(requests[0].body.auth_code, "single-code");
  assert.ok(requests[0].body.code_verifier);
  assert.ok(events.includes(user.id));
  const reloaded = createClient("https://unit-test.supabase.co", "sb_publishable_test", options);
  assert.equal((await createAuth(reloaded).session()).session?.user.id, user.id);
  off();
});
