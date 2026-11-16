import test from "node:test";
import assert from "node:assert/strict";
import { createStandaloneViewer } from "../src/features/fence3d/export.js";

test("standalone fence HTML shims import maps for iOS Safari and embeds its model bytes", () => {
  const html = createStandaloneViewer(new Uint8Array([0, 255, 17]), "Fence <preview>", [
    { title: "Rails", generated: "24 ft LF", manual: null },
  ]);

  assert.match(html, /es-module-shims@2\.8\.4/);
  assert.match(html, /type="importmap-shim"/);
  assert.match(html, /type="module-shim"/);
  assert.doesNotMatch(html, /type="importmap"/);
  assert.match(html, /decodeBase64\(encoded\)/);
  assert.match(html, /AP8R/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Quantities/);
});
