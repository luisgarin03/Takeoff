import { Capacitor } from "@capacitor/core";
import { cloudError } from "./errors.js";
export const DRIVE_RETURN = "com.opentakeoff.app://drive-auth";
const PENDING = "otk:drive-return-workspace";

export function driveReturnResult(href) {
  const url = new URL(href), result = url.searchParams.get("otkDrive");
  if (!result) return null;
  return { error: result === "account" ? cloudError(new Error("OTK_DRIVE_ACCOUNT")).message
    : result === "failed" ? cloudError(new Error("OTK_DRIVE_CONSENT")).message : "" };
}
export function isDriveDeepLink(href) {
  try { const u = new URL(href); return u.protocol === "com.opentakeoff.app:" && u.hostname === "drive-auth" && !u.pathname && !u.username && !u.password && !u.port; }
  catch { return false; }
}
export async function connectDrive(drive) {
  const native = Capacitor.isNativePlatform();
  const { url } = await drive.connect(native ? DRIVE_RETURN : window.location.href);
  const parsed = new URL(url);
  if (parsed.origin !== "https://accounts.google.com" || parsed.pathname !== "/o/oauth2/v2/auth") throw cloudError(new Error("OTK_DRIVE_RETURN"));
  if (native) {
    // Non-secret workspace ID only; the server owns OAuth state, PKCE and tokens.
    localStorage.setItem(PENDING, new URLSearchParams(window.location.search).get("localProject") || "default");
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } else window.location.assign(url);
}
export async function listenForDriveReturn(onReturn, signal) {
  if (signal?.aborted) return () => {};
  const url = new URL(window.location.href), returned = driveReturnResult(url.href);
  if (returned) {
    url.searchParams.delete("otkDrive"); window.history.replaceState(window.history.state, "", url.href); onReturn(returned);
  }
  if (!Capacitor.isNativePlatform()) return () => {};
  const { App } = await import("@capacitor/app");
  if (signal?.aborted) return () => {};
  const receive = async ({ url: href }) => {
    if (signal?.aborted || !isDriveDeepLink(href)) return;
    const pending = localStorage.getItem(PENDING);
    if (pending == null) return;
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => {});
    // A superseded React mount must not consume the cold-start callback.
    if (signal?.aborted || localStorage.getItem(PENDING) == null) return;
    localStorage.removeItem(PENDING);
    const result = driveReturnResult(href) || { error: "" };
    const current = new URLSearchParams(window.location.search).get("localProject") || "default";
    if (pending !== current && (pending === "default" || /^[0-9a-f-]{36}$/i.test(pending))) {
      const next = new URL(window.location.pathname, window.location.origin);
      if (pending !== "default") next.searchParams.set("localProject", pending);
      next.searchParams.set("otkDrive", new URL(href).searchParams.get("otkDrive") || "1");
      window.location.replace(next.href);
    } else onReturn(result);
  };
  const listener = await App.addListener("appUrlOpen", receive);
  const launched = await App.getLaunchUrl();
  if (launched) await receive(launched);
  return () => listener.remove();
}
