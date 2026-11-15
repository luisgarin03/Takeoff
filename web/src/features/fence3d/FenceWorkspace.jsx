import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FenceViewer, { download } from "./FenceViewer.jsx";
import { adaptFenceRuns } from "./source.js";
import { buildFenceLayout } from "./layout.js";
import { FITTINGS, FRAME_COMPONENTS, METERS_PER_FOOT as FT, METERS_PER_INCH as IN, normalizeFence3d, runSpec, WIRE_GAUGES } from "./settings.js";
import { buildFenceFittings } from "./fittings.js";
import { buildColorMapRows } from "./colorMap.js";
import "./fence3d.css";

const DISPLAY_CONTROLS = [["fabric", "Fabric"], ["posts", "Posts"], ["rails", "Rails and wires"], ["fittings", "Fittings"], ["corners", "Corner markers"], ["lengths", "Run lengths"], ["edgeLabels", "Wall lengths & line-post counts"], ["angles", "Corner angles"], ["spacing", "Post spacing"], ["grid", "Grid"]];
const TYPES = [["chain-link", "Chain-link"], ["ornamental", "Ornamental"], ["wood", "Wood"], ["vinyl", "Vinyl"], ["exclude", "Exclude"]];
const FINISH = [["matching", "Match fabric"], ["galvanized", "Galvanized"], ["vinyl", "Vinyl-coated"]];
const SELVAGE = [["knuckle", "Knuckle"], ["twist", "Twist"], ["plain", "Plain"]];
const GATES = [["single", "Single swing"], ["double", "Double swing"], ["cantilever", "Cantilever"]];
const HARDWARE = [["caps", "Post caps", "totalPosts"], ["loopCaps", "Loop caps", "line"], ["railEnds", "Rail ends", "end"],
  ["braceBands", "Brace bands", "corner"], ["tensionBands", "Tension bands", "end"], ["tensionBars", "Tension bars", "end"],
  ["railSleeves", "Rail sleeves", "line"], ["ties", "Tie wires", "line"], ["hogRings", "Hog rings", "fabric"],
  ["hinges", "Gate hinges", "swing"], ["latches", "Gate latches", "gates"], ["gateHardware", "Gate hardware", "gates"]];

function NumberField({ label, value, update, minimum = 0, step = "any", disabled = false }) {
  const [editing, setEditing] = useState(null);
  return <label>{label}<input type="number" step={step} min={minimum} value={editing ?? value} disabled={disabled}
    onFocus={() => setEditing(String(value))} onBlur={(event) => {
      const next = event.currentTarget.valueAsNumber;
      setEditing(null);
      if (Number.isFinite(next) && next !== value) update(next);
    }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    onChange={(event) => setEditing(event.currentTarget.value)} /></label>;
}
function Options({ label, value, update, choices, disabled = false }) {
  return <label>{label}<select value={value} disabled={disabled} onChange={(event) => update(event.target.value)}>
    {choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select></label>;
}
function Toggle({ label, value, update }) {
  return <label className="fence3d-check"><input type="checkbox" checked={value} onChange={(event) => update(event.target.checked)} />{label}</label>;
}
function Section({ label, children, open }) {
  return <details open={open}><summary>{label}</summary><div className="fence3d-fields">{children}</div></details>;
}
function VisibilityIcon({ visible }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    {visible ? <circle cx="12" cy="12" r="3" /> : <path d="m4 4 16 16" />}
  </svg>;
}

const updateItem = (items, id, patch) => items.map((item) => item.id === id ? { ...item, ...patch } : item);

function RunSettings({ run, field, setSpec, updateRun, units }) {
  const spec = run?.spec;
  if (!spec) return null;
  const metric = units === "metric";
  const num = (name, label, kind, minimum = 0) => {
    const factor = metric ? (kind === "ft" ? FT : kind === "in" ? IN * 1000 : 1) : 1;
    const unit = kind === "ft" ? (metric ? "m" : "ft") : kind === "in" ? (metric ? "mm" : "in") : kind === "count" ? "" : "%";
    return <NumberField key={name} label={unit ? `${label} (${unit})` : label} value={+(spec[name] * factor).toFixed(4)} minimum={minimum * factor}
      step={kind === "count" ? 1 : "any"} update={(n) => setSpec(name, kind === "count" ? Math.round(n) : n / factor)} />;
  };
  const option = (name, label, choices) => <Options label={label} value={spec[name]} choices={choices} update={(v) => setSpec(name, v)} />;
  const toggle = (name, label) => <Toggle key={name} label={label} value={spec[name]} update={(v) => setSpec(name, v)} />;
  const addGate = () => {
    const segment = run.gateSegments.findIndex((item) => item.length >= 4 * FT);
    if (segment < 0) { field("A gate needs a straight segment at least 4 ft long."); return; }
    const item = run.gateSegments[segment];
    const start = Math.max(0, Math.min(2, (item.length / FT - 4) / 2));
    updateRun({ gates: [...run.configuredGates, { id: crypto.randomUUID(), type: "single", segment: segment + 1, start, width: 4, height: spec.height, mesh: spec.mesh }] });
  };
  const compact = metric ? 1000 * IN : 1;
  const large = metric ? FT : 1;
  const lengthUnit = metric ? "m" : "ft";
  const shortUnit = metric ? "mm" : "in";
  return <>
    <Section label="Fence dimensions" open>
      {num("height", "Fabric height", "ft", 1)}{num("clearance", "Bottom clearance", "in")}
      {num("elevation", "Base elevation", "ft", -1000)}{num("offset", "Fabric offset", "in", -24)}
    </Section>
    <Section label="Fabric">
      {num("mesh", "Clear mesh opening", "in", .25)}
      <div className="fence3d-presets">{[2, 1.75, 1].map((size) => <button key={size} onClick={() => setSpec("mesh", size)}>{metric ? `${+(size * compact).toFixed(2)} mm` : `${size} in`}</button>)}</div>
      {option("gauge", "Nominal gauge", Object.keys(WIRE_GAUGES).map((gauge) => [gauge, `${gauge} ga · ${+(WIRE_GAUGES[gauge] * compact).toFixed(4)} ${shortUnit}`]))}
      {num("wire", "Core diameter override (0 uses gauge)", "in")}
      {option("finish", "Fabric finish", FINISH.slice(1))}
      {spec.finish === "vinyl" && <>
        {num("coatedWire", "Coated outside diameter", "in", .001)}
        <label>Coating color<input type="color" value={spec.color} onChange={(event) => setSpec("color", event.target.value)} /></label>
        {spec.coatedWire < (spec.wire || WIRE_GAUGES[spec.gauge]) && <p className="fence3d-note">Enter the specified coated diameter. Preview uses the core diameter until it is supplied.</p>}
      </>}
      {option("topSelvage", "Top selvage", SELVAGE)}{option("bottomSelvage", "Bottom selvage", SELVAGE)}
      {option("detail", "Fabric detail", [["auto", "Auto"], ["pattern", "Pattern"], ["wire", "Individual wires where available"]])}
    </Section>
    <Section label="Posts">
      {num("spacing", "Maximum line-post spacing", "ft", .5)}
      {option("strategy", "Spacing strategy", [["even", "Equal bays"], ["maximum", "Maximum spacing, shorter last bay"]])}
      {num("lineDiameter", "Line post diameter", "in", .25)}{num("terminalDiameter", "Terminal and corner diameter", "in", .25)}
      {num("gateDiameter", "Gate post diameter", "in", .25)}{num("postHeight", "Minimum post height (0 uses fabric)", "ft")}
      {num("extension", "Extension above fabric", "in")}{option("postFinish", "Post finish", FINISH)}
    </Section>
    <Section label="Rails">
      {num("railDiameter", "Pipe diameter", "in", .25)}{num("railOffset", "Rail offset", "in", -24)}
      {option("railFinish", "Rail finish", FINISH)}
      {option("railConnection", "Rail connection", [["between", "Between posts"], ["center", "Along post centerline"]])}
      {FRAME_COMPONENTS.filter(([id]) => id.endsWith("Rail")).map(([id, label]) => <React.Fragment key={id}>{toggle(id, label)}{spec[id] && num(id + "Height", label + " height", "%")}</React.Fragment>)}
    </Section>
    <Section label="Tension wires">
      {num("wireDiameter", "Tension wire diameter", "in", .02)}
      {FRAME_COMPONENTS.filter(([id]) => id.endsWith("Wire")).map(([id, label]) => <React.Fragment key={id}>{toggle(id, label)}{spec[id] && num(id + "Height", label + " height", "%")}</React.Fragment>)}
    </Section>
    <Section label="Barbed wire">
      {toggle("barbedWire", "Barbed wire")}
      {spec.barbedWire && <>
        {num("barbStrands", "Number of strands", "count", 1)}
        {num("barbRise", "Arm rise", "in", 4)}{num("barbReach", "Arm projection (0 for vertical)", "in")}
        {option("barbSide", "Arm direction", [["left", "Left as drawn"], ["right", "Right as drawn"]])}
      </>}
    </Section>
    <Section label="Components">
      {toggle("fittings", "Install fittings")}
      {spec.fittings && <>
        {FITTINGS.map(([id, label]) => toggle(id, label))}
        {num("barLength", "Tension bar length (0 uses fabric height)", "ft")}
        {num("bandSpacing", "Tension band interval", "in", 4)}
        {num("minimumBands", "Minimum bands per bar", "count")}
        {num("postTieSpacing", "Line post tie spacing", "in", 6)}
        {num("railTieSpacing", "Rail tie spacing", "in", 6)}
        {num("hogRingSpacing", "Hog ring spacing", "in", 6)}
        {option("railStock", "Rail ends", [["plain", "Plain with sleeves"], ["swaged", "Swaged"]])}
        {num("railStockLength", "Rail stock length", "ft", 4)}
        {spec.footings && <>{num("footingDepth", "Footing depth", "in", 4)}{num("footingDiameter", "Footing diameter", "in", 3)}</>}
      </>}
    </Section>
    <Section label={`Gates (${run.configuredGates.length})`}>
      <button disabled={!run.gateSegments.length} onClick={addGate}>Add gate</button>
      {run.configuredGates.map((gate, index) => {
        const patch = (value) => updateRun({ gates: updateItem(run.configuredGates, gate.id, value) });
        const gateNum = (name, label, factor, unit) => <NumberField label={`${label} (${unit})`} value={+(gate[name] * factor).toFixed(3)} update={(n) => patch({ [name]: n / factor })} />;
        return <div className="fence3d-edit" key={gate.id}>
          <strong>Gate {index + 1}</strong>
          <Options label="Type" value={gate.type} choices={GATES} update={(type) => patch({ type })} />
          {gate.type === "single" && <Options label="Hinge side" value={gate.hingeSide} choices={[["start", "Opening start"], ["end", "Opening end"]]} update={(hingeSide) => patch({ hingeSide })} />}
          <Options label="Source segment" value={String(gate.segment)} choices={run.gateSegments.map((item, i) => [String(i + 1), `${i + 1} · ${length(item.length, units)}`])} update={(n) => patch({ segment: Number(n) })} />
          {gateNum("start", "Position from segment start", large, lengthUnit)}
          {gateNum("width", "Opening width", large, lengthUnit)}{gateNum("height", "Gate height", large, lengthUnit)}
          {gateNum("clearance", "Ground clearance", compact, shortUnit)}{gateNum("frame", "Frame diameter", compact, shortUnit)}
          {gateNum("mesh", "Gate mesh opening", compact, shortUnit)}{gateNum("opening", "Open", 1, "%")}
          <Options label={gate.type === "cantilever" ? "Slide toward" : "Swing"} value={gate.direction}
            choices={gate.type === "cantilever" ? [["in", "Segment start"], ["out", "Segment end"]] : [["in", "In"], ["out", "Out"]]} update={(direction) => patch({ direction })} />
          {gate.type === "cantilever" && gateNum("tail", "Support tail", large, lengthUnit)}
          <Options label="Gate finish" value={gate.finish} choices={FINISH} update={(finish) => patch({ finish })} />
          <button onClick={() => updateRun({ gates: run.configuredGates.filter((item) => item.id !== gate.id) })}>Remove gate</button>
        </div>;
      })}
    </Section>
  </>;
}

const length = (n, units) => `${(units === "metric" ? n : n / FT).toFixed(2)} ${units === "metric" ? "m" : "ft"}`;
const area = (n, units) => `${(units === "metric" ? n : n / (FT * FT)).toFixed(2)} ${units === "metric" ? "m²" : "ft²"}`;
const csvCell = (value) => `"${String(value).replaceAll('"', '""')}"`;

function quantities(layout, data, units) {
  const t = layout.totals;
  const rows = [
    ["measured", "Saved takeoff length", length(t.measured, units)], ["path", "Calibrated fence path", length(t.path, units)],
    ["fabric", "Fabric run length", length(t.fabric, units)], ["opening", "Gate openings", length(t.opening, units)],
    ["area", "Fence fabric area", area(t.area, units)], ["gateArea", "Gate infill area", area(t.gateArea, units)],
    ["rail", "Rail centerline length", length(t.rail, units)], ["wire", "Tension wire length", length(t.wire, units)],
    ["barbedWire", "Barbed wire strand length", length(layout.fittings.barbedLength, units)],
    ...[["line", "Line posts"], ["end", "End posts"], ["corner", "Corner posts"], ["junction", "Junction posts"], ["pull", "Pull posts"],
      ["gate", "Gate posts"], ["totalPosts", "Total posts"], ["single", "Single swing gates"], ["double", "Double swing gates"], ["cantilever", "Cantilever gates"]].map(([id, title]) => [id, title, t[id]]),
  ];
  const bases = { ...t, fabric: t.fabric / FT, gates: t.single + t.double + t.cantilever, swing: t.single + t.double };
  for (const [id, title] of FITTINGS) rows.push([id, title, layout.fittings.counts[id]]);
  for (const [id, title, base] of HARDWARE) {
    if (data.rules[id] != null) rows.push([`rule-${id}`, title + " (rule)", +(data.rules[id] * bases[base]).toFixed(3)]);
  }
  return rows;
}

export default function FenceWorkspace({ shapes, fences, ornamental, conditions, sheets, activeSheet, selectedId, units,
  value, onChange, onClose, onMode, onSelectSource, readCalibration, renderPlan, sheetLabel, readOnly, mode }) {
  const [sheet, setSheet] = useState(null);
  const [selection, setSelection] = useState(selectedId || "");
  const [pageCalibration, setPageCalibration] = useState(null);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [flyMode, setFlyMode] = useState(false);
  const [flySpeed, setFlySpeed] = useState(3);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStatus, setMeasureStatus] = useState("");
  const [annotationMode, setAnnotationMode] = useState("");
  const [annotationStatus, setAnnotationStatus] = useState("");
  const [noteDraft, setNoteDraft] = useState(null);
  const [colorMap, setColorMap] = useState(false);
  const [viewportLegendVisible, setViewportLegendVisible] = useState(true);
  const [includeExportMarkups, setIncludeExportMarkups] = useState(true);
  const [includeExportQuantities, setIncludeExportQuantities] = useState(true);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [designHistory, setDesignHistory] = useState({ undo: [], redo: [] });
  const [preview, setPreview] = useState(null);
  const viewer = useRef(null);
  const raw = readOnly && preview ? preview : value;
  const data = useMemo(() => normalizeFence3d(raw), [raw]);
  const rawRuns = raw?.runs;
  const version = raw?.version;
  const modelRuns = useMemo(() => normalizeFence3d({ version, runs: rawRuns }).runs, [version, rawRuns]);
  const migratedPostDataRef = useRef("");
  const legacyPostData = Object.entries(raw?.runs || {}).flatMap(([runId, run]) =>
    (Array.isArray(run?.posts) ? run.posts : []).map((post, index) => `${runId}:${post?.id || index}:${post?.action || "legacy"}`))
    .sort().join("|");
  useEffect(() => {
    if (readOnly || !legacyPostData || migratedPostDataRef.current === legacyPostData) return;
    migratedPostDataRef.current = legacyPostData;
    onChange(data);
  }, [data, legacyPostData, onChange, readOnly]);
  const page = sheet && sheets.includes(sheet) ? sheet : activeSheet;
  const candidates = useMemo(() => shapes.filter((shape) => shape.sheet_id === page && shape.measure_role === "linear"), [shapes, page]);
  const conditionNames = useMemo(() => Object.fromEntries(conditions.map((condition) => [condition.id, condition.finish_tag || condition.name])), [conditions]);
  const fenceById = useMemo(() => new Map(fences.map((item) => [item.shape_id, item])), [fences]);
  const selected = candidates.find((shape) => shape.id === selection);
  const config = selected && data.runs[selected.id];
  const effectiveType = selected && (config?.type || (fenceById.has(selected.id) ? "chain-link" : ornamental.some((item) => item.shape_id === selected.id) ? "ornamental" : "exclude"));
  const write = (next) => { if (readOnly) setPreview(next); else onChange(next); };
  const save = (next) => {
    setDesignHistory((current) => ({ undo: [...current.undo.slice(-49), { ...data, runs: rawRuns || modelRuns }], redo: [] }));
    write(next.runs === data.runs ? { ...next, runs: rawRuns || modelRuns } : next);
  };
  const history = (direction) => {
    const prior = designHistory[direction].at(-1);
    if (!prior) return;
    const other = direction === "undo" ? "redo" : "undo";
    setDesignHistory({ [direction]: designHistory[direction].slice(0, -1), [other]: [...designHistory[other], data] });
    write(prior);
    onMode(prior.display.mode);
  };
  const updateRun = (patch) => save({ ...data, runs: { ...data.runs, [selected.id]: { type: "chain-link", spec: {}, gates: [], ...config, ...patch } } });
  const updateDisplay = (key, value) => save({ ...data, display: { ...data.display, [key]: value } });

  useEffect(() => {
    if (!page) return;
    let current = true;
    Promise.resolve(readCalibration(page)).then(
      (result) => { if (current) setPageCalibration({ page, result }); },
      () => { if (current) setPageCalibration({ page, result: null }); },
    );
    return () => { current = false; };
  }, [page, readCalibration]);
  useEffect(() => {
    if (!selectedId) return;
    const shape = shapes.find((item) => item.id === selectedId && item.measure_role === "linear");
    if (shape) { setSelection(selectedId); setSheet(shape.sheet_id === activeSheet ? null : shape.sheet_id); }
  }, [selectedId, shapes, activeSheet]);

  const source = useMemo(() => adaptFenceRuns({ shapes, fences, ornamental, sheetId: page,
    calibration: pageCalibration?.page === page ? pageCalibration.result : null, settings: { runs: modelRuns }, conditionNames }),
  [shapes, fences, ornamental, page, pageCalibration, modelRuns, conditionNames]);
  const calibration = pageCalibration?.page === page ? pageCalibration.result : null;
  const layout = useMemo(() => {
    const base = buildFenceLayout(source);
    return { ...base, fittings: buildFenceFittings(base) };
  }, [source]);
  const run = layout.runs.find((item) => item.id === selected?.id);
  const editingRun = run && { ...run, configuredGates: config?.gates || [] };
  const pick = useCallback((id) => { setSelection(id); onSelectSource(id); }, [onSelectSource]);
  const output = quantities(layout, data, units);
  const exportQuantities = output.map(([id, title, generated]) => ({ id, title, generated, manual: data.overrides[id] ?? null }));
  const colorRows = useMemo(() => buildColorMapRows(layout, units, data.display.fabricMeasure), [layout, units, data.display.fabricMeasure]);
  const gateCount = layout.runs.reduce((total, item) => total + item.gates.length, 0);
  const viewportLegendRows = useMemo(() => buildColorMapRows(layout, "imperial", "length")
    .map((row) => row.id === "gateArea"
      ? { ...row, count: gateCount, quantity: `${gateCount.toLocaleString()} count` }
      : row)
    .filter((row) => Number(row.count) > 0), [layout, gateCount]);
  const componentVisibility = data.display.componentVisibility || {};
  const updateComponentVisibility = (category, visible) => updateDisplay("componentVisibility", { ...componentVisibility, [category]: visible });
  const annotations = data.annotations || { drawings: [], notes: [] };
  const addDrawing = (points) => save({ ...data, annotations: { ...annotations, drawings: [...annotations.drawings, { id: crypto.randomUUID(), points }] } });
  const addNote = () => {
    const text = noteDraft?.text.trim().slice(0, 500);
    if (!text || !noteDraft?.point) return;
    save({ ...data, annotations: { ...annotations, notes: [...annotations.notes, { id: crypto.randomUUID(), point: noteDraft.point, text }] } });
    setNoteDraft(null);
  };
  const removeAnnotation = (kind, id) => save({ ...data, annotations: { ...annotations,
    [kind]: annotations[kind].filter((item) => item.id !== id) } });
  const toggleAnnotationMode = (mode) => {
    if (flyMode) { viewer.current?.fly(false); setFlyMode(false); }
    setMeasureMode(false);
    setNoteDraft(null);
    setAnnotationMode((current) => current === mode ? "" : mode);
  };

  async function exportFile(kind) {
    setStatus("");
    try {
      if (kind === "csv") {
        const lines = [["Item", "Source or generated quantity", "Manual quantity"], ...output.map(([id, title, generated]) => [title, generated, data.overrides[id] ?? ""])];
        download(lines.map((line) => line.map(csvCell).join(",")).join("\r\n"), "fence-quantities.csv", "text/csv");
        return;
      }
      setExporting(true);
      const exportOptions = { includeMarkups: includeExportMarkups, includeQuantities: includeExportQuantities, quantities: exportQuantities, units };
      if (kind === "png") await viewer.current.png(exportOptions);
      else if (kind === "html") await viewer.current.html(sheetLabel(page) + " — Chain-link Fence", exportOptions);
      else if (kind === "otk3d") await viewer.current.otk3d({
        title: sheetLabel(page) + " — Chain-link Fence",
        design: includeExportMarkups ? data : { ...data, annotations: { drawings: [], notes: [] } },
        options: exportOptions,
        metadata: {
          app: "OpenTakeoff",
          units,
          sheet: { id: page, name: sheetLabel(page), calibration },
          ...(includeExportQuantities ? { quantities: exportQuantities } : {}),
          planIncluded: data.display.plan === true,
        },
      });
      else await viewer.current.gltf(kind === "glb", exportOptions);
    } catch (error) {
      setStatus(error.message || "Export failed.");
    } finally { setExporting(false); }
  }

  return <section className={"fence3d" + (settingsCollapsed ? " settings-collapsed" : "")} aria-label="3D Fence Generator" onKeyDown={(event) => { if (event.key !== "Tab") event.stopPropagation(); }}>
    <header className="fence3d-header">
      <div className="fence3d-header-main">
        <strong>3D Fence Generator</strong>
        <span className="fence3d-sheet-label" title={sheetLabel(page)}>{sheetLabel(page)}</span>
        <div className="fence3d-toolbar" aria-label="Workspace view">
          <button onClick={onClose}>2D</button>
          <button aria-pressed={mode === "split"} onClick={() => { onMode("split"); updateDisplay("mode", "split"); }}>Split</button>
          <button aria-pressed={mode === "3d"} onClick={() => { onMode("3d"); updateDisplay("mode", "3d"); }}>3D</button>
        </div>
        <button aria-label="Close 3D Fence Generator" title="Close 3D view" onClick={onClose}>×</button>
      </div>
      <div className="fence3d-toolbar fence3d-camera" aria-label="3D tools">
        {["Iso", "Top", "Front", "Side"].map((direction) => <button key={direction} onClick={() => viewer.current?.view(direction)}>{direction}</button>)}
        <button onClick={() => viewer.current?.view("Iso")}>Fit</button>
        <button type="button" aria-pressed={flyMode} title="WASD to move, drag or move the mouse to look, Space/C to move vertically, Escape to exit"
          onClick={() => { setStatus(""); setMeasureMode(false); setAnnotationMode(""); setNoteDraft(null); viewer.current?.fly(!flyMode); }}>{flyMode ? "Fly · Esc" : "Fly"}</button>
        <button type="button" aria-pressed={measureMode} title="Measure a ground distance between two points; nearby fence vertices snap"
          onClick={() => { if (!measureMode) { if (flyMode) { viewer.current?.fly(false); setFlyMode(false); } setAnnotationMode(""); setNoteDraft(null); } setMeasureMode((enabled) => !enabled); }}>
          {measureMode ? "Measure · On" : "Measure"}
        </button>
        <button type="button" aria-pressed={annotationMode === "draw"} title="Drag on the ground to draw a saved line"
          onClick={() => toggleAnnotationMode("draw")}>{annotationMode === "draw" ? "Draw · On" : "Draw"}</button>
        <button type="button" aria-pressed={annotationMode === "note"} title="Click the ground to place a text note"
          onClick={() => toggleAnnotationMode("note")}>{annotationMode === "note" ? "Note · On" : "Note"}</button>
        <label className="fence3d-fly-speed" title="Adjust camera movement speed">
          <span>Speed</span>
          <input type="range" min="1" max="10" step="1" value={flySpeed} aria-label="Fly speed"
            onChange={(event) => {
              const speed = Number(event.target.value);
              setFlySpeed(speed);
              viewer.current?.setFlySpeed(speed);
            }} />
          <output>{flySpeed}×</output>
        </label>
        <button type="button" aria-pressed={data.display.plan} onClick={() => updateDisplay("plan", !data.display.plan)}>Plan</button>
        <button type="button" aria-pressed={colorMap} title="Color each generated fence component and show quantity callouts"
          onClick={() => setColorMap((enabled) => !enabled)}>Color map</button>
        <Options label="Projection" value={data.display.camera} choices={[["perspective", "Perspective"], ["orthographic", "Orthographic"]]} update={(v) => updateDisplay("camera", v)} />
      </div>
    </header>
    <div className="fence3d-view">
      <FenceViewer ref={viewer} layout={layout} display={data.display} units={units} selectedId={selected?.id} onPick={pick}
        sheetId={page} calibration={calibration} renderPlan={renderPlan} onFlyChange={setFlyMode} onFlyError={setStatus}
        onFlySpeedChange={setFlySpeed} flySpeed={flySpeed} colorMap={colorMap} colorMapRows={colorRows}
        measureMode={measureMode} onMeasureChange={setMeasureStatus} annotationMode={annotationMode} annotations={annotations}
        onAnnotationModeChange={setAnnotationMode} onAnnotationStatusChange={setAnnotationStatus}
        onDrawComplete={addDrawing} onNotePoint={(point) => { setNoteDraft({ point, text: "" }); setAnnotationMode(""); }}
        onMarkupDelete={(kind, id) => { if (kind === "measure") setMeasureStatus(""); else removeAnnotation(kind, id); }} />
      {viewportLegendVisible ? <aside className="fence3d-viewport-legend" aria-label="Fence component quantities">
        <div className="fence3d-viewport-legend-header">
          <strong>Components</strong>
          <button type="button" aria-label="Hide component legend" aria-expanded="true" title="Hide component legend"
            onClick={() => setViewportLegendVisible(false)}><VisibilityIcon visible /></button>
        </div>
        {viewportLegendRows.length ? <ul>
          {viewportLegendRows.map((row) => <li key={row.id}>
            <span className="fence3d-map-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" />
            <span className="fence3d-viewport-legend-name">{row.title}</span>
            <output>{row.quantity}</output>
          </li>)}
        </ul> : <p>No components with quantities.</p>}
      </aside> : <button className="fence3d-viewport-legend-reopen" type="button" aria-label="Show component legend"
        aria-expanded="false" title="Show component legend" onClick={() => setViewportLegendVisible(true)}><VisibilityIcon visible={false} /></button>}
      {measureStatus && <p className="fence3d-measure-status" role="status" aria-live="polite">{measureStatus}</p>}
      {annotationStatus && <p className="fence3d-annotation-status" role="status" aria-live="polite">{annotationStatus}</p>}
      {noteDraft && <form className="fence3d-note-editor" onSubmit={(event) => { event.preventDefault(); addNote(); }}>
        <label>Note text<textarea autoFocus maxLength={500} rows={3} value={noteDraft.text}
          onChange={(event) => setNoteDraft((current) => ({ ...current, text: event.target.value }))} /></label>
        <div><button type="submit" disabled={!noteDraft.text.trim()}>Add note</button><button type="button" onClick={() => setNoteDraft(null)}>Cancel</button></div>
      </form>}
      {!layout.runs.length && pageCalibration && !(data.display.plan && calibration) && <p className="fence3d-empty">{candidates.length ? "Choose a run and assign it Chain-link. A calibrated sheet is required." : "Draw a Linear or Polyline takeoff on this sheet to generate a fence."}</p>}
      {!pageCalibration && <p className="fence3d-empty" role="status">Reading sheet calibration…</p>}
      <span className="fence3d-grid-key">{flyMode ? "WASD move · Mouse look or drag · Space/C up/down · Shift boost · −/= speed · Esc exit" : (units === "metric" ? "Meters" : "Feet") + " · Drag to orbit · Right-drag to pan · Scroll to move forward/back"}</span>
    </div>
    <aside className={"fence3d-settings" + (settingsCollapsed ? " is-collapsed" : "")} aria-label="Fence settings">
      <button className="fence3d-settings-toggle" type="button" aria-expanded={!settingsCollapsed}
        aria-label={settingsCollapsed ? "Expand fence settings" : "Collapse fence settings"}
        aria-controls="fence3d-settings-content" title={settingsCollapsed ? "Expand settings" : "Collapse settings"}
        onClick={() => setSettingsCollapsed((collapsed) => !collapsed)}>
        <span className="fence3d-settings-arrow" aria-hidden="true">{settingsCollapsed ? "‹" : "›"}</span>
        {!settingsCollapsed && <span>Hide settings</span>}
        {settingsCollapsed && <span className="fence3d-settings-tab-label">Settings</span>}
      </button>
      <div className="fence3d-settings-content" id="fence3d-settings-content" hidden={settingsCollapsed}>
      <div className="fence3d-source">
        {readOnly && <p className="fence3d-note">Preview settings apply for this session.</p>}
        <Options label="Sheet" value={page} choices={sheets.map((id) => [id, sheetLabel(id)])} update={(id) => { setSheet(id); setSelection(""); }} />
        <Options label="Source takeoff" value={selected?.id || ""} choices={[["", "Choose a linear takeoff"], ...candidates.map((shape, i) => [
          shape.id, `${shape.label || `${conditionNames[shape.condition_id] || "Run"} ${i + 1}`} · ${length((shape.computed?.perimeter_lf || 0) * FT, units)}`,
        ])]} update={(id) => { if (id) pick(id); else setSelection(""); }} />
        {selected && <Options label="Fence type" value={effectiveType} choices={TYPES} update={(type) => updateRun({ type })} />}
        {selected && !["chain-link", "exclude"].includes(effectiveType) && <p className="fence3d-note">3D generation is available for chain-link fences.</p>}
        <div className="fence3d-toolbar">
          <button disabled={!designHistory.undo.length} onClick={() => history("undo")}>Undo design</button>
          <button disabled={!designHistory.redo.length} onClick={() => history("redo")}>Redo design</button>
        </div>
        <output className="fence3d-total"><small>Total fence path</small><strong>{length(layout.totals.path, units)}</strong></output>
      {layout.issues.length > 0 && <details className="fence3d-issues"><summary>Geometry checks · {layout.issues.length} {layout.issues.length === 1 ? "issue" : "issues"}</summary>
          <ul>{layout.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </details>}
      </div>
      <RunSettings run={editingRun && { ...editingRun, spec: runSpec(config, fenceById.get(selected.id)) }} field={setStatus}
        setSpec={(name, val) => updateRun({ spec: { ...config?.spec, [name]: val } })} updateRun={updateRun} units={units} />
      <Section label="Rendering">
        {DISPLAY_CONTROLS.map(([id, label]) => <Toggle key={id} label={label} value={data.display[id]} update={(v) => updateDisplay(id, v)} />)}
        <label>Lighting<input type="range" min=".3" max="6" step=".1" value={data.display.light} onChange={(event) => updateDisplay("light", event.currentTarget.valueAsNumber)} /></label>
      </Section>
      <Section label="Color map & quantities">
        <Toggle label="Show component colors and callouts" value={colorMap} update={setColorMap} />
        <div className="fence3d-map-measure" role="group" aria-label="Fabric quantity units">
          <span>Fabric quantity</span>
          {[['length', 'LF'], ['area', 'SF']].map(([id, label]) => <button key={id} type="button" aria-pressed={data.display.fabricMeasure === id}
            onClick={() => updateDisplay("fabricMeasure", id)}>{label}</button>)}
        </div>
        <p className="fence3d-note">Rows show one quantity and its unit. Rails always show LF. Use each eye to show or hide that component in the model.</p>
        <ul className="fence3d-map-legend">
          {colorRows.map((row) => <li key={row.id}>
            <span className="fence3d-map-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" />
            <span className="fence3d-map-name">{row.title}</span>
            <button className="fence3d-map-visibility" type="button" aria-pressed={componentVisibility[row.category] !== false}
              aria-label={`${componentVisibility[row.category] === false ? "Show" : "Hide"} ${row.title}`}
              title={`${componentVisibility[row.category] === false ? "Show" : "Hide"} ${row.title}`}
              onClick={() => updateComponentVisibility(row.category, componentVisibility[row.category] === false)}>
              <VisibilityIcon visible={componentVisibility[row.category] !== false} />
            </button>
            <output>{row.quantity}</output>
          </li>)}
        </ul>
      </Section>
      <Section label={`Drawings & notes · ${annotations.drawings.length + annotations.notes.length}`}>
        {!annotations.drawings.length && !annotations.notes.length && <p className="fence3d-note">Use Draw or Note in the 3D toolbar to add saved ground annotations.</p>}
        {annotations.drawings.map((drawing, index) => <div className="fence3d-annotation-row" key={drawing.id}>
          <span>Drawing {index + 1}</span>
        </div>)}
        {annotations.notes.map((note) => <div className="fence3d-annotation-row" key={note.id}>
          <span title={note.text}>{note.text}</span>
        </div>)}
        {(annotations.drawings.length > 0 || annotations.notes.length > 0) && <p className="fence3d-note">Select a drawing or note in the 3D view to show its red × delete button.</p>}
      </Section>
      <Section label="Material quantities">
        <dl className="fence3d-quantity">{output.map(([id, title, calculated]) => <React.Fragment key={id}><dt>{title}</dt><dd>{calculated}{data.overrides[id] != null && <small> · Override {data.overrides[id]}</small>}</dd></React.Fragment>)}</dl>
        <p className="fence3d-note">Generated quantities describe this 3D layout. Overrides use the units shown beside the calculated quantities.</p>
        <QuantityOverride rows={output.filter(([id]) => id !== "measured")} values={data.overrides}
          update={(overrides) => save({ ...data, overrides })} />
      </Section>
      <Section label="Fitting quantity rules">
        {HARDWARE.map(([id, title, base]) => <label key={id}>{title} per {base === "fabric" ? "ft of fabric" : ({ totalPosts: "post", line: "line post", end: "end post", corner: "corner post", swing: "swing gate", gates: "gate" })[base]}
          <input type="number" min="0" step="any" placeholder="No rule" value={data.rules[id] ?? ""}
            onChange={(event) => {
              const rules = { ...data.rules };
              if (event.currentTarget.value === "") delete rules[id];
              else rules[id] = event.currentTarget.valueAsNumber;
              save({ ...data, rules });
            }} />
        </label>)}
      </Section>
      <Section label="Export">
        <Toggle label="Include markups" value={includeExportMarkups} update={setIncludeExportMarkups} />
        <Toggle label="Include quantities" value={includeExportQuantities} update={setIncludeExportQuantities} />
        <p className="fence3d-note">Markups include saved ground drawings, notes, and the current measurement. Quantities are added to model metadata and the browser or PNG view. Quantities CSV always exports the quantity table.</p>
        <div className="fence3d-toolbar">
          {["glb", "gltf", "otk3d", "html", "png", "csv"].map((kind) => <button key={kind} disabled={exporting || !layout.runs.length} onClick={() => exportFile(kind)} title={{
            glb: "Download a Blender-ready GLB model",
            gltf: "Download a glTF model",
            otk3d: "Download an OpenTakeoff 3D project archive",
            html: "Download an interactive browser viewer",
            png: "Download a screenshot",
            csv: "Download quantities as CSV",
          }[kind]}>{({
            glb: "Blender GLB",
            gltf: "glTF",
            otk3d: "OTK3D",
            html: "Browser HTML",
            png: "PNG",
            csv: "Quantities CSV",
          })[kind]}</button>)}
        </div>
        <p className="fence3d-note">3D exports include the ground plan when <strong>Plan</strong> is on. The HTML viewer needs internet to load its 3D engine.</p>
      </Section>
      {status && <p className="fence3d-note" role="status">{status}</p>}
      </div>
    </aside>
  </section>;
}

function QuantityOverride({ rows, values, update }) {
  const [key, setKey] = useState("totalPosts");
  return <>
    <Options label="Override item" value={key} choices={rows.map(([id, title]) => [id, title])} update={setKey} />
    <label>Purchasing quantity<input type="number" min="0" step="any" placeholder="No override" value={values[key] ?? ""}
      onChange={(event) => {
        const next = { ...values };
        if (event.currentTarget.value === "") delete next[key];
        else next[key] = event.currentTarget.valueAsNumber;
        update(next);
      }} /></label>
  </>;
}
