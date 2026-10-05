import test from "node:test";
import assert from "node:assert/strict";
import { createBillingService, SUBSCRIPTION_PLANS } from "../src/lib/subscriptions.js";

test("unconfigured billing never grants a paid subscription", async () => {
  const service = createBillingService();
  const user = { id: "signed-in-user" };
  assert.equal(await service.getSubscription(user), null);
  assert.deepEqual(SUBSCRIPTION_PLANS.map((plan) => plan.price), [40, 50, 60]);
  for (const plan of SUBSCRIPTION_PLANS) {
    await assert.rejects(service.checkout(user, plan.id), /billing backend/);
    assert.equal(await service.getSubscription(user), null);
  }
  assert.equal(service.canManage, false);
  await assert.rejects(service.checkout(user, "invalid"), /Unknown/);
  await assert.rejects(service.getSubscription(null), /Sign in/);
  await assert.rejects(service.checkout(null, "starter"), /Sign in/);
  await assert.rejects(service.manageSubscription(user), /not available/);
});

test("billing delegates to the authenticated adapter without mutating its record", async () => {
  const record = Object.freeze({ subscriptionStatus: "active", subscriptionPlan: "professional", subscriptionPrice: 50 });
  const calls: unknown[] = [];
  const service = createBillingService({
    getSubscription: async (id: string) => { calls.push(["read", id]); return record; },
    checkout: async (id: string, plan: string) => { calls.push(["checkout", id, plan]); },
    manageSubscription: async (id: string) => { calls.push(["manage", id]); },
  });
  const user = { id: "account-1" };
  assert.equal(await service.getSubscription(user), record);
  await service.checkout(user, "business");
  await service.manageSubscription(user);
  assert.equal(record.subscriptionPlan, "professional");
  assert.equal(service.canManage, true);
  assert.deepEqual(calls, [["read", "account-1"], ["checkout", "account-1", "business"], ["manage", "account-1"]]);
});
