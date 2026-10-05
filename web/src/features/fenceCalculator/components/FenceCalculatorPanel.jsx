import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../brand/icons.jsx";
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert.jsx";
import { Badge } from "../../../components/ui/badge.jsx";
import { Button } from "../../../components/ui/button.jsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card.jsx";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog.jsx";
import { Input } from "../../../components/ui/input.jsx";
import { Label } from "../../../components/ui/label.jsx";
import { ScrollArea } from "../../../components/ui/scroll-area.jsx";
import { Select } from "../../../components/ui/select.jsx";
import { Separator } from "../../../components/ui/separator.jsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table.jsx";
import {
  CALCULATORS,
  calculateFenceMaterials,
  defaultEstimateResultIds,
  getCalculatorDefinition,
  loadFenceFavorites,
  loadFencePresets,
  makeFencePreset,
  mergeCalculatorValues,
  sanitizeFenceCalculatorProject,
  saveFenceFavorites,
  saveFencePresets,
  setDefaultFencePreset,
  takeoffToCalculatorSeed,
} from "../index.ts";
import "../../../styles/fenceCalculator.css";

const SECTION_LABELS = {
  dimensions: "Dimensions",
  layout: "Layout",
  materials: "Material rules",
  gates: "Gates",
  advanced: "Advanced",
};
const SECTION_ORDER = ["dimensions", "layout", "materials", "gates", "advanced"];

const formatQty = (value, digits = 3) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });

function initialPanelState(projectState, takeoffSource) {
  const project = sanitizeFenceCalculatorProject(projectState);
  const seed = takeoffToCalculatorSeed(takeoffSource);
  const presets = loadFencePresets();
  const activeId = seed.calculatorId || project.activeCalculatorId || "board-on-board";
  const calculator = getCalculatorDefinition(activeId) || CALCULATORS[0];
  const saved = project.valuesByCalculator[calculator.id];
  const defaultPreset = !saved ? presets.find((preset) => preset.calculatorId === calculator.id && preset.isDefault) : null;
  const valuesByCalculator = {
    ...project.valuesByCalculator,
    [calculator.id]: mergeCalculatorValues(calculator, defaultPreset?.values, saved, seed.values),
  };
  return { presets, project, seed, activeId: calculator.id, valuesByCalculator };
}

function CalculatorInput({ definition, value, issue, onChange }) {
  const id = `fence-input-${definition.id}`;
  return (
    <div className="fence-field">
      <div className="fence-field-label">
        <Label htmlFor={id}>{definition.label}</Label>
        {definition.unit && <Badge variant="outline">{definition.unit}</Badge>}
      </div>
      {definition.type === "select" ? (
        <Select id={id} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} aria-invalid={!!issue} title={definition.description}>
          {(definition.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      ) : (
        <Input id={id} type="number" inputMode="decimal" value={value ?? ""}
          min={definition.min} max={definition.max} step={definition.integer ? 1 : definition.step || "any"}
          onChange={(event) => onChange(event.target.value)} aria-invalid={!!issue} title={definition.description} />
      )}
      {definition.description && !issue && <small>{definition.description}</small>}
      {issue && <small className="fence-field-error">{issue.message}</small>}
    </div>
  );
}

export default function FenceCalculatorPanel({
  projectState,
  onProjectStateChange,
  takeoffSource,
  activeCondition,
  onAddToEstimate,
  onClose,
}) {
  const initial = useRef(null);
  if (!initial.current) initial.current = initialPanelState(projectState, takeoffSource);
  const [presets, setPresets] = useState(initial.current.presets);
  const [favorites, setFavorites] = useState(loadFenceFavorites);
  const [activeId, setActiveId] = useState(initial.current.activeId);
  const [valuesByCalculator, setValuesByCalculator] = useState(initial.current.valuesByCalculator);
  const [selectedResults, setSelectedResults] = useState([]);
  const [unitCosts, setUnitCosts] = useState({});
  const [rulesOpen, setRulesOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState({});
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [deletePreset, setDeletePreset] = useState(null);
  const [notice, setNotice] = useState("");
  const seed = initial.current.seed;
  const calculator = getCalculatorDefinition(activeId) || CALCULATORS[0];
  const values = mergeCalculatorValues(calculator, valuesByCalculator[calculator.id]);
  const calculation = useMemo(() => calculateFenceMaterials(calculator.id, values), [calculator.id, valuesByCalculator]); // eslint-disable-line react-hooks/exhaustive-deps
  const issueByField = useMemo(() => new Map([...calculation.errors, ...calculation.warnings].map((issue) => [issue.field, issue])), [calculation]);
  const sortedCalculators = useMemo(() => [...CALCULATORS].sort((a, b) => {
    const af = favorites.includes(a.id), bf = favorites.includes(b.id);
    return af === bf ? 0 : af ? -1 : 1;
  }), [favorites]);

  useEffect(() => {
    onProjectStateChange?.({ version: 1, activeCalculatorId: calculator.id, valuesByCalculator });
  }, [calculator.id, valuesByCalculator, onProjectStateChange]);

  useEffect(() => {
    setSelectedResults(defaultEstimateResultIds(calculation.results));
    setUnitCosts({});
  }, [calculator.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const setValue = (id, value) => {
    setValuesByCalculator((current) => ({
      ...current,
      [calculator.id]: { ...mergeCalculatorValues(calculator, current[calculator.id]), [id]: value },
    }));
    setNotice("");
  };

  const chooseCalculator = (id) => {
    const next = getCalculatorDefinition(id);
    if (!next) return;
    setValuesByCalculator((current) => {
      if (current[id]) return current;
      const defaultPreset = presets.find((preset) => preset.calculatorId === id && preset.isDefault);
      return { ...current, [id]: mergeCalculatorValues(next, defaultPreset?.values, seed.values) };
    });
    setActiveId(id);
    setNotice("");
  };

  const toggleFavorite = (id) => setFavorites((current) => saveFenceFavorites(
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
  ));

  const openRules = () => {
    setRuleDraft(Object.fromEntries(calculator.ruleKeys.map((key) => [key, values[key]])));
    setRulesOpen(true);
  };

  const applyRules = () => {
    setValuesByCalculator((current) => ({
      ...current,
      [calculator.id]: mergeCalculatorValues(calculator, current[calculator.id], ruleDraft),
    }));
    setRulesOpen(false);
    setNotice("Rule values updated for this project.");
  };

  const applyPreset = (id) => {
    const preset = presets.find((item) => item.id === id);
    if (!preset) return;
    const target = getCalculatorDefinition(preset.calculatorId);
    if (!target) return;
    setValuesByCalculator((current) => ({ ...current, [target.id]: mergeCalculatorValues(target, preset.values, seed.values) }));
    setActiveId(target.id);
    setNotice(`Loaded preset “${preset.name}”.`);
  };

  const persistPresets = (next) => {
    const saved = saveFencePresets(next);
    setPresets(saved);
    return saved;
  };

  const saveCurrentPreset = () => {
    try {
      const preset = makeFencePreset(calculator.id, presetName, values);
      persistPresets([...presets, preset]);
      setPresetName("");
      setNotice(`Saved preset “${preset.name}”.`);
    } catch (error) { setNotice(error.message || "Could not save the preset."); }
  };

  const duplicatePreset = (preset) => {
    const now = new Date().toISOString();
    persistPresets([...presets, { ...preset, id: crypto.randomUUID(), name: `${preset.name} copy`, isDefault: undefined, createdAt: now, updatedAt: now }]);
  };

  const confirmDeletePreset = () => {
    if (!deletePreset) return;
    persistPresets(presets.filter((preset) => preset.id !== deletePreset.id));
    setDeletePreset(null);
  };

  const toggleResult = (id) => setSelectedResults((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const selectedTotal = calculation.results.reduce((sum, result) => {
    if (!selectedResults.includes(result.id)) return sum;
    const cost = Number(unitCosts[result.id]);
    return sum + (Number.isFinite(cost) && cost >= 0 ? result.orderQty * cost : 0);
  }, 0);

  const addToEstimate = () => {
    const count = onAddToEstimate?.(calculation, selectedResults, unitCosts) || 0;
    setNotice(count ? `Added ${count} material line${count === 1 ? "" : "s"} to ${activeCondition?.finish_tag || "the active takeoff"}.` : "No material lines were added.");
  };

  const groups = SECTION_ORDER.map((section) => ({
    section,
    inputs: calculator.inputs.filter((input) => (input.section || "dimensions") === section && (!input.visibleWhen || input.visibleWhen.values.includes(values[input.visibleWhen.field]))),
  })).filter((group) => group.inputs.length);

  return createPortal(
    <section className="fence-calculator" role="dialog" aria-modal="true" aria-label="Fence Material Calculator" tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape") onClose?.(); }}>
      <header className="fence-calculator-header">
        <div>
          <span className="fence-eyebrow">Estimating tool</span>
          <h1>Fence Material Calculator</h1>
          <p>Rule-driven material takeoffs with instant order quantities.</p>
        </div>
        <div className="fence-header-actions">
          <Badge variant="positive">Saved with project</Badge>
          <Button variant="outline" onClick={openRules}><Icon name="sliders" size={15} />Edit rules</Button>
          <Button variant="outline" onClick={() => setPresetsOpen(true)}><Icon name="star" size={15} />Presets</Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close fence calculator" title="Close"><Icon name="close" size={18} /></Button>
        </div>
      </header>

      {seed.source.quantity > 0 && (
        <div className="fence-import-banner">
          <Icon name="linear" size={16} />
          <span>Imported <strong>{formatQty(seed.source.quantity)} {seed.source.unit}</strong>{seed.source.label ? ` from ${seed.source.label}` : " from the active takeoff"}.</span>
          {seed.suggestedCalculatorIds.length > 0 && <Badge variant="default">Suggested match</Badge>}
        </div>
      )}

      <main className="fence-calculator-grid">
        <Card className="fence-selector-card">
          <CardHeader>
            <CardTitle>Calculator</CardTitle>
            <CardDescription>Favorites stay at the top.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="fence-calculator-list">
              {sortedCalculators.map((item) => {
                const active = item.id === calculator.id;
                const favorite = favorites.includes(item.id);
                const suggested = seed.suggestedCalculatorIds.includes(item.id);
                return <div key={item.id} className={`fence-calculator-choice${active ? " is-active" : ""}`}>
                  <button type="button" onClick={() => chooseCalculator(item.id)} aria-pressed={active}>
                    <span>{item.shortName}</span>
                    {suggested && <small>takeoff match</small>}
                  </button>
                  <button type="button" className="fence-favorite" onClick={() => toggleFavorite(item.id)} aria-pressed={favorite} aria-label={`${favorite ? "Remove" : "Add"} ${item.shortName} ${favorite ? "from" : "to"} favorites`} title={favorite ? "Remove favorite" : "Favorite calculator"}>
                    <Icon name={favorite ? "starFilled" : "star"} size={14} />
                  </button>
                </div>;
              })}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="fence-inputs-card">
          <CardHeader>
            <div className="fence-card-title-row">
              <div><CardTitle>{calculator.name}</CardTitle><CardDescription>{calculator.description}</CardDescription></div>
              <Badge variant="outline">Instant</Badge>
            </div>
            <div className="fence-preset-quick">
              <Select aria-label="Apply a saved preset" value="" onChange={(event) => applyPreset(event.target.value)}>
                <option value="">Apply preset…</option>
                {presets.filter((preset) => preset.calculatorId === calculator.id).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{preset.isDefault ? " · default" : ""}</option>)}
              </Select>
              <Button size="sm" variant="outline" onClick={() => { setPresetName(`${calculator.shortName} preset`); setPresetsOpen(true); }}>Save current</Button>
            </div>
          </CardHeader>
          <CardContent className="fence-input-groups">
            {groups.map((group, groupIndex) => <React.Fragment key={group.section}>
              {groupIndex > 0 && <Separator />}
              <section className="fence-input-group">
                <h3>{SECTION_LABELS[group.section]}</h3>
                <div className="fence-fields">
                  {group.inputs.map((input) => <CalculatorInput key={input.id} definition={input} value={values[input.id]} issue={issueByField.get(input.id)} onChange={(value) => setValue(input.id, value)} />)}
                </div>
              </section>
            </React.Fragment>)}
          </CardContent>
        </Card>

        <Card className="fence-results-card">
          <CardHeader>
            <div className="fence-card-title-row">
              <div><CardTitle>Materials</CardTitle><CardDescription>Required versus rounded order quantity.</CardDescription></div>
              <Badge variant={calculation.valid ? "positive" : "outline"}>{calculation.valid ? `${calculation.results.length} results` : "Check inputs"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {calculation.errors.length > 0 && <Alert variant="destructive"><AlertTitle>Fix the highlighted inputs</AlertTitle><AlertDescription>{calculation.errors.map((error) => error.message).join(" ")}</AlertDescription></Alert>}
            {calculation.warnings.length > 0 && <Alert variant="warning"><AlertTitle>Layout warning</AlertTitle><AlertDescription>{calculation.warnings.map((warning) => warning.message).join(" ")}</AlertDescription></Alert>}
            {calculation.valid && <Table>
              <TableHeader><TableRow>
                <TableHead><span className="sr-only">Include</span></TableHead><TableHead>Material</TableHead><TableHead>Required</TableHead><TableHead>Waste</TableHead><TableHead>Order</TableHead><TableHead>Unit cost</TableHead><TableHead>Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>{calculation.results.map((item) => {
                const included = selectedResults.includes(item.id);
                const cost = Number(unitCosts[item.id]);
                const total = Number.isFinite(cost) && cost >= 0 ? item.orderQty * cost : null;
                return <TableRow key={item.id} title={item.note || "Order quantity applies waste and the configured rounding rule."}>
                  <TableCell><input type="checkbox" checked={included} onChange={() => toggleResult(item.id)} aria-label={`Include ${item.name}`} /></TableCell>
                  <TableCell><strong>{item.name}</strong>{item.stockSize && <small>{item.stockSize} {item.stockUnit} stock</small>}</TableCell>
                  <TableCell>{formatQty(item.requiredQty)} <small>{item.unit}</small></TableCell>
                  <TableCell>{item.wastePercent ? `${formatQty(item.wastePercent)}%` : "—"}</TableCell>
                  <TableCell><strong>{formatQty(item.orderQty)}</strong> <small>{item.unit}</small></TableCell>
                  <TableCell><Input className="fence-cost-input" type="number" min="0" step="0.01" inputMode="decimal" placeholder="—" value={unitCosts[item.id] ?? ""} onChange={(event) => setUnitCosts((current) => ({ ...current, [item.id]: event.target.value }))} aria-label={`${item.name} unit cost`} /></TableCell>
                  <TableCell>{total == null ? "—" : total.toLocaleString(undefined, { style: "currency", currency: "USD" })}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>}
            {selectedTotal > 0 && <div className="fence-priced-total"><span>Selected material total</span><strong>{selectedTotal.toLocaleString(undefined, { style: "currency", currency: "USD" })}</strong></div>}
            {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
            {!activeCondition && <Alert variant="warning"><AlertTitle>No active takeoff condition</AlertTitle><AlertDescription>Results are ready, but select a takeoff condition before adding its material lines to the estimate.</AlertDescription></Alert>}
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={openRules}>Edit rules</Button>
            <Button onClick={addToEstimate} disabled={!calculation.valid || !selectedResults.length || !activeCondition}>Add to Estimate</Button>
          </CardFooter>
        </Card>
      </main>

      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogHeader><DialogTitle>Edit {calculator.shortName} rules</DialogTitle><DialogDescription>These values are project-specific. Formulas remain safe, fixed code—no arbitrary expressions are executed.</DialogDescription></DialogHeader>
        <div className="fence-dialog-body fence-rule-fields">
          {calculator.ruleKeys.map((key) => {
            const input = calculator.inputs.find((definition) => definition.id === key);
            if (!input) return null;
            return <CalculatorInput key={key} definition={input} value={ruleDraft[key]} issue={null} onChange={(value) => setRuleDraft((current) => ({ ...current, [key]: value }))} />;
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setRulesOpen(false)}>Cancel</Button><Button onClick={applyRules}>Apply rules</Button></DialogFooter>
      </Dialog>

      <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
        <div className="fence-presets-dialog">
          <DialogHeader><DialogTitle>Fence calculator presets</DialogTitle><DialogDescription>Presets are reusable across projects in this browser. Project quantities are stored separately.</DialogDescription></DialogHeader>
          <div className="fence-dialog-body">
            <div className="fence-save-preset">
              <Input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder={`${calculator.shortName} preset name`} aria-label="Preset name" />
              <Button onClick={saveCurrentPreset} disabled={!presetName.trim()}>Save current values</Button>
            </div>
            <Separator />
            <ScrollArea className="fence-preset-list">
              {presets.length === 0 && <p className="fence-empty-copy">No saved presets yet.</p>}
              {presets.map((preset) => <div className="fence-preset-row" key={preset.id}>
                <div>
                  <Input value={preset.name} aria-label="Preset name" onChange={(event) => setPresets((current) => current.map((item) => item.id === preset.id ? { ...item, name: event.target.value } : item))}
                    onBlur={() => persistPresets(presets.map((item) => item.id === preset.id ? { ...item, updatedAt: new Date().toISOString() } : item))} />
                  <small>{getCalculatorDefinition(preset.calculatorId)?.shortName}{preset.isDefault ? " · default" : ""}</small>
                </div>
                <div>
                  <Button size="sm" variant="outline" onClick={() => applyPreset(preset.id)}>Load</Button>
                  <Button size="sm" variant="ghost" onClick={() => persistPresets(setDefaultFencePreset(presets, preset.id))}>{preset.isDefault ? "Default" : "Set default"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => duplicatePreset(preset)}>Duplicate</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletePreset(preset)} aria-label={`Delete ${preset.name}`}><Icon name="close" size={13} /></Button>
                </div>
              </div>)}
            </ScrollArea>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPresetsOpen(false)}>Done</Button></DialogFooter>
        </div>
      </Dialog>

      <Dialog open={!!deletePreset} onOpenChange={(open) => !open && setDeletePreset(null)}>
        <DialogHeader><DialogTitle>Delete preset?</DialogTitle><DialogDescription>“{deletePreset?.name}” will be removed from this browser. Project calculator values are unaffected.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setDeletePreset(null)}>Cancel</Button><Button variant="destructive" onClick={confirmDeletePreset}>Delete preset</Button></DialogFooter>
      </Dialog>
    </section>,
    document.body,
  );
}
