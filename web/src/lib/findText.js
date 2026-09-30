export const DEFAULT_SCOPE_TERMS = Object.freeze([
  "fence", "fencing", "gate", "enclosure", "dumpster", "trash",
  "board-on-board", "privacy", "chain-link", "ornamental", "bollard",
  "backstop", "netting",
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
