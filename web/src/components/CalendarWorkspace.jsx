import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FullCalendar from "@fullcalendar/react";
import dayGrid from "@fullcalendar/react/daygrid";
import timeGrid from "@fullcalendar/react/timegrid";
import list from "@fullcalendar/react/list";
import interaction from "@fullcalendar/react/interaction";
import monarch from "@fullcalendar/react/themes/monarch";
import rrule from "@fullcalendar/rrule";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/blue.css";
import { useCloud } from "../lib/supabase/CloudContext.jsx";
import { useLicenseAccess } from "../lib/licenseAccess.jsx";
import { pickDriveFiles } from "../lib/googleDrivePicker.js";
import { createCalendarRepository, calendarZone, dateKey, fullCalendarEvent } from "../lib/calendarWorkspace.js";
import { googleCalendarDisplayColors, googleCalendarEvent } from "../lib/googleCalendarEvent.js";
import { readCalendarCache, writeCalendarCache, clearCalendarCache } from "../lib/calendarCache.js";
import { localProjects } from "../lib/localCalendarProjects.js";
import CalendarEventEditor from "./CalendarEventEditor.jsx";
import { createFileProjectStore, localStore, projectWritesAreBlocked } from "../lib/store.js";
import { bidDescription } from "../lib/calendarBidDetails.js";
import CalendarEventDetails from "./CalendarEventDetails.jsx";
import { restoreGoogleSelection, saveGoogleSelection } from "../lib/googleCalendarSelection.js";
import CalendarSettings from "./CalendarSettings.jsx";
import GoogleCalendarEventEditor from "./GoogleCalendarEventEditor.jsx";
import "../styles/projectCalendar.css";
const plugins = [monarch, dayGrid, timeGrid, list, interaction, rrule];
export default function CalendarWorkspace({ metadata, onClose, onSaveMetadata }) {
  const cloud = useCloud(), license = useLicenseAccess(), userId = cloud.user?.id;
  const cacheKey = userId ? `${cloud.configuration.url}/${userId}` : "";
  const repo = useMemo(() => cloud.client && userId ? createCalendarRepository(cloud.client, userId) : null, [cloud.client, userId]);
  const ref = useRef(null), loadId = useRef(0), root = useRef(null);
  const [calendars, setCalendars] = useState([]), [rows, setRows] = useState([]), [projects, setProjects] = useState([]);
  const [googleCalendars, setGoogleCalendars] = useState([]), [googleEvents, setGoogleEvents] = useState([]), [googleIds, setGoogleIds] = useState([]);
  const [hidden, setHidden] = useState([]), [showProjects, setShowProjects] = useState(true), [range, setRange] = useState(null);
  const [search, setSearch] = useState(""), [category, setCategory] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [cachedAt, setCachedAt] = useState(""), [editing, setEditing] = useState(null), [settings, setSettings] = useState(false), [revision, setRevision] = useState(0);
  const [details, setDetails] = useState(null);
  const [googleEditing, setGoogleEditing] = useState(null), [googleWrite, setGoogleWrite] = useState(false);
  const canWrite = !!userId && !cloud.offline && !license.readOnly;
  const writable = calendars.filter((c) => c.role !== "viewer");
  const canEdit = (row) => canWrite && calendars.some((c) => c.id === row.calendar_id && c.role !== "viewer");
  const edge = useCallback(async (action, body = {}) => {
    if (!cloud.client || !userId) throw new Error("Log in to connect Google Workspace.");
    const { data, error } = await cloud.client.functions.invoke(`otk-drive?action=${action}`, { body });
    if (error || data?.code) {
      let code = data?.code;
      if (!code && error?.context?.json) { try { code = (await error.context.json()).code; } catch { /* No server response body. */ } }
      const messages = {
        OTK_CALENDAR_WRITE_PERMISSION: "Approve Google Calendar editing access in Settings to make changes.",
        OTK_CALENDAR_CONFLICT: "This Google event changed elsewhere. Refresh and reopen it before saving.",
        OTK_CALENDAR_CONNECT: "Google Calendar is not connected. Click Connect Google Calendar in Settings to approve Calendar access.",
        OTK_CALENDAR_SETUP: "The Calendar connection service could not load authorization settings. Please try again.",
        OTK_DRIVE_CONNECT: "Google authorization is missing or expired. Click Connect Google Calendar in Settings and complete Google's approval screen.",
        OTK_CALENDAR_PERMISSION: "Google denied Calendar access. Reconnect Google Calendar and approve Calendar permissions. Also check that Google Calendar API is enabled for this OAuth project.",
        OTK_AUTH: "Your app session expired. Sign in again, then reconnect Google Calendar.",
        OTK_ACCESS: "This app address is not allowed by the Google connection service. Contact the app administrator.",
        OTK_DRIVE_RETURN: "This app address is not allowed as a Google sign-in return address. Contact the app administrator.",
        OTK_DRIVE_SETUP: "The Google connection service is missing its server configuration.",
        OTK_CALENDAR_REQUEST: "Google Calendar could not load the requested calendar. Try connecting again, then load your calendar list.",
      };
      throw new Error(messages[code] || `Google Workspace request failed${code ? ` (${code})` : ""}. Try Connect Google Calendar again in Settings.`);
    }
    return data;
  }, [cloud.client, userId]);
  const refresh = useCallback(async () => {
    if (!repo || !range || cloud.offline) return;
    const id = ++loadId.current;
    try {
      const next = await repo.list(), events = await repo.events(next.map((c) => c.id), range.start, range.end);
      if (id !== loadId.current) return;
      setCalendars(next); setRows(events); setCachedAt("");
      await writeCalendarCache(cacheKey, { calendars: next, rows: events, range });
    } catch (e) { if (id !== loadId.current) return; setCalendars([]); setRows([]); await clearCalendarCache(cacheKey).catch(() => {}); setError(`Calendar could not load: ${e.message}. Apply the calendar migration if it has not been installed.`); }
  }, [repo, range, cloud.offline, cacheKey]);
  useEffect(() => { loadId.current++; setCalendars([]); setRows([]); setGoogleEvents([]); setGoogleCalendars([]); setGoogleIds([]); setGoogleWrite(false); setGoogleEditing(null); setEditing(null); setDetails(null); return () => { loadId.current++; }; }, [userId]);
  useEffect(() => {
    if (!repo) return;
    if (cloud.offline) { let live = true; readCalendarCache(cacheKey).then((cache) => { if (live && cache) { setCalendars(cache.calendars); setRows(cache.rows); setCachedAt(cache.cachedAt); } }).catch(() => {}); return () => { live = false; }; }
    refresh(); let timer;
    const changed = () => { clearTimeout(timer); timer = setTimeout(refresh, 200); };
    const stop = repo.watch(changed); window.addEventListener("focus", changed);
    return () => { clearTimeout(timer); stop(); window.removeEventListener("focus", changed); loadId.current++; };
  }, [repo, cloud.offline, cacheKey, refresh]);
  useEffect(() => {
    if (!cloud.client || !userId || cloud.offline) return;
    let live = true;
    (async () => {
      const { data: connection, error: connectionError } = await cloud.client.from("google_connections").select("status,granted_scopes").eq("owner_id", userId).maybeSingle();
      if (connectionError) throw new Error("Could not restore your Google Calendar connection. Try Refresh.");
      if (live) setGoogleWrite(!!connection?.granted_scopes?.includes("https://www.googleapis.com/auth/calendar"));
      if (!connection || connection.status !== "connected" || !connection.granted_scopes?.includes("https://www.googleapis.com/auth/calendar.events.readonly")) return;
      const data = await edge("calendar-calendars");
      if (live) { setGoogleCalendars(data.calendars); setGoogleIds(restoreGoogleSelection(cacheKey, data.calendars)); }
    })().catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [cloud.client, userId, cloud.offline, edge, cacheKey, revision]);
  const selectGoogleCalendars = (ids) => { setGoogleIds(ids); saveGoogleSelection(cacheKey, ids); };
  useEffect(() => { let live = true; localProjects().then((items) => { if (live) setProjects([{ ...metadata, search: window.location.search }, ...items.filter((p) => p.search !== window.location.search)]); }).catch(() => {}); return () => { live = false; }; }, [metadata]);
  useEffect(() => { const previous = document.activeElement; root.current?.focus(); return () => previous?.focus?.(); }, []);
  useEffect(() => {
    if (cloud.offline || !range || !googleIds.length) { setGoogleEvents([]); return; }
    let live = true;
    Promise.all(googleIds.map(async (id) => { const data = await edge("calendar-events", { calendarId: id, start: range.start, end: range.end }); return data.events.map((event) => ({ ...event, calendarId: id })); })).then((events) => { if (live) setGoogleEvents([...new Map(events.flat().map((e) => [`${e.calendarId}/${e.id}`, e])).values()]); }).catch((e) => { if (live) { setGoogleEvents([]); setError(e.message); } });
    return () => { live = false; };
  }, [range, googleIds, edge, cloud.offline, revision]);
  const events = useMemo(() => {
    const match = (title, description = "") => `${title} ${description}`.toLowerCase().includes(search.toLowerCase());
    return [...rows.filter((e) => !hidden.includes(e.calendar_id) && (!category || category === e.category) && match(e.title, e.description)).map((e) => fullCalendarEvent(e, calendars.find((c) => c.id === e.calendar_id), canWrite && calendars.some((c) => c.id === e.calendar_id && c.role !== "viewer"))),
      ...googleEvents.filter((e) => !category && match(e.title)).map((e) => googleCalendarEvent(e, googleCalendars.find((c) => c.id === e.calendarId), canWrite && googleWrite && ["writer", "owner"].includes(e.accessRole))),
      ...(!showProjects || category ? [] : projects.filter((p) => p.submissionDate && match(p.name)).map((p) => ({ id: `project:${p.search}`, title: `Due — ${p.name}`, start: p.submissionDate, allDay: true, color: "#4f8d80", editable: false, extendedProps: { kind: "project", project: p } })))];
  }, [rows, calendars, googleCalendars, googleEvents, projects, hidden, showProjects, search, category, canWrite, googleWrite]);
  async function run(action) { setBusy(true); setError(""); try { await action(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function editGoogle(event, series = false) {
    if (!canWrite || !googleWrite) { setSettings(true); setNotice("Approve Google Calendar editing access in Settings first."); return; }
    await run(async () => {
      const raw = await edge("calendar-get", { calendarId: event.calendarId, eventId: series && event.recurringEventId ? event.recurringEventId : event.id });
      setGoogleEditing({ ...raw, calendarId: event.calendarId }); setDetails(null);
    });
  }
  function create(info) {
    if (!canWrite || !writable.length) { setNotice("Log in with editing access to create events."); return; }
    const start = info.dateStr || info.startStr || new Date().toISOString(), date = new Date(start), all = info.allDay ?? !start.includes("T");
    setEditing({ calendar_id: writable[0].id, start_time: date.toISOString(), end_time: new Date(info.endStr || date.getTime() + (all ? 86400000 : 3600000)).toISOString(), all_day: all, timezone: calendarZone() });
  }
  async function reschedule(info) {
    if (info.event.extendedProps.kind === "google") {
      const event = info.event.extendedProps.google;
      if (!canWrite || !googleWrite || !["owner", "writer"].includes(event.accessRole)) { info.revert(); return; }
      try {
        const end = info.event.end || new Date(info.event.start.getTime() + (info.event.allDay ? 86400000 : 3600000));
        await edge("calendar-update", { calendarId: event.calendarId, eventId: event.id, etag: event.etag, event: { summary: event.title, start: info.event.allDay ? { date: info.event.startStr.slice(0, 10) } : { dateTime: info.event.start.toISOString(), timeZone: calendarZone() }, end: info.event.allDay ? { date: dateKey(end) } : { dateTime: end.toISOString(), timeZone: calendarZone() } } });
        setRevision((r) => r + 1);
      } catch (e) { info.revert(); setError(e.message); }
      return;
    }
    const row = info.event.extendedProps.row;
    if (!row || !canEdit(row) || row.recurrence_rule) { info.revert(); return; }
    const before = rows, updated = { ...row, start_time: new Date(info.event.startStr).toISOString(), end_time: new Date(info.event.endStr).toISOString(), all_day: info.event.allDay };
    setRows((current) => current.map((e) => e.id === row.id ? updated : e));
    try { await repo.save(updated, row.updated_at); await refresh(); } catch (e) { info.revert(); setRows(before); setError(e.message); await refresh(); }
  }
  const calendarCheckbox = (c) => <label className="calendar-checkbox" key={c.id}><input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => setHidden((ids) => ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id])} /><span style={{ color: c.color }}>●</span>{c.name}</label>;
  return createPortal(<div className="project-calendar-shade"><section className="project-calendar calendar-workspace" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Project calendar" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { if (googleEditing) setGoogleEditing(null); else if (editing) setEditing(null); else if (details) setDetails(null); else onClose(); } }}>
    <header><h2>Calendar</h2><input aria-label="Search events" placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Filter category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{[...new Set(rows.map((r) => r.category))].map((c) => <option key={c}>{c}</option>)}</select><button disabled={busy || cloud.offline} onClick={() => run(async () => { await refresh(); setRevision((r) => r + 1); })}>Refresh</button><button onClick={() => setSettings((v) => !v)}>Settings</button><button className="project-calendar-close" onClick={onClose} aria-label="Close calendar">×</button></header>
    {(cloud.offline || cachedAt) && <p className="calendar-notice">Offline · Cached information may be outdated{cachedAt ? ` · Last synced ${new Date(cachedAt).toLocaleString()}` : ""}. Editing is disabled.</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status" className="calendar-notice">{notice}</p>}
    <div className="calendar-workspace-body"><aside className="calendar-sidebar"><button disabled={!canWrite || !writable.length} onClick={() => create({ allDay: true, dateStr: dateKey(new Date()) })}>+ Create event</button><button disabled={!canWrite || !googleWrite || !googleCalendars.some((c) => ["owner", "writer"].includes(c.accessRole))} onClick={() => setGoogleEditing({})}>+ Google event</button>{!googleWrite && !!googleCalendars.length && <button onClick={() => setSettings(true)}>Enable Google editing</button>}<label>Go to date<input type="date" onChange={(e) => { if (e.target.value) ref.current.getApi().gotoDate(e.target.value); }} /></label><MiniCalendar onChoose={(date) => ref.current.getApi().gotoDate(date)} />
      <h4>Project due dates</h4><label className="calendar-checkbox"><input type="checkbox" checked={showProjects} onChange={(e) => setShowProjects(e.target.checked)} />Local projects</label><h4>My calendars</h4>{calendars.filter((c) => c.owner_id === userId).map(calendarCheckbox)}<h4>Shared calendars</h4>{calendars.filter((c) => c.owner_id !== userId).map(calendarCheckbox)}<h4>Google calendars</h4>{googleCalendars.map((c) => <label className="calendar-checkbox" key={c.id}><input type="checkbox" checked={googleIds.includes(c.id)} onChange={(e) => selectGoogleCalendars(e.target.checked ? [...googleIds, c.id] : googleIds.filter((id) => id !== c.id))} /><span style={{ color: googleCalendarDisplayColors(c.color, c.textColor).color }}>●</span>{c.name}</label>)}{!userId && <p>Log in for cloud calendars. Local project dates remain available.</p>}
      {settings && <CalendarSettings googleCalendars={googleCalendars} googleWrite={googleWrite} cloud={cloud} calendars={calendars} repo={repo} edge={edge} canWrite={canWrite} busy={busy} run={run} onRefresh={refresh} onGoogle={(items) => { setGoogleCalendars(items); setGoogleEvents([]); setGoogleIds(restoreGoogleSelection(cacheKey, items)); }} onDisconnect={async () => { setGoogleCalendars([]); setGoogleEvents([]); setGoogleIds([]); await clearCalendarCache(cacheKey); }} />}
    </aside><main className="calendar-main"><FullCalendar ref={ref} plugins={plugins} initialView="dayGridMonth" height="100%" timeZone="local" headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }} buttonText={{ today: "Today", month: "Month", week: "Week", day: "Day", list: "Agenda" }} nowIndicator selectable={canWrite} editable={canWrite} dayMaxEvents longPressDelay={400} events={events} datesSet={(info) => setRange((old) => old?.start === info.startStr && old?.end === info.endStr ? old : { start: info.startStr, end: info.endStr })} dateClick={create} select={create} eventDrop={reschedule} eventResize={reschedule} eventClick={({ event, jsEvent }) => { jsEvent.preventDefault(); setDetails(event); }} /></main></div>
    {details && <CalendarEventDetails event={details} editable={details.extendedProps.kind === "google" ? canWrite && googleWrite && ["owner", "writer"].includes(details.extendedProps.google.accessRole) : details.extendedProps.kind === "project" ? canWrite : !!details.extendedProps.row && canEdit(details.extendedProps.row)} busy={busy} onClose={() => setDetails(null)} onEditEvent={() => { if (details.extendedProps.kind === "google") editGoogle(details.extendedProps.google); else { setEditing(details.extendedProps.row); setDetails(null); } }} onEditSeries={() => editGoogle(details.extendedProps.google, true)} onSaveBid={async (bidDetails) => {
      if (!canWrite) throw new Error("Editing access required.");
      const p = details.extendedProps;
      if (p.kind === "project") {
        if (projectWritesAreBlocked()) throw new Error("Project is view only.");
        const next = { ...p.project, bidDetails };
        if (p.project.search === window.location.search) await onSaveMetadata({ bidDetails });
        else { const id = new URLSearchParams(p.project.search).get("localProject"); const target = id ? createFileProjectStore(id) : localStore; const a = await target.loadAnnotations(); await target.saveAnnotations({ ...a, project_metadata: { ...a.project_metadata, bidDetails, lastModifiedAt: new Date().toISOString() } }); }
        setProjects((items) => items.map((item) => item.search === next.search ? next : item)); details.setExtendedProp("project", next);
      } else {
        const row = p.row; if (!canEdit(row)) throw new Error("Editing access required.");
        const updated = await repo.save({ ...row, description: bidDescription(bidDetails), location: bidDetails.location }, row.updated_at); details.setExtendedProp("row", { ...updated, calendar_attachments: row.calendar_attachments }); await refresh();
      }
    }} onDelete={async () => { setBusy(true); try { await repo.remove(details.extendedProps.row); setDetails(null); await refresh(); } finally { setBusy(false); } }} onOpenProject={() => { const project = details.extendedProps.project; if (project.search === window.location.search) onClose(); else window.location.assign(`${window.location.pathname}${project.search}`); }} />}
    {googleEditing && <GoogleCalendarEventEditor event={googleEditing} calendars={googleCalendars} edge={edge} onClose={() => setGoogleEditing(null)} onSaved={async () => { setGoogleEditing(null); setRevision((r) => r + 1); }} />}
    {editing && <CalendarEventEditor key={editing.id || "new"} event={editing} calendars={calendars} editable={editing.id ? canEdit(editing) : canWrite} busy={busy} onClose={() => setEditing(null)} onPick={() => pickDriveFiles({ sharePicker: () => edge("share-picker") }, { title: "Attach Google Drive files to this event" })} onDetach={async (id) => { await repo.detach(id); setEditing((e) => ({ ...e, calendar_attachments: e.calendar_attachments.filter((f) => f.id !== id) })); await refresh(); }} onSave={async (draft, version, files) => { setBusy(true); try { const row = await repo.save(draft, version); setEditing({ ...row, calendar_attachments: editing.calendar_attachments || [] }); await repo.attach(row.id, files); setEditing(null); await refresh(); } finally { setBusy(false); } }} onDelete={async (event) => { await repo.remove(event); setEditing(null); await refresh(); }} />}
  </section></div>, document.body);
}
function MiniCalendar({ onChoose }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  return <section className="calendar-mini"><div><button aria-label="Previous mini month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.toLocaleDateString(undefined, { month: "short", year: "numeric" })}</strong><button aria-label="Next mini month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><div className="calendar-mini-grid">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <small key={i}>{d}</small>)}{Array.from({ length: 42 }, (_, i) => { const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); return <button key={i} className={dateKey(d) === dateKey(new Date()) ? "is-today" : ""} aria-label={d.toLocaleDateString()} onClick={() => onChoose(dateKey(d))}>{d.getDate()}</button>; })}</div></section>;
}
