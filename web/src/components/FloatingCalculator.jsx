import { useEffect, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";

const POSITION_KEY = "opentakeoff_calculator_position";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function normalizeExpression(raw) {
  let expression = String(raw || "")
    .replace(/[′’]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/(\d+(?:\.\d+)?)\s*'/g, "$1 ft")
    .replace(/(\d+(?:\.\d+)?)\s*"/g, "$1 in")
    .replace(/\b(feet|foot)\b/gi, "ft")
    .replace(/\b(inches|inch)\b/gi, "in")
    .replace(/\bft(?=\s*\d)/gi, "ft + ");
  expression = expression.replace(/(\d+)\s+(\d+)\/(\d+)\s*(ft|in)\b/gi, (_, whole, numerator, denominator, unit) => {
    const fraction = Number(numerator) / Number(denominator);
    return Number.isFinite(fraction) ? (Number(whole) + fraction) + " " + unit : "";
  });
  if (!/^[\d\s()+\-*/%.^a-z]*$/i.test(expression)) throw new Error("Use numbers and + − × ÷, parentheses, ft, or in.");
  const words = expression.match(/[a-z]+/gi) || [];
  if (words.some((word) => !["ft", "in", "sqrt"].includes(word.toLowerCase()))) throw new Error("Only feet and inches are supported as units.");
  return expression.trim();
}

function formatFeetInches(rawInches) {
  const totalInches = Math.round(Math.abs(rawInches) * 1000) / 1000;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round((totalInches - feet * 12) * 1000) / 1000;
  const inchText = Number.isInteger(inches) ? String(inches) : inches.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return (rawInches < 0 ? "−" : "") + feet + "' " + inchText + '"';
}

async function calculate(raw) {
  const expression = normalizeExpression(raw);
  if (!expression) return { display: "0", value: 0, length: false };
  const { evaluate } = await import("mathjs");
  const value = evaluate(expression);
  if (value && value.isUnit) {
    const inches = value.toNumber("inch");
    if (!Number.isFinite(inches)) throw new Error("Result is not a finite measurement.");
    return { display: formatFeetInches(inches), value: inches, length: true };
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error("Result is not a finite number.");
  return { display: Number(numeric.toPrecision(12)).toString(), value: numeric, length: false };
}

const buttonBase = {
  minWidth: 0, minHeight: 44, border: "1px solid var(--workspace-border, #3b3b3b)",
  borderRadius: 5, background: "var(--workspace-muted, #303236)", color: "var(--workspace-foreground, #f5f5f5)",
  cursor: "pointer", font: "500 18px var(--f-body, system-ui)",
};
const headerButtonStyle = {
  width: 26, height: 26, padding: 0, border: 0, borderRadius: 4,
  background: "transparent", color: "var(--workspace-foreground, #f3f3f3)",
  cursor: "pointer", fontSize: 19, lineHeight: 1,
};

export default function FloatingCalculator({ open, onClose }) {
  const [position, setPosition] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return stored;
    } catch { /* use the default position */ }
    return { x: Math.max(12, (typeof window === "undefined" ? 1024 : window.innerWidth) - 350), y: 104 };
  });
  const [collapsed, setCollapsed] = useState(false);
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("0");
  const [error, setError] = useState("");
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [memory, setMemory] = useState(null);
  const [memoryIndicator, setMemoryIndicator] = useState(false);
  const dragRef = useRef(null);
  const inputRef = useRef(null);
  const valueRef = useRef({ value: 0, length: false });
  const positionRef = useRef(position);
  useEffect(() => { positionRef.current = position; }, [position]);

  useEffect(() => {
    if (!open || !expression.trim()) {
      if (!expression.trim()) { setResult("0"); setError(""); valueRef.current = { value: 0, length: false }; }
      return undefined;
    }
    let current = true;
    const timer = setTimeout(() => {
      calculate(expression).then((answer) => {
        if (!current) return;
        setResult(answer.display); setError(""); valueRef.current = answer;
      }).catch(() => { if (current) setError(""); });
    }, 100);
    return () => { current = false; clearTimeout(timer); };
  }, [expression, open]);

  useEffect(() => {
    const resize = () => setPosition((p) => ({
      x: clamp(p.x, 8, Math.max(8, window.innerWidth - 330)),
      y: clamp(p.y, 8, Math.max(8, window.innerHeight - (collapsed ? 48 : 470))),
    }));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [collapsed]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerMove = (event) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const next = {
        x: clamp(event.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - drag.width - 8)),
        y: clamp(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - (collapsed ? 48 : drag.height) - 8)),
      };
      positionRef.current = next;
      setPosition(next);
    };
    const onPointerUp = (event) => {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
      dragRef.current = null;
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(positionRef.current)); } catch { /* keep the current position in memory */ }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [collapsed, open]);

  const append = (token) => {
    const numeric = /^\d$/.test(token) || token === ".";
    setExpression((current) => {
      const base = justEvaluated && numeric ? "" : current;
      if (/^[+\-*/]$/.test(token)) return base.trimEnd() + " " + token + " ";
      return base + token;
    });
    setError(""); setJustEvaluated(false);
  };
  const equals = async () => {
    try {
      const answer = await calculate(expression);
      setResult(answer.display); valueRef.current = answer; setError(""); setJustEvaluated(true);
    } catch (cause) {
      setError(cause && cause.message ? cause.message : "Check the expression.");
      setJustEvaluated(false);
    }
  };
  const wrapExpression = (prefix, suffix) => {
    if (!expression.trim()) { append(prefix); return; }
    setExpression(prefix + "(" + expression + ")" + suffix);
    setJustEvaluated(false); setError("");
  };
  const clear = () => { setExpression(""); setResult("0"); setError(""); valueRef.current = { value: 0, length: false }; setJustEvaluated(false); };
  const backspace = () => { setExpression((current) => current.slice(0, -1)); setError(""); setJustEvaluated(false); };
  const toggleSign = () => {
    setExpression((current) => {
      const match = current.match(/(\d+(?:\.\d+)?\s*(?:ft|in)?\s*)$/i);
      if (!match) return current ? "- (" + current + ")" : "-";
      const start = match.index || 0, suffix = match[1].trim();
      return current.slice(0, start) + (suffix.startsWith("-") ? suffix.slice(1) : "-" + suffix);
    });
    setJustEvaluated(false);
  };
  const memoryAction = (action) => {
    if (action === "MC") { setMemory(null); setMemoryIndicator(false); return; }
    if (action === "MR") {
      if (memory) setExpression(memory.length ? (memory.value / 12) + " ft" : String(memory.value));
      return;
    }
    const current = valueRef.current;
    if (action === "MS") setMemory(current);
    else if (action === "M+") setMemory((old) => ({ value: (old ? old.value : 0) + current.value, length: !!(old && old.length) || current.length }));
    else if (action === "M−") setMemory((old) => ({ value: (old ? old.value : 0) - current.value, length: !!(old && old.length) || current.length }));
    else if (action === "M↕") setMemoryIndicator((shown) => !shown);
  };
  if (!open) return null;

  const key = (label, action, tone) => (
    <button key={label} type="button" onClick={action} style={{
      ...buttonBase,
      background: tone === "operator" ? "var(--workspace-raised, #414349)" : tone === "equals" ? "#bda9d8" : tone === "utility" ? "var(--workspace-panel, #282a2e)" : buttonBase.background,
      color: tone === "equals" ? "#17151b" : buttonBase.color,
      fontSize: tone === "utility" ? 14 : 18,
    }}>{label}</button>
  );
  const headerPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  return (
    <section role="dialog" aria-label="Calculator" onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        position: "fixed", left: position.x, top: position.y, zIndex: 3200,
        width: "min(340px, calc(100vw - 16px))", boxSizing: "border-box",
        border: "1px solid var(--workspace-border, #444)", borderRadius: 9, overflow: "hidden",
        color: "var(--workspace-foreground, #f5f5f5)", background: "var(--workspace-panel, #202124)",
        boxShadow: "0 14px 36px rgba(0,0,0,.42)", fontFamily: "var(--f-body, system-ui)",
      }}>
      <header onPointerDown={headerPointerDown} style={{ height: 40, display: "flex", alignItems: "center", gap: 9, padding: "0 9px", background: "var(--workspace-muted, #303236)", cursor: "grab", userSelect: "none" }}>
        <Icon name="calculator" size={16} />
        <strong style={{ flex: 1, fontSize: 13 }}>Calculator</strong>
        <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand calculator" : "Minimize calculator"} title={collapsed ? "Expand" : "Minimize"} style={headerButtonStyle}>−</button>
        <button type="button" onClick={onClose} aria-label="Close calculator" title="Close" style={{ ...headerButtonStyle, color: "var(--c-danger, #d34b43)" }}>×</button>
      </header>
      {!collapsed && <div style={{ padding: 10 }}>
        <div style={{ minHeight: 112, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "8px 9px 12px", marginBottom: 8, borderRadius: 6, background: "var(--workspace-canvas, #1b1c1e)" }}>
          <input ref={inputRef} value={expression} onChange={(event) => { setExpression(event.target.value); setJustEvaluated(false); setError(""); }}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === "=") { event.preventDefault(); equals(); } else if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
            aria-label="Calculator expression" placeholder={'try 10\' - 4"'}
            style={{ width: "100%", boxSizing: "border-box", padding: "3px 1px", border: 0, outline: 0, background: "transparent", color: "var(--ink-muted, #aaa)", textAlign: "right", font: "14px ui-monospace, monospace" }} />
          <div aria-live="polite" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", font: "500 clamp(26px, 8vw, 38px) ui-monospace, monospace", lineHeight: 1.15 }}>
            {error ? <span style={{ fontSize: 12, color: "var(--c-danger, #db675f)" }}>{error}</span> : result}
          </div>
          {memoryIndicator && memory && <small style={{ color: "var(--ink-muted, #aaa)" }}>Memory: {memory.length ? formatFeetInches(memory.value) : memory.value}</small>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2, margin: "0 1px 7px" }}>
          {["MC", "MR", "M+", "M−", "MS", "M↕"].map((label) => <button key={label} type="button" onClick={() => memoryAction(label)}
            style={{ border: 0, padding: "4px 0", color: "var(--workspace-foreground, #eee)", background: "transparent", cursor: "pointer", fontSize: 12, opacity: label === "MR" && !memory ? .45 : 1 }}>{label}</button>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2 }}>
          {key("%", () => append("/100"), "utility")}
          {key("CE", clear, "utility")}
          {key("C", clear, "utility")}
          {key("⌫", backspace, "utility")}
          {key("1/x", () => wrapExpression("1/", ""), "utility")}
          {key("x²", () => wrapExpression("", "^2"), "utility")}
          {key("√x", () => wrapExpression("sqrt", ""), "utility")}
          {key("÷", () => append("/"), "operator")}
          {key("7", () => append("7"))}{key("8", () => append("8"))}{key("9", () => append("9"))}{key("×", () => append("*"), "operator")}
          {key("4", () => append("4"))}{key("5", () => append("5"))}{key("6", () => append("6"))}{key("−", () => append("-"), "operator")}
          {key("1", () => append("1"))}{key("2", () => append("2"))}{key("3", () => append("3"))}{key("+", () => append("+"), "operator")}
          {key("±", toggleSign, "utility")}{key("0", () => append("0"))}{key(".", () => append("."))}{key("=", equals, "equals")}
          {key("ft ′", () => append("'"), "utility")}{key("in ″", () => append('"'), "utility")}
          {key("(", () => append("("), "utility")}{key(")", () => append(")"), "utility")}
        </div>
      </div>}
    </section>
  );
}
