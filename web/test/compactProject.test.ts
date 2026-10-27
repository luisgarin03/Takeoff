import test from "node:test";
import assert from "node:assert/strict";
import { compactPagesByFile, removeRestoredCompactFiles, sanitizeCompactProject } from "../src/lib/compactProject.js";

const hash = "a".repeat(64);

test("compact page selection unions measurements, markups, bookmarks and revisions by original file", () => {
  const pages = compactPagesByFile([
    {
      shapes: [{ sheet_id: "Plan.pdf#7" }],
      markups: [{ sheet_id: "Plan.pdf" }],
      chain_link_fences: [{ sheet_id: "Plan.pdf#7" }],
      rfis: [{ sheet_id: "Other.pdf#3" }],
      sheet_bookmarks: ["Plan.pdf#2"],
    },
    { shapes: [{ sheet_id: "Plan.pdf#9" }], markups: [], sheet_bookmarks: [] },
  ]);
  assert.deepEqual(pages.get("Plan.pdf"), [1, 2, 7, 9]);
  assert.deepEqual(pages.get("Other.pdf"), [3]);
});

test("compact recovery metadata is strict and removes restored files without losing the remainder", () => {
  const value = sanitizeCompactProject({
    version: 1,
    mode: "marked-pages-only",
    created_at: "2026-10-19T00:00:00.000Z",
    files: [
      { name: "A.pdf", original_size: 10, sha256: hash, included_pages: [3, 1, 3], page_count: 4 },
      { name: "B.pdf", original_size: 20, sha256: "b".repeat(64), included_pages: [] },
    ],
  });
  assert.deepEqual(value?.files[0].included_pages, [1, 3]);
  assert.deepEqual(removeRestoredCompactFiles(value, ["a.PDF"])?.files.map((file) => file.name), ["B.pdf"]);
  assert.equal(removeRestoredCompactFiles(value, ["A.pdf", "B.pdf"]), null);
  assert.equal(sanitizeCompactProject({ ...value, files: [{ name: "A.pdf", original_size: -1, sha256: hash, included_pages: [] }] }), null);
});
