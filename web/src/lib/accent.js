import { useSyncExternalStore } from "react";

const KEY = "opentakeoff_accent";
const normalize = (value) => /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
let current = null;
try { current = normalize(localStorage.getItem(KEY)); } catch { /* Session-only preference. */ }
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!current) {
    root.removeAttribute("data-custom-accent");
    root.style.removeProperty("--custom-accent");
    root.style.removeProperty("--custom-accent-contrast");
    return;
  }
  const channels = current.slice(1).match(/../g).map((hex) => parseInt(hex, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  root.style.setProperty("--custom-accent", current);
  root.style.setProperty("--custom-accent-contrast", luminance > 0.179 ? "#000000" : "#ffffff");
  root.setAttribute("data-custom-accent", "true");
}

export function setAccent(value) {
  current = normalize(value);
  apply();
  try {
    if (current) localStorage.setItem(KEY, current);
    else localStorage.removeItem(KEY);
  } catch { /* Still apply when storage is unavailable. */ }
  listeners.forEach((fn) => fn());
}

export const useAccent = () => useSyncExternalStore(subscribe, () => current, () => null);

apply();
if (typeof window !== "undefined") window.addEventListener("storage", (event) => {
  if (event.key !== KEY && event.key !== null) return;
  current = normalize(event.newValue);
  apply();
  listeners.forEach((fn) => fn());
});
