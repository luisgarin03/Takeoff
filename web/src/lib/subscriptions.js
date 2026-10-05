// Display catalog only. A future server must map these IDs to provider prices.
export const SUBSCRIPTION_PLANS = Object.freeze([
  Object.freeze({ id: "starter", name: "Starter", price: 40, interval: "month", currency: "USD" }),
  Object.freeze({ id: "professional", name: "Professional", price: 50, interval: "month", currency: "USD" }),
  Object.freeze({ id: "business", name: "Business", price: 60, interval: "month", currency: "USD" }),
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
 * @property {(userId: string, planId: string) => Promise<unknown>} checkout
 * @property {(userId: string) => Promise<unknown>} [manageSubscription]
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
    configured: !!adapter,
    canManage: typeof adapter?.manageSubscription === "function",
    async getSubscription(user) {
      requireUser(user);
      return adapter ? adapter.getSubscription(user.id) : null;
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
  };
}
export const billingService = createBillingService();
export const monthlyPrice = (price) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(price);
