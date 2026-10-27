import React, { useEffect, useState } from "react";
import { calendarZone, zonedInput, zonedISO } from "../lib/calendarWorkspace.js";
import { calendarDescriptionText } from "../lib/calendarDescription.js";
import { googleCalendarDisplayColors, googleEventColorOptions } from "../lib/googleCalendarEvent.js";

export default function GoogleCalendarEventEditor({ event, calendars, edge, onClose, onSaved }) {
  const zone = event.start?.timeZone || calendarZone();
  const originalDescriptionText = calendarDescriptionText(event.description);
  const [draft, setDraft] = useState({ summary: event.summary || event.title || "", description: originalDescriptionText, location: event.location || "", colorId: event.colorId || "", visibility: event.visibility || "default", transparency: event.transparency || "opaque" });
  const [calendarId, setCalendarId] = useState(event.calendarId || calendars.find((c) => ["owner", "writer"].includes(c.accessRole))?.id || "");
  const [allDay, setAllDay] = useState(!!event.start?.date || !event.start);
  const [start, setStart] = useState(event.start?.date || zonedInput(event.start?.dateTime || new Date().toISOString(), zone, !event.start));
  const [end, setEnd] = useState(event.end?.date || zonedInput(event.end?.dateTime || new Date(Date.now() + 86400000).toISOString(), zone, !event.start));
  const [timeZone, setTimeZone] = useState(zone), [recurrence, setRecurrence] = useState((event.recurrence || []).join("\n"));
  const [attendees, setAttendees] = useState((event.attendees || []).map((a) => a.email).join(", "));
  const [reminders, setReminders] = useState(event.reminders || { useDefault: true });
  const [notify, setNotify] = useState(false), [colors, setColors] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState(""), [deleting, setDeleting] = useState(false);
  const [destination, setDestination] = useState(""), [response, setResponse] = useState(event.attendees?.find((a) => a.self)?.responseStatus || "needsAction");
  useEffect(() => { let live = true; edge("calendar-colors").then((data) => { if (live) setColors(data.event || {}); }).catch(() => {}); return () => { live = false; }; }, [edge]);
  const change = (key, value) => setDraft((old) => ({ ...old, [key]: value }));
  const colorOptions = googleEventColorOptions(colors);
  const selectedColor = colorOptions.find((color) => color.id === draft.colorId);
  const selectedCalendar = calendars.find((calendar) => calendar.id === calendarId);
  const defaultColor = googleCalendarDisplayColors(selectedCalendar?.color, selectedCalendar?.textColor);
  async function execute(action) {
    setBusy(true); setError("");
    try {
      const notifications = notify ? "all" : "none";
      if (action === "delete") await edge("calendar-delete", { calendarId: event.calendarId, eventId: event.id, etag: event.etag, sendUpdates: notifications });
      else if (action === "move") await edge("calendar-move", { calendarId: event.calendarId, eventId: event.id, etag: event.etag, destination, sendUpdates: notifications });
      else {
        const emails = attendees.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
        if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Enter valid attendee email addresses.");
        const reminderValue = reminders;
        if (typeof reminderValue.useDefault !== "boolean" || (!reminderValue.useDefault && (!Array.isArray(reminderValue.overrides) || reminderValue.overrides.length > 5 || reminderValue.overrides.some((r) => !["email", "popup"].includes(r.method) || !Number.isInteger(r.minutes) || r.minutes < 0 || r.minutes > 40320)))) throw new Error("Use up to five popup/email reminders, with minutes from 0 to 40320.");
        const body = { ...draft, colorId: draft.colorId || null,
          description: draft.description === originalDescriptionText ? event.description || "" : draft.description.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>"),
          start: allDay ? { date: start.slice(0, 10) } : { dateTime: zonedISO(start, timeZone, false), timeZone },
          end: allDay ? { date: end.slice(0, 10) } : { dateTime: zonedISO(end, timeZone, false), timeZone },
          recurrence: recurrence.split("\n").map((s) => s.trim()).filter(Boolean), reminders: reminderValue,
          attendees: emails.map((email) => { const old = event.attendees?.find((a) => a.email === email); return old?.self ? { ...old, responseStatus: response } : old || { email }; }) };
        if (event.recurringEventId && action !== "duplicate") delete body.recurrence;
        if (Date.parse(body.end.date || body.end.dateTime) <= Date.parse(body.start.date || body.start.dateTime)) throw new Error("End must be after start. All-day end dates are exclusive.");
        await edge(event.id && action !== "duplicate" ? "calendar-update" : "calendar-create", { calendarId: event.calendarId || calendarId, eventId: event.id, etag: event.etag, event: body, sendUpdates: notifications });
      }
      await onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="calendar-editor-shade"><form className="calendar-event-editor" role="dialog" aria-modal="true" aria-label="Google event editor" onSubmit={(e) => { e.preventDefault(); execute("save"); }}>
    <header><h3>{event.id ? "Edit Google event" : "Create Google event"}</h3><button type="button" aria-label="Close Google event editor" onClick={onClose}>×</button></header>
    <fieldset disabled={busy}>
      <label>Calendar<select required disabled={!!event.id} value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>{calendars.filter((c) => ["writer", "owner"].includes(c.accessRole)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Title<input required autoFocus maxLength={250} value={draft.summary} onChange={(e) => change("summary", e.target.value)} /></label>
      <label className="calendar-checkbox"><input type="checkbox" checked={allDay} onChange={(e) => { setAllDay(e.target.checked); setStart(e.target.checked ? start.slice(0, 10) : `${start.slice(0, 10)}T09:00`); setEnd(e.target.checked ? end.slice(0, 10) : `${end.slice(0, 10)}T10:00`); }} />All day</label>
      <div className="calendar-editor-pair"><label>Start<input required type={allDay ? "date" : "datetime-local"} value={start} onChange={(e) => setStart(e.target.value)} /></label><label>End {allDay ? "(following day)" : ""}<input required type={allDay ? "date" : "datetime-local"} value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>
      <label>Timezone<input required value={timeZone} onChange={(e) => setTimeZone(e.target.value)} /></label>
      <label>Description<textarea className="google-event-description" rows={12} maxLength={20000} value={draft.description} onChange={(e) => change("description", e.target.value)} /></label>
      <label>Location<input maxLength={1000} value={draft.location} onChange={(e) => change("location", e.target.value)} /></label>
      <section className="google-event-color-field" aria-labelledby="google-event-color-label">
        <span id="google-event-color-label">Google event color</span>
        <div className="google-event-color-options" role="radiogroup" aria-labelledby="google-event-color-label">
          <button type="button" role="radio" aria-checked={!draft.colorId} className={`google-event-color-default${!draft.colorId ? " is-selected" : ""}`} onClick={() => change("colorId", "")}>
            <span className="google-event-color-swatch" style={{ "--event-color": defaultColor.color, "--event-contrast": defaultColor.contrastColor }} aria-hidden="true">{!draft.colorId ? "✓" : ""}</span>
            Calendar default
          </button>
          <div className="google-event-color-grid">
            {colorOptions.map((color) => <button key={color.id} type="button" role="radio" aria-checked={draft.colorId === color.id} aria-label={color.name} title={color.name} className={`google-event-color-swatch${draft.colorId === color.id ? " is-selected" : ""}`} style={{ "--event-color": color.color, "--event-contrast": color.contrastColor }} onClick={() => change("colorId", color.id)}>{draft.colorId === color.id ? "✓" : ""}</button>)}
          </div>
        </div>
        <small>{selectedColor ? selectedColor.name : "Calendar default"} · Save to apply this color in Google Calendar.</small>
      </section>
      <label>Repeat<select value={recurrence.startsWith("RRULE:") && !recurrence.includes("\n") ? recurrence : recurrence ? "custom" : ""} onChange={(e) => setRecurrence(e.target.value === "custom" ? "RRULE:FREQ=WEEKLY;INTERVAL=2" : e.target.value)}><option value="">Does not repeat</option><option value="RRULE:FREQ=DAILY">Daily</option><option value="RRULE:FREQ=WEEKLY">Weekly</option><option value="RRULE:FREQ=MONTHLY">Monthly</option><option value="RRULE:FREQ=YEARLY">Yearly</option><option value="custom">Custom</option>{recurrence && !["RRULE:FREQ=DAILY", "RRULE:FREQ=WEEKLY", "RRULE:FREQ=MONTHLY", "RRULE:FREQ=YEARLY"].includes(recurrence) && <option value={recurrence}>Custom recurrence</option>}</select></label>
      {!!recurrence && <label>Recurrence rules<textarea value={recurrence} onChange={(e) => setRecurrence(e.target.value)} placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10" /></label>}
      {event.recurringEventId && <p>You are editing this occurrence. Use Edit series in the details menu to change the whole series.</p>}
      {event.recurrence?.length > 0 && <p>Changes apply to the entire recurring series.</p>}
      <label>Attendee emails<textarea value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="name@example.com, colleague@example.com" /></label>
      {event.attendees?.some((a) => a.self) && <label>My RSVP<select value={response} onChange={(e) => setResponse(e.target.value)}><option value="needsAction">Not responded</option><option value="accepted">Accepted</option><option value="tentative">Tentative</option><option value="declined">Declined</option></select></label>}
      <label>Reminders<select value={reminders.useDefault ? "default" : "custom"} onChange={(e) => setReminders(e.target.value === "default" ? { useDefault: true } : { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] })}><option value="default">Calendar defaults</option><option value="custom">Custom reminders</option></select></label>
      {!reminders.useDefault && <section>{(reminders.overrides || []).map((reminder, index) => <div className="calendar-editor-pair" key={index}><label>Reminder type<select value={reminder.method} onChange={(e) => setReminders({ ...reminders, overrides: reminders.overrides.map((r, i) => i === index ? { ...r, method: e.target.value } : r) })}><option value="popup">Notification</option><option value="email">Email</option></select></label><label>Minutes before<input type="number" required min={0} max={40320} value={reminder.minutes} onChange={(e) => setReminders({ ...reminders, overrides: reminders.overrides.map((r, i) => i === index ? { ...r, minutes: Number(e.target.value) } : r) })} /></label><button type="button" onClick={() => setReminders({ ...reminders, overrides: reminders.overrides.filter((_, i) => i !== index) })}>Remove reminder</button></div>)}<button type="button" disabled={(reminders.overrides?.length || 0) >= 5} onClick={() => setReminders({ ...reminders, overrides: [...(reminders.overrides || []), { method: "popup", minutes: 30 }] })}>Add reminder</button></section>}
      <div className="calendar-editor-pair"><label>Visibility<select value={draft.visibility} onChange={(e) => change("visibility", e.target.value)}>{["default", "public", "private"].map((v) => <option key={v}>{v}</option>)}</select></label><label>Availability<select value={draft.transparency} onChange={(e) => change("transparency", e.target.value)}><option value="opaque">Busy</option><option value="transparent">Free</option></select></label></div>
      <label className="calendar-checkbox"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Send invitation and update emails to attendees</label>
      {event.id && !event.recurringEventId && <label>Move to another calendar<select value={destination} onChange={(e) => setDestination(e.target.value)}><option value="">Choose destination</option>{calendars.filter((c) => c.id !== event.calendarId && ["owner", "writer"].includes(c.accessRole)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" disabled={!destination} onClick={() => execute("move")}>Move event</button></label>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    {deleting && <p>Delete {event.recurrence?.length ? "the entire recurring series" : "this event"} from Google Calendar? <button type="button" disabled={busy} onClick={() => execute("delete")}>Confirm delete</button><button type="button" onClick={() => setDeleting(false)}>Keep event</button></p>}
    <footer>{event.id && <><button type="button" disabled={busy} onClick={() => setDeleting(true)}>Delete</button><button type="button" disabled={busy} onClick={() => execute("duplicate")}>Duplicate</button></>}<button type="button" onClick={onClose}>Cancel</button><button disabled={busy || !calendarId} type="submit">Save to Google Calendar</button></footer>
  </form></div>;
}
