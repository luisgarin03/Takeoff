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

export function sheetBookmarkGroups(openTabs, bookmarks, sheets) {
  const names = new Set(sheets.map((sheet) => sheet.name));
  // Closing a tab keeps its bookmark. Unavailable files stay saved but hidden,
  // like their takeoff data, so re-adding the PDF restores its bookmarks.
  const bookmarked = sanitizeSheetBookmarks(bookmarks)
    .filter((key) => names.has(parseSheetKey(key).file)).sort(compareSheetKeys);
  const starred = new Set(bookmarked);
  return { bookmarked, other: openTabs.filter((key) => !starred.has(key)) };
}
