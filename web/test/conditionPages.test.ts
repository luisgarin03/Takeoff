import assert from "node:assert/strict";
import test from "node:test";

import { conditionPageKeys } from "../src/lib/conditionPages.js";

test("condition pages are unique and follow loaded PDF and page order", () => {
  const pages = conditionPageKeys([
    { condition_id: "wood", sheet_id: "Details.pdf#3" },
    { condition_id: "chain", sheet_id: "Civil.pdf#7" },
    { condition_id: "chain", sheet_id: "Civil.pdf#2" },
    { condition_id: "chain", sheet_id: "Civil.pdf#2" },
    { condition_id: "chain", sheet_id: "Details.pdf" },
    { condition_id: "wood", sheet_id: "Civil.pdf#4" },
  ], ["Civil.pdf", "Details.pdf"]);

  assert.deepEqual(pages.get("chain"), ["Civil.pdf#2", "Civil.pdf#7", "Details.pdf"]);
  assert.deepEqual(pages.get("wood"), ["Civil.pdf#4", "Details.pdf#3"]);
  assert.equal(pages.has("unused"), false);
});

test("condition pages ignore incomplete shape references", () => {
  const pages = conditionPageKeys([
    { condition_id: "chain", sheet_id: "Civil.pdf" },
    { condition_id: "chain" },
    { sheet_id: "Civil.pdf#2" },
    {},
  ]);

  assert.deepEqual(pages.get("chain"), ["Civil.pdf"]);
  assert.equal(pages.size, 1);
});
