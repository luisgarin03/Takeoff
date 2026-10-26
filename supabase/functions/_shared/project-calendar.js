import { fail } from "./drive-security.js";
const API = "https://www.googleapis.com/calendar/v3";
export const CALENDAR_SCOPES = ["calendar.events.readonly", "calendar.calendarlist.readonly"].map((scope) => `https://www.googleapis.com/auth/${scope}`).join(" ");
export function createProjectCalendar({ token, fetcher = fetch }) {
  async function request(auth, path, method = "GET", body, etag) {
    const response = await fetcher(`${API}${path}`, { method, headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json", ...(etag ? { "If-Match": etag } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (response.status === 412) fail("OTK_CALENDAR_CONFLICT", 409);
    if (response.status === 403) fail("OTK_CALENDAR_PERMISSION", 403);
    if (!response.ok) fail("OTK_CALENDAR_REQUEST", 502);
    return response.status === 204 ? null : response.json();
  }
  return async (user, action, input) => {
    const auth = await token(user);
    if (action === "colors") return request(auth, "/colors");
    if (action === "settings") return request(auth, "/users/me/settings");
    if (action === "create-calendar") {
      if (!input.name?.trim() || input.name.length > 250) fail("OTK_CALENDAR_REQUEST");
      return request(auth, "/calendars", "POST", { summary: input.name.trim(), timeZone: input.timeZone || "UTC" });
    }
    const calendars = await request(auth, "/users/me/calendarList?maxResults=250");
    if (action === "calendars") return { calendars: (calendars.items || []).map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary, color: c.backgroundColor, textColor: c.foregroundColor, accessRole: c.accessRole, timeZone: c.timeZone })) };
    const source = (calendars.items || []).find((c) => c.id === input.calendarId);
    const writable = source && ["owner", "writer"].includes(source.accessRole);
    const calendarPath = `/calendars/${encodeURIComponent(input.calendarId || "")}`;
    const eventPath = `${calendarPath}/events/${encodeURIComponent(input.eventId || "")}`;
    if (action === "acl") { if (source?.accessRole !== "owner") fail("OTK_CALENDAR_PERMISSION", 403); return request(auth, `${calendarPath}/acl`); }
    if (["create", "update", "delete", "quick-add", "update-calendar", "calendar-color", "delete-calendar", "move", "share", "unshare"].includes(action)) {
      if (!writable) fail("OTK_CALENDAR_PERMISSION", 403);
      const notify = input.sendUpdates === "all" ? "all" : "none";
      if (["share", "unshare"].includes(action)) {
        if (source.accessRole !== "owner") fail("OTK_CALENDAR_PERMISSION", 403);
        if (action === "unshare") {
          const rule = await request(auth, `${calendarPath}/acl/${encodeURIComponent(input.ruleId || "")}`);
          if (rule.role === "owner") fail("OTK_CALENDAR_PERMISSION", 403);
          return request(auth, `${calendarPath}/acl/${encodeURIComponent(input.ruleId)}`, "DELETE");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email || "") || !["reader", "writer"].includes(input.role)) fail("OTK_CALENDAR_REQUEST");
        return request(auth, `${calendarPath}/acl?sendNotifications=false`, "POST", { scope: { type: "user", value: input.email }, role: input.role });
      }
      if (action === "delete") {
        if (!input.eventId || !input.etag) fail("OTK_CALENDAR_CONFLICT", 409);
        return request(auth, `${eventPath}?sendUpdates=${notify}`, "DELETE", undefined, input.etag);
      }
      if (action === "move") {
        if (!input.eventId || !input.etag) fail("OTK_CALENDAR_CONFLICT", 409);
        if (!(calendars.items || []).some((c) => c.id === input.destination && ["writer", "owner"].includes(c.accessRole))) fail("OTK_CALENDAR_PERMISSION", 403);
        return request(auth, `${eventPath}/move?destination=${encodeURIComponent(input.destination)}&sendUpdates=${notify}`, "POST", undefined, input.etag);
      }
      if (action === "quick-add") {
        if (!input.text?.trim() || input.text.length > 1000) fail("OTK_CALENDAR_REQUEST");
        return request(auth, `${calendarPath}/events/quickAdd?text=${encodeURIComponent(input.text)}&sendUpdates=${notify}`, "POST");
      }
      if (action === "calendar-color") {
        if (!/^#[0-9a-f]{6}$/i.test(input.color || "")) fail("OTK_CALENDAR_REQUEST");
        return request(auth, `/users/me/calendarList/${encodeURIComponent(input.calendarId)}?colorRgbFormat=true`, "PATCH", { backgroundColor: input.color });
      }
      if (["update-calendar", "delete-calendar"].includes(action) && source.accessRole !== "owner") fail("OTK_CALENDAR_PERMISSION", 403);
      if (action === "delete-calendar") {
        if (source.primary) fail("OTK_CALENDAR_REQUEST");
        return request(auth, calendarPath, "DELETE");
      }
      if (action === "update-calendar") return request(auth, calendarPath, "PATCH", { ...(input.name !== undefined ? { summary: String(input.name).slice(0, 250) } : {}), ...(input.description !== undefined ? { description: String(input.description).slice(0, 10000) } : {}), ...(input.timeZone ? { timeZone: input.timeZone } : {}) });
      if (action === "update" && (!input.eventId || !input.etag)) fail("OTK_CALENDAR_CONFLICT", 409);
      const body = input.event || {};
      if (!body.summary?.trim() || body.summary.length > 250 || !body.start || !body.end) fail("OTK_CALENDAR_REQUEST");
      const start = Date.parse(body.start.date || body.start.dateTime), end = Date.parse(body.end.date || body.end.dateTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail("OTK_CALENDAR_RANGE");
      const allowed = ["summary", "description", "location", "start", "end", "colorId", "recurrence", "reminders", "attendees", "visibility", "transparency"];
      const safe = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)));
      if ((body.attendees?.length || 0) > 100 || (body.description?.length || 0) > 20000) fail("OTK_CALENDAR_REQUEST");
      return request(auth, `${action === "update" ? eventPath : calendarPath + "/events"}?sendUpdates=${notify}`, action === "update" ? "PATCH" : "POST", safe, action === "update" ? input.etag : undefined);
    }
    if (action === "get") { if (!source) fail("OTK_CALENDAR_PERMISSION", 403); return request(auth, eventPath); }
    if (action === "freebusy") {
      if (!Array.isArray(input.ids) || input.ids.length > 50 || input.ids.some((id) => !(calendars.items || []).some((c) => c.id === id))) fail("OTK_CALENDAR_REQUEST");
      if (!Number.isFinite(Date.parse(input.start)) || !Number.isFinite(Date.parse(input.end)) || Date.parse(input.end) <= Date.parse(input.start)) fail("OTK_CALENDAR_RANGE");
      return request(auth, "/freeBusy", "POST", { timeMin: input.start, timeMax: input.end, items: input.ids.map((id) => ({ id })) });
    }
    if (action === "events") {
      const start = new Date(input.start), end = new Date(input.end);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end - start > 100 * 86400000) fail("OTK_CALENDAR_RANGE");
      const calendar = (calendars.items || []).find((c) => c.id === input.calendarId);
      if (!calendar) fail("OTK_CALENDAR_REQUEST");
      let items = [], pageToken = "";
      do {
        const query = new URLSearchParams({ timeMin: start.toISOString(), timeMax: end.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250", ...(pageToken ? { pageToken } : {}) });
        const page = await request(auth, `/calendars/${encodeURIComponent(calendar.id)}/events?${query}`);
        items.push(...(page.items || []).filter((event) => event.status !== "cancelled")); pageToken = page.nextPageToken || "";
      } while (pageToken && items.length < 2000);
      const palette = items.some((event) => event.colorId) ? await request(auth, "/colors") : null;
      const colorsFor = (event) => {
        const custom = palette?.event?.[event.colorId];
        return { color: custom?.background || calendar.backgroundColor, textColor: custom?.foreground || calendar.foregroundColor };
      };
      return { events: items.map((e) => ({ ...colorsFor(e), etag: e.etag, colorId: e.colorId, recurringEventId: e.recurringEventId, accessRole: calendar.accessRole, id: e.id, title: e.summary || "Busy", start: e.start, end: e.end, url: e.htmlLink, description: e.description || "", location: e.location || "" })) };
    }
    fail("OTK_CALENDAR_REQUEST");
  };
}
