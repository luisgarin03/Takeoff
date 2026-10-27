import test from "node:test";
import assert from "node:assert/strict";
import { buildFindResultsExport, findResultsFilename } from "../src/lib/findResultsExport.js";

const hit = (overrides: Record<string, unknown> = {}) => ({
  key: "Plans.pdf",
  file: "Plans.pdf",
  page: 1,
  term: "fence",
  exactMatchedText: "FENCE",
  contextBefore: "Install ",
  contextAfter: " at property line",
  source: "selectable_pdf_text",
  documentId: "doc-plans",
  documentKey: "doc-plans",
  pageDimensions: { width: 1224, height: 792, unit: "pdf_points" },
  x: .1,
  y: .2,
  w: .08,
  h: .025,
  ...overrides,
});

test("exports one PDF with stable schema, metadata, context, and navigation identifiers", () => {
  const payload = buildFindResultsExport({
    projectName: "Airport Fence",
    exportedAt: "2026-10-23T15:00:00.000Z",
    sheetLabels: { "Plans.pdf": "C-101" },
    job: {
      query: "fence, gate",
      documents: [{ fileName: "Plans.pdf", documentId: "doc-plans", documentKey: "doc-plans", totalPagesSearched: 3 }],
      matches: [hit(), hit({ term: "gate", exactMatchedText: "GATE", start: 4, x: .5 })],
    },
  });

  assert.equal(payload.schemaVersion, "1.1");
  assert.equal(payload.app, "OpenTakeoff");
  assert.equal(payload.exportType, "find-search-results");
  assert.equal(payload.projectName, "Airport Fence");
  assert.deepEqual(payload.searchTerms, ["fence", "gate"]);
  assert.deepEqual(payload.summary, { pdfsSearched: 1, matchingPages: 1, totalMatches: 2 });
  assert.equal(payload.rankedPages[0].sheetNumber, "C-101");
  assert.deepEqual(payload.rankedPages[0].pageDimensions, { width: 1224, height: 792, unit: "pdf_points" });
  assert.deepEqual(payload.rankedPages[0].keywordCounts, { fence: 1, gate: 1 });
  assert.ok(payload.rankedPages[0].categories.includes("fencing"));
  assert.ok(payload.rankedPages[0].categories.includes("gates"));
  assert.deepEqual(payload.rankedPages[0].matches[0].pageReference, {
    documentId: "doc-plans", fileName: "Plans.pdf", pdfPage: 1, sheetKey: "Plans.pdf",
  });
  assert.deepEqual(payload.rankedPages[0].matches[0].boundingBox, {
    x: .1, y: .2, width: .08, height: .025, coordinateSpace: "normalized_page",
  });
});

test("ranks pages and every searched PDF independently, including zero-match PDFs", () => {
  const payload = buildFindResultsExport({
    projectName: "Multi",
    job: {
      searchTerms: ["fence", "gate"],
      documents: [
        { fileName: "B.pdf", documentId: "doc-b", documentKey: "doc-b", totalPagesSearched: 5 },
        { fileName: "A.pdf", documentId: "doc-a", documentKey: "doc-a", totalPagesSearched: 8 },
        { fileName: "No Matches.pdf", documentId: "doc-zero", documentKey: "doc-zero", totalPagesSearched: 2 },
      ],
      matches: [
        hit({ key: "B.pdf#3", file: "B.pdf", page: 3, documentId: "doc-b", documentKey: "doc-b" }),
        hit({ key: "A.pdf#2", file: "A.pdf", page: 2, documentId: "doc-a", documentKey: "doc-a" }),
        hit({ key: "A.pdf#2", file: "A.pdf", page: 2, documentId: "doc-a", documentKey: "doc-a", term: "gate" }),
        hit({ key: "A.pdf#4", file: "A.pdf", page: 4, documentId: "doc-a", documentKey: "doc-a", term: "gate" }),
      ],
    },
  });

  assert.deepEqual(payload.rankedPages.map((page: { fileName: string; pdfPage: number; totalMatches: number }) => [page.fileName, page.pdfPage, page.totalMatches]), [
    ["A.pdf", 2, 2], ["A.pdf", 4, 1], ["B.pdf", 3, 1],
  ]);
  assert.deepEqual(payload.rankedDocuments.map((document: { fileName: string; totalMatches: number }) => [document.fileName, document.totalMatches]), [
    ["A.pdf", 3], ["B.pdf", 1], ["No Matches.pdf", 0],
  ]);
  assert.equal(payload.rankedDocuments[2].totalPagesSearched, 2);
  assert.deepEqual(payload.rankedDocuments[2].keywordCounts, { fence: 0, gate: 0 });
  assert.deepEqual(payload.rankedDocuments[2].topPages, []);
});

test("keeps duplicate filenames separate when the PDFs have distinct existing document IDs", () => {
  const payload = buildFindResultsExport({
    job: {
      query: "fence",
      documents: [
        { fileName: "Plans.pdf", documentId: "revision-a", totalPagesSearched: 1 },
        { fileName: "Plans.pdf", documentId: "revision-b", totalPagesSearched: 1 },
      ],
      matches: [
        hit({ documentId: "revision-a", documentKey: "revision-a" }),
        hit({ documentId: "revision-b", documentKey: "revision-b", key: "Plans.pdf#2", page: 2 }),
      ],
    },
  });

  assert.equal(payload.rankedDocuments.length, 2);
  assert.deepEqual(payload.rankedDocuments.map((document: { documentId: string }) => document.documentId), ["revision-a", "revision-b"]);
  assert.equal(payload.rankedPages.length, 2);
});

test("large cached result sets retain every occurrence without rescanning or truncating rankings", () => {
  const matches = Array.from({ length: 5_000 }, (_, index) => hit({
    key: `Plans.pdf#${Math.floor(index / 50) + 1}`,
    page: Math.floor(index / 50) + 1,
    itemIndex: index,
  }));
  const payload = buildFindResultsExport({
    job: {
      query: "fence",
      documents: [{ fileName: "Plans.pdf", documentId: "doc-plans", totalPagesSearched: 100 }],
      matches,
    },
  });

  assert.deepEqual(payload.summary, { pdfsSearched: 1, matchingPages: 100, totalMatches: 5_000 });
  assert.equal(payload.rankedPages.length, 100);
  assert.equal(payload.rankedPages.reduce((sum: number, page: { matches: unknown[] }) => sum + page.matches.length, 0), 5_000);
});

test("image-only and unavailable source fields are null rather than invented", () => {
  const payload = buildFindResultsExport({
    job: {
      query: "fence",
      documents: [{ fileName: "Scan.pdf", documentId: null, totalPagesSearched: 1 }],
      matches: [hit({
        key: "Scan.pdf", file: "Scan.pdf", documentId: null, documentKey: "scan", source: "local_ocr",
        exactMatchedText: undefined, contextBefore: undefined, contextAfter: undefined,
        pageDimensions: undefined, x: undefined, y: undefined, w: undefined, h: undefined,
      })],
    },
  });
  const page = payload.rankedPages[0];
  assert.equal(page.documentId, null);
  assert.equal(page.sheetNumber, null);
  assert.equal(page.pageDimensions, null);
  assert.equal(page.matches[0].exactMatchedText, null);
  assert.equal(page.matches[0].contextBefore, null);
  assert.equal(page.matches[0].boundingBox, null);
});

test("empty searches preserve searched-document totals and produce no ranked pages", () => {
  const payload = buildFindResultsExport({
    job: {
      query: "fence",
      documents: [{ fileName: "Empty.pdf", documentId: null, totalPagesSearched: 12 }],
      matches: [],
    },
  });
  assert.deepEqual(payload.summary, { pdfsSearched: 1, matchingPages: 0, totalMatches: 0 });
  assert.equal(payload.rankedPages.length, 0);
  assert.equal(payload.rankedDocuments[0].totalMatches, 0);
});

test("repeated and replaced searches export only the completed job passed by the caller", () => {
  const earlier = { query: "gate", documents: [{ fileName: "Old.pdf", documentId: "old", totalPagesSearched: 1 }], matches: [hit({ file: "Old.pdf", key: "Old.pdf", documentId: "old", term: "gate" })] };
  const latest = { query: "fence", documents: [{ fileName: "New.pdf", documentId: "new", totalPagesSearched: 1 }], matches: [hit({ file: "New.pdf", key: "New.pdf", documentId: "new" }), hit({ file: "New.pdf", key: "New.pdf", documentId: "new", itemIndex: 2 })] };
  buildFindResultsExport({ job: earlier });
  const payload = buildFindResultsExport({ job: latest });
  assert.deepEqual(payload.searchTerms, ["fence"]);
  assert.equal(payload.summary.totalMatches, 2);
  assert.deepEqual(payload.rankedDocuments.map((document: { fileName: string }) => document.fileName), ["New.pdf"]);
});

test("find-result filenames are dated and safe for local download", () => {
  assert.equal(findResultsFilename("River: House / Phase 1", "2026-10-23T18:15:00Z"), "River- House - Phase 1_Find_Results_2026-10-23.json");
});
