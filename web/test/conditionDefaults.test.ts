import assert from "node:assert/strict";
import test from "node:test";

import { FLOORING_DEFAULTS } from "../src/lib/canvasConstants.js";

test("fresh workspaces start with the three fence conditions", () => {
  assert.deepEqual(
    FLOORING_DEFAULTS.map((condition) => condition.finish_tag),
    ["Chain Link Fence", "Wood Fence", "Aluminum Fence"],
  );
});

test("starter fence conditions retain distinct visual treatments", () => {
  assert.equal(new Set(FLOORING_DEFAULTS.map((condition) => condition.color)).size, 3);
  assert.equal(new Set(FLOORING_DEFAULTS.map((condition) => condition.hatch)).size, 3);
});
