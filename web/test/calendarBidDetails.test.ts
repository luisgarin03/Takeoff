import test from "node:test";
import assert from "node:assert/strict";
import { bidDescription, normalizeBidDetails, parseBidDetails } from "../src/lib/calendarBidDetails.js";
import { metadataPayload, normalizeProjectMetadata } from "../src/lib/projectMetadata.js";
test("bid fields and multiline meeting notes survive event description storage", () => {
  const details = normalizeBidDetails({ project: "Library", contact: "Estimator\nestimator@example.com", documents: "https://example.com/plans", notes: "Site visit\nCheck access" });
  assert.deepEqual(parseBidDetails(bidDescription(details)), details);
});
test("project bid details survive metadata normalization and export", () => {
  const details = normalizeBidDetails({ client: "General contractor", amount: "$12,000" });
  const metadata = normalizeProjectMetadata({ project_metadata: { name: "Library", bidDetails: details } });
  assert.deepEqual(metadataPayload(metadata).bidDetails, details);
  assert.equal(normalizeBidDetails({ notes: {}, client: null }).notes, "");
});
