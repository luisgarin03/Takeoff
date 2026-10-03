export const CURSOR_THEMES = ["default", "red", "blue", "pink", "orange", "purple", "green", "yellow"];
export const normalizeCursorTheme = (value) => CURSOR_THEMES.includes(value) ? value : "default";
export const CURSOR_ROLES = {
  default: "chrome.cur", pointer: "chrome-link.cur", text: "chrome-text.cur", crosshair: "chrome-crosshair.cur",
  move: "chrome-move.cur", grab: "chrome-move.cur", grabbing: "chrome-move.cur",
  wait: "chrome-busy-static.cur", progress: "chrome-working-static.cur", help: "chrome-help.cur",
  "not-allowed": "chrome-unavailable.cur", "no-drop": "chrome-unavailable.cur",
  "ns-resize": "chrome-vertical.cur", "ew-resize": "chrome-horizontal.cur",
  "nesw-resize": "chrome-nesw.cur", "nwse-resize": "chrome-nwse.cur",
  "col-resize": "chrome-horizontal.cur", "row-resize": "chrome-vertical.cur",
  "n-resize": "chrome-vertical.cur", "s-resize": "chrome-vertical.cur",
  "e-resize": "chrome-horizontal.cur", "w-resize": "chrome-horizontal.cur",
  "ne-resize": "chrome-nesw.cur", "sw-resize": "chrome-nesw.cur",
  "nw-resize": "chrome-nwse.cur", "se-resize": "chrome-nwse.cur",
};
export function getCursor(theme, role, base = "/") {
  const file = CURSOR_ROLES[role];
  if (!file) return role;
  const selected = normalizeCursorTheme(theme);
  const root = `${base.replace(/\/$/, "")}/cursors/`;
  return `url("${root}${selected}/${file}"), ${selected !== "default" ? `url("${root}default/${file}"), ` : ""}${role}`;
}
export function applyCursorTheme(theme) {
  if (typeof document === "undefined") return;
  const value = normalizeCursorTheme(theme);
  document.documentElement.dataset.cursorTheme = value;
  for (const role of Object.keys(CURSOR_ROLES)) document.documentElement.style.setProperty(`--cursor-${role}`, getCursor(value, role, import.meta.env?.BASE_URL || "/"));
}
