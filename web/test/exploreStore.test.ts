import { test } from "node:test";
import assert from "node:assert/strict";
import { createExploreStore } from "../src/lib/exploreStore.js";
import { setActiveStore, setProjectWritesBlocked, store } from "../src/lib/store.js";

test("preview PDFs load in memory while all project writes stay blocked", async () => {
  const preview = createExploreStore();
  setActiveStore(preview); setProjectWritesBlocked(true);
  try {
    const file = new File(["%PDF-preview"], "sample.pdf", { type: "application/pdf" });
    await store.openViewPdf(file, { mode: "compatible" }, null);
    assert.deepEqual(await store.listSheets(), [{ name: "sample.pdf" }]);
    const bytes = await store.loadPdfData("sample.pdf");
    assert.equal(new TextDecoder().decode(bytes), "%PDF-preview");
    bytes[0] = 0;
    assert.equal(new TextDecoder().decode(await store.loadPdfData("sample.pdf")), "%PDF-preview");
    await assert.rejects(store.saveAnnotations({ shapes: ["edit"] }), (error: any) => error.code === "OTK_READ_ONLY");
    await assert.rejects(preview.saveAnnotations(), (error: any) => error.code === "OTK_READ_ONLY");
    await assert.rejects(store.addPdf(file), (error: any) => error.code === "OTK_READ_ONLY");
    assert.deepEqual((await store.loadAnnotations()).shapes, []);
    assert.deepEqual(await createExploreStore().listSheets(), []);
  } finally { setProjectWritesBlocked(false); setActiveStore(); }
});
