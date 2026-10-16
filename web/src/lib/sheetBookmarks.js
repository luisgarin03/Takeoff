import { compareSheetKeys, parseSheetKey } from "./sheetKey";

// Missing fields in older projects/revisions must clear, not inherit, bookmarks.
export function sanitizeSheetBookmarks(raw) {
  return Array.isArray(raw) ? [...new Set(raw.filter((key) => {
    if (typeof key !== "string" || !key.trim()) return false;
    const { page } = parseSheetKey(key);
    return Number.isSafeInteger(page) && page > 0;
  }))] : [];
}

export function toggleSheetBookmark(bookmarks, key) {
  if (!sanitizeSheetBookmarks([key]).length) return bookmarks;
  return bookmarks.includes(key) ? bookmarks.filter((k) => k !== key) : [...bookmarks, key];
}

// File favorites deliberately use their own persisted field. A page-1 sheet
// key is the bare PDF filename, so sharing `sheet_bookmarks` would make a file
// favorite indistinguishable from bookmarking the first page.
export function sanitizeFileBookmarks(raw) {
  return Array.isArray(raw) ? [...new Set(raw.filter((name) => typeof name === "string" && name.trim()))] : [];
}

export function toggleFileBookmark(bookmarks, name) {
  if (!sanitizeFileBookmarks([name]).length) return bookmarks;
  return bookmarks.includes(name) ? bookmarks.filter((item) => item !== name) : [...bookmarks, name];
}

export function fileBookmarkGroups(sheets, bookmarks) {
  const names = sheets.map((sheet) => sheet.name);
  const available = new Set(names);
  const starred = new Set(sanitizeFileBookmarks(bookmarks).filter((name) => available.has(name)));
  return { bookmarked: names.filter((name) => starred.has(name)), other: names.filter((name) => !starred.has(name)) };
}

export function sheetBookmarkGroups(openTabs, bookmarks, sheets) {
  const names = new Set(sheets.map((sheet) => sheet.name));
  // Closing a tab keeps its bookmark. Unavailable files stay saved but hidden,
  // like their takeoff data, so re-adding the PDF restores its bookmarks.
  const bookmarked = sanitizeSheetBookmarks(bookmarks)
    .filter((key) => names.has(parseSheetKey(key).file)).sort(compareSheetKeys);
  const starred = new Set(bookmarked);
  return { bookmarked, other: openTabs.filter((key) => !starred.has(key)) };
}
