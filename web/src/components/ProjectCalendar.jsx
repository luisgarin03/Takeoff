import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { connectDrive } from "../lib/supabase/driveConnection.js";
import "../styles/projectCalendar.css";

async function localProjects() {
  if (!indexedDB.databases) return [];
  const databases = await indexedDB.databases();
  return (await Promise.all(databases.filter(({ name }) => name === "opentakeoff" || /^opentakeoff-project-/.test(name)).map(({ name }) => new Promise((resolve) => {
    const request = indexedDB.open(name);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) { db.close(); resolve(null); return; }
      const read = db.transaction("meta").objectStore("meta").get("annotations");
      read.onsuccess = () => { const a = read.result; db.close(); resolve(a ? { ...a.project_metadata, name: a.project_metadata?.name || a.project_name || "Untitled project", search: name === "opentakeoff" ? "" : `?localProject=${encodeURIComponent(name.slice("opentakeoff-project-".length))}` } : null); };
      read.onerror = () => { db.close(); resolve(null); };
    };
  })))).filter(Boolean);
}
const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export default function ProjectCalendar({ metadata, onClose }) {
  const cloud = useCloud();
  const [calendars, setCalendars] = useState([]), [calendarId, setCalendarId] = useState(""), [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const google = useCallback(async (action, body = {}) => {
    if (!cloud.client || !cloud.user) throw new Error("Log in to connect Google Calendar.");
    const { data, error } = await cloud.client.functions.invoke(`otk-drive?action=calendar-${action}`, { body });
    if (error || data?.code) throw new Error("Google Calendar is unavailable. Connect Google Calendar and approve calendar access. If Google reports accessNotConfigured, enable Google Calendar API in your Google Cloud project.");
    return data;
  }, [cloud.client, cloud.user]);
  async function loadCalendars() {
    setBusy(true); setError("");
    try { const result = await google("calendars"); setCalendars(result.calendars); setCalendarId((old) => old || result.calendars.find((c) => c.primary)?.id || result.calendars[0]?.id || ""); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [projects, setProjects] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  useEffect(() => { let live = true; localProjects().then((rows) => { if (!live) return; const search = window.location.search; setProjects([{ ...metadata, search }, ...rows.filter((row) => row.search !== search)]); }).catch(() => { if (live) setError("Could not read saved projects."); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [metadata]);
  useEffect(() => { const onKey = (event) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const count = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
  const days = Array.from({ length: count }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const today = key(new Date());
  const rangeStart = key(start), rangeEnd = key(new Date(start.getFullYear(), start.getMonth(), start.getDate() + count));
  useEffect(() => {
    if (!calendarId) return;
    let live = true;
    setBusy(true); setEvents([]);
    google("events", { calendarId, start: new Date(`${rangeStart}T00:00:00`).toISOString(), end: new Date(`${rangeEnd}T00:00:00`).toISOString() }).then((result) => { if (live) setEvents(result.events); }).catch((e) => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [calendarId, rangeStart, rangeEnd, google]);
  const dayEvents = (date) => events.filter((event) => {
    const first = event.start?.date || (event.start?.dateTime ? key(new Date(event.start.dateTime)) : "");
    const last = event.end?.date || (event.end?.dateTime ? key(new Date(new Date(event.end.dateTime).getTime() - 1)) : first);
    return key(date) >= first && (event.end?.date ? key(date) < last : key(date) <= last);
  });
  return createPortal(<div className="project-calendar-shade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="project-calendar" role="dialog" aria-modal="true" aria-label="Project calendar">
    <header><h2>Project calendar</h2><button onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button><strong aria-live="polite">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</strong><button className="project-calendar-close" onClick={onClose} aria-label="Close calendar">×</button></header>
    <p className="project-calendar-hint">Projects saved in this browser, shown on their submission / due date. Set dates in Project Data.</p>
    <div className="project-calendar-google">
      <button disabled={busy || !cloud.user} onClick={async () => { setError(""); try { await connectDrive({ connect: async (returnUrl) => { const { data, error } = await cloud.client.functions.invoke("otk-drive?action=connect", { body: { returnUrl, calendar: true } }); if (error) throw error; return data; } }); } catch { setError("Could not connect Google Calendar. Please try again."); } }}>Connect Google Calendar</button>
      <button disabled={busy || !cloud.user} onClick={loadCalendars}>Load calendars</button>
      {!!calendars.length && <select aria-label="Google calendar" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>{calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
      <button disabled={busy || !cloud.user || !projects.some((p) => p.submissionDate)} onClick={async () => { setBusy(true); setError(""); try { const result = await google("sync", { projects: projects.filter((p) => p.submissionDate).map((p) => ({ id: p.projectId || p.search || "default", name: p.name, dueDate: p.submissionDate, status: p.status })) }); setNotice(`${result.synced} project deadlines synced to Estimating Projects.`); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Sync due dates</button>
      {busy && <span role="status">Working…</span>}{notice && <span role="status">{notice}</span>}
    </div>
    {loading && <p role="status">Loading projects…</p>}{error && <p role="alert">{error}</p>}
    <div className="project-calendar-scroll"><div className="project-calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="project-calendar-weekday" key={day}>{day}</div>)}
    {days.map((date) => <div key={key(date)} className={`project-calendar-day${date.getMonth() !== month.getMonth() ? " is-outside" : ""}`}><span className={key(date) === today ? "is-today" : ""}>{date.getDate()}</span>{projects.filter((project) => project.submissionDate === key(date)).map((project) => <button className="project-calendar-event" key={project.search} title={`${project.name} · ${project.status || "Ongoing"}`} onClick={() => { if (project.search === window.location.search) onClose(); else window.location.assign(`${window.location.pathname}${project.search}`); }}>{project.name || "Untitled project"}<small>{project.status || "Ongoing"}</small></button>)}{dayEvents(date).map((event) => <a className="project-calendar-event is-google" key={event.id} href={event.url?.startsWith("https://") ? event.url : undefined} target="_blank" rel="noreferrer">{event.title}</a>)}</div>)}</div></div>
    <footer>{projects.filter((p) => p.submissionDate).length} projects with due dates · {projects.filter((p) => !p.submissionDate).length} without a due date</footer>
  </section></div>, document.body);
}
