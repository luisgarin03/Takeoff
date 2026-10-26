import React, { useState } from "react";
import { calendarZone } from "../lib/calendarWorkspace.js";

export default function GoogleCalendarManagement({ calendars, enabled, edge, onChanged }) {
  const [calendarId, setCalendarId] = useState(""), [name, setName] = useState(""), [color, setColor] = useState("#70a89f"), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState(""), [confirmDelete, setConfirmDelete] = useState(false);
  const [email, setEmail] = useState(""), [role, setRole] = useState("reader"), [access, setAccess] = useState([]), [settings, setSettings] = useState(null);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const selected = calendars.find((c) => c.id === calendarId), owner = selected?.accessRole === "owner";
  async function execute(action, extra = {}) {
    setBusy(true); setError(""); setResult("");
    try {
      const data = await edge(`calendar-${action}`, { calendarId, name, color, text, ...(action === "create-calendar" ? { timeZone: calendarZone() } : {}), ...extra });
      if (action === "freebusy") setResult(Object.entries(data.calendars || {}).flatMap(([id, calendar]) => (calendar.busy || []).map((slot) => `${calendars.find((c) => c.id === id)?.name || id}: ${new Date(slot.start).toLocaleString()} – ${new Date(slot.end).toLocaleString()}`)).join("\n") || "No busy periods on this day.");
      else if (action === "settings") setSettings(data.items || []);
      else if (action === "acl") setAccess(data.items || []);
      else { setResult("Saved to Google Calendar."); await onChanged(); if (action === "delete-calendar") { setCalendarId(""); setConfirmDelete(false); } }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <details><summary>Manage Google calendars</summary><fieldset disabled={busy || !enabled}>
    <label>Google calendar<select value={calendarId} onChange={(e) => { const c = calendars.find((item) => item.id === e.target.value); setCalendarId(e.target.value); setName(c?.name || ""); setColor(c?.color || "#70a89f"); setAccess([]); setConfirmDelete(false); }}><option value="">Choose Google calendar</option>{calendars.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.accessRole}</option>)}</select></label>
    <label>Calendar name<input value={name} maxLength={250} onChange={(e) => setName(e.target.value)} /></label>
    <button type="button" disabled={!name.trim()} onClick={() => execute("create-calendar")}>Create Google calendar</button>
    <button type="button" disabled={!owner || !name.trim()} onClick={() => execute("update-calendar")}>Rename Google calendar</button>
    <label>Calendar color<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label><button type="button" disabled={!selected} onClick={() => execute("calendar-color")}>Save calendar color</button>
    <label>Quick event<input value={text} maxLength={1000} placeholder="Site visit tomorrow at 3pm" onChange={(e) => setText(e.target.value)} /></label><button type="button" disabled={!text.trim() || !["writer", "owner"].includes(selected?.accessRole)} onClick={() => execute("quick-add")}>Add quick event</button>
    <label>Availability date<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label><button type="button" disabled={!selected || !day} onClick={() => execute("freebusy", { ids: [calendarId], start: new Date(`${day}T00:00:00`).toISOString(), end: new Date(new Date(`${day}T00:00:00`).getTime() + 86400000).toISOString() })}>Check availability</button>
    <button type="button" onClick={() => execute("settings")}>Show Google calendar preferences</button>
    <h4>Google calendar sharing</h4><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Access<select value={role} onChange={(e) => setRole(e.target.value)}><option value="reader">Read events</option><option value="writer">Edit events</option></select></label><button type="button" disabled={!owner || !email} onClick={() => execute("share", { email, role })}>Grant Google calendar access</button><button type="button" disabled={!owner} onClick={() => execute("acl")}>Show Google sharing</button>
    {access.map((rule) => <div key={rule.id}><small>{rule.scope?.value || rule.scope?.type}: {rule.role}</small>{rule.role !== "owner" && <button type="button" onClick={() => execute("unshare", { ruleId: rule.id })}>Remove access</button>}</div>)}
    {owner && !selected.primary && <button type="button" onClick={() => setConfirmDelete(true)}>Delete Google calendar</button>}
    {confirmDelete && <p>Delete “{selected?.name}” and its Google events? This cannot be undone.<button type="button" onClick={() => execute("delete-calendar")}>Confirm calendar deletion</button><button type="button" onClick={() => setConfirmDelete(false)}>Keep calendar</button></p>}
  </fieldset>{!enabled && <p>Approve Google Calendar editing access to enable these controls.</p>}{settings && <dl>{settings.map((item) => <React.Fragment key={item.id}><dt>{item.id}</dt><dd>{item.value}</dd></React.Fragment>)}</dl>}{result && <p role="status" style={{ whiteSpace: "pre-wrap" }}>{result}</p>}{error && <p role="alert">{error}</p>}</details>;
}
