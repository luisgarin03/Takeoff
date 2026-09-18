import React from "react";

// The canvas owns these values and the pointer implementation; this component
// is deliberately just the small, accessible settings surface beside the rail.
export default function TrackpadSettings({ visible, width, height, opacity, bottom, onVisibleChange, onWidthChange, onHeightChange, onOpacityChange, onClose }) {
  return (
    <section id="trackpad-settings" className="trackpad-settings" aria-label="Trackpad settings" style={{ bottom }} onPointerDown={(e) => e.stopPropagation()}>
      <header className="trackpad-settings-header">
        <strong>Trackpad settings</strong>
        <button type="button" className="trackpad-settings-close" onClick={onClose} aria-label="Close Trackpad settings">×</button>
      </header>

      <label className="trackpad-show">
        <input type="checkbox" checked={visible} onChange={(e) => onVisibleChange(e.target.checked)} />
        <span>Show Trackpad</span>
      </label>

      <label className="trackpad-setting">
        <span><b>Width</b><output>{width}%</output></span>
        <input type="range" min="50" max="100" step="1" value={width}
          onChange={(e) => onWidthChange(Number(e.target.value))} aria-label="Trackpad width" />
      </label>

      <label className="trackpad-setting">
        <span><b>Height</b><output>{height} px</output></span>
        <input type="range" min="40" max="150" step="1" value={height}
          onChange={(e) => onHeightChange(Number(e.target.value))} aria-label="Trackpad height" />
      </label>

      <label className="trackpad-setting">
        <span><b>Transparency</b><output>{opacity}% opacity</output></span>
        <input type="range" min="35" max="100" step="1" value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))} aria-label="Trackpad opacity" />
      </label>
    </section>
  );
}
