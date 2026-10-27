// Display catalog only. A future server must map these IDs to provider prices.
export const SUBSCRIPTION_PLANS = Object.freeze([
  Object.freeze({ id: "estimating_pro_monthly", name: "Estimating Pro", billingLabel: "Monthly", price: 40, interval: "month", currency: "USD" }),
  Object.freeze({ id: "estimating_pro_yearly", name: "Estimating Pro", billingLabel: "Yearly", price: 400, interval: "year", currency: "USD" }),
]);

/**
 * @typedef {Object} SubscriptionRecord
 * @property {string} subscriptionStatus
 * @property {string} subscriptionPlan
 * @property {number} [subscriptionPrice]
 * @property {string} [subscriptionInterval]
 * @property {string} [subscriptionProvider]
 * @property {string} [subscriptionCustomerId]
 * @property {string} [subscriptionId]
 * @property {string} [subscriptionCurrentPeriodEnd]
 *
 * @typedef {Object} BillingAdapter
 * @property {(userId: string) => Promise<SubscriptionRecord|null>} getSubscription
 * @property {(userId: string) => Promise<Array<Object>|null>} [getPlans]
 * @property {(userId: string, planId: string) => Promise<unknown>} checkout
 * @property {(userId: string) => Promise<unknown>} [manageSubscription]
 * @property {(userId: string) => Promise<unknown>} [restorePurchases]
 * @property {(userId: string) => Promise<SubscriptionRecord|null>} [refreshSubscription]
 * @property {(userId: string, device: {deviceId: string, deviceName: string}) => Promise<{subscription: SubscriptionRecord|null, session: Object}>} [claimLicenseSession]
 */

/**
 * Provider adapter: getSubscription(userId), checkout(userId, planId),
 * and optional manageSubscription(userId). All must use authenticated endpoints.
 * getSubscription returns null or a server-owned record with subscriptionStatus,
 * subscriptionPlan, subscriptionPrice, subscriptionInterval, subscriptionProvider,
 * subscriptionCustomerId, subscriptionId, subscriptionCurrentPeriodEnd.
 * Never use editable user_metadata or local storage as billing authority.
 * @param {BillingAdapter|null} adapter
 */
export function createBillingService(adapter = null) {
  const requireUser = (user) => { if (!user?.id) throw new Error("Sign in to view your subscription."); };
  return {
    configured: !!adapter && adapter.configured !== false,
    canManage: typeof adapter?.manageSubscription === "function",
    canRestore: typeof adapter?.restorePurchases === "function" && adapter.canRestore !== false,
    canRefresh: typeof adapter?.refreshSubscription === "function",
    canClaimSession: typeof adapter?.claimLicenseSession === "function",
    async getSubscription(user) {
      requireUser(user);
      return adapter ? adapter.getSubscription(user.id) : null;
    },
    async getPlans(user) {
      requireUser(user);
      const live = adapter?.getPlans ? await adapter.getPlans(user.id) : null;
      if (!Array.isArray(live)) return SUBSCRIPTION_PLANS;
      return SUBSCRIPTION_PLANS.map((plan) => ({ ...plan, ...(live.find((item) => item?.id === plan.id) || {}) }));
    },
    async checkout(user, planId) {
      requireUser(user);
      if (!SUBSCRIPTION_PLANS.some((plan) => plan.id === planId)) throw new Error("Unknown subscription plan.");
      if (!adapter) throw new Error("Checkout is not available yet. A billing backend and payment provider must be connected.");
      return adapter.checkout(user.id, planId);
    },
    async manageSubscription(user) {
      requireUser(user);
      if (!adapter?.manageSubscription) throw new Error("Subscription management is not available yet.");
      return adapter.manageSubscription(user.id);
    },
    async restorePurchases(user) {
      requireUser(user);
      if (!adapter?.restorePurchases) throw new Error("Purchase restore is not available on this device.");
      return adapter.restorePurchases(user.id);
    },
    async refreshSubscription(user) {
      requireUser(user);
      return adapter?.refreshSubscription ? adapter.refreshSubscription(user.id) : adapter?.getSubscription(user.id) || null;
    },
    async claimLicenseSession(user, device) {
      requireUser(user);
      if (!adapter?.claimLicenseSession) throw new Error("This build cannot verify an editing session.");
      return adapter.claimLicenseSession(user.id, device);
    },
  };
}
export const billingService = createBillingService();
export const monthlyPrice = (price) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
