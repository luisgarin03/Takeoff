import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { LOGO_DEFAULTS, useLogoSettings, setLogoSettings } from "../brand/logoSettings.js";
import "./themeSettings.css";
import { CURSOR_THEMES } from "../brand/cursorThemes.js";

export default function ThemeSettings({ theme, toggleTheme, onClose, onMenuDepth }) {
  const settings = useLogoSettings();
  const dialog = useRef(null);
  const update = (patch) => setLogoSettings({ ...settings, ...patch });
  useEffect(() => {
    const focus = document.activeElement;
    onMenuDepth(true);
    dialog.current.showModal();
    return () => { onMenuDepth(false); focus?.focus(); };
  }, [onMenuDepth]);
  return createPortal(<dialog className="theme-settings" ref={dialog} aria-labelledby="theme-settings-title" onCancel={onClose} onKeyDown={(e) => e.stopPropagation()}>
    <header><div><small>APPEARANCE</small><h2 id="theme-settings-title">Theme</h2></div><button autoFocus onClick={onClose} aria-label="Close theme settings">×</button></header>
    <div className="theme-settings-body">
      <label className="theme-row">App theme<button onClick={toggleTheme}>{theme === "dark" ? "Dark" : "Light"} · Switch to {theme === "dark" ? "light" : "dark"}</button></label>
      <fieldset><legend>Cursor theme</legend><div className="theme-cursors">{CURSOR_THEMES.map((cursorTheme) => <button key={cursorTheme} type="button" aria-pressed={settings.cursorTheme === cursorTheme} onClick={() => update({ cursorTheme })}>{cursorTheme[0].toUpperCase() + cursorTheme.slice(1)}</button>)}</div></fieldset>
      <label>Logo effect<select value={settings.effect} onChange={(e) => update({ effect: e.target.value })}><option value="shimmer">Shimmer — moving highlight</option><option value="solid">Solid color — no animation</option><option value="pulse">Pulse — soft fade</option><option value="morph">Morph — blend two colors</option><option value="rainbow">Rainbow — moving spectrum</option></select></label>
      <div className="theme-colors"><label>Primary color<input aria-label="Primary logo color" type="color" value={settings.color} disabled={settings.effect === "rainbow"} onChange={(e) => update({ color: e.target.value })} /><span>{settings.color.toUpperCase()}</span></label><label>Second color<input aria-label="Second logo color" type="color" value={settings.second} disabled={settings.effect !== "morph"} onChange={(e) => update({ second: e.target.value })} /><span>{settings.second.toUpperCase()}</span></label></div>
      {settings.effect === "rainbow" && <p>Rainbow uses the full spectrum. Choose another effect to use a custom color.</p>}
      <fieldset disabled={settings.effect === "rainbow"}><legend>Preset colors</legend><div className="theme-swatches">{["#8da8ff", "#38bdf8", "#34d399", "#facc15", "#fb923c", "#f87171", "#c084fc", "#f472b6"].map((color) => <button key={color} aria-label={`Use ${color}`} aria-pressed={settings.color === color} style={{ background: color }} onClick={() => update({ color })} />)}</div></fieldset>
      <label>Brightness <output>{settings.brightness}%</output><input aria-label="Logo brightness" type="range" min="30" max="150" value={settings.brightness} onChange={(e) => update({ brightness: +e.target.value })} /></label>
      <label>Animation speed <output>{settings.speed}%</output><input aria-label="Logo animation speed" disabled={settings.effect === "solid"} type="range" min="0" max="100" value={settings.speed} onChange={(e) => update({ speed: +e.target.value })} /><span className="theme-range-labels"><span>Slow</span><span>Fast</span></span></label>
      <p>Changes save automatically in this browser. System reduced-motion settings pause logo animation.</p>
    </div>
    <footer><button onClick={() => setLogoSettings({ ...LOGO_DEFAULTS, cursorTheme: settings.cursorTheme })}>Reset logo</button><button onClick={onClose}>Done</button></footer>
  </dialog>, document.body);
}
