// Observational diagnostics only. This module never owns, schedules, or cancels a render.
const MAX_EVENTS = 80;
const state = {
  events: [], warnings: [], renders: { started: 0, completed: 0, cancelled: 0, errors: 0, active: 0, pending: 0, lastMs: 0, longestMs: 0, zoomTriggered: 0 },
  zoom: { current: 1, previous: 1, direction: "—", events: [], lastAt: 0, rendersAfter: 0 },
};
const listeners = new Set();
const tasks = new WeakMap();
const emit = () => listeners.forEach((fn) => fn());
const stamp = () => new Date().toLocaleTimeString();
export const diagnosticsSubscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const diagnosticsState = () => state;
export function diagnosticsEvent(type, text, warning = false) {
  state.events.unshift({ time: stamp(), type, text, at: performance.now() });
  if (state.events.length > MAX_EVENTS) state.events.length = MAX_EVENTS;
  if (warning) { state.warnings.unshift({ time: stamp(), text }); state.warnings.length = 12; }
  emit();
}
export function diagnosticsZoom(previous, current) {
  if (previous === current) return;
  state.zoom = { ...state.zoom, previous, current, direction: current < previous ? "out" : "in", lastAt: performance.now(), rendersAfter: 0 };
  state.zoom.events.push(performance.now());
  state.zoom.events = state.zoom.events.filter((at) => performance.now() - at < 1000);
  diagnosticsEvent("ZOOM", `${(previous * 100).toFixed(0)}% → ${(current * 100).toFixed(0)}%`);
}
export function diagnosticsRenderStart(task, label, scale) {
  const record = { at: performance.now(), settled: false, label, scale };
  tasks.set(task, record); state.renders.started++; state.renders.active++; state.renders.pending++;
  if (performance.now() - state.zoom.lastAt < 1500) { state.renders.zoomTriggered++; state.zoom.rendersAfter++; }
  diagnosticsEvent("PDF RENDER START", `${label}${scale ? ` · scale=${scale.toFixed(2)}` : ""}`);
  if (state.renders.active > 1) diagnosticsEvent("WARNING", `${state.renders.active} render operations active simultaneously`, true);
}
function settle(task, outcome, error) {
  const r = tasks.get(task); if (!r || r.settled) return; r.settled = true;
  state.renders.active = Math.max(0, state.renders.active - 1); state.renders.pending = Math.max(0, state.renders.pending - 1);
  const ms = performance.now() - r.at; state.renders.lastMs = ms; state.renders.longestMs = Math.max(state.renders.longestMs, ms);
  if (outcome === "complete") { state.renders.completed++; diagnosticsEvent("PDF RENDER COMPLETE", `${r.label} · ${Math.round(ms)}ms`); }
  else if (outcome === "cancel") { state.renders.cancelled++; diagnosticsEvent("RENDER CANCEL", `${r.label} · ${Math.round(ms)}ms`); }
  else { state.renders.errors++; diagnosticsEvent("ERROR", `${r.label}: ${String(error?.message || error || "render error")}`, true); }
  emit();
}
export const diagnosticsRenderComplete = (task) => settle(task, "complete");
export const diagnosticsRenderCancel = (task) => settle(task, "cancel");
export const diagnosticsRenderError = (task, error) => settle(task, error?.name === "RenderingCancelledException" ? "cancel" : "error", error);
export function diagnosticsClear() { state.events = []; state.warnings = []; emit(); }
