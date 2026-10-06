import test from "node:test";
import assert from "node:assert/strict";
import { addFindSuggestions, DEFAULT_SCOPE_TERMS, FIND_HIGHLIGHT_COLORS, findHighlightsForPageExport, findSearchTargets, findTextItemMatches, findVisibleMatches, groupFindMatchesByPage, mergeFindMatches, normalizeFindSuggestions, parseFindTerms, removeFindSuggestion, stepFindPageIndex } from "../src/lib/findText.js";

test("scope suggestions include the requested estimating terms", () => {
  assert.deepEqual(DEFAULT_SCOPE_TERMS, [
    "fence", "fencing", "gate", "enclosure", "dumpster", "trash",
    "board-on-board", "privacy", "chain-link", "ornamental", "bollard", "backstop", "netting",
  ]);
});

test("find query accepts comma, semicolon, and newline-separated terms without duplicates", () => {
  assert.deepEqual(parseFindTerms("Fence, gate; FENCE\ntrash"), ["Fence", "gate", "trash"]);
});

test("scope suggestions can be added, deduplicated, normalized, and removed", () => {
  assert.deepEqual(addFindSuggestions(["fence", "gate"], ["Dumpsters", "FENCE"]), ["fence", "gate", "Dumpsters"]);
  assert.deepEqual(removeFindSuggestion(["fence", "gate", "dumpster"], "GATE"), ["fence", "dumpster"]);
  assert.deepEqual(normalizeFindSuggestions(["  fence ", "FENCE", null, "chain-link"]), ["fence", "chain-link"]);
});

test("matches every requested term case-insensitively and records each occurrence", () => {
  const items = [{ str: "CHAIN-LINK FENCE; new fence" }, { str: "Trash enclosure" }];
  assert.deepEqual(findTextItemMatches(items, ["chain-link", "fence", "trash"]), [
    { itemIndex: 0, term: "chain-link", start: 0, length: 10 },
    { itemIndex: 0, term: "fence", start: 11, length: 5 },
    { itemIndex: 0, term: "fence", start: 22, length: 5 },
    { itemIndex: 1, term: "trash", start: 0, length: 5 },
  ]);
});

test("find matches group into pages with unique keyword counts in scan order", () => {
  const hits = [
    { key: "A.pdf", file: "A.pdf", page: 1, term: "Fence", x: .1 },
    { key: "A.pdf", file: "A.pdf", page: 1, term: "fence", x: .2 },
    { key: "A.pdf", file: "A.pdf", page: 1, term: "Gate", x: .3 },
    { key: "A.pdf#2", file: "A.pdf", page: 2, term: "Gate", x: .4 },
    { key: "B.pdf", file: "B.pdf", page: 1, term: "Privacy", x: .5 },
  ];
  const pages = groupFindMatchesByPage(hits);
  assert.deepEqual(pages.map((page) => page.key), ["A.pdf", "A.pdf#2", "B.pdf"]);
  assert.equal(pages[0].matchCount, 3);
  assert.deepEqual(pages[0].terms, [{ term: "Fence", count: 2 }, { term: "Gate", count: 1 }]);
  assert.equal(pages[0].firstMatch, hits[0]);
  assert.deepEqual(pages[0].hits, hits.slice(0, 3));
});

test("matching-page navigation wraps and handles an empty or unselected list", () => {
  assert.equal(stepFindPageIndex(-1, 1, 3), 0);
  assert.equal(stepFindPageIndex(-1, -1, 3), 2);
  assert.equal(stepFindPageIndex(2, 1, 3), 0);
  assert.equal(stepFindPageIndex(0, -1, 3), 2);
  assert.equal(stepFindPageIndex(0, 1, 0), -1);
});

test("find targets can cover every loaded PDF or only the focused current page", () => {
  const sheets = [{ name: "A.pdf" }, { name: "B.pdf" }, { name: "A.pdf" }];
  assert.deepEqual(findSearchTargets(sheets), [
    { file: "A.pdf", page: null, key: null },
    { file: "B.pdf", page: null, key: null },
  ]);
  assert.deepEqual(findSearchTargets(sheets, "page", { key: "B.pdf#7", file: "B.pdf", page: 7 }), [
    { file: "B.pdf", page: 7, key: "B.pdf#7" },
  ]);
  assert.deepEqual(findSearchTargets(sheets, "page", { key: "missing.pdf#2", file: "missing.pdf", page: 2 }), []);
  assert.deepEqual(findSearchTargets(sheets, "page", { key: "B.pdf", file: "B.pdf" }), []);
  assert.deepEqual(findSearchTargets(sheets, "page", { key: "B.pdf#bad", file: "B.pdf", page: Number.NaN }), []);
});

test("page-only results add to completed highlights without duplicating an existing hit", () => {
  const existing = [{ key: "A.pdf", file: "A.pdf", page: 1, term: "Fence", itemIndex: 8, start: 2, length: 5, x: .1, y: .2, w: .3, h: .04 }];
  const pageJob = [
    { ...existing[0], term: "fence", x: .10000001 },
    { key: "B.pdf#2", file: "B.pdf", page: 2, term: "Gate", x: .4, y: .5, w: .2, h: .05 },
    { ...existing[0], term: "Fence", length: 3, w: .2 },
  ];
  assert.deepEqual(mergeFindMatches(existing, pageJob), [existing[0], pageJob[1], pageJob[2]]);
  assert.equal(existing.length, 1);
});

test("completed find jobs can be colored, hidden, or removed independently", () => {
  const shared = { key: "A.pdf", file: "A.pdf", page: 1, term: "Fence", itemIndex: 2, start: 4, length: 5, x: .1, y: .2, w: .3, h: .04 };
  const jobs = [
    { id: "plans", visible: true, color: FIND_HIGHLIGHT_COLORS[0], matches: [shared] },
    { id: "page", visible: true, color: FIND_HIGHLIGHT_COLORS[1], matches: [shared, { ...shared, key: "B.pdf", file: "B.pdf", itemIndex: 3 }] },
  ];
  assert.deepEqual(findVisibleMatches(jobs).map(({ key, color, findJobId }) => ({ key, color, findJobId })), [
    { key: "A.pdf", color: FIND_HIGHLIGHT_COLORS[0], findJobId: "plans" },
    { key: "B.pdf", color: FIND_HIGHLIGHT_COLORS[1], findJobId: "page" },
  ]);
  assert.deepEqual(findVisibleMatches([{ ...jobs[0], visible: false }, jobs[1]]).map(({ key, color, findJobId }) => ({ key, color, findJobId })), [
    { key: "A.pdf", color: FIND_HIGHLIGHT_COLORS[1], findJobId: "page" },
    { key: "B.pdf", color: FIND_HIGHLIGHT_COLORS[1], findJobId: "page" },
  ]);
  assert.deepEqual(findVisibleMatches([jobs[0]]).map(({ key }) => key), ["A.pdf"]);
});

test("page export snapshots only visible, valid Find highlights for the current sheet", () => {
  const hits = [
    { key: "A.pdf#2", term: "fence", x: .1, y: .2, w: .3, h: .04 },
    { key: "B.pdf", term: "gate", x: .4, y: .5, w: .2, h: .05 },
    { key: "A.pdf#2", term: "bad", x: .2, y: .3, w: 0, h: .04 },
  ];
  const before = structuredClone(hits);

  assert.deepEqual(findHighlightsForPageExport(hits, "A.pdf#2", true, "A.pdf#2"), [
    { ...hits[0], active: true },
  ]);
  assert.deepEqual(findHighlightsForPageExport(hits, "A.pdf#2", false, "A.pdf#2"), []);
  assert.deepEqual(hits, before);
});
