import React from "react";

function toHex(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + rgb.map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("");
}
function fromHex(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const v = Math.max(r, g, b), d = v - Math.min(r, g, b);
  return { h: d ? ((v === r ? (g - b) / d : v === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360 : 0, s: v ? d / v : 0, v };
}
export default function ColorWheel({ color, onChange }) {
  const { h, s, v } = fromHex(color);
  const select = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2), y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    onChange(toHex((Math.atan2(y, x) * 180 / Math.PI + 450) % 360, Math.min(1, Math.hypot(x, y)), v || 1));
  };
  return <div className="logo-wheel-group" style={{ display: "grid", gap: 14 }}>
    <div className="logo-color-wheel" style={{ position: "relative", justifySelf: "center", width: 180, height: 180, borderRadius: "50%", touchAction: "none", cursor: "crosshair", background: "radial-gradient(circle closest-side, white, transparent), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }} role="slider" tabIndex={0} aria-label="Logo color wheel" aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(h) % 360} aria-valuetext={color}
      onKeyDown={(e) => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return; e.preventDefault(); const step = ["ArrowRight", "ArrowUp"].includes(e.key) ? 1 : -1; onChange(toHex(e.shiftKey ? h : (h + step * 3 + 360) % 360, e.shiftKey ? Math.max(0, Math.min(1, s + step * .05)) : s || 1, v || 1)); }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); select(e); }} onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) select(e); }}>
      <span style={{ position: "absolute", width: 16, height: 16, border: "2px solid white", borderRadius: "50%", boxShadow: "0 0 0 1px #222", transform: "translate(-50%, -50%)", pointerEvents: "none", left: `${50 + Math.sin(h * Math.PI / 180) * s * 50}%`, top: `${50 - Math.cos(h * Math.PI / 180) * s * 50}%`, background: color }} />
    </div>
    <p>Drag around the wheel for color; toward the center for softer shades. Arrow keys change hue; Shift + arrows changes saturation.</p>
    <label>Color shade<input aria-label="Color shade" type="range" min="0" max="100" value={Math.round(v * 100)} onChange={(e) => onChange(toHex(h, s, +e.target.value / 100))} /></label>
  </div>;
}
