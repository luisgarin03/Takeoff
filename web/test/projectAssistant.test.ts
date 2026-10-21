import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PROJECT_ASSISTANT_TOOL_DEFS,
  assistantProjectRevision,
  emptyProjectAssistant,
  executeProjectAssistantTool,
  responseToolDefinitions,
  sanitizeProjectAssistant,
  validateProjectAssistantToolCall,
} from "../src/lib/projectAssistant.js";
import { projectAssistantStatus, runProjectAssistant } from "../src/lib/projectAssistantClient.js";

const snapshot = () => ({
  project_id: "project-1", project_name: "Test", project_metadata: {}, client_info: null, units: "imperial", save_state: "saved",
  summary: { ok: true }, statistics: {}, audit: { unscaled_measured_pages: [] }, handoff: {}, files: [{ name: "Plans.pdf", pages: 1 }], pages: [{ key: "Plans.pdf", file: "Plans.pdf", page: 1 }],
  revisions: [], view: "canvas", active_file: "Plans.pdf", active_page: { key: "Plans.pdf" }, selection: null, open_sheets: [],
  sheet_bookmarks: [], file_bookmarks: [], conditions: [{ id: "c1", finish_tag: "Fence", color: "#123456" }],
  shapes: [{ id: "m1", sheet_id: "Plans.pdf", condition_id: "c1", measure_role: "linear", computed: { perimeter_lf: 12.25 }, verts_norm: [[0, 0], [1, 1]] }],
  markups: [], rfis: [], condition_totals: [{ id: "c1", lf: 12.25, shape_count: 1 }], sheet_totals: [{ sheet_id: "Plans.pdf", rows: [{ id: "c1", lf: 12.25 }] }],
  material_totals: [], scales: [{ sheet_id: "Plans.pdf", units_per_px: 0.1 }], scale_audit: {}, whiteboard: { sows: [] }, sow_audit: { measurements_without_sow_items: [], sow_items_without_measurements: [] },
  whiteboard_summary: {}, fence_calculator: {}, chain_link_fences: [], compact_project: null,
});

const context = (overrides = {}) => ({
  scope: "current-page", allowedSheets: new Set(["Plans.pdf"]), allowedFiles: new Set(["Plans.pdf"]), snapshot,
  readPageText: async () => ({ sheet: "Plans.pdf", text: "fence" }), searchText: async () => ({ matches: [] }),
  navigate: async () => ({ navigated: true }), runFind: async () => ({ status: "completed" }), onProposal: () => {},
  ...overrides,
});

test("assistant registry exposes strict bounded schemas and permission classes", () => {
  const api = responseToolDefinitions();
  assert.equal(api.length, PROJECT_ASSISTANT_TOOL_DEFS.length);
  assert.ok(api.every((tool) => tool.strict === true && tool.parameters.additionalProperties === false));
  assert.ok(PROJECT_ASSISTANT_TOOL_DEFS.some((tool) => !tool.mutating));
  assert.ok(PROJECT_ASSISTANT_TOOL_DEFS.filter((tool) => tool.name.startsWith("propose_")).every((tool) => tool.mutating));
  assert.equal(validateProjectAssistantToolCall("get_measurement", { id: "m1", surprise: true }).valid, false);
  assert.equal(validateProjectAssistantToolCall("find_scope_keywords", { query: "fence", scope: "workspace" }).valid, false);
});

test("authoritative measurement output is returned unchanged and isolated by context", async () => {
  const result = await executeProjectAssistantTool(context(), "get_measurement_quantity", { id: "m1" });
  assert.deepEqual(result, { id: "m1", measure_role: "linear", computed: { perimeter_lf: 12.25 } });
  const blocked = await executeProjectAssistantTool(context({ allowedSheets: new Set() }), "get_measurement", { id: "m1" });
  assert.equal(blocked.measurement, null);
});

test("revision comparison is scoped to the entire project and delegates to the existing diff path", async () => {
  let compared: string[] = [];
  const blocked = await executeProjectAssistantTool(context(), "compare_project_revisions", { base_id: "r1", compare_id: "r2" });
  assert.match(blocked.error, /Entire project/);
  const result = await executeProjectAssistantTool(context({
    scope: "entire-project",
    compareRevisions: async (base: string, compare: string) => { compared = [base, compare]; return { diff: { conditions: [] } }; },
  }), "compare_project_revisions", { base_id: "r1", compare_id: "r2" });
  assert.deepEqual(compared, ["r1", "r2"]);
  assert.deepEqual(result, { diff: { conditions: [] } });
});

test("mutating tools create approval proposals without applying data", async () => {
  const proposals: any[] = [];
  const result = await executeProjectAssistantTool(context({ onProposal: (proposal: any) => proposals.push(proposal), projectRevision: () => "rev-1" }), "propose_bookmark_page", { sheet: "Plans.pdf" });
  assert.equal(result.status, "pending_user_approval");
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].project_revision, "rev-1");
  assert.deepEqual(snapshot().sheet_bookmarks, []);
});

test("project revision changes when measured project entities change", () => {
  const before = assistantProjectRevision(snapshot());
  const after = assistantProjectRevision({ ...snapshot(), shapes: [...snapshot().shapes, { id: "m2" }] });
  assert.notEqual(before, after);
  const edited = assistantProjectRevision({ ...snapshot(), shapes: snapshot().shapes.map((shape) => ({ ...shape, computed: { perimeter_lf: 13 } })) });
  assert.notEqual(before, edited);
});

test("conversation history is optional, bounded, and backward-compatible", () => {
  assert.deepEqual(sanitizeProjectAssistant(undefined), emptyProjectAssistant());
  const messages = Array.from({ length: 100 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `message ${index}`, ts: index }));
  const clean = sanitizeProjectAssistant({ persist: true, messages });
  assert.equal(clean.persist, true);
  assert.equal(clean.messages.length, 80);
  assert.equal(clean.messages[0].text, "message 20");
});

test("streaming client executes local tools and never sends a browser API key", async () => {
  const calls: string[] = [];
  const streamed = (events: any[]) => new Response(new ReadableStream({ start(controller) { const encoder = new TextEncoder(); for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); controller.close(); } }), { headers: { "content-type": "application/x-ndjson" } });
  const replies = [
    streamed([{ type: "response", output: [{ type: "function_call", call_id: "call-1", name: "get_project_summary", arguments: "{}" }] }]),
    streamed([{ type: "text_delta", delta: "Grounded " }, { type: "text_delta", delta: "answer" }, { type: "response", output: [{ type: "message", content: [{ type: "output_text", text: "Grounded answer" }] }] }]),
  ];
  const result = await runProjectAssistant({ token: "google-token", prompt: "Analyze", execute: async (name: string) => { calls.push(name); return { ok: true }; }, fetchFn: async () => replies.shift() as Response, onEvent: () => {} });
  assert.deepEqual(calls, ["get_project_summary"]);
  assert.equal(result.text, "Grounded answer");
  const clientSource = await readFile(new URL("../src/lib/projectAssistantClient.js", import.meta.url), "utf8");
  assert.doesNotMatch(clientSource, /OPENAI_API_KEY|sk-[A-Za-z0-9]/);
});

test("disabled assistant status remains a normal optional state", async () => {
  const status = await projectAssistantStatus({ fetchFn: async () => new Response(JSON.stringify({ configured: false }), { headers: { "content-type": "application/json" } }) });
  assert.equal(status.configured, false);
});

test("regular ChatGPT launchers stay separate from the API project assistant", async () => {
  const canvasSource = await readFile(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url), "utf8");
  const agentSource = await readFile(new URL("../src/components/AgentPanel.jsx", import.meta.url), "utf8");
  const panelSource = await readFile(new URL("../src/components/ProjectAssistantPanel.jsx", import.meta.url), "utf8");
  for (const source of [agentSource, panelSource]) {
    assert.match(source, /href="https:\/\/chatgpt\.com\/"/);
    assert.match(source, /target="_blank"/);
    assert.match(source, /rel="noopener noreferrer"/);
  }
  assert.match(agentSource, /Open ChatGPT ↗/);
  assert.match(agentSource, /Project Assistant/);
  assert.match(canvasSource, /onOpenProjectAssistant=\{\(\) => \{ setAgentOpen\(false\); setProjectAssistantOpen\(true\); \}\}/);
  assert.doesNotMatch(canvasSource, /project-assistant-launchers/);
});
