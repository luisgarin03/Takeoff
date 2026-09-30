import test from "node:test";
import assert from "node:assert/strict";
import { addFindSuggestions, DEFAULT_SCOPE_TERMS, findTextItemMatches, normalizeFindSuggestions, parseFindTerms, removeFindSuggestion } from "../src/lib/findText.js";

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
