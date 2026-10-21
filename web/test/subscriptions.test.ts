import test from "node:test";
import assert from "node:assert/strict";
import { createBillingService, SUBSCRIPTION_PLANS } from "../src/lib/subscriptions.js";

test("unconfigured billing never grants a paid subscription", async () => {
  const service = createBillingService();
  const user = { id: "signed-in-user" };
  assert.equal(await service.getSubscription(user), null);
  assert.deepEqual(await service.getPlans(user), SUBSCRIPTION_PLANS);
  assert.deepEqual(SUBSCRIPTION_PLANS.map((plan) => plan.price), [40, 50, 60]);
  for (const plan of SUBSCRIPTION_PLANS) {
    await assert.rejects(service.checkout(user, plan.id), /billing backend/);
    assert.equal(await service.getSubscription(user), null);
  }
  assert.equal(service.canManage, false);
  assert.equal(service.canRestore, false);
  assert.equal(service.canRefresh, false);
  assert.equal(service.canClaimSession, false);
  await assert.rejects(service.checkout(user, "invalid"), /Unknown/);
  await assert.rejects(service.getSubscription(null), /Sign in/);
  await assert.rejects(service.checkout(null, "starter"), /Sign in/);
  await assert.rejects(service.manageSubscription(user), /not available/);
  await assert.rejects(service.restorePurchases(user), /not available/);
});

test("billing delegates to the authenticated adapter without mutating its record", async () => {
  const record = Object.freeze({ subscriptionStatus: "active", subscriptionPlan: "professional", subscriptionPrice: 50 });
  const calls: unknown[] = [];
  const service = createBillingService({
    getSubscription: async (id: string) => { calls.push(["read", id]); return record; },
    getPlans: async (id: string) => { calls.push(["plans", id]); return [{ id: "professional", displayPrice: "$49.99" }]; },
    checkout: async (id: string, plan: string) => { calls.push(["checkout", id, plan]); },
    manageSubscription: async (id: string) => { calls.push(["manage", id]); },
    restorePurchases: async (id: string) => { calls.push(["restore", id]); },
    refreshSubscription: async (id: string) => { calls.push(["refresh", id]); return record; },
    claimLicenseSession: async (id: string, device: { deviceId: string }) => { calls.push(["session", id, device.deviceId]); return { subscription: record, session: { granted: true } }; },
  });
  const user = { id: "account-1" };
  assert.equal(await service.getSubscription(user), record);
  assert.equal((await service.getPlans(user) as unknown as ReadonlyArray<{ displayPrice?: string }>)[1].displayPrice, "$49.99");
  await service.checkout(user, "business");
  await service.manageSubscription(user);
  await service.restorePurchases(user);
  await service.refreshSubscription(user);
  const session = await service.claimLicenseSession(user, { deviceId: "device-1", deviceName: "Windows computer" });
  assert.equal((session.session as { granted: boolean }).granted, true);
  assert.equal(record.subscriptionPlan, "professional");
  assert.equal(service.canManage, true);
  assert.equal(service.canClaimSession, true);
  assert.deepEqual(calls, [["read", "account-1"], ["plans", "account-1"], ["checkout", "account-1", "business"], ["manage", "account-1"], ["restore", "account-1"], ["refresh", "account-1"], ["session", "account-1", "device-1"]]);
});
