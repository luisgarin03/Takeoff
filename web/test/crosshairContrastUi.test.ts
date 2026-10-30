import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("drawing crosshair uses the dark blue guide treatment", () => {
  const guides = source.match(/ref=\{cross[HV]Ref\}[^\n]+background: "rgba\(10,27,92,\.88\)"/g) || [];
  assert.equal(guides.length, 2);
  assert.match(source, /rgba\(255,255,255,\.38\)/);
});
