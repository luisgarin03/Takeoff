import { useSyncExternalStore } from "react";
export const LOGO_DEFAULTS = { effect: "shimmer", color: "#8da8ff", second: "#ef8dce", speed: 50, brightness: 100 };
const key = "opentakeoff.logo-style.v1";
export function normalizeLogoSettings(value = {}) {
  const color = (v, fallback) => /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  const number = (v, fallback, min, max) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return { effect: ["shimmer", "solid", "pulse", "morph", "rainbow"].includes(value?.effect) ? value.effect : LOGO_DEFAULTS.effect,
    color: color(value?.color, LOGO_DEFAULTS.color), second: color(value?.second, LOGO_DEFAULTS.second),
    speed: number(value?.speed, 50, 0, 100), brightness: number(value?.brightness, 100, 30, 150) };
}
let current = LOGO_DEFAULTS;
try { current = normalizeLogoSettings(JSON.parse(localStorage.getItem(key))); } catch { /* Defaults when storage is unavailable. */ }
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setLogoSettings(value) {
  current = normalizeLogoSettings(value);
  try { localStorage.setItem(key, JSON.stringify(current)); } catch { /* Still preview in this session. */ }
  listeners.forEach((fn) => fn());
}
export const useLogoSettings = () => useSyncExternalStore(subscribe, () => current, () => LOGO_DEFAULTS);
