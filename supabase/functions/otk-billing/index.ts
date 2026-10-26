import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const env = (key: string) => Deno.env.get(key) || "";
const allowedOrigins = env("OTK_BILLING_ALLOWED_ORIGINS").split(",").map((value) => value.trim()).filter(Boolean);
const entitlementId = env("REVENUECAT_ENTITLEMENT_ID");
const revenueCatKey = env("REVENUECAT_SECRET_API_KEY");
const webhookAuthorization = env("REVENUECAT_WEBHOOK_AUTHORIZATION");
const webhookSigningSecret = env("REVENUECAT_WEBHOOK_SIGNING_SECRET");
const allowSandboxLicenses = env("OTK_ALLOW_SANDBOX_LICENSES").toLowerCase() === "true";
const licenseLeaseSeconds = 120;
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Json = Record<string, unknown>;

function headersFor(origin: string) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version,x-revenuecat-webhook-signature",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function uuid(value: unknown) {
  const text = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : "";
}

function verifiedSessionId(bearer: string) {
  try {
    const encoded = bearer.split(".")[1] || "";
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return uuid((JSON.parse(atob(padded)) as Json).session_id);
  } catch {
    return "";
  }
}

function safePlanMap() {
  try {
    const parsed = JSON.parse(env("REVENUECAT_PLAN_MAP") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function validWebhook(req: Request, raw: string) {
  if (webhookSigningSecret) {
    const match = /^t=(\d+),v1=([a-f0-9]+)$/i.exec(req.headers.get("x-revenuecat-webhook-signature") || "");
    if (!match || Math.abs(Date.now() / 1000 - Number(match[1])) > 300) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookSigningSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${match[1]}.${raw}`)));
    return constantTimeEqual(signature, match[2].toLowerCase());
  }
  return !!webhookAuthorization && constantTimeEqual(req.headers.get("authorization") || "", webhookAuthorization);
}

async function subscriber(appUserId: string) {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${revenueCatKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed (${response.status})`);
  return await response.json() as Json;
}

function subscriptionRecord(userId: string, body: Json, event: Json = {}) {
  const root = (body.subscriber || {}) as Json;
  const entitlements = (root.entitlements || {}) as Record<string, Json>;
  const entitlement = entitlements[entitlementId] || {};
  const productId = String(entitlement.product_identifier || "");
  const subscriptions = (root.subscriptions || {}) as Record<string, Json>;
  const subscription = subscriptions[productId] || {};
  const expires = String(entitlement.expires_date || subscription.expires_date || "") || null;
  const graceExpires = String(subscription.grace_period_expires_date || "") || null;
  const expiresAt = expires ? Date.parse(expires) : Number.POSITIVE_INFINITY;
  const graceAt = graceExpires ? Date.parse(graceExpires) : 0;
  const activeUntil = Math.max(Number.isFinite(expiresAt) ? expiresAt : 0, Number.isFinite(graceAt) ? graceAt : 0);
  const isActive = !!productId && activeUntil > Date.now();
  const isGrace = isActive && Number.isFinite(expiresAt) && expiresAt <= Date.now() && graceAt > Date.now();
  const trial = String(subscription.period_type || "").toLowerCase() === "trial";
  const billingIssue = !!subscription.billing_issues_detected_at;
  const canceled = !!subscription.unsubscribe_detected_at;
  const status = isActive ? (isGrace ? "grace" : billingIssue ? "billing_issue" : trial ? "trialing" : canceled ? "canceled" : "active") : (productId ? "expired" : "inactive");
  const planId = String(safePlanMap()[productId] || productId || "").slice(0, 80);
  const eventEnvironment = String(event.environment || "").toLowerCase();
  const environment = subscription.is_sandbox === true || eventEnvironment === "sandbox" ? "sandbox" : "production";
  return {
    user_id: userId,
    status,
    plan_id: planId,
    provider: "revenuecat",
    product_id: productId.slice(0, 255),
    store: String(subscription.store || "").slice(0, 40),
    entitlement_id: entitlementId,
    revenuecat_customer_id: userId,
    subscription_id: String(subscription.original_transaction_id || subscription.store_transaction_id || "").slice(0, 255),
    current_period_end: activeUntil > 0 && Number.isFinite(activeUntil) ? new Date(activeUntil).toISOString() : null,
    will_renew: isActive && !canceled,
    environment,
    last_event_id: String(event.id || "").slice(0, 255),
    last_event_at: event.event_timestamp_ms ? new Date(Number(event.event_timestamp_ms)).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

async function refresh(userId: string, event: Json = {}) {
  const record = subscriptionRecord(userId, await subscriber(userId), event);
  const { error } = await db.from("otk_subscriptions").upsert(record, { onConflict: "user_id" });
  if (error) throw error;
  return record;
}

function subscriptionIsActive(record: Json | null, allowSandbox = allowSandboxLicenses) {
  if (!record) return false;
  if (String(record.environment || "production") === "sandbox" && !allowSandbox) return false;
  const status = String(record.status || "");
  if (["active", "trialing", "grace"].includes(status)) return true;
  if (!["canceled", "billing_issue"].includes(status)) return false;
  const periodEnd = Date.parse(String(record.current_period_end || ""));
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const headers = headersFor(origin);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...headers, "Content-Type": "application/json" } });
  try {
    if (origin && !allowedOrigins.includes(origin)) return json({ code: "OTK_ACCESS" }, 403);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json({ code: "OTK_BILLING_REQUEST" }, 405);

    const queryAction = new URL(req.url).searchParams.get("action") || "";
    const raw = await req.text();
    let requestBody: Json = {};
    if (queryAction === "webhook" && !await validWebhook(req, raw)) return json({ code: "OTK_BILLING_SIGNATURE" }, 401);
    try { requestBody = raw ? JSON.parse(raw) as Json : {}; } catch { return json({ code: "OTK_BILLING_JSON" }, 400); }
    const action = queryAction || String(requestBody.action || "refresh");
    if (action === "webhook") {
      if (!entitlementId || !revenueCatKey) return json({ code: "OTK_BILLING_SETUP" }, 503);
      if (queryAction !== "webhook") return json({ code: "OTK_BILLING_SIGNATURE" }, 401);
      const payload = requestBody;
      const event = (payload.event || {}) as Json;
      const eventId = String(event.id || "");
      if (!eventId) return json({ code: "OTK_BILLING_EVENT" }, 400);
      const candidates = [event.app_user_id, event.original_app_user_id, ...((event.aliases as unknown[]) || []),
        ...((event.transferred_to as unknown[]) || []), ...((event.transferred_from as unknown[]) || [])]
        .map(uuid).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
      const processed: string[] = [];
      for (const userId of candidates) {
        const { data } = await db.auth.admin.getUserById(userId);
        if (data.user) { await refresh(userId, event); processed.push(userId); }
      }
      const { error } = await db.from("otk_billing_events").upsert({ id: eventId.slice(0, 255), event_type: String(event.type || "UNKNOWN").slice(0, 120),
        user_id: processed[0] || null, environment: String(event.environment || "PRODUCTION").toLowerCase() === "sandbox" ? "sandbox" : "production" }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
      return json({ received: true });
    }

    const bearer = /^Bearer (.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
    if (!bearer) return json({ code: "OTK_AUTH" }, 401);
    const { data, error } = await db.auth.getUser(bearer);
    if (error || !data.user) return json({ code: "OTK_AUTH" }, 401);
    if (action === "session") {
      const { data: savedSubscription, error: subscriptionError } = await db.from("otk_subscriptions").select("*").eq("user_id", data.user.id).maybeSingle();
      if (subscriptionError) throw subscriptionError;
      // Webhooks keep existing entitlements current. A brand-new account has
      // no row yet, so perform one authoritative RevenueCat lookup to seed it;
      // heartbeats thereafter remain a small database-only request.
      const subscription = savedSubscription || (entitlementId && revenueCatKey ? await refresh(data.user.id) : null);
      // getUser() above verified the JWT signature. Prefer its server-issued
      // auth session id over the browser's installation id so a caller cannot
      // bypass the one-computer lease by editing local storage.
      const deviceId = verifiedSessionId(bearer) || uuid(requestBody.device_id);
      const deviceName = String(requestBody.device_name || "Computer").trim().slice(0, 120);
      if (!deviceId) return json({ code: "OTK_LICENSE_DEVICE" }, 400);
      const localSandboxTest = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) && /^(sk|rk)_test_/.test(env("STRIPE_TEST_SECRET_KEY"));
      if (!subscriptionIsActive(subscription, allowSandboxLicenses || localSandboxTest)) {
        return json({ subscription, session: { granted: false, reason: "subscription" } });
      }
      const { data: rows, error: claimError } = await db.rpc("otk_claim_license_session", {
        p_user_id: data.user.id,
        p_device_id: deviceId,
        p_device_name: deviceName || "Computer",
        p_lease_seconds: licenseLeaseSeconds,
      });
      if (claimError) throw claimError;
      const claim = Array.isArray(rows) ? rows[0] : rows;
      return json({ subscription, session: {
        granted: claim?.granted === true,
        reason: claim?.granted === true ? "" : "another_device",
        active_device_name: String(claim?.active_device_name || ""),
        lease_expires_at: claim?.active_lease_expires_at || null,
      } });
    }
    if (action !== "refresh") return json({ code: "OTK_BILLING_ACTION" }, 400);
    const { data: stripeSubscription, error: stripeReadError } = await db.from("otk_subscriptions").select("*").eq("user_id", data.user.id).eq("provider", "stripe").maybeSingle();
    if (stripeReadError) throw stripeReadError;
    if (stripeSubscription) return json({ subscription: stripeSubscription });
    if (!entitlementId || !revenueCatKey) {
      const { data: subscription, error } = await db.from("otk_subscriptions").select("*").eq("user_id", data.user.id).maybeSingle();
      if (error) throw error;
      return json({ subscription });
    }
    return json({ subscription: await refresh(data.user.id) });
  } catch (error) {
    console.error("otk-billing request failed", { name: error instanceof Error ? error.name : "Error" });
    return json({ code: "OTK_BILLING_FAILED" }, 502);
  }
});

