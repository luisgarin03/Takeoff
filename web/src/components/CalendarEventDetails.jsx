import React, { useEffect, useRef, useState } from "react";
import { BID_FIELDS, normalizeBidDetails, parseBidDetails } from "../lib/calendarBidDetails.js";
import { icons } from "../brand/icons.jsx";

// Calendar descriptions can contain HTML from Google. Render only inert text
// and explicitly permitted links, never provider HTML or executable markup.
function descriptionText(value) {
  const doc = new DOMParser().parseFromString(value || "", "text/html");
  doc.querySelectorAll("script,style,iframe,object").forEach((node) => node.remove());
  doc.querySelectorAll("a[href]").forEach((node) => {
    const href = node.getAttribute("href");
    if (/^https?:\/\//i.test(href || "")) node.append(` (${href})`);
  });
  doc.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  doc.querySelectorAll("p,div,li").forEach((node) => { node.prepend(node.tagName === "LI" ? "• " : ""); node.append("\n"); });
  return (doc.body.textContent || "").trim();
}
function LinkedText({ text }) {
  return text.split(/(https?:\/\/[^\s<>]+)/gi).map((part, i) => /^https?:\/\//i.test(part)
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part);
}
export default function CalendarEventDetails({ event, editable, busy, onClose, onEditEvent, onSaveBid, onDelete, onOpenProject, onEditSeries }) {
  const card = useRef(null), [confirmDelete, setConfirmDelete] = useState(false), [error, setError] = useState("");
  const p = event.extendedProps, row = p.row || {}, project = p.project || {}, google = p.google || {};
  const [editBid, setEditBid] = useState(false), [saving, setSaving] = useState(false);
  const [bid, setBid] = useState(() => {
    const parsed = project.bidDetails ? normalizeBidDetails(project.bidDetails) : parseBidDetails(descriptionText(row.description || google.description || ""));
    return { ...parsed, project: parsed.project || project.name || event.title.replace(/^Due — /, ""), due: parsed.due || project.submissionDate || "", location: parsed.location || row.location || google.location || "", notes: parsed.notes || (row.description && !row.description.startsWith("Project: ") ? row.description : "") };
  });
  const zone = row.timezone || google.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const format = (date) => date?.toLocaleString(undefined, { timeZone: event.allDay ? "UTC" : zone, year: "numeric", month: "long", day: "numeric", ...(!event.allDay ? { hour: "numeric", minute: "2-digit" } : {}) });
  const start = event.allDay ? new Date(`${event.startStr.slice(0, 10)}T00:00:00Z`) : event.start;
  const end = event.allDay && event.endStr ? new Date(new Date(`${event.endStr.slice(0, 10)}T00:00:00Z`).getTime() - 86400000) : event.end;
  const location = bid.location || project.location || project.address;
  const description = descriptionText(row.description || google.description || project.notes || project.description || "");
  const files = row.calendar_attachments || [];
  useEffect(() => {
    const previous = document.activeElement;
    card.current?.querySelector("button")?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className="calendar-detail-shade" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="calendar-event-detail" ref={card} role="dialog" aria-modal="true" aria-label="Event details" onKeyDown={(e) => {
      e.stopPropagation();
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = [...card.current.querySelectorAll("button:not(:disabled),a[href],input,textarea")];
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="calendar-detail-actions">
        {editable && <><button aria-label="Edit event" title="Edit event" disabled={busy} onClick={() => p.kind === "google" ? onEditEvent() : setEditBid(true)}>{icons.pencil(20)}</button>{p.kind !== "project" && p.kind !== "google" && <button aria-label="Delete event" title="Delete event" disabled={busy} onClick={() => setConfirmDelete(true)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 9v9M14 9v9" /></svg></button>}</>}
        <button aria-label="Close event details" title="Close" onClick={onClose}>{icons.close(20)}</button>
      </div>
      <div className="calendar-detail-scroll">
        <div className="calendar-detail-heading"><span className="calendar-detail-color" style={{ background: event.color || event.backgroundColor || "#70a89f" }} /><div><h3>{event.title}</h3><p>{format(start)}{end && end.getTime() !== start.getTime() ? ` – ${format(end)}` : ""}{event.allDay ? " · All day" : ` · ${zone}`}</p></div></div>
        {editBid ? <form className="calendar-bid-form" onSubmit={async (e) => { e.preventDefault(); setSaving(true); setError(""); try { await onSaveBid(bid); setEditBid(false); } catch (err) { setError(err.message); } finally { setSaving(false); } }}>
          <h4>Edit bid details</h4>{Object.entries(BID_FIELDS).map(([key,label]) => <label key={key}>{label}{key === "notes" || key === "contact" ? <textarea rows={key === "notes" ? 5 : 2} maxLength={10000} value={bid[key]} onChange={(e) => setBid({ ...bid, [key]: e.target.value })} /> : <input maxLength={10000} value={bid[key]} onChange={(e) => setBid({ ...bid, [key]: e.target.value })} />}</label>)}
          <button type="submit" disabled={saving}>Save bid details</button><button type="button" onClick={() => setEditBid(false)}>Cancel</button>
        </form> : <>
          <div className="calendar-detail-row">{icons.document(20)}<div><button className="calendar-notes-action" disabled={!editable} onClick={() => p.kind === "google" ? onEditEvent() : setEditBid(true)}>{bid.notes ? "Meeting notes" : "Take meeting notes"}</button><p className="calendar-detail-source">{bid.notes ? <LinkedText text={bid.notes} /> : "Add notes for this bid"}</p></div></div>
          <div className="calendar-detail-row"><span aria-hidden="true">⌖</span><p>{location || "Location not added"}</p></div>
          <div className="calendar-detail-row"><span aria-hidden="true">≡</span><div><h4>Bid details</h4><ul className="calendar-bid-list">{["project","client","contact","due","amount","folder"].map((key) => <li key={key}>{BID_FIELDS[key]}: <LinkedText text={bid[key] || (key === "due" ? format(start) : "Not added")} /></li>)}</ul>
          {["documents","invitation"].map((key) => <div className="calendar-bid-link" key={key}><h4>{BID_FIELDS[key]}</h4>{bid[key] ? <LinkedText text={bid[key]} /> : <span className="calendar-detail-source">Not added</span>}</div>)}
          {description && !row.description?.startsWith("Project: ") && <div className="calendar-detail-notes"><LinkedText text={description} /></div>}
          </div></div>
        </>}
        {!!files.length && <div className="calendar-detail-row">{icons.document(20)}<div><h4>Attachments</h4>{files.map((file) => /^https:\/\/(drive|docs)\.google\.com\//.test(file.external_url || "") && <p key={file.id}><a href={file.external_url} target="_blank" rel="noopener noreferrer">{file.filename}</a></p>)}</div></div>}
        <div className="calendar-detail-row">{icons.document(20)}<div><p className="calendar-detail-source">{p.kind === "project" ? "Project due date" : p.kind === "google" ? editable ? "Google Calendar" : "Google Calendar · Read only" : row.category || "General"}</p>{editable && p.kind !== "project" && <button onClick={onEditEvent}>Edit event date and settings</button>}{p.kind === "google" && google.recurringEventId && editable && <button onClick={onEditSeries}>Edit series</button>}{p.kind === "project" && <button onClick={onOpenProject}>Open project</button>}{p.kind === "google" && /^https:\/\/(www\.google\.com\/calendar\/|calendar\.google\.com\/)/.test(p.url || "") && <a href={p.url} target="_blank" rel="noopener noreferrer">Open in Google Calendar</a>}</div></div>
        {confirmDelete && <div className="calendar-detail-confirm"><p>Delete this {row.recurrence_rule ? "entire recurring series" : "event"}?</p><button disabled={busy} onClick={async () => { try { await onDelete(); } catch (e) { setError(e.message); } }}>Delete</button><button onClick={() => setConfirmDelete(false)}>Keep event</button></div>}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}
