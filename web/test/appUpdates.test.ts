import test from "node:test";
import assert from "node:assert/strict";
import { desktopUpdateApi, formatUpdateBytes, normalizeDesktopUpdateState } from "../src/lib/appUpdates.js";

test("desktop update state accepts only known phases and bounded progress", () => {
  const state = normalizeDesktopUpdateState({
    supported: true,
    currentVersion: "1.0.0",
    availableVersion: "1.1.0",
    phase: "downloading",
    percent: 140,
    transferred: -3,
    total: 1024,
  });
  assert.equal(state.supported, true);
  assert.equal(state.phase, "downloading");
  assert.equal(state.percent, 100);
  assert.equal(state.transferred, 0);
  assert.equal(state.total, 1024);
  assert.equal(normalizeDesktopUpdateState({ phase: "made-up" }).phase, "idle");
});

test("desktop update bridge is recognized only with the narrow expected surface", () => {
  const bridge = { getState() {}, onState() {} };
  assert.equal(desktopUpdateApi({ desktopUpdates: bridge }), bridge);
  assert.equal(desktopUpdateApi({ desktopUpdates: { getState() {} } }), null);
  assert.equal(desktopUpdateApi({}), null);
});

test("update byte labels remain compact", () => {
  assert.equal(formatUpdateBytes(0), "0 B");
  assert.equal(formatUpdateBytes(1024), "1.0 KB");
  assert.equal(formatUpdateBytes(5 * 1024 * 1024), "5.0 MB");
});
