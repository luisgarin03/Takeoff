export const licenseRequired = (env = import.meta.env || {}) => String(env.VITE_REQUIRE_ACTIVE_LICENSE || "") === "1";
export const sandboxLicensesAllowed = (env = import.meta.env || {}) => String(env.VITE_ALLOW_SANDBOX_LICENSES || "") === "1";

export function hasActiveLicense(record, now = Date.now(), allowSandbox = false) {
  if (!record) return false;
  if (record.subscriptionEnvironment === "sandbox" && !allowSandbox) return false;
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
  if (!hasActiveLicense(record, now, allowSandbox) || session?.reason === "subscription") {
    return { readOnly: true, reason: "subscription", message: "This account has no active subscription. You can view and export projects; open your profile to subscribe.", subscription: record, session };
  }
  if (session?.granted !== true) {
    return { readOnly: true, reason: "another_device", message: `Another computer${session?.activeDeviceName ? ` (${session.activeDeviceName})` : ""} is using this license. This computer is read-only until that session ends.`, subscription: record, session };
  }
  return { readOnly: false, reason: "", message: "", subscription: record, session };
}

