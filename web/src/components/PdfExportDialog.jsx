import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import { DEFAULT_PDF_EXPORT_QUALITY, PDF_EXPORT_QUALITIES, formatFileSizeRange, pdfExportQuality } from "../lib/exportQuality.js";

export default function PdfExportDialog({ title = "Export PDF", scopeLabel, defaultQuality = DEFAULT_PDF_EXPORT_QUALITY,
  estimateFor, busy = false, onExport, onClose }) {
  const [quality, setQuality] = useState(pdfExportQuality(defaultQuality).id);
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector('input[name="pdf-export-quality"]:checked')?.focus();
    const key = (event) => {
      if (!root.current?.contains(event.target)) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); previous?.focus?.(); };
  }, [busy, onClose]);
  return <div ref={root} className="pdf-export-scrim" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section className="pdf-export-dialog" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title">
      <header>
        <div><span>PDF export</span><h2 id="pdf-export-title">{title}</h2></div>
        <button type="button" aria-label="Close PDF export settings" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="pdf-export-body">
        {scopeLabel && <p className="pdf-export-scope">{scopeLabel}</p>}
        <div className="pdf-quality-list" role="radiogroup" aria-label="PDF export quality">
          {PDF_EXPORT_QUALITIES.map((preset) => {
            const checked = quality === preset.id;
            return <label key={preset.id} className={checked ? "is-selected" : ""}>
              <input name="pdf-export-quality" type="radio" value={preset.id} checked={checked}
                onChange={() => setQuality(preset.id)} disabled={busy} />
              <span className="pdf-quality-copy"><b>{preset.label}</b><small>{preset.badge}</small><em>{preset.description}</em></span>
              <strong>{formatFileSizeRange(estimateFor?.(preset.id))}</strong>
            </label>;
          })}
        </div>
        <div className="pdf-export-note"><Icon name="check" size={15} /><span><b>Lightweight visual PDF.</b> The visible page is flattened while source OCR, selectable text, fonts, forms, annotation data, and hidden PDF resources are removed. The estimate is a range because drawing density affects JPEG compression.</span></div>
      </div>
      <footer>
        <button className="btn-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="btn-primary" type="button" disabled={busy} onClick={() => onExport(quality)}>
          <Icon name="document" size={15} />{busy ? "Exporting…" : `Export ${pdfExportQuality(quality).label}`}
        </button>
      </footer>
    </section>
  </div>;
}
