import { Capacitor } from "@capacitor/core";
import { checked, CloudError } from "./errors.js";

const GOOGLE_RETURN = "otkGoogle";
const callbackFields = [GOOGLE_RETURN, "code", "error", "error_code", "error_description", "access_token", "refresh_token", "provider_token", "provider_refresh_token", "expires_in", "expires_at", "token_type", "type"];
const oauthReturns = new WeakMap();

export function googleSignInUnavailable(href = globalThis.location?.href || "", native = Capacitor.isNativePlatform()) {
  // This wrapper has no system-browser/deep-link bridge. Google blocks embedded WebViews.
  if (native) return "Google sign-in is not available in this Android app build. Use email and password, or open the web app in Chrome.";
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return "";
  } catch { /* No browser origin, for example a packaged file:// build. */ }
  return "Google sign-in needs the HTTPS web app or localhost. Email sign-in is still available.";
}

export function googleRedirectUrl(href, native = Capacitor.isNativePlatform()) {
  const unavailable = googleSignInUnavailable(href, native);
  if (unavailable) throw new CloudError("OTK_OAUTH_UNSUPPORTED", unavailable);
  const url = new URL(href);
  for (const key of callbackFields) url.searchParams.delete(key);
  url.hash = "";
  url.searchParams.set(GOOGLE_RETURN, "1");
  // Stay on the current origin/path and retain the localProject workspace.
  return url.href;
}

export function restoreGoogleReturn(client, href = window.location.href, replaceUrl = (url) => window.history.replaceState(window.history.state, "", url)) {
  // A PKCE code is single-use: StrictMode/remounts must share its one exchange.
  if (oauthReturns.has(client)) return oauthReturns.get(client);
  const url = new URL(href);
  if (url.searchParams.get(GOOGLE_RETURN) !== "1") return Promise.resolve(null);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error") || fragment.get("error");
  const hasError = denied || url.searchParams.has("error_code") || fragment.has("error_code");
  for (const key of callbackFields) { url.searchParams.delete(key); fragment.delete(key); }
  if (/[=&]/.test(url.hash)) url.hash = fragment.toString();
  const pending = Promise.resolve().then(async () => {
    // Remove credentials/errors before network work, retaining unrelated workspace parameters.
    replaceUrl(`${url.pathname}${url.search}${url.hash}`);
    if (hasError) return { error: denied === "access_denied" ? "Google sign-in was canceled. You can try again or use email and password." : "Google sign-in failed. Please try again or use email and password." };
    if (!code) return { error: "Google sign-in did not return a code. Check the Supabase redirect URL settings and try again." };
    try {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data?.session) throw new Error("No OAuth session");
      return { error: "" };
    } catch {
      return { error: "Google sign-in could not be completed. Try again in the same browser where you started. Your local work is safe." };
    }
  });
  oauthReturns.set(client, pending);
  return pending;
}

// Email codes work in Capacitor and browsers without redirect/deep-link plugins.
export function createAuth(client) {
  return {
    session: () => checked(client.auth.getSession()),
    subscribe: (fn) => { const { data } = client.auth.onAuthStateChange((_event, session) => fn(session)); return () => data.subscription.unsubscribe(); },
    signIn: (email, password) => checked(client.auth.signInWithPassword({ email, password })),
    signInWithGoogle: (href = window.location.href) => checked(client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: googleRedirectUrl(href) } })),
    signUp: (email, password, displayName) => checked(client.auth.signUp({ email, password, options: { data: { display_name: displayName } } })),
    signOut: () => checked(client.auth.signOut({ scope: "local" })),
    forgotPassword: (email) => checked(client.auth.resetPasswordForEmail(email)),
    verifyCode: (email, token, type) => checked(client.auth.verifyOtp({ email, token, type })),
    updatePassword: (password) => checked(client.auth.updateUser({ password })),
    async saveProfile(id, displayName) {
      const display_name = displayName.trim().slice(0, 120);
      await checked(client.from("otk_profiles").upsert({ id, display_name }));
      await checked(client.auth.updateUser({ data: { display_name } }));
    },
  };
}
