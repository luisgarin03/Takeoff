import test from "node:test";
import assert from "node:assert/strict";
import { hasActiveLicense, licenseRequired, resolveLicenseAccess, sandboxLicensesAllowed } from "../src/lib/license.js";
import { revenueCatConfig } from "../src/lib/revenueCatBilling.js";
import { getLicenseDeviceId, licenseDeviceName } from "../src/lib/licenseSession.js";
import { projectWritesAreBlocked, setProjectWritesBlocked, store } from "../src/lib/store.js";

test("license enforcement is explicit and defaults off", () => {
  assert.equal(licenseRequired({}), false);
  assert.equal(licenseRequired({ VITE_REQUIRE_ACTIVE_LICENSE: "0" }), false);
  assert.equal(licenseRequired({ VITE_REQUIRE_ACTIVE_LICENSE: "1" }), true);
  assert.equal(sandboxLicensesAllowed({}), false);
  assert.equal(sandboxLicensesAllowed({ VITE_ALLOW_SANDBOX_LICENSES: "1" }), true);
});

test("only server subscription states with remaining access unlock the app", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(hasActiveLicense({ subscriptionStatus: "active" }), true);
  assert.equal(hasActiveLicense({ subscriptionStatus: "trialing" }), true);
  assert.equal(hasActiveLicense({ subscriptionStatus: "canceled", subscriptionCurrentPeriodEnd: future }), true);
  assert.equal(hasActiveLicense({ subscriptionStatus: "billing_issue", subscriptionCurrentPeriodEnd: future }), true);
  assert.equal(hasActiveLicense({ subscriptionStatus: "canceled", subscriptionCurrentPeriodEnd: past }), false);
  assert.equal(hasActiveLicense({ subscriptionStatus: "expired", subscriptionCurrentPeriodEnd: future }), false);
  assert.equal(hasActiveLicense({ subscriptionStatus: "active", subscriptionEnvironment: "sandbox" }), false);
  assert.equal(hasActiveLicense({ subscriptionStatus: "active", subscriptionEnvironment: "sandbox" }, Date.now(), true), true);
  assert.equal(hasActiveLicense(null), false);
});

test("offline, unsubscribed and second-computer sessions are read-only", () => {
  const active = { subscriptionStatus: "active" };
  assert.equal(resolveLicenseAccess({ offline: true, record: active, session: { granted: true } }).reason, "offline");
  assert.equal(resolveLicenseAccess({ record: { subscriptionStatus: "inactive" }, session: { granted: false, reason: "subscription" } }).reason, "subscription");
  assert.equal(resolveLicenseAccess({ record: active, session: { granted: false, reason: "another_device", activeDeviceName: "Windows computer" } }).reason, "another_device");
  assert.equal(resolveLicenseAccess({ record: active, session: { granted: true } }).readOnly, false);
  assert.equal(resolveLicenseAccess({ required: false, offline: true }).readOnly, false);
});

test("RevenueCat configuration uses native IAP on iOS and HTTPS checkout on desktop", () => {
  const env = {
    VITE_REVENUECAT_IOS_API_KEY: "appl_public",
    VITE_REVENUECAT_ENTITLEMENT_ID: "opentakeoff_pro",
    VITE_REVENUECAT_WEB_PURCHASE_URL: "https://pay.rev.cat/live-token/",
    VITE_REVENUECAT_PACKAGE_STARTER: "$rc_monthly",
  };
  const ios = revenueCatConfig(env, "ios");
  assert.equal(ios.checkoutConfigured, true);
  assert.equal(ios.native, true);
  assert.equal(ios.apiKey, "appl_public");
  const desktop = revenueCatConfig(env, "web");
  assert.equal(desktop.checkoutConfigured, true);
  assert.equal(desktop.purchaseUrl, "https://pay.rev.cat/live-token");
  assert.equal(desktop.packages.starter, "$rc_monthly");
  assert.equal(revenueCatConfig({ ...env, VITE_REVENUECAT_WEB_PURCHASE_URL: "javascript:alert(1)" }, "web").checkoutConfigured, false);
});

test("editing sessions use one stable installation id without hardware fingerprinting", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => values.set(key, value) };
  let calls = 0;
  const cryptoApi = { randomUUID: () => { calls += 1; return "123e4567-e89b-42d3-a456-426614174000"; } };
  assert.equal(getLicenseDeviceId(storage as unknown as Storage, cryptoApi as unknown as Crypto), "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(getLicenseDeviceId(storage as unknown as Storage, cryptoApi as unknown as Crypto), "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(calls, 1);
  assert.equal(licenseDeviceName({ platform: "Win32", userAgent: "Desktop" } as unknown as Navigator), "Win32 computer");
});

test("read-only enforcement rejects persistence below the UI", async () => {
  setProjectWritesBlocked(true);
  try {
    assert.equal(projectWritesAreBlocked(), true);
    await assert.rejects(store.saveAnnotations({ conditions: [], shapes: [] }), (error: any) => error?.code === "OTK_READ_ONLY");
  } finally {
    setProjectWritesBlocked(false);
  }
  assert.equal(projectWritesAreBlocked(), false);
});

