import { useMemo, useRef, useState } from "react";
import { Icon } from "../brand/icons.jsx";

const SUGGESTIONS = [
  "Analyze this project",
  "Summarize the current sheet",
  "Find fence-related scope",
  "Audit my takeoff",
  "Compare measured quantities with the SOW",
  "Draft RFIs for unresolved scope",
  "Create an estimator handoff summary",
];

const CITATION = /\[(sheet|measurement|condition|sow|rfi|revision):([^\]]+)\]/g;

function MessageText({ value, onCitation }) {
  const parts = [];
  let cursor = 0, match;
  CITATION.lastIndex = 0;
  while ((match = CITATION.exec(value))) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const [raw, type, id] = match;
    parts.push(<button key={`${match.index}-${raw}`} type="button" className="assistant-citation" onClick={() => onCitation(type, id)}>{raw.slice(1, -1)}</button>);
    cursor = match.index + raw.length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}

export default function ProjectAssistantPanel({
  configured, signedIn, messages, running, streamingText = "", activity, proposals, scope, contextChips = [], includeMetadata, persist, undoLabel,
  onScope, onIncludeMetadata, onPersist, onSend, onStop, onNew, onRetry, onApprove, onReject, onUndo, onCitation, onClose,
}) {
  const [draft, setDraft] = useState("");
  const [dock, setDock] = useState("right");
  const [width, setWidth] = useState(470);
  const dragRef = useRef(null);
  const scopeLabel = {
    "current-page": "Current page",
    selected: "Selected elements",
    "current-pdf": "Current PDF set",
    marked: "Measured and bookmarked pages",
    "entire-project": "Entire project",
  }[scope] || "Current page";
  const lastAssistant = useMemo(() => [...messages].reverse().find((message) => message.role === "assistant"), [messages]);
  const lastError = useMemo(() => [...activity].reverse().find((item) => item.type === "error"), [activity]);
  const send = (value = draft) => {
    const prompt = String(value || "").trim();
    if (!prompt || running || !configured || !signedIn) return;
    setDraft(""); onSend(prompt);
  };
  const beginResize = (event) => {
    event.preventDefault();
    dragRef.current = { x: event.clientX, width };
    const move = (e) => {
      const delta = e.clientX - dragRef.current.x;
      setWidth(Math.max(360, Math.min(820, dragRef.current.width + (dock === "left" ? delta : -delta))));
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); dragRef.current = null; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end);
  };
  const exportChat = () => {
    const body = messages.map((message) => `${message.role === "user" ? "ESTIMATOR" : "CHATGPT"}\n${message.text}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "OpenTakeoff ChatGPT Project Assistant.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const printChat = () => {
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.opener = null;
    const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    popup.document.write(`<!doctype html><title>OpenTakeoff ChatGPT Project Assistant</title><style>body{font:14px/1.5 system-ui;margin:40px;color:#171717}h1{font-size:20px}article{break-inside:avoid;margin:20px 0;padding:12px;border:1px solid #bbb;white-space:pre-wrap}b{display:block;margin-bottom:6px}</style><h1>OpenTakeoff · ChatGPT Project Assistant</h1>${messages.map((message) => `<article><b>${message.role === "user" ? "Estimator" : "ChatGPT"}</b>${escape(message.text)}</article>`).join("")}`);
    popup.document.close(); popup.focus(); popup.print();
  };

  return <aside className={`project-assistant project-assistant-${dock}`} style={{ width }} aria-label="ChatGPT Project Assistant">
    <button className="project-assistant-resize" type="button" aria-label="Resize ChatGPT Project Assistant" onPointerDown={beginResize} />
    <header className="project-assistant-header">
      <span className="assistant-chat-logo"><Icon name="agentAI" size={17} /></span>
      <div><strong>ChatGPT</strong><small>{configured ? "OpenTakeoff assistant" : "Not configured"}</small></div>
      <a className="assistant-header-web" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" title="Open the regular ChatGPT website in a new tab">Open ChatGPT ↗</a>
      <button className="assistant-header-new" type="button" onClick={onNew} disabled={running}>＋ New chat</button>
      <button type="button" title={`Dock on the ${dock === "right" ? "left" : "right"}`} aria-label={`Dock on the ${dock === "right" ? "left" : "right"}`} onClick={() => setDock((value) => value === "right" ? "left" : "right")}>⇆</button>
      <button type="button" title="Close" aria-label="Close ChatGPT" onClick={onClose}>×</button>
    </header>

    {configured === null ? <div className="project-assistant-empty"><h3>Checking configuration…</h3></div> : !configured ? <div className="project-assistant-empty">
      <h3>AI assistant is not configured</h3>
      <p>Set <code>OPENAI_API_KEY</code> and <code>OPENAI_MODEL</code> on the OpenTakeoff server. The secret is never stored in this browser or project file.</p>
    </div> : !signedIn ? <div className="project-assistant-empty">
      <h3>Sign in required</h3><p>Sign in with your verified Google account to use the server-side assistant.</p>
    </div> : <>
      <details className="project-assistant-context">
        <summary><span>Project context</span><b>{scopeLabel}</b></summary>
        <div className="assistant-context-body">
          <label>Use information from
            <select value={scope} onChange={(event) => onScope(event.target.value)} disabled={running}>
              <option value="current-page">Current page</option>
              <option value="selected">Selected elements</option>
              <option value="current-pdf">Current PDF set</option>
              <option value="marked">Measured and bookmarked pages</option>
              <option value="entire-project">Entire project</option>
            </select>
          </label>
          <div className="assistant-context-chips">{contextChips.map((chip) => <span className="assistant-context-chip" key={chip}>{chip}</span>)}</div>
          <label className="assistant-check"><input type="checkbox" checked={includeMetadata} onChange={(event) => onIncludeMetadata(event.target.checked)} /> Include client metadata</label>
          <small>Source PDFs and page images stay local. Find/OCR runs in OpenTakeoff.</small>
        </div>
      </details>

      <section className="project-assistant-messages" aria-live="polite">
        {!messages.length && <div className="assistant-welcome">
          <span className="assistant-welcome-logo"><Icon name="agentAI" size={24} /></span>
          <h2>How can I help with this estimate?</h2>
          <p>Ask about your plans, scope, measurements, SOW, RFIs, or material totals.</p>
          <div className="assistant-suggestions">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)}>{suggestion}</button>)}</div>
        </div>}
        {messages.map((message) => <article key={message.id} className={`assistant-message assistant-message-${message.role}`}>
          {message.role === "assistant" && <span className="assistant-message-avatar"><Icon name="agentAI" size={15} /></span>}
          <b>{message.role === "user" ? "You" : "ChatGPT"}</b>
          <div><MessageText value={message.text} onCitation={onCitation} /></div>
        </article>)}
        {running && <article className="assistant-message assistant-message-assistant"><span className="assistant-message-avatar"><Icon name="agentAI" size={15} /></span><b>ChatGPT</b><div className={streamingText ? "" : "assistant-thinking"}>{streamingText || activity.at(-1)?.text || "Thinking…"}</div></article>}
      </section>

      {lastError && !running && <div className="assistant-error" role="alert"><span>{lastError.text}</span><button type="button" onClick={onRetry} disabled={!messages.some((message) => message.role === "user")}>Retry</button></div>}

      {!!activity.length && <details className="assistant-activity"><summary>Worked with OpenTakeoff · {activity.length}</summary>{activity.slice(-20).map((item, index) => <div key={`${index}-${item.name || item.text}`}>{item.name ? `${item.type === "tool_start" ? "Using" : "Completed"} ${item.name}` : item.text}</div>)}</details>}

      {!!proposals.length && <section className="assistant-proposals"><strong>Approval required</strong>{proposals.map((proposal) => <article key={proposal.id}>
        <span>{proposal.summary}</span><div><button type="button" className="btn-primary" disabled={running} onClick={() => onApprove(proposal)}>Approve</button><button type="button" disabled={running} onClick={() => onReject(proposal.id)}>Reject</button></div>
      </article>)}</section>}

      {undoLabel && <section className="assistant-undo"><span>Applied: {undoLabel}</span><button type="button" onClick={onUndo}>Undo</button></section>}

      {messages.length > 50 && <p className="assistant-context-warning">This conversation is getting long. Start a new chat to reduce context size and usage cost.</p>}

      <section className="project-assistant-compose">
        <div className="assistant-compose-box"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Message ChatGPT" rows={2}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} disabled={running} />
          {running ? <button className="assistant-send" type="button" onClick={onStop} title="Stop generating" aria-label="Stop generating">■</button> : <button className="assistant-send" type="button" disabled={!draft.trim()} onClick={() => send()} title="Send message" aria-label="Send message">↑</button>}
        </div>
        <div className="assistant-compose-meta">
          <span>ChatGPT can make mistakes. Verify quantities and plan requirements.</span>
          <details className="assistant-chat-actions"><summary aria-label="Chat options">•••</summary><div>
            <button type="button" onClick={onRetry} disabled={running || !messages.some((message) => message.role === "user")}>Retry last response</button>
            <button type="button" onClick={() => lastAssistant && navigator.clipboard?.writeText(lastAssistant.text)} disabled={!lastAssistant}>Copy last response</button>
            <button type="button" onClick={exportChat} disabled={!messages.length}>Export chat as TXT</button>
            <button type="button" onClick={printChat} disabled={!messages.length}>Export chat as PDF</button>
            <label><input type="checkbox" checked={persist} onChange={(event) => onPersist(event.target.checked)} /> Save chat with project</label>
          </div></details>
        </div>
      </section>
    </>}
  </aside>;
}
