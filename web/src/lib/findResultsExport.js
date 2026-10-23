import { parseFindTerms } from "./findText.js";

export const FIND_RESULTS_SCHEMA_VERSION = "1.1";

function cleanString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function positiveInteger(value) {
  const number = Math.trunc(Number(value));
  return Number.isInteger(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function documentIdentity(value, fallbackIndex = 0) {
  return cleanString(value?.documentId)
    || cleanString(value?.documentKey)
    || `${cleanString(value?.fileName || value?.file) || "document"}\u0000${fallbackIndex}`;
}

function keywordCounter(searchTerms) {
  return Object.fromEntries(searchTerms.map((term) => [term, 0]));
}

function termKey(term) {
  return String(term || "").trim().toLocaleLowerCase();
}

function addKeywordCount(counts, canonicalTerms, term, amount = 1) {
  const key = termKey(term);
  const canonical = canonicalTerms.get(key) || cleanString(term);
  if (!canonical) return;
  if (!Object.prototype.hasOwnProperty.call(counts, canonical)) {
    Object.defineProperty(counts, canonical, { value: 0, writable: true, enumerable: true, configurable: true });
  }
  counts[canonical] += amount;
}

function categoriesForPage(page) {
  const text = [
    ...Object.entries(page.keywordCounts || {}).filter(([, count]) => count > 0).map(([term]) => term),
    ...(page.matches || []).map((match) => match.exactMatchedText || match.searchTerm || ""),
  ].join(" ").toLocaleLowerCase();
  const hasFence = /\bfenc(?:e|es|ing)\b/u.test(text);
  const has = (pattern) => pattern.test(text);
  return [
    ["fencing", hasFence],
    ["gates", has(/\bgates?\b/u)],
    ["ornamental_fence", hasFence && has(/\bornamental\b/u)],
    ["chain_link", has(/\bchain(?:\s+|[-–—])link\b/u) || (has(/\bchain\b/u) && has(/\blink\b/u))],
    ["wood_fence", hasFence && has(/\bwood\b/u)],
    ["guardrail", has(/\bguard(?:\s+|[-–—])rail\b|\bguardrail\b/u)],
    ["dumpster_enclosure", has(/\bdumpster\b/u) && has(/\benclosure\b/u)],
    ["security_fence", hasFence && has(/\bsecurity\b/u)],
    ["demolition", has(/\bdemolition\b|\bdemo\b/u)],
    ["temporary_fence", hasFence && has(/\btemporary\b/u)],
    ["tree_protection", has(/\btree\b/u) && has(/\bprotection\b/u)],
  ].filter(([, included]) => included).map(([category]) => category);
}

function normalizedBoundingBox(hit) {
  const x = finiteNumber(hit?.x);
  const y = finiteNumber(hit?.y);
  const width = finiteNumber(hit?.w);
  const height = finiteNumber(hit?.h);
  if ([x, y, width, height].some((value) => value == null) || width <= 0 || height <= 0) return null;
  return { x, y, width, height, coordinateSpace: "normalized_page" };
}

function pageDimensions(hit) {
  const width = finiteNumber(hit?.pageDimensions?.width ?? hit?.pageWidth);
  const height = finiteNumber(hit?.pageDimensions?.height ?? hit?.pageHeight);
  if (width == null || height == null || width <= 0 || height <= 0) return null;
  return { width, height, unit: cleanString(hit?.pageDimensions?.unit) || "pdf_points" };
}

function exportMatch(hit, fileName, documentId, pdfPage) {
  const sheetKey = cleanString(hit?.key || hit?.sheetKey);
  return {
    searchTerm: cleanString(hit?.term),
    exactMatchedText: cleanString(hit?.exactMatchedText),
    contextBefore: typeof hit?.contextBefore === "string" ? hit.contextBefore : null,
    contextAfter: typeof hit?.contextAfter === "string" ? hit.contextAfter : null,
    boundingBox: normalizedBoundingBox(hit),
    source: cleanString(hit?.source),
    pageReference: {
      documentId,
      fileName,
      pdfPage,
      sheetKey,
    },
  };
}

function filenameCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Build a deterministic, portable snapshot from one completed Find job.
 * The caller supplies the job captured by the scan; visible/highlight filters
 * are intentionally not accepted so they cannot alter export totals.
 * @param {{ job?: any, projectName?: string, sheetLabels?: Record<string, string>, exportedAt?: string }} options
 */
export function buildFindResultsExport({ job, projectName, sheetLabels = {}, exportedAt = new Date().toISOString() } = /** @type {any} */ ({})) {
  const searchTerms = parseFindTerms(job?.searchTerms || job?.terms || job?.query || "");
  const canonicalTerms = new Map(searchTerms.map((term) => [termKey(term), term]));
  const inputDocuments = Array.isArray(job?.documents) ? job.documents : [];
  const matches = Array.isArray(job?.matches) ? job.matches : [];
  const documentEntries = [];
  const documentsByIdentity = new Map();

  const ensureDocument = (value, fallbackIndex = documentEntries.length) => {
    const fileName = cleanString(value?.fileName || value?.file) || "Unknown PDF";
    const documentId = cleanString(value?.documentId);
    const identity = documentIdentity({ ...value, fileName }, fallbackIndex);
    let entry = documentsByIdentity.get(identity);
    if (!entry) {
      entry = {
        identity,
        fileName,
        documentId,
        totalPagesSearched: Math.max(0, Math.trunc(Number(value?.totalPagesSearched) || 0)),
        searchStatus: cleanString(value?.searchStatus) || "searched",
        keywordCounts: keywordCounter(searchTerms),
        pages: [],
        pageMap: new Map(),
      };
      documentsByIdentity.set(identity, entry);
      documentEntries.push(entry);
    }
    return entry;
  };

  inputDocuments.forEach((document, index) => ensureDocument(document, index));

  for (const hit of matches) {
    if (!hit || typeof hit !== "object") continue;
    const fileName = cleanString(hit.fileName || hit.file) || "Unknown PDF";
    const documentId = cleanString(hit.documentId);
    const hintedIdentity = documentIdentity({ documentId, documentKey: hit.documentKey, fileName }, documentEntries.length);
    let document = documentsByIdentity.get(hintedIdentity);
    if (!document && documentId) document = documentEntries.find((entry) => entry.documentId === documentId);
    if (!document) document = documentEntries.find((entry) => entry.fileName === fileName && !documentId);
    if (!document) document = ensureDocument({ fileName, documentId, documentKey: hit.documentKey }, documentEntries.length);

    const pdfPage = positiveInteger(hit.page || hit.pdfPage);
    if (!pdfPage) continue;
    const pageKey = `${document.identity}\u0000${pdfPage}`;
    let page = document.pageMap.get(pageKey);
    if (!page) {
      const sheetKey = cleanString(hit.key || hit.sheetKey);
      page = {
        fileName: document.fileName,
        documentId: document.documentId,
        pdfPage,
        sheetNumber: cleanString(hit.sheetNumber) || cleanString(sheetLabels[sheetKey]) || null,
        pageKey: sheetKey,
        pageDimensions: pageDimensions(hit),
        keywordCounts: keywordCounter(searchTerms),
        matches: [],
      };
      document.pageMap.set(pageKey, page);
      document.pages.push(page);
    } else {
      if (!page.sheetNumber) page.sheetNumber = cleanString(hit.sheetNumber) || cleanString(sheetLabels[page.pageKey]) || null;
      if (!page.pageDimensions) page.pageDimensions = pageDimensions(hit);
    }
    addKeywordCount(page.keywordCounts, canonicalTerms, hit.term);
    addKeywordCount(document.keywordCounts, canonicalTerms, hit.term);
    page.matches.push(exportMatch(hit, document.fileName, document.documentId, pdfPage));
  }

  const rankedPages = documentEntries.flatMap((document) => document.pages.map((page) => ({
    fileName: page.fileName,
    documentId: page.documentId,
    pdfPage: page.pdfPage,
    sheetNumber: page.sheetNumber,
    pageKey: page.pageKey,
    totalMatches: page.matches.length,
    keywordCounts: page.keywordCounts,
    categories: categoriesForPage(page),
    pageDimensions: page.pageDimensions,
    matches: page.matches,
  }))).sort((a, b) => b.totalMatches - a.totalMatches
    || filenameCompare(a.fileName, b.fileName)
    || a.pdfPage - b.pdfPage
    || filenameCompare(a.documentId, b.documentId))
    .map((page, index) => ({ rank: index + 1, ...page }));

  const pagesByDocument = new Map();
  for (const page of rankedPages) {
    const identity = documentEntries.find((entry) => entry.documentId
      ? entry.documentId === page.documentId
      : entry.fileName === page.fileName)?.identity;
    if (!identity) continue;
    const list = pagesByDocument.get(identity) || [];
    list.push({
      pdfPage: page.pdfPage,
      sheetNumber: page.sheetNumber,
      pageKey: page.pageKey,
      totalMatches: page.totalMatches,
      keywordCounts: page.keywordCounts,
      categories: page.categories,
    });
    pagesByDocument.set(identity, list);
  }

  const rankedDocuments = documentEntries.map((document) => ({
    fileName: document.fileName,
    documentId: document.documentId,
    totalMatches: document.pages.reduce((total, page) => total + page.matches.length, 0),
    matchingPages: document.pages.length,
    totalPagesSearched: document.totalPagesSearched,
    keywordCounts: document.keywordCounts,
    topPages: pagesByDocument.get(document.identity) || [],
  })).sort((a, b) => b.totalMatches - a.totalMatches
    || filenameCompare(a.fileName, b.fileName)
    || filenameCompare(a.documentId, b.documentId))
    .map((document, index) => ({ rank: index + 1, ...document }));

  return {
    schemaVersion: FIND_RESULTS_SCHEMA_VERSION,
    app: "OpenTakeoff",
    exportType: "find-search-results",
    projectName: cleanString(projectName) || "Untitled Project",
    exportedAt,
    searchTerms,
    summary: {
      pdfsSearched: rankedDocuments.length,
      matchingPages: rankedPages.length,
      totalMatches: rankedPages.reduce((total, page) => total + page.totalMatches, 0),
    },
    rankedPages,
    rankedDocuments,
  };
}

/** @param {string} projectName @param {Date | string | number} date */
export function findResultsFilename(projectName, date = new Date()) {
  const printableProjectName = Array.from(String(projectName || "Untitled Project"), (character) => character.charCodeAt(0) < 32 ? "-" : character).join("");
  const safeProjectName = printableProjectName
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim() || "Untitled Project";
  const parsed = date instanceof Date ? date : new Date(date);
  const day = Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
  return `${safeProjectName}_Find_Results_${day}.json`;
}
