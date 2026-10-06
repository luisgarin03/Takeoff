export const DEFAULT_SCOPE_TERMS = Object.freeze([
  "fence", "fencing", "gate", "enclosure", "dumpster", "trash",
  "board-on-board", "privacy", "chain-link", "ornamental", "bollard",
  "backstop", "netting",
]);

export const FIND_HIGHLIGHT_COLORS = Object.freeze([
  "#f59e0b", "#06b6d4", "#d946ef", "#22c55e",
  "#8b5cf6", "#ef4444", "#3b82f6", "#84cc16",
]);

export function parseFindTerms(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[,;\n]+/);
  const seen = new Set();
  return source.map((term) => String(term).trim()).filter((term) => {
    const key = term.toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeFindSuggestions(value) {
  return parseFindTerms(Array.isArray(value) ? value.filter((term) => typeof term === "string").map((term) => term.slice(0, 100)) : DEFAULT_SCOPE_TERMS).slice(0, 40);
}

export function addFindSuggestions(current, additions) {
  return normalizeFindSuggestions([...normalizeFindSuggestions(current), ...parseFindTerms(additions)]);
}

export function removeFindSuggestion(current, term) {
  const key = String(term || "").toLocaleLowerCase();
  return normalizeFindSuggestions(current).filter((item) => item.toLocaleLowerCase() !== key);
}

// Search each PDF.js text item independently. This intentionally searches
// selectable/extractable PDF text, not pixels in scanned drawings.
export function findTextItemMatches(items, terms) {
  const needles = parseFindTerms(terms).map((term) => ({ term, folded: term.toLocaleLowerCase() }));
  const matches = [];
  for (let itemIndex = 0; itemIndex < (items || []).length; itemIndex++) {
    const raw = items[itemIndex]?.str;
    if (typeof raw !== "string" || !raw.trim()) continue;
    const text = raw.toLocaleLowerCase();
    for (const { term, folded } of needles) {
      let from = 0;
      while ((from = text.indexOf(folded, from)) !== -1) {
        matches.push({ itemIndex, term, start: from, length: folded.length });
        from += Math.max(1, folded.length);
      }
    }
  }
  return matches;
}

// The canvas keeps one normalized rectangle per text occurrence so every hit
// can still be highlighted. Navigation is page-oriented, though: estimators
// want to review each matching sheet once instead of stepping through every
// repeated word on that sheet. Map insertion order preserves PDF scan order.
export function groupFindMatchesByPage(matches) {
  const pages = [];
  const byKey = new Map();
  for (const match of matches || []) {
    if (!match || typeof match !== "object" || !String(match.key || "")) continue;
    let group = byKey.get(match.key);
    if (!group) {
      group = {
        key: match.key,
        file: match.file,
        page: match.page,
        hits: [],
        firstMatch: match,
        termCounts: new Map(),
      };
      byKey.set(match.key, group);
      pages.push(group);
    }
    group.hits.push(match);
    const term = String(match.term || "").trim();
    if (term) {
      const folded = term.toLocaleLowerCase();
      const current = group.termCounts.get(folded);
      if (current) current.count += 1;
      else group.termCounts.set(folded, { term, count: 1 });
    }
  }
  return pages.map(({ termCounts, ...group }) => ({
    ...group,
    matchCount: group.hits.length,
    terms: [...termCounts.values()],
  }));
}

export function stepFindPageIndex(current, direction, pageCount) {
  const count = Math.max(0, Math.trunc(Number(pageCount) || 0));
  if (!count) return -1;
  const index = Number.isInteger(current) && current >= 0 && current < count ? current : null;
  if (index == null) return direction < 0 ? count - 1 : 0;
  return (index + (direction < 0 ? -1 : 1) + count) % count;
}

// Build a stable search plan before any asynchronous PDF work begins. A
// page-scoped run snapshots the focused panel, so clicking another sheet while
// it scans cannot silently redirect the job to a different page.
/**
 * @param {Array<{ name?: string }>} sheets
 * @param {"all" | "page"} scope
 * @param {{ key?: string, file?: string, page?: number } | null} currentPage
 */
export function findSearchTargets(sheets, scope = "all", currentPage = null) {
  const loadedFiles = [];
  const seen = new Set();
  for (const sheet of sheets || []) {
    const file = String(sheet?.name || "").trim();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    loadedFiles.push(file);
  }
  if (scope !== "page") return loadedFiles.map((file) => ({ file, page: null, key: null }));

  const file = String(currentPage?.file || "").trim();
  const page = Math.trunc(Number(currentPage?.page));
  if (!file || !seen.has(file) || !Number.isInteger(page) || page < 1) return [];
  return [{ file, page, key: String(currentPage?.key || (page > 1 ? `${file}#${page}` : file)) }];
}

// Page-only searches are additive jobs: retain every completed highlight and
// add any new occurrences without drawing/counting the same PDF text run twice.
export function mergeFindMatches(current, additions) {
  const merged = [];
  const seen = new Set();
  for (const hit of [...(current || []), ...(additions || [])]) {
    if (!hit || typeof hit !== "object") continue;
    const occurrence = Number.isInteger(hit.itemIndex) && Number.isInteger(hit.start)
      ? `${hit.itemIndex}:${hit.start}:${hit.length}`
      : `${hit.x}:${hit.y}:${hit.w}:${hit.h}`;
    const signature = [hit.key, String(hit.term || "").toLocaleLowerCase(), occurrence].join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(hit);
  }
  return merged;
}

// Search jobs remain independently hideable/removable/colorable. Rendering,
// navigation, counts, and PDF export consume this deduplicated visible union.
// If two visible jobs own the same text occurrence, the earlier job supplies
// its color until it is hidden or removed, then the next owner takes over.
export function findVisibleMatches(jobs) {
  let visible = [];
  for (const job of jobs || []) {
    if (!job || job.visible === false) continue;
    const color = /^#[0-9a-f]{6}$/i.test(String(job.color || "")) ? job.color : FIND_HIGHLIGHT_COLORS[0];
    visible = mergeFindMatches(visible, (job.matches || []).map((hit) => ({ ...hit, color, findJobId: job.id })));
  }
  return visible;
}

// Download-this-page snapshots only the visible Find overlays for that sheet.
// The returned objects remain transient export input; they never enter saved
// markups or mutate the search results held by the canvas.
export function findHighlightsForPageExport(matches, sheetKey, enabled, activeKey = "") {
  if (!enabled || !String(sheetKey || "")) return [];
  return (matches || []).filter((hit) => {
    if (!hit || hit.key !== sheetKey) return false;
    const { x, y, w, h } = hit;
    return [x, y, w, h].every(Number.isFinite) && w > 0 && h > 0;
  }).map((hit) => ({ ...hit, active: hit.key === activeKey }));
}
