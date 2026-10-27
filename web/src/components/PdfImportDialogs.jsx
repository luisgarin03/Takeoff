import React, { useEffect, useState } from "react";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.jsx";
import { PDF_OCR_MODES, PDF_OPEN_MODES } from "../lib/pdfPreferences.js";

export function PdfPasswordDialog({ prompt, onSubmit, onCancel }) {
  const [password, setPassword] = useState("");
  useEffect(() => { setPassword(""); }, [prompt?.fileName, prompt?.attempt]);
  if (!prompt) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <form className="pdf-password-dialog" onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}>
      <DialogHeader>
        <DialogTitle>{prompt.incorrect ? "Password didn't work" : "Password required"}</DialogTitle>
        <DialogDescription>
          {prompt.incorrect ? "Enter the authorized password again." : "This PDF uses password-based protection supported by the viewer."}
          <strong>{prompt.fileName}</strong>
        </DialogDescription>
      </DialogHeader>
      <label className="pdf-password-field">
        <span>PDF password</span>
        <input type="password" value={password} autoFocus autoComplete="off" aria-label="PDF password"
          onChange={(event) => setPassword(event.target.value)} />
      </label>
      <p className="pdf-password-privacy">The password is used only in memory to open this PDF. It is not saved with the project.</p>
      <DialogFooter>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={!password}>Open PDF</button>
      </DialogFooter>
    </form>
  </Dialog>;
}
export function PdfImportReportDialog({ report, onClose, onRetry }) {
  const [details, setDetails] = useState(false);
  useEffect(() => { setDetails(false); }, [report]);
  if (!report?.excluded?.length) return null;
  const imported = Number(report.imported) || 0;
  const excluded = report.excluded;
  const retryable = excluded.some((item) => item.file && item.retryable !== false);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <section className="pdf-import-report">
      <DialogHeader>
        <DialogTitle>{imported ? "Some plans couldn't be imported" : "No plans were imported"}</DialogTitle>
        <DialogDescription>
          {imported
            ? "The plans below were excluded because they are protected, corrupted, or incompatible with the PDF viewer."
            : "Every selected plan was protected, corrupted, or incompatible with the PDF viewer."}
        </DialogDescription>
      </DialogHeader>
      <div className="pdf-import-report-body">
        <div className="pdf-import-summary" role="status">
          <strong>{imported} plan{imported === 1 ? "" : "s"} imported successfully.</strong>
          <strong className="danger">{excluded.length} plan{excluded.length === 1 ? "" : "s"} excluded.</strong>
        </div>
        <div className="pdf-import-table-wrap">
          <table className="pdf-import-table">
            <thead><tr><th>Plan</th><th>Reason</th></tr></thead>
            <tbody>{excluded.map((item, index) => <tr key={`${item.name}-${index}`}>
              <td>{item.name}</td>
              <td><span>{item.reason}</span>{details && item.technical && <small>{item.technical}</small>}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>
      <DialogFooter>
        <button type="button" onClick={() => setDetails((value) => !value)}>{details ? "Hide details" : "View details"}</button>
        {retryable && <button type="button" onClick={onRetry}>Try Again</button>}
        <button type="button" className="primary" onClick={onClose}>OK</button>
      </DialogFooter>
    </section>
  </Dialog>;
}
export function PdfOpeningSettingsDialog({ preferences, onChange, onClose }) {
  if (!preferences) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <section className="pdf-opening-settings">
      <DialogHeader>
        <DialogTitle>PDF opening and OCR</DialogTitle>
        <DialogDescription>Choose how plans are checked when imported or opened and how Find handles scanned pages.</DialogDescription>
      </DialogHeader>
      <div className="pdf-opening-settings-body">
        <fieldset>
          <legend>Importing and opening plans</legend>
          <label><input type="radio" name="pdf-open-mode" checked={preferences.openMode === PDF_OPEN_MODES.FAST}
            onChange={() => onChange({ ...preferences, openMode: PDF_OPEN_MODES.FAST })} />
            <span><strong>Fast auto-detect</strong><small>Check only the first page of a new or unverified plan, then validate later pages when you open them.</small></span>
          </label>
          <label><input type="radio" name="pdf-open-mode" checked={preferences.openMode === PDF_OPEN_MODES.VERIFY}
            onChange={() => onChange({ ...preferences, openMode: PDF_OPEN_MODES.VERIFY })} />
            <span><strong>Verify every page</strong><small>Before opening, scan every page that has not already passed the current compatibility check.</small></span>
          </label>
        </fieldset>
        <fieldset>
          <legend>OCR for Find</legend>
          <label><input type="radio" name="pdf-ocr-mode" checked={preferences.ocrMode === PDF_OCR_MODES.AUTO}
            onChange={() => onChange({ ...preferences, ocrMode: PDF_OCR_MODES.AUTO })} />
            <span><strong>Automatic</strong><small>Use local OCR only when a page has little or no selectable PDF text.</small></span>
          </label>
          <label><input type="radio" name="pdf-ocr-mode" checked={preferences.ocrMode === PDF_OCR_MODES.ASK}
            onChange={() => onChange({ ...preferences, ocrMode: PDF_OCR_MODES.ASK })} />
            <span><strong>Ask first</strong><small>Ask once per Find job before reading scanned pages with OCR.</small></span>
          </label>
          <label><input type="radio" name="pdf-ocr-mode" checked={preferences.ocrMode === PDF_OCR_MODES.OFF}
            onChange={() => onChange({ ...preferences, ocrMode: PDF_OCR_MODES.OFF })} />
            <span><strong>Off</strong><small>Search selectable PDF text only. Scanned pages will be skipped.</small></span>
          </label>
        </fieldset>
        <p>The opening choice applies to the next import or project open. These settings stay in this browser and are not written into project files.</p>
      </div>
      <DialogFooter><button type="button" className="primary" onClick={onClose}>Done</button></DialogFooter>
    </section>
  </Dialog>;
}

export function FindOcrPermissionDialog({ prompt, onAllow, onSkip }) {
  if (!prompt) return null;
  return <Dialog open onOpenChange={(open) => { if (!open) onSkip(); }}>
    <section className="pdf-ocr-prompt">
      <DialogHeader>
        <DialogTitle>Use OCR for scanned pages?</DialogTitle>
        <DialogDescription>
          Find reached a page with little or no selectable text. OCR runs locally in this browser, but it can take longer and use more processor time.
        </DialogDescription>
      </DialogHeader>
      <div className="pdf-ocr-prompt-body">Your choice applies to the rest of this Find job. Existing search marks will stay unchanged.</div>
      <DialogFooter>
        <button type="button" onClick={onSkip}>Skip OCR</button>
        <button type="button" className="primary" onClick={onAllow}>Use OCR</button>
      </DialogFooter>
    </section>
  </Dialog>;
}
