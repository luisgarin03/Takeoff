import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSheetBookmarks, toggleSheetBookmark, sheetBookmarkGroups } from "../src/lib/sheetBookmarks.js";

test("older or malformed projects reset bookmarks; valid keys deduplicate without renaming", () => {
  for (const input of [undefined, null, {}, "Plan.pdf", 1]) assert.deepEqual(sanitizeSheetBookmarks(input), []);
  assert.deepEqual(sanitizeSheetBookmarks(["Plan.pdf#2", null, "", " ", 7, "Plan.pdf", "Plan.pdf#2", "Plan.pdf#0", "Plan.pdf#99999999999999999999", "Set#A.pdf#3"]),
    ["Plan.pdf#2", "Plan.pdf", "Set#A.pdf#3"]);
});

test("toggling a bookmark is immutable and reversible", () => {
  const old = Object.freeze(["Plan.pdf"]);
  const starred = toggleSheetBookmark(old, "Plan.pdf#2");
  assert.deepEqual(starred, ["Plan.pdf", "Plan.pdf#2"]);
  assert.deepEqual(old, ["Plan.pdf"]);
  assert.deepEqual(toggleSheetBookmark(starred, "Plan.pdf#2"), old);
  assert.deepEqual(toggleSheetBookmark(old, "Plan.pdf"), []);
  assert.equal(toggleSheetBookmark(old, ""), old);
});

test("bookmarks group first in document order without changing tab order or duplicating pages", () => {
  const tabs = ["Plan.pdf#10", "Other.pdf", "Plan.pdf#2", "Plan.pdf"];
  const bookmarks = ["Plan.pdf#10", "Plan.pdf#2"];
  assert.deepEqual(sheetBookmarkGroups(tabs, bookmarks, [{ name: "Plan.pdf" }, { name: "Other.pdf" }]), {
    bookmarked: ["Plan.pdf#2", "Plan.pdf#10"], other: ["Other.pdf", "Plan.pdf"],
  });
  assert.deepEqual(tabs, ["Plan.pdf#10", "Other.pdf", "Plan.pdf#2", "Plan.pdf"]);
  assert.deepEqual(bookmarks, ["Plan.pdf#10", "Plan.pdf#2"]);
});

test("bookmarks survive closing a tab and hide unavailable PDFs until they return", () => {
  const bookmarks = ["Plan.pdf#2", "Closed.pdf"];
  assert.deepEqual(sheetBookmarkGroups(["Plan.pdf"], bookmarks, [{ name: "Plan.pdf" }]), {
    bookmarked: ["Plan.pdf#2"], other: ["Plan.pdf"],
  });
  assert.deepEqual(bookmarks, ["Plan.pdf#2", "Closed.pdf"]);
  assert.deepEqual(sheetBookmarkGroups([], bookmarks, [{ name: "Closed.pdf" }]).bookmarked, ["Closed.pdf"]);
  assert.deepEqual(sheetBookmarkGroups([], bookmarks, []), { bookmarked: [], other: [] });
});

test("bookmark keys distinguish same page numbers in different files and filenames with hashes", () => {
  const keys = ["Set#A.pdf#2", "Set#B.pdf#2"];
  assert.deepEqual(sheetBookmarkGroups(keys, [keys[1]], [{ name: "Set#A.pdf" }, { name: "Set#B.pdf" }]), {
    bookmarked: [keys[1]], other: [keys[0]],
  });
});

test("large sets include offscreen sheets; clearing bookmarks returns the original navigation order", () => {
  const tabs = Array.from({ length: 150 }, (_, i) => i ? `Plan.pdf#${i + 1}` : "Plan.pdf");
  const sheets = [{ name: "Plan.pdf" }];
  const bookmarks = [tabs[149], tabs[87], tabs[0]];
  const groups = sheetBookmarkGroups(tabs, bookmarks, sheets);
  assert.deepEqual(groups.bookmarked, [tabs[0], tabs[87], tabs[149]]);
  assert.equal(groups.other.length, 147);
  assert.equal(new Set([...groups.bookmarked, ...groups.other]).size, 150);
  assert.deepEqual(sheetBookmarkGroups(tabs, [], sheets), { bookmarked: [], other: tabs });
});
