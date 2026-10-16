import React, { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import brandBanner from "../assets/beitzell-estimating-worksheet-stamp.png";
import {
  addWhiteboardSowEntry,
  addWhiteboardSowTitle,
  duplicateWhiteboardSowPanel,
  bytesToBase64,
  duplicateWhiteboardSowEntry,
  moveWhiteboardSowEntry,
  removeWhiteboardSowEntry,
  removeWhiteboardSowPanel,
  renameWhiteboardSowTab,
  setWhiteboardSowBranding,
  updateWhiteboardSowEntry,
  updateWhiteboardSowSectionTitle,
  updateWhiteboardSowTakeoffTitle,
  WHITEBOARD_FILE_LIMIT,
  WHITEBOARD_TOTAL_LIMIT,
  WHITEBOARD_SOW_COLORS,
  WHITEBOARD_SOW_DEFAULT_COLOR,
  WHITEBOARD_SOW_MAX_TEXT,
  WHITEBOARD_SOW_MAX_SECTION_TITLE,
  WHITEBOARD_SOW_MAX_TAKEOFF_TITLE,
  whiteboardFileType,
} from "../lib/whiteboard.js";

function SOWEntry({ board, sowId, tabId, entry, index, entries, panelWidth, onCommit, onEditEnd, registerRef, onFocusEntry }) {
  const textarea = useRef(null);
  const isTitle = entry.kind === "title";

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [entry.text, panelWidth]);

  const moveUp = () => {
    if (!index) return;
    onCommit(moveWhiteboardSowEntry(board, tabId, entry.id, entries[index - 1].id, sowId));
  };
  const moveDown = () => {
    if (index >= entries.length - 1) return;
    onCommit(moveWhiteboardSowEntry(board, tabId, entry.id, entries[index + 2]?.id || null, sowId));
  };

  return <article className={`wb-sow-entry${isTitle ? " is-title" : ""}`} style={isTitle ? undefined : { "--sow-entry-color": entry.color }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
    onDrop={(event) => {
      event.preventDefault(); event.stopPropagation();
      const sourceId = event.dataTransfer.getData("application/x-opentakeoff-sow-entry") || event.dataTransfer.getData("text/plain");
      if (sourceId) onCommit(moveWhiteboardSowEntry(board, tabId, sourceId, entry.id, sowId));
    }}>
    {!isTitle && <details className="wb-sow-color-picker">
      <summary aria-label="Change item color" title="Change item color"><span style={{ backgroundColor: entry.color }} /></summary>
      <div className="wb-sow-color-popover" role="group" aria-label="Scope item colors">
        {WHITEBOARD_SOW_COLORS.map(({ name, value }) => <button key={value} type="button" className="wb-sow-color-swatch"
          title={name} aria-label={name} aria-pressed={entry.color.toUpperCase() === value}
          style={{ backgroundColor: value }} onClick={(event) => {
            onCommit(updateWhiteboardSowEntry(board, tabId, entry.id, { color: value }, sowId));
            event.currentTarget.closest("details")?.removeAttribute("open");
          }} />)}
        <label className="wb-sow-custom-color" title="Custom color">
          <Icon name="palette" size={15} /><span>Custom</span>
          <input type="color" aria-label="Custom item color" value={entry.color}
            onChange={(event) => onCommit(updateWhiteboardSowEntry(board, tabId, entry.id, { color: event.target.value }, sowId))} />
        </label>
      </div>
    </details>}
    <textarea ref={(element) => { textarea.current = element; registerRef(entry.id, element); }} value={entry.text}
      maxLength={WHITEBOARD_SOW_MAX_TEXT} rows={1} spellCheck aria-label={isTitle ? `Scope title ${index + 1}` : `Scope line item ${index + 1}`}
      placeholder={isTitle ? "Enter title…" : "Describe this scope line item…"}
      onFocus={() => onFocusEntry(entry.id)}
      onChange={(event) => onCommit(updateWhiteboardSowEntry(board, tabId, entry.id, { text: event.target.value }, sowId), `sow-entry:${entry.id}`)}
      onBlur={onEditEnd} />
    <div className="wb-sow-entry-actions" aria-label={`Actions for scope item ${index + 1}`}>
      <button type="button" className="wb-sow-drag" draggable="true" title="Drag to reorder" aria-label="Drag scope item to reorder"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-opentakeoff-sow-entry", entry.id);
          event.dataTransfer.setData("text/plain", entry.id);
        }}><Icon name="pan" size={14} /></button>
      <button type="button" title="Move item up" aria-label="Move scope item up" disabled={!index} onClick={moveUp}><Icon name="chevronUp" size={14} /></button>
      <button type="button" title="Move item down" aria-label="Move scope item down" disabled={index >= entries.length - 1} onClick={moveDown}><Icon name="chevronDown" size={14} /></button>
      <button type="button" className="wb-sow-uppercase" title="Convert text to uppercase" aria-label={`Convert ${isTitle ? "scope title" : "scope line item"} to uppercase`}
        disabled={!entry.text || entry.text === entry.text.toUpperCase()}
        onClick={() => onCommit(updateWhiteboardSowEntry(board, tabId, entry.id, { text: entry.text.toUpperCase() }, sowId))}>AA</button>
      <button type="button" title="Duplicate item" aria-label="Duplicate scope item" onClick={() => {
        const id = `sow-entry-${crypto.randomUUID()}`;
        onCommit(duplicateWhiteboardSowEntry(board, tabId, entry.id, id, sowId)); onFocusEntry(id);
      }}><Icon name="duplicate" size={14} /></button>
      <button type="button" title="Delete item" aria-label="Delete scope item" onClick={() => onCommit(removeWhiteboardSowEntry(board, tabId, entry.id, sowId))}><Icon name="close" size={14} /></button>
    </div>
  </article>;
}

const SOWPanel = memo(function SOWPanel({ board, sow, onCommit, onEditEnd, onError, position, onStartMove, onStartResize, onStartLogoResize }) {
  const activeTab = sow.tabs.find((tab) => tab.id === sow.activeTabId) || sow.tabs[0];
  const [renameDraft, setRenameDraft] = useState(activeTab.name);
  const [focusEntry, setFocusEntry] = useState(null);
  const entryRefs = useRef(new Map());
  const brandingInput = useRef(null);
  const brandingAsset = sow.brandAssetId ? board.assets.find((asset) => asset.id === sow.brandAssetId && asset.type.startsWith("image/") && !asset.missing) : null;
  const brandingSrc = brandingAsset ? `data:${brandingAsset.type};base64,${brandingAsset.data}` : brandBanner;

  useEffect(() => { setRenameDraft(activeTab.name); }, [activeTab.id, activeTab.name]);
  useEffect(() => {
    if (!focusEntry) return;
    const element = entryRefs.current.get(focusEntry);
    if (element) { element.focus(); element.setSelectionRange(element.value.length, element.value.length); setFocusEntry(null); }
  }, [focusEntry, activeTab.entries.length]);

  const commitRename = () => {
    const name = renameDraft.trim();
    if (name) onCommit(renameWhiteboardSowTab(board, activeTab.id, name, sow.id));
    else setRenameDraft(activeTab.name);
    onEditEnd();
  };
  const addLineItem = () => {
    const id = `sow-entry-${crypto.randomUUID()}`;
    onCommit(addWhiteboardSowEntry(board, activeTab.id, "", WHITEBOARD_SOW_DEFAULT_COLOR, id, sow.id));
    setFocusEntry(id);
  };
  const addTitle = () => {
    const id = `sow-title-${crypto.randomUUID()}`;
    onCommit(addWhiteboardSowTitle(board, activeTab.id, "", id, sow.id));
    setFocusEntry(id);
  };
  const changeBranding = async (file) => {
    if (!file) return;
    try {
      const type = whiteboardFileType(file);
      if (!type?.startsWith("image/")) throw new Error("Choose a PNG, JPEG, WebP, GIF or BMP image.");
      if (!file.size || file.size > WHITEBOARD_FILE_LIMIT) throw new Error("Maximum branding image size is 25 MB.");
      const replacedSize = brandingAsset?.size || 0;
      const total = board.assets.reduce((sum, asset) => sum + asset.size, 0) - replacedSize + file.size;
      if (total > WHITEBOARD_TOTAL_LIMIT) throw new Error("Whiteboard attachment limit is 75 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(new Blob([bytes], { type }));
      bitmap.close();
      const asset = { id: `sow-brand-${crypto.randomUUID()}`, name: file.name || "SOW logo", type, size: bytes.length, data: bytesToBase64(bytes) };
      onCommit(setWhiteboardSowBranding(board, asset, sow.id));
    } catch (error) { onError?.(error.message || "Could not use that logo image."); }
  };

  return <aside className="wb-sow" aria-label="Scope of work" style={{ width: position.w,
    transform: `translate(${position.x}px, ${position.y}px) scale(${position.scale})` }}
    onPointerDown={(event) => event.stopPropagation()} onPointerMove={(event) => event.stopPropagation()}
    onPointerUp={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <div className="wb-sow-brand" title="Drag to move scope of work" onPointerDown={onStartMove}>
      <div className={`wb-sow-logo${brandingAsset ? " is-custom" : " is-default"}`} style={{ "--sow-logo-width": `${position.logoWidth}px` }}>
        <img src={brandingSrc} alt={brandingAsset?.name || "Beitzell Fence Company logo"} />
        <div className="wb-sow-brand-actions" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" title="Choose logo image" onClick={() => brandingInput.current?.click()}><Icon name="imageFile" size={14} />Change logo</button>
          {brandingAsset && <button type="button" title="Restore the default logo" onClick={() => onCommit(setWhiteboardSowBranding(board, null, sow.id))}>Use default</button>}
        </div>
      </div>
      <button type="button" className="wb-sow-logo-resize" title="Drag to resize logo area" aria-label="Resize SOW logo area"
        onPointerDown={onStartLogoResize} />
      <label className="wb-sow-takeoff-title-label" onPointerDown={(event) => event.stopPropagation()}>
        <span>Takeoff title</span>
        <input className="wb-sow-takeoff-title" type="text" value={sow.takeoffTitle}
          maxLength={WHITEBOARD_SOW_MAX_TAKEOFF_TITLE} placeholder="Takeoff title" aria-label="Takeoff title"
          onChange={(event) => onCommit(updateWhiteboardSowTakeoffTitle(board, event.target.value, sow.id), `sow-takeoff-title:${sow.id}`)}
          onBlur={onEditEnd} />
      </label>
      <input ref={brandingInput} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp"
        aria-label="Choose SOW logo image" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = ""; changeBranding(file);
        }} />
    </div>
    <div className="wb-sow-title">
      <input className="wb-sow-section-title" type="text" value={sow.sectionTitle}
        maxLength={WHITEBOARD_SOW_MAX_SECTION_TITLE} placeholder="Section title" aria-label="Scope of work section title"
        onChange={(event) => onCommit(updateWhiteboardSowSectionTitle(board, event.target.value, sow.id), `sow-section-title:${sow.id}`)}
        onBlur={onEditEnd} />
    </div>
    <div className="wb-sow-list" aria-live="polite">
      {!activeTab.entries.length && <div className="wb-sow-empty"><strong>No scope items yet</strong><span>Add the first item for {activeTab.name}.</span></div>}
      {activeTab.entries.map((entry, index) => <SOWEntry key={entry.id} board={board} sowId={sow.id} tabId={activeTab.id} entry={entry}
        index={index} entries={activeTab.entries} panelWidth={position.w} onCommit={onCommit} onEditEnd={onEditEnd}
        onFocusEntry={setFocusEntry} registerRef={(id, element) => {
          if (element) entryRefs.current.set(id, element); else entryRefs.current.delete(id);
        }} />)}
      <div className="wb-sow-drop-end" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault(); event.stopPropagation();
        const sourceId = event.dataTransfer.getData("application/x-opentakeoff-sow-entry") || event.dataTransfer.getData("text/plain");
        if (sourceId) onCommit(moveWhiteboardSowEntry(board, activeTab.id, sourceId, null, sow.id));
      }} />
    </div>
    <div className="wb-sow-tabs">
      <input className="wb-sow-tab-rename" value={renameDraft} maxLength={80} aria-label="SOW panel name"
        onChange={(event) => { setRenameDraft(event.target.value); onCommit(renameWhiteboardSowTab(board, activeTab.id, event.target.value, sow.id), `sow-name:${sow.id}`); }}
        onBlur={commitRename} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
      <button type="button" className="wb-sow-header-button" title="Duplicate SOW panel" aria-label="Duplicate SOW panel"
        onClick={() => onCommit(duplicateWhiteboardSowPanel(board, sow.id))}><Icon name="duplicate" size={14} /></button>
      <button type="button" className="wb-sow-header-button" title="Delete SOW panel" aria-label="Delete SOW panel" onClick={() => {
        if (window.confirm(`Delete the “${activeTab.name}” SOW panel and all of its items?`)) onCommit(removeWhiteboardSowPanel(board, sow.id));
      }}><Icon name="close" size={14} /></button>
      <span className="wb-sow-count" title={`${activeTab.entries.length} items`}>{activeTab.entries.length}</span>
    </div>
    <div className="wb-sow-add-row">
      <button type="button" className="wb-sow-add" onClick={addLineItem}><Icon name="plus" size={15} />Line Item</button>
      <button type="button" className="wb-sow-add" onClick={addTitle}><Icon name="plus" size={15} />Title</button>
    </div>
    <button type="button" className="wb-sow-resize-handle is-left" aria-label="Resize scope panel from left"
      title="Drag to resize scope panel" onPointerDown={(event) => onStartResize(event, "left")} />
    <button type="button" className="wb-sow-resize-handle is-right" aria-label="Resize scope panel from right"
      title="Drag to resize scope panel" onPointerDown={(event) => onStartResize(event, "right")} />
  </aside>;
});

export default SOWPanel;
