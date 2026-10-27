export const licenseRequired = (env = import.meta.env || {}) => String(env.VITE_REQUIRE_ACTIVE_LICENSE || "") === "1";
export const sandboxLicensesAllowed = (env = import.meta.env || {}, href = globalThis.location?.href || "") => {
  if (String(env.VITE_ALLOW_SANDBOX_LICENSES || "") === "1") return true;
  try { return env.DEV === true && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(href).hostname); }
  catch { return false; }
};

export function hasActiveLicense(record, now = Date.now(), allowSandbox = false) {
  if (!record) return false;
  if (record.subscriptionEnvironment === "sandbox" && !allowSandbox) return false;
  if (record.subscriptionProvider === "trial") return record.subscriptionStatus === "trialing" && Date.parse(record.subscriptionCurrentPeriodEnd || "") > now;
  if (["active", "trialing", "grace"].includes(record.subscriptionStatus)) return true;
  if (!["canceled", "billing_issue"].includes(record.subscriptionStatus)) return false;
  const end = Date.parse(record.subscriptionCurrentPeriodEnd || "");
  return Number.isFinite(end) && end > now;
}

/**
 * @param {{
 *   required?: boolean,
 *   offline?: boolean,
 *   serverError?: string,
 *   record?: Record<string, any> | null,
 *   session?: Record<string, any> | null,
 *   now?: number,
 *   allowSandbox?: boolean,
 * }} options
 */
export function resolveLicenseAccess({ required = true, offline = false, serverError = "", record = null, session = null,
  now = Date.now(), allowSandbox = false } = {}) {
  if (!required) return { readOnly: false, reason: "", message: "", subscription: record, session };
  if (offline) return { readOnly: true, reason: "offline", message: "No internet connection. You can view and export this project, but editing is disabled.", subscription: record, session: null };
  if (serverError) return { readOnly: true, reason: "server", message: "The license server is unavailable. Editing stays disabled until the connection is verified.", subscription: record, session: null };
  if (record?.subscriptionProvider === "trial" && !hasActiveLicense(record, now, allowSandbox)) {
    return { readOnly: true, reason: "trial_expired", message: "Your 30-day free trial has ended. Upgrade your membership to unlock all tools.", subscription: record, session };
  }
  if (!hasActiveLicense(record, now, allowSandbox) || session?.reason === "subscription") {
    return { readOnly: true, reason: "subscription", message: "This account has no active subscription. You can view and export projects; open your profile to subscribe.", subscription: record, session };
  }
  if (session?.granted !== true) {
    return { readOnly: true, reason: "another_device", message: `Another computer${session?.activeDeviceName ? ` (${session.activeDeviceName})` : ""} is using this license. This computer is read-only until that session ends.`, subscription: record, session };
  }
  return { readOnly: false, reason: "", message: "", subscription: record, session };
}


// Only a server-verified membership and granted editing lease can leave preview
// mode or display PRO. Development full-access defaults are not an entitlement.
export function hasEditingMembership(access, allowSandbox = false) {
  return access?.readOnly === false && access?.session?.granted === true &&
    hasActiveLicense(access.subscription, Date.now(), allowSandbox);
}

export function trialDaysRemaining(record, now = Date.now()) {
  if (record?.subscriptionProvider !== 'trial') return null;
  const end = Date.parse(record.subscriptionCurrentPeriodEnd || '');
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 86400000)) : 0;
}
