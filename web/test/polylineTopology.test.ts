import test from "node:test";
import assert from "node:assert/strict";
import { migrateLegacyPolylineGroups } from "../src/lib/polylineTopology.js";

const dimensions = new Map([["sheet", { width: 100, height: 100 }]]);

test("legacy runs with explicit coincident shared posts migrate to one editable Polyline", () => {
  const source = {
    id: "source", sheet_id: "sheet", measure_role: "linear",
    verts_norm: [[0, 0], [1, 0]], computed: { perimeter_lf: 100 },
  };
  const branch = {
    id: "branch", sheet_id: "sheet", measure_role: "linear",
    verts_norm: [[0.5, 0], [0.5, 1]], computed: { perimeter_lf: 100 },
  };
  const sourceFence = {
    id: "fence-source", shape_id: "source", sheet_id: "sheet", closed: false,
    markers: [{ id: "junction", path_t: 0.5 }], shared_posts: { junction: "shared-1" },
  };
  const branchFence = {
    id: "fence-branch", shape_id: "branch", sheet_id: "sheet", closed: false,
    markers: [], shared_posts: { "fence-branch-start": "shared-1" },
  };

  const migrated = migrateLegacyPolylineGroups([source, branch], [sourceFence, branchFence], dimensions);
  assert.equal(migrated.changed, true);
  assert.ok(migrated.shapes[0].polyline_group_id);
  assert.equal(migrated.shapes[0].polyline_group_id, migrated.shapes[1].polyline_group_id);
  assert.equal(migrated.shapes[0].polyline_node_ids[1], migrated.shapes[1].polyline_node_ids[0]);
  assert.deepEqual(migrated.shapes[0].verts_norm, [[0, 0], [0.5, 0], [1, 0]]);
  assert.deepEqual(migrated.shapes[1].verts_norm, branch.verts_norm);
  assert.equal(migrated.fences[0].shared_posts.junction, migrated.shapes[0].polyline_node_ids[1]);
});

test("unlinked Linear marks and divergent legacy junctions are left unchanged", () => {
  const source = { id: "source", sheet_id: "sheet", measure_role: "linear", verts_norm: [[0, 0], [1, 0]] };
  const branch = { id: "branch", sheet_id: "sheet", measure_role: "linear", verts_norm: [[0.5, 0.2], [0.5, 1]] };
  const fences = [
    { id: "fence-source", shape_id: "source", sheet_id: "sheet", markers: [{ id: "junction", path_t: 0.5 }], shared_posts: { junction: "shared-1" } },
    { id: "fence-branch", shape_id: "branch", sheet_id: "sheet", markers: [], shared_posts: { "fence-branch-start": "shared-1" } },
  ];
  const unlinked = migrateLegacyPolylineGroups([source], [], dimensions);
  assert.equal(unlinked.changed, false);
  assert.equal(unlinked.shapes[0], source);
  const divergent = migrateLegacyPolylineGroups([source, branch], fences, dimensions);
  assert.equal(divergent.changed, false);
  assert.equal(divergent.shapes[0], source);
  assert.equal(divergent.shapes[1], branch);
});
