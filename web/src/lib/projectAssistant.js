// Secure ChatGPT Project Assistant primitives. The OpenAI credential never
// enters this module: the browser sends bounded conversation input to the
// server-side /ai/project-assistant endpoint and executes project tools here.

export const PROJECT_ASSISTANT_ENDPOINT = "/ai/project-assistant";
export const PROJECT_ASSISTANT_MAX_MESSAGES = 80;
export const PROJECT_ASSISTANT_MAX_TEXT = 20_000;
export const PROJECT_ASSISTANT_MAX_TOOL_CHARS = 24_000;
export const PROJECT_ASSISTANT_MAX_ITERATIONS = 12;

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = PROJECT_ASSISTANT_MAX_TEXT) => typeof value === "string" ? value.slice(0, max) : "";
const clone = (value) => JSON.parse(JSON.stringify(value ?? null));

export function emptyProjectAssistant() {
  return { version: 1, persist: false, messages: [] };
}

export function sanitizeProjectAssistant(value) {
  if (!object(value)) return emptyProjectAssistant();
  const messages = (Array.isArray(value.messages) ? value.messages : []).slice(-PROJECT_ASSISTANT_MAX_MESSAGES).flatMap((message) => {
    if (!object(message) || !["user", "assistant"].includes(message.role)) return [];
    const body = text(message.text).trim();
    if (!body) return [];
    return [{
      id: typeof message.id === "string" && message.id ? message.id.slice(0, 128) : crypto.randomUUID(),
      role: message.role,
      text: body,
      ts: Number.isFinite(message.ts) ? message.ts : Date.now(),
    }];
  });
  return { version: 1, persist: value.persist === true, messages };
}

const EMPTY_SCHEMA = { type: "object", properties: {}, required: [], additionalProperties: false };
const STRING_ID = { type: "string", minLength: 1, maxLength: 256 };
const PAGE_SCHEMA = {
  type: "object",
  properties: { sheet: { ...STRING_ID, description: "OpenTakeoff sheet key, for example Plans.pdf#3." } },
  required: ["sheet"],
  additionalProperties: false,
};
const ID_SCHEMA = {
  type: "object", properties: { id: STRING_ID }, required: ["id"], additionalProperties: false,
};
const QUERY_SCHEMA = {
  type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200 } }, required: ["query"], additionalProperties: false,
};

const read = (name, description, parameters = EMPTY_SCHEMA) => ({ name, description, parameters, mutating: false });
const propose = (name, description, properties, required) => ({
  name, description, mutating: true,
  parameters: { type: "object", properties, required, additionalProperties: false },
});

export const PROJECT_ASSISTANT_TOOL_DEFS = [
  read("get_project_summary", "Summarize the active OpenTakeoff project, its plans, measurements, SOW, RFIs, bookmarks, revisions, and compact-project status."),
  read("get_project_metadata", "Read project name, dates, status, client/job metadata, and units."),
  read("get_project_statistics", "Read counts of files, sheets, measurements, conditions, markups, RFIs, SOW panels, and bookmarks."),
  read("get_project_units", "Read the authoritative OpenTakeoff project unit system."),
  read("get_project_save_status", "Read whether the current project is saved, saving, or has unsaved changes."),
  read("list_project_files", "List PDF files loaded in the project, with page counts when known."),
  read("list_pdf_sets", "List PDF sets available within the assistant's approved context."),
  read("list_project_revisions", "List saved OpenTakeoff takeoff revisions."),
  read("compare_project_revisions", "Compare two saved OpenTakeoff revisions with the app's existing revision-diff engine. Available only with Entire project context.", {
    type: "object",
    properties: { base_id: STRING_ID, compare_id: STRING_ID },
    required: ["base_id", "compare_id"],
    additionalProperties: false,
  }),
  read("get_revision_summary", "Read the summary for one saved revision.", ID_SCHEMA),
  read("list_missing_compact_project_files", "List original PDFs still missing from a marked-pages-only compact project."),
  read("audit_project_completeness", "Run deterministic completeness checks using existing project state."),
  read("get_estimator_handoff_summary", "Read a grounded estimator handoff containing project identity, quantities, RFIs, reviewed pages, and unresolved risks."),
  read("get_current_workspace", "Read the current OpenTakeoff workspace and approved assistant context scope."),
  read("get_current_view", "Read the active Project, Sheets, Takeoff, Whiteboard, or Report view."),
  read("get_active_pdf", "Read the active PDF filename."),
  read("get_active_page", "Read the active page key, page number, and label."),
  read("get_active_selection", "Read the selected measurement or markup, if any."),
  read("list_open_sheets", "List currently open sheets."),
  read("list_bookmarked_pages", "List bookmarked pages."),
  read("list_bookmarked_files", "List favorite PDF files."),
  read("navigate_to_page", "Navigate to an approved project page without changing project data.", PAGE_SCHEMA),
  read("focus_measurement", "Navigate to and select a measurement without changing it.", ID_SCHEMA),
  read("focus_markup", "Navigate to and select a markup without changing it.", ID_SCHEMA),
  read("focus_sow_item", "Open the whiteboard containing a SOW item without changing it.", ID_SCHEMA),
  read("get_pdf_metadata", "Read page count and project metadata for an approved PDF file.", { type: "object", properties: { file: STRING_ID }, required: ["file"], additionalProperties: false }),
  read("list_pdf_pages", "List pages in an approved PDF file.", { type: "object", properties: { file: STRING_ID }, required: ["file"], additionalProperties: false }),
  read("get_page_label", "Read an approved page's OpenTakeoff label.", PAGE_SCHEMA),
  read("get_page_text", "Read bounded selectable PDF text for an approved page. Empty text can mean the page is scanned and OCR has not been approved.", PAGE_SCHEMA),
  read("get_page_ocr_text", "Read bounded keyword hits produced by OpenTakeoff's local OCR for an approved page. OCR runs through Find and is never silently started by this read tool.", PAGE_SCHEMA),
  read("get_page_annotations", "Read notes, markups, RFIs, and measurements on an approved page.", PAGE_SCHEMA),
  read("get_page_notes", "Read text-note markups on an approved page.", PAGE_SCHEMA),
  read("get_page_markups", "Read all markups on an approved page.", PAGE_SCHEMA),
  read("get_page_measurements", "Read authoritative stored measurements on an approved page.", PAGE_SCHEMA),
  read("get_search_matches", "List bounded existing Find/OCR keyword marks inside the approved context."),
  read("get_measured_pages", "List approved pages containing measurements."),
  read("get_marked_pages", "List approved pages containing measurements, notes, markups, RFIs, or bookmarks."),
  read("search_project_text", "Search selectable PDF text inside the approved assistant context.", QUERY_SCHEMA),
  read("search_current_page", "Search selectable text on the approved current page.", QUERY_SCHEMA),
  read("search_current_pdf_set", "Search selectable text in the approved current PDF set.", QUERY_SCHEMA),
  read("search_all_plans", "Search selectable text across all pages only when the entire-project context is approved.", QUERY_SCHEMA),
  read("find_scope_keywords", "Run OpenTakeoff's existing Find/OCR workflow and mark keyword matches on plans. This is faster and more exact than asking the model to inspect page images.", {
    type: "object",
    properties: {
      query: { type: "string", minLength: 1, maxLength: 500 },
      scope: { type: "string", enum: ["page", "file", "all"] },
    },
    required: ["query", "scope"],
    additionalProperties: false,
  }),
  read("list_conditions", "List takeoff conditions and authoritative totals calculated by OpenTakeoff."),
  read("get_condition", "Read one condition and its authoritative totals.", ID_SCHEMA),
  read("get_condition_color", "Read one condition's configured color.", ID_SCHEMA),
  read("get_condition_measurements", "Read measurements assigned to one condition.", ID_SCHEMA),
  read("get_selected_measurements", "Read the currently selected measurement, if it is inside the approved context."),
  read("get_measurement", "Read one stored measurement and its authoritative computed quantity.", ID_SCHEMA),
  read("get_measurement_geometry", "Read normalized stored geometry for one measurement.", ID_SCHEMA),
  read("get_measurement_quantity", "Read the authoritative stored computed quantity for one measurement.", ID_SCHEMA),
  read("get_measurement_provenance", "Read provenance for one measurement.", ID_SCHEMA),
  read("get_measurement_totals", "Read authoritative project totals by condition."),
  read("get_measurement_breakdown_by_sheet", "Read authoritative quantities grouped by sheet."),
  read("get_scale_info", "Read all saved page scales and their sources."),
  read("check_scale_consistency", "Find measured pages without a scale and PDF sets using inconsistent scales."),
  read("find_duplicate_measurements", "Find exact duplicate measurement records without changing them."),
  read("find_unscaled_measured_pages", "List measured sheets that have no valid saved scale."),
  read("list_sow_panels", "List whiteboard SOW panels and their tabs."),
  read("get_sow_panel", "Read one SOW panel.", ID_SCHEMA),
  read("list_sow_titles", "List plain SOW title rows."),
  read("list_sow_line_items", "List all SOW titles and line items."),
  read("get_sow_line_item", "Read one SOW title or line item.", ID_SCHEMA),
  read("find_measurements_without_sow_items", "List measured conditions that have no linked SOW line item."),
  read("find_sow_items_without_measurements", "List measurement-linked SOW rows whose source measurements are missing."),
  read("compare_sow_to_measurements", "Compare measurement-linked SOW rows with current authoritative measurements."),
  read("get_whiteboard_summary", "Summarize whiteboard files, notes, SOW panels, and layout."),
  read("get_report_summary", "Read authoritative report rows and totals from OpenTakeoff's existing calculation engine."),
  read("get_report_rows", "Read authoritative condition rows from OpenTakeoff's report calculation engine."),
  read("get_condition_totals", "Read authoritative totals for one condition.", ID_SCHEMA),
  read("get_material_totals", "Read material rows already calculated by OpenTakeoff's report engine."),
  read("get_waste_settings", "Read condition waste settings without changing them."),
  read("find_missing_unit_costs", "List report materials without a unit cost."),
  read("get_fence_calculator_configuration", "Read the saved Fence Material Calculator inputs."),
  read("get_fence_calculator_results", "Read results already produced by the existing Fence Material Calculator."),
  read("get_chain_link_post_configuration", "Read saved chain-link post calculator inputs."),
  read("get_chain_link_post_results", "Read saved chain-link post calculator records and derived results already stored by the app."),
  read("list_rfis", "List project RFIs."),
  read("get_rfi", "Read one RFI.", ID_SCHEMA),
  read("find_unresolved_rfis", "List RFIs not marked resolved or closed."),

  propose("propose_bookmark_page", "Propose bookmarking a page. This does not change the project until the estimator approves it.", { sheet: STRING_ID }, ["sheet"]),
  propose("propose_bookmark_file", "Propose favoriting a PDF file. Requires estimator approval.", { file: STRING_ID }, ["file"]),
  propose("propose_update_project_metadata", "Propose updates to project name, status, submission date, or client information. Requires approval.", {
    name: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] }, status: { anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }] }, submissionDate: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
    client: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] }, projectNumber: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
  }, ["name", "status", "submissionDate", "client", "projectNumber"]),
  propose("propose_add_sow_title", "Propose adding a plain title to a named SOW panel/tab. Requires approval.", {
    sow_id: STRING_ID, tab_id: STRING_ID, text: { type: "string", minLength: 1, maxLength: 1000 },
  }, ["sow_id", "tab_id", "text"]),
  propose("propose_add_sow_line_item", "Propose adding a color-coded SOW line item. Requires approval.", {
    sow_id: STRING_ID, tab_id: STRING_ID, text: { type: "string", minLength: 1, maxLength: 2000 }, color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
  }, ["sow_id", "tab_id", "text", "color"]),
  propose("propose_create_rfi", "Propose a grounded RFI draft. Requires approval and never sends anything externally.", {
    title: { type: "string", minLength: 1, maxLength: 240 }, question: { type: "string", minLength: 1, maxLength: 4000 }, sheet: { anyOf: [{ type: "string", maxLength: 256 }, { type: "null" }] },
  }, ["title", "question", "sheet"]),
];

const DEF_BY_NAME = new Map(PROJECT_ASSISTANT_TOOL_DEFS.map((tool) => [tool.name, tool]));

export function responseToolDefinitions() {
  return PROJECT_ASSISTANT_TOOL_DEFS.map(({ name, description, parameters }) => ({
    type: "function", name, description, parameters, strict: true,
  }));
}

function schemaAccepts(schema, value) {
  if (schema.anyOf) return schema.anyOf.some((candidate) => schemaAccepts(candidate, value));
  if (schema.type === "null") return value === null;
  if (schema.type === "string") return typeof value === "string" && (!schema.enum || schema.enum.includes(value)) && (!schema.minLength || value.length >= schema.minLength) && (!schema.maxLength || value.length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern).test(value));
  if (schema.type === "object") {
    if (!object(value)) return false;
    if ((schema.required || []).some((key) => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(schema.properties || {}, key))) return false;
    return Object.entries(value).every(([key, child]) => !schema.properties?.[key] || schemaAccepts(schema.properties[key], child));
  }
  return true;
}

export function validateProjectAssistantToolCall(name, args) {
  const def = DEF_BY_NAME.get(name);
  if (!def) return { valid: false, error: `Unknown project tool: ${name}.` };
  if (!schemaAccepts(def.parameters, args)) return { valid: false, error: `Invalid arguments for ${name}.` };
  return { valid: true, tool: def };
}

export function assistantProjectRevision(snapshot) {
  const canonical = JSON.stringify({
    project_id: snapshot.project_id || "local",
    conditions: (snapshot.conditions || []).map((item) => [item.id, item.finish_tag, item.color, item.waste_pct, item.multiplier]),
    shapes: (snapshot.shapes || []).map((item) => [item.id, item.sheet_id, item.condition_id, item.measure_role, item.verts_norm, item.computed, item.updated_at]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    markups: (snapshot.markups || []).map((item) => [item.id, item.sheet_id, item.type, item.text, item.at, item.rect, item.from, item.to, item.rfi_id]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    rfis: (snapshot.rfis || []).map((item) => [item.id, item.status, item.subject, item.question, item.response, item.sheet_id]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index++) { hash ^= canonical.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `${snapshot.project_id || "local"}:${(hash >>> 0).toString(36)}`;
}

function bounded(value) {
  let encoded;
  try { encoded = JSON.stringify(value); } catch { return { error: "Tool result could not be serialized." }; }
  if (encoded.length <= PROJECT_ASSISTANT_MAX_TOOL_CHARS) return value;
  return { truncated: true, preview: encoded.slice(0, PROJECT_ASSISTANT_MAX_TOOL_CHARS), original_characters: encoded.length };
}

function allowedSheet(ctx, sheet) {
  return ctx.allowedSheets.has(sheet);
}

function pageRows(snapshot, sheet) {
  return {
    sheet,
    measurements: (snapshot.shapes || []).filter((item) => item.sheet_id === sheet),
    markups: (snapshot.markups || []).filter((item) => item.sheet_id === sheet),
    rfis: (snapshot.rfis || []).filter((item) => item.sheet_id === sheet),
  };
}

function conditionRows(snapshot) {
  const totals = new Map((snapshot.condition_totals || []).map((row) => [row.id, row]));
  return (snapshot.conditions || []).map((condition) => ({ ...condition, totals: totals.get(condition.id) || null }));
}

function sowEntries(snapshot) {
  return (snapshot.whiteboard?.sows || []).flatMap((sow) => (sow.tabs || []).flatMap((tab) => (tab.entries || []).map((entry) => ({
    sow_id: sow.id, sow_title: sow.sectionTitle, tab_id: tab.id, tab_name: tab.name, ...entry,
  }))));
}

function exactDuplicateMeasurements(shapes) {
  const seen = new Map(), duplicates = [];
  for (const shape of shapes || []) {
    const key = JSON.stringify([shape.sheet_id, shape.condition_id, shape.measure_role, shape.verts_norm, shape.computed]);
    if (seen.has(key)) duplicates.push({ first_id: seen.get(key), duplicate_id: shape.id, sheet: shape.sheet_id });
    else seen.set(key, shape.id);
  }
  return duplicates;
}

function proposalSummary(name, args) {
  switch (name) {
    case "propose_bookmark_page": return `Bookmark page ${args.sheet}`;
    case "propose_bookmark_file": return `Favorite PDF ${args.file}`;
    case "propose_update_project_metadata": return "Update project metadata";
    case "propose_add_sow_title": return `Add SOW title: ${args.text}`;
    case "propose_add_sow_line_item": return `Add SOW line item: ${args.text}`;
    case "propose_create_rfi": return `Create RFI draft: ${args.title}`;
    default: return name;
  }
}

export async function executeProjectAssistantTool(ctx, name, args = {}) {
  const checked = validateProjectAssistantToolCall(name, args);
  if (!checked.valid) return { error: checked.error };
  const def = checked.tool;
  const snapshot = ctx.snapshot();
  if (def.mutating) {
    const proposal = {
      id: crypto.randomUUID(), tool: name, args: clone(args), summary: proposalSummary(name, args),
      project_revision: ctx.projectRevision?.() || assistantProjectRevision(snapshot), created_at: new Date().toISOString(),
    };
    ctx.onProposal?.(proposal);
    return { status: "pending_user_approval", proposal_id: proposal.id, summary: proposal.summary };
  }
  let result;
  switch (name) {
    case "get_project_summary": result = snapshot.summary; break;
    case "get_project_metadata": result = { project_name: snapshot.project_name, project_metadata: snapshot.project_metadata, client_info: snapshot.client_info, units: snapshot.units }; break;
    case "get_project_statistics": result = snapshot.statistics; break;
    case "get_project_units": result = { units: snapshot.units }; break;
    case "get_project_save_status": result = { save_state: snapshot.save_state }; break;
    case "list_project_files": result = { files: snapshot.files }; break;
    case "list_pdf_sets": result = { files: snapshot.files.filter((file) => ctx.allowedFiles.has(file.name)) }; break;
    case "list_project_revisions": result = { revisions: snapshot.revisions || [] }; break;
    case "compare_project_revisions": result = ctx.scope === "entire-project" ? await ctx.compareRevisions(args.base_id, args.compare_id) : { error: "Choose Entire project context before comparing saved revisions." }; break;
    case "get_revision_summary": result = { revision: (snapshot.revisions || []).find((item) => item.id === args.id) || null }; break;
    case "list_missing_compact_project_files": result = { files: snapshot.compact_project?.files || [] }; break;
    case "audit_project_completeness": result = snapshot.audit; break;
    case "get_estimator_handoff_summary": result = snapshot.handoff; break;
    case "get_current_workspace": result = { view: snapshot.view, scope: ctx.scope, approved_sheets: [...ctx.allowedSheets] }; break;
    case "get_current_view": result = { view: snapshot.view }; break;
    case "get_active_pdf": result = { file: snapshot.active_file || null }; break;
    case "get_active_page": result = snapshot.active_page || null; break;
    case "get_active_selection": result = snapshot.selection || null; break;
    case "list_open_sheets": result = { sheets: snapshot.open_sheets.filter((item) => allowedSheet(ctx, item.key)) }; break;
    case "list_bookmarked_pages": result = { sheets: snapshot.sheet_bookmarks.filter((key) => allowedSheet(ctx, key)) }; break;
    case "list_bookmarked_files": result = { files: snapshot.file_bookmarks.filter((file) => ctx.allowedFiles.has(file)) }; break;
    case "navigate_to_page": result = allowedSheet(ctx, args.sheet) ? await ctx.navigate("sheet", args.sheet) : { error: "That page is outside the user-approved assistant context." }; break;
    case "focus_measurement": result = await ctx.navigate("measurement", args.id); break;
    case "focus_markup": result = await ctx.navigate("markup", args.id); break;
    case "focus_sow_item": result = await ctx.navigate("sow", args.id); break;
    case "get_pdf_metadata": result = ctx.allowedFiles.has(args.file) ? { file: snapshot.files.find((item) => item.name === args.file) || null } : { error: "That PDF is outside the approved context." }; break;
    case "list_pdf_pages": result = ctx.allowedFiles.has(args.file) ? { pages: snapshot.pages.filter((item) => item.file === args.file && allowedSheet(ctx, item.key)) } : { error: "That PDF is outside the approved context." }; break;
    case "get_page_label": result = allowedSheet(ctx, args.sheet) ? snapshot.pages.find((item) => item.key === args.sheet) || null : { error: "That page is outside the approved context." }; break;
    case "get_page_text": result = allowedSheet(ctx, args.sheet) ? await ctx.readPageText(args.sheet) : { error: "That page is outside the user-approved assistant context." }; break;
    case "get_page_ocr_text": result = allowedSheet(ctx, args.sheet) ? { sheet: args.sheet, source: "local_ocr", hits: (snapshot.search_jobs || []).flatMap((job) => job.matches || []).filter((match) => match.sheet === args.sheet && match.source === "local_ocr") } : { error: "That page is outside the user-approved assistant context." }; break;
    case "get_page_annotations": result = allowedSheet(ctx, args.sheet) ? pageRows(snapshot, args.sheet) : { error: "That page is outside the user-approved assistant context." }; break;
    case "get_page_notes": result = allowedSheet(ctx, args.sheet) ? { sheet: args.sheet, notes: pageRows(snapshot, args.sheet).markups.filter((item) => item.type === "text") } : { error: "That page is outside the user-approved assistant context." }; break;
    case "get_page_markups": result = allowedSheet(ctx, args.sheet) ? { sheet: args.sheet, markups: pageRows(snapshot, args.sheet).markups } : { error: "That page is outside the user-approved assistant context." }; break;
    case "get_page_measurements": result = allowedSheet(ctx, args.sheet) ? { sheet: args.sheet, measurements: pageRows(snapshot, args.sheet).measurements } : { error: "That page is outside the user-approved assistant context." }; break;
    case "get_search_matches": result = { jobs: snapshot.search_jobs || [] }; break;
    case "get_measured_pages": result = { sheets: [...new Set(snapshot.shapes.map((item) => item.sheet_id))].filter((key) => allowedSheet(ctx, key)) }; break;
    case "get_marked_pages": result = { sheets: [...new Set([...snapshot.shapes, ...snapshot.markups, ...snapshot.rfis].map((item) => item.sheet_id).concat(snapshot.sheet_bookmarks))].filter((key) => allowedSheet(ctx, key)) }; break;
    case "search_project_text": result = await ctx.searchText(args.query); break;
    case "search_current_page": result = await ctx.searchText(args.query, "page"); break;
    case "search_current_pdf_set": result = await ctx.searchText(args.query, "file"); break;
    case "search_all_plans": result = ctx.scope === "entire-project" ? await ctx.searchText(args.query, "all") : { error: "Choose Entire project context before searching all plans." }; break;
    case "find_scope_keywords": result = await ctx.runFind(args.scope, args.query); break;
    case "list_conditions": result = { conditions: conditionRows(snapshot) }; break;
    case "get_condition": result = { condition: conditionRows(snapshot).find((item) => item.id === args.id) || null }; break;
    case "get_condition_color": { const condition = snapshot.conditions.find((item) => item.id === args.id); result = { id: args.id, color: condition?.color || null }; break; }
    case "get_condition_measurements": result = { condition_id: args.id, measurements: snapshot.shapes.filter((item) => item.condition_id === args.id && allowedSheet(ctx, item.sheet_id)) }; break;
    case "get_selected_measurements": result = { measurements: snapshot.selection?.type === "measurement" ? [snapshot.selection.value] : [] }; break;
    case "get_measurement": result = { measurement: snapshot.shapes.find((item) => item.id === args.id && allowedSheet(ctx, item.sheet_id)) || null }; break;
    case "get_measurement_geometry": { const row = snapshot.shapes.find((item) => item.id === args.id && allowedSheet(ctx, item.sheet_id)); result = { id: args.id, sheet_id: row?.sheet_id || null, verts_norm: row?.verts_norm || null, curved: !!row?.curved }; break; }
    case "get_measurement_quantity": { const row = snapshot.shapes.find((item) => item.id === args.id && allowedSheet(ctx, item.sheet_id)); result = { id: args.id, measure_role: row?.measure_role || null, computed: row?.computed || null }; break; }
    case "get_measurement_provenance": { const row = snapshot.shapes.find((item) => item.id === args.id && allowedSheet(ctx, item.sheet_id)); result = { id: args.id, origin: row?.origin || null, created_at: row?.created_at || null, updated_at: row?.updated_at || null }; break; }
    case "get_measurement_totals": result = { rows: snapshot.condition_totals }; break;
    case "get_measurement_breakdown_by_sheet": result = { rows: snapshot.sheet_totals.filter((item) => allowedSheet(ctx, item.sheet_id)) }; break;
    case "get_scale_info": result = { scales: snapshot.scales.filter((item) => allowedSheet(ctx, item.sheet_id)) }; break;
    case "check_scale_consistency": result = snapshot.scale_audit; break;
    case "find_duplicate_measurements": result = { duplicates: exactDuplicateMeasurements(snapshot.shapes.filter((item) => allowedSheet(ctx, item.sheet_id))) }; break;
    case "find_unscaled_measured_pages": result = { sheets: snapshot.audit.unscaled_measured_pages.filter((key) => allowedSheet(ctx, key)) }; break;
    case "list_sow_panels": result = { sows: snapshot.whiteboard?.sows || [] }; break;
    case "get_sow_panel": result = { sow: (snapshot.whiteboard?.sows || []).find((item) => item.id === args.id) || null }; break;
    case "list_sow_titles": result = { entries: sowEntries(snapshot).filter((item) => item.kind === "title") }; break;
    case "list_sow_line_items": result = { entries: sowEntries(snapshot) }; break;
    case "get_sow_line_item": result = { entry: sowEntries(snapshot).find((item) => item.id === args.id) || null }; break;
    case "find_measurements_without_sow_items": result = { conditions: snapshot.sow_audit.measurements_without_sow_items || [] }; break;
    case "find_sow_items_without_measurements": result = { entries: snapshot.sow_audit.sow_items_without_measurements || [] }; break;
    case "compare_sow_to_measurements": result = snapshot.sow_audit; break;
    case "get_whiteboard_summary": result = snapshot.whiteboard_summary; break;
    case "get_report_summary": result = { conditions: snapshot.condition_totals, by_sheet: snapshot.sheet_totals.filter((item) => allowedSheet(ctx, item.sheet_id)) }; break;
    case "get_report_rows": result = { rows: snapshot.condition_totals }; break;
    case "get_condition_totals": result = { row: snapshot.condition_totals.find((item) => item.id === args.id) || null }; break;
    case "get_material_totals": result = { rows: snapshot.material_totals || [] }; break;
    case "get_waste_settings": result = { conditions: snapshot.conditions.map((item) => ({ id: item.id, finish_tag: item.finish_tag, waste_pct: item.waste_pct || 0 })) }; break;
    case "find_missing_unit_costs": result = { materials: (snapshot.material_totals || []).filter((item) => !Number.isFinite(Number(item.unit_cost))) }; break;
    case "get_fence_calculator_configuration": result = snapshot.fence_calculator || {}; break;
    case "get_fence_calculator_results": result = snapshot.fence_calculator || {}; break;
    case "get_chain_link_post_configuration": result = { fences: snapshot.chain_link_fences || [] }; break;
    case "get_chain_link_post_results": result = { fences: snapshot.chain_link_fences || [] }; break;
    case "list_rfis": result = { rfis: snapshot.rfis.filter((item) => !item.sheet_id || allowedSheet(ctx, item.sheet_id)) }; break;
    case "get_rfi": result = { rfi: snapshot.rfis.find((item) => item.id === args.id && (!item.sheet_id || allowedSheet(ctx, item.sheet_id))) || null }; break;
    case "find_unresolved_rfis": result = { rfis: snapshot.rfis.filter((item) => !["resolved", "closed"].includes(String(item.status || "").toLowerCase()) && (!item.sheet_id || allowedSheet(ctx, item.sheet_id))) }; break;
    default: result = { error: `Tool ${name} is registered but has no executor.` };
  }
  return bounded(result);
}

export function assistantSystemPrompt() {
  return [
    "You are ChatGPT Project Assistant inside OpenTakeoff, a construction takeoff application.",
    "Use the supplied OpenTakeoff tools for every project-specific fact. Never invent dimensions, quantities, scales, costs, dates, sheet names, or contract requirements.",
    "Authoritative quantities come only from tool results generated by OpenTakeoff's calculation engine; never recalculate them from screenshots or prose.",
    "The user has approved only the context reported by get_current_workspace. Do not request data outside that scope unless you ask the user to expand it.",
    "Cite evidence inline using [sheet:SHEET_KEY], [measurement:ID], [condition:ID], [sow:ID], [rfi:ID], or [revision:ID].",
    "Clearly label confirmed facts, OCR/selectable-text evidence, inferences, and suggestions.",
    "Tools whose names begin with propose_ create approval cards only. They do not change project data until the estimator explicitly approves them.",
    "Never claim that a proposed action already happened. Never send email or communicate externally.",
    "Be concise, practical, and oriented toward an estimator reviewing scope and quantity risk.",
  ].join("\n");
}
