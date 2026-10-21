import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

const planEnv = Object.freeze({
  starter: "VITE_REVENUECAT_PACKAGE_STARTER",
  professional: "VITE_REVENUECAT_PACKAGE_PROFESSIONAL",
  business: "VITE_REVENUECAT_PACKAGE_BUSINESS",
});

let nativeSession = null;

export function revenueCatConfig(env = import.meta.env || {}, platform = Capacitor.getPlatform()) {
  const native = platform === "ios" || platform === "android";
  const apiKey = String(platform === "ios" ? env.VITE_REVENUECAT_IOS_API_KEY || "" : env.VITE_REVENUECAT_ANDROID_API_KEY || "").trim();
  const purchaseUrl = String(env.VITE_REVENUECAT_WEB_PURCHASE_URL || "").trim().replace(/\/$/, "");
  const manageUrl = String(env.VITE_REVENUECAT_MANAGE_URL || "").trim();
  const entitlementId = String(env.VITE_REVENUECAT_ENTITLEMENT_ID || "").trim();
  const packages = Object.fromEntries(Object.entries(planEnv).map(([plan, key]) => [plan, String(env[key] || "").trim()]));
  const validPurchaseUrl = /^https:\/\//i.test(purchaseUrl) ? purchaseUrl : "";
  const validManageUrl = /^https:\/\//i.test(manageUrl) ? manageUrl : "";
  return {
    platform, native, apiKey, entitlementId, packages,
    purchaseUrl: validPurchaseUrl, manageUrl: validManageUrl,
    checkoutConfigured: !!entitlementId && (native ? !!apiKey : !!validPurchaseUrl),
  };
}

function fromRow(row) {
  if (!row) return null;
  return {
    subscriptionStatus: row.status,
    subscriptionPlan: row.plan_id,
    subscriptionProvider: row.provider,
    subscriptionCustomerId: row.revenuecat_customer_id,
    subscriptionId: row.subscription_id,
    subscriptionCurrentPeriodEnd: row.current_period_end,
    subscriptionStore: row.store,
    subscriptionProductId: row.product_id,
    subscriptionWillRenew: row.will_renew,
    subscriptionEnvironment: row.environment,
  };
}

async function openExternal(url) {
  if (!/^https:\/\//i.test(url)) throw new Error("The subscription destination is not configured securely.");
  if (Capacitor.isNativePlatform()) return Browser.open({ url });
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) throw new Error("Allow pop-ups to open the secure subscription page.");
}

async function nativePurchases(config, userId) {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  if (!nativeSession || nativeSession.apiKey !== config.apiKey) {
    const { isConfigured } = await Purchases.isConfigured();
    if (!isConfigured) await Purchases.configure({ apiKey: config.apiKey, appUserID: userId });
    else await Purchases.logIn({ appUserID: userId });
    nativeSession = { apiKey: config.apiKey, userId };
  } else if (nativeSession.userId !== userId) {
    await Purchases.logIn({ appUserID: userId });
    nativeSession = { ...nativeSession, userId };
  }
  return Purchases;
}

export async function initializeRevenueCat(userId, env = import.meta.env || {}, platform = Capacitor.getPlatform()) {
  const config = revenueCatConfig(env, platform);
  if (!userId || !config.native || !config.apiKey || !config.entitlementId) return false;
  await nativePurchases(config, userId);
  return true;
}

async function refreshServer(client) {
  const { data, error } = await client.functions.invoke("otk-billing", { body: {} });
  if (error) throw error;
  return fromRow(data?.subscription || null);
}

async function claimServerSession(client, device) {
  const { data, error } = await client.functions.invoke("otk-billing", {
    body: { action: "session", device_id: device.deviceId, device_name: device.deviceName },
  });
  if (error) throw error;
  return {
    subscription: fromRow(data?.subscription || null),
    session: {
      granted: data?.session?.granted === true,
      reason: String(data?.session?.reason || ""),
      activeDeviceName: String(data?.session?.active_device_name || ""),
      leaseExpiresAt: data?.session?.lease_expires_at || null,
    },
  };
}

export function createRevenueCatBillingAdapter(client, env = import.meta.env || {}, platform = Capacitor.getPlatform()) {
  if (!client) return null;
  const config = revenueCatConfig(env, platform);
  return {
    configured: config.checkoutConfigured,
    canRestore: config.native && !!config.apiKey,
    async getPlans(userId) {
      if (!config.native || !config.apiKey) return null;
      const Purchases = await nativePurchases(config, userId);
      const offerings = await Purchases.getOfferings();
      const available = offerings.current?.availablePackages || [];
      return Object.entries(config.packages).map(([id, packageId]) => {
        const found = available.find((item) => item.identifier === packageId || item.product?.identifier === packageId);
        return found ? { id, price: found.product.price, currency: found.product.currencyCode, displayPrice: found.product.priceString } : null;
      }).filter(Boolean);
    },
    async getSubscription(userId) {
      const { data, error } = await client.from("otk_subscriptions").select("status,plan_id,provider,product_id,store,revenuecat_customer_id,subscription_id,current_period_end,will_renew,environment").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return fromRow(data);
    },
    async checkout(userId, planId) {
      if (!config.checkoutConfigured) throw new Error("Subscription checkout has not been configured for this build.");
      const packageId = config.packages[planId];
      if (!packageId) throw new Error(`The ${planId} store package has not been configured.`);
      if (config.native) {
        const Purchases = await nativePurchases(config, userId);
        const offerings = await Purchases.getOfferings();
        const packages = offerings.current?.availablePackages || [];
        const selected = packages.find((item) => item.identifier === packageId || item.product?.identifier === packageId);
        if (!selected) throw new Error("This subscription is not available from the App Store right now.");
        await Purchases.purchasePackage({ aPackage: selected });
        return refreshServer(client);
      }
      const target = new URL(`${config.purchaseUrl}/${encodeURIComponent(userId)}`);
      target.searchParams.set("package_id", packageId);
      await openExternal(target.href);
      return null;
    },
    async manageSubscription(userId) {
      if (config.native && config.apiKey) {
        const Purchases = await nativePurchases(config, userId);
        const { customerInfo } = await Purchases.getCustomerInfo();
        if (customerInfo.managementURL) return openExternal(customerInfo.managementURL);
      }
      if (config.manageUrl) return openExternal(config.manageUrl);
      throw new Error("Subscription management has not been configured for this store.");
    },
    async restorePurchases(userId) {
      if (!config.native || !config.apiKey) throw new Error("Purchase restore is available in the mobile app.");
      const Purchases = await nativePurchases(config, userId);
      await Purchases.restorePurchases();
      return refreshServer(client);
    },
    async refreshSubscription() {
      return refreshServer(client);
    },
    async claimLicenseSession(userId, device) {
      if (!userId || !device?.deviceId) throw new Error("A signed-in user and device are required.");
      return claimServerSession(client, device);
    },
  };
}

