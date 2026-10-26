import { RRule } from "rrule";
import { Temporal } from "temporal-polyfill";
export const calendarZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function zonedInput(iso, zone, allDay = false) { return allDay ? iso.slice(0, 10) : Temporal.Instant.from(iso).toZonedDateTimeISO(zone).toPlainDateTime().toString().slice(0, 16); }
export function zonedISO(input, zone, allDay = false) {
  if (allDay) return new Date(`${input}T00:00:00Z`).toISOString();
  try { return Temporal.ZonedDateTime.from(`${input}[${zone}]`, { disambiguation: "reject" }).toInstant().toString(); }
  catch { throw new Error("That local time is invalid or ambiguous in this timezone. Choose another time around the daylight-saving transition."); }
}
export function validateCalendarEvent(draft) {
  if (!draft.title?.trim()) throw new Error("Enter an event title.");
  if (draft.title.length > 250) throw new Error("Keep the title under 250 characters.");
  const start = Date.parse(draft.start_time), end = Date.parse(draft.end_time);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("End must be after the start.");
  try { new Intl.DateTimeFormat("en", { timeZone: draft.timezone }).format(); } catch { throw new Error("Choose a valid timezone."); }
  if (draft.recurrence_rule) {
    if (draft.recurrence_rule.length > 4000) throw new Error("Recurrence rule is too long.");
    try { RRule.fromString(draft.recurrence_rule); } catch { throw new Error("Enter a valid recurrence rule."); }
  }
  return { ...draft, title: draft.title.trim(), start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), color: draft.color || null, recurrence_rule: draft.recurrence_rule || null };
}
export function fullCalendarEvent(row, calendar, editable) {
  const common = { id: row.id, title: row.title, color: row.color || calendar?.color, allDay: row.all_day,
    editable: editable && !row.recurrence_rule, extendedProps: { row, kind: "supabase", calendarId: row.calendar_id } };
  if (row.recurrence_rule) {
    const stamp = row.all_day ? `DTSTART;VALUE=DATE:${row.start_time.slice(0, 10).replaceAll("-", "")}` : `DTSTART;TZID=${row.timezone}:${zonedInput(row.start_time, row.timezone).replace(/[-:]/g, "")}00`;
    return { ...common, rrule: `${stamp}\nRRULE:${row.recurrence_rule.replace(/^RRULE:/, "")}`, duration: { milliseconds: Date.parse(row.end_time) - Date.parse(row.start_time) } };
  }
  return { ...common, start: row.all_day ? row.start_time.slice(0, 10) : row.start_time, end: row.all_day ? row.end_time.slice(0, 10) : row.end_time };
}
const unwrap = ({ data, error }) => { if (error) throw error; return data; };
export function createCalendarRepository(client, userId) {
  return {
    async list() {
      unwrap(await client.rpc("otk_provision_calendar"));
      const calendars = unwrap(await client.from("calendars").select("*,calendar_members(user_id,role)").order("created_at"));
      return calendars.map((c) => ({ ...c, role: c.owner_id === userId ? "owner" : c.calendar_members.find((m) => m.user_id === userId)?.role || "viewer" }));
    },
    async events(ids, start, end) {
      if (!ids.length) return [];
      let rows = [], offset = 0;
      while (true) {
        const page = unwrap(await client.from("calendar_events").select("*,calendar_attachments(*)").in("calendar_id", ids).lt("start_time", end).or(`end_time.gt.${start},recurrence_rule.not.is.null`).order("id").range(offset, offset + 499));
        rows.push(...page); if (page.length < 500) break; offset += 500;
      }
      return rows;
    },
    async save(draft, version) {
      const { id, calendar_attachments, created_at, updated_at, created_by, ...fields } = draft;
      const valid = validateCalendarEvent(fields);
      const result = id ? await client.from("calendar_events").update(valid).eq("id", id).eq("updated_at", version).select().maybeSingle()
        : await client.from("calendar_events").insert({ ...valid, created_by: userId }).select().single();
      const row = unwrap(result);
      if (!row) throw new Error("This event changed or your access was removed. Refresh before trying again.");
      return row;
    },
    async remove(row) { const rows = unwrap(await client.from("calendar_events").delete().eq("id", row.id).eq("updated_at", row.updated_at).select("id")); if (!rows.length) throw new Error("This event changed. Refresh before deleting."); },
    async create(name, color) { return unwrap(await client.from("calendars").insert({ owner_id: userId, name: name.trim(), color }).select().single()); },
    async share(calendar_id, user_id, role) { return unwrap(await client.from("calendar_members").upsert({ calendar_id, user_id, role }, { onConflict: "calendar_id,user_id" }).select().single()); },
    async unshare(id) { unwrap(await client.from("calendar_members").delete().eq("id", id)); },
    async attach(event_id, files) {
      if (!files.length) return;
      return unwrap(await client.from("calendar_attachments").upsert(files.map((file) => ({ event_id, provider: "google_drive", provider_file_id: file.id, filename: file.name, mime_type: file.mimeType, external_url: file.url })), { onConflict: "event_id,provider,provider_file_id" }));
    },
    async detach(id) { unwrap(await client.from("calendar_attachments").delete().eq("id", id)); },
    watch(onChange) {
      let channel = client.channel(`calendar-workspace-${crypto.randomUUID()}`);
      for (const table of ["calendars", "calendar_events", "calendar_members", "calendar_attachments"]) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
      channel.subscribe((status) => { if (status === "SUBSCRIBED") onChange(); });
      return () => { client.removeChannel(channel); };
    },
  };
}
