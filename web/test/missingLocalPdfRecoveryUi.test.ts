import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a missing browser-stored PDF tells the user how to restore it", () => {
  assert.match(source, /\/PDF not found in local store:\/i\.test\(err\)/);
  assert.match(source, /To restore it, drag that PDF back into this page\./);
});
