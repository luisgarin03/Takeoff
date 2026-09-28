import test from "node:test";
import assert from "node:assert/strict";
import { PROJECT_STATUSES, createProjectMetadata, metadataPayload, normalizeProjectMetadata, preserveUnknownProjectFields, touchProjectMetadata, validateProjectDraft } from "../src/lib/projectMetadata.js";

test("creating a project validates, defaults status, and stamps ISO dates", () => {
  const meta = createProjectMetadata({ name: "  Bid Center  ", submissionDate: "" }, "2026-09-28T12:00:00.000Z");
  assert.deepEqual(meta, { name: "Bid Center", submissionDate: "", status: "Ongoing", createdAt: "2026-09-28T12:00:00.000Z", lastModifiedAt: "2026-09-28T12:00:00.000Z" });
});

test("project name is required and submission date is optional", () => {
  assert.equal(validateProjectDraft({ name: "   " }).valid, false);
  assert.equal(validateProjectDraft({ name: "A", submissionDate: "" }).valid, true);
  assert.equal(validateProjectDraft({ name: "A", submissionDate: "2026-10-15" }).valid, true);
});

test("every supported status round-trips", () => {
  for (const status of PROJECT_STATUSES) {
    const meta = createProjectMetadata({ name: "A", status }, "2026-09-28T12:00:00Z");
    assert.equal(normalizeProjectMetadata({ project_metadata: metadataPayload(meta) }).status, status);
  }
});

test("metadata serializes and restores all portable fields", () => {
  const meta = createProjectMetadata({ name: "Airport", submissionDate: "2026-11-03", status: "Needs revision" }, "2026-09-28T12:00:00Z");
  assert.deepEqual(normalizeProjectMetadata({ project_name: meta.name, project_metadata: metadataPayload(meta) }), meta);
});

test("last modified advances only when explicitly touched", () => {
  const original = createProjectMetadata({ name: "A" }, "2026-09-28T12:00:00Z");
  assert.equal(metadataPayload(original).lastModifiedAt, "2026-09-28T12:00:00.000Z");
  const touched = touchProjectMetadata(original, "2026-09-29T09:30:00Z");
  assert.equal(touched.createdAt, original.createdAt);
  assert.equal(touched.lastModifiedAt, "2026-09-29T09:30:00.000Z");
});

test("older saves without metadata load safely from project_name", () => {
  assert.deepEqual(normalizeProjectMetadata({ project_name: "Legacy job" }), { name: "Legacy job", submissionDate: "", status: "Ongoing", createdAt: "", lastModifiedAt: "" });
  assert.equal(normalizeProjectMetadata({}).status, "Ongoing");
});

test("unknown top-level fields are preserved separately for resave", () => {
  assert.deepEqual(preserveUnknownProjectFields({ schema: "v1", shapes: [], future_flag: { enabled: true } }), { future_flag: { enabled: true } });
});
