import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectCalendar } from "../../supabase/functions/_shared/project-calendar.js";

const event = { summary: "Site visit", start: { date: "2026-10-26" }, end: { date: "2026-10-27" }, colorId: "5", recurrence: ["RRULE:FREQ=WEEKLY;COUNT=3"], reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] } };
function fixture(role = "owner", status = 200) {
  const calls: any[] = [];
  const api = createProjectCalendar({ token: async () => "private", fetcher: async (input, init: any) => {
    const url = String(input); calls.push({ url, ...init });
    if (url.includes("calendarList?")) return Response.json({ items: [{ id: "work", accessRole: role }, { id: "destination", accessRole: "writer" }, { id: "primary", accessRole: "owner", primary: true }] });
    if (url.endsWith("/acl/owner")) return Response.json({ role: "owner" });
    if (status === 412) return new Response("", { status });
    return init.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ id: "saved", etag: "new-version" });
  } });
  return { api, calls };
}
test("Google writes preserve event settings and strip unapproved provider properties", async () => {
  const { api, calls } = fixture();
  await api("user", "create", { calendarId: "work", event: { ...event, attendees: [{ email: "person@example.com" }], creator: { email: "forged@example.com" }, organizer: { self: true } } });
  const write = calls.at(-1), body = JSON.parse(write.body);
  assert.equal(write.method, "POST"); assert.match(write.url, /sendUpdates=none/);
  assert.equal(body.colorId, "5"); assert.deepEqual(body.recurrence, event.recurrence); assert.deepEqual(body.reminders, event.reminders);
  assert.equal(body.creator, undefined); assert.equal(body.organizer, undefined);
});
test("Google updates and deletes require concurrency versions and send If-Match", async () => {
  const { api, calls } = fixture();
  await assert.rejects(api("user", "update", { calendarId: "work", eventId: "id", event }));
  await api("user", "update", { calendarId: "work", eventId: "id", etag: "version", event, sendUpdates: "all" });
  assert.equal(calls.at(-1).headers["If-Match"], "version"); assert.equal(calls.at(-1).method, "PATCH"); assert.match(calls.at(-1).url, /sendUpdates=all/);
  await api("user", "delete", { calendarId: "work", eventId: "id", etag: "version" });
  assert.equal(calls.at(-1).method, "DELETE"); assert.equal(calls.at(-1).headers["If-Match"], "version");
  await assert.rejects(fixture("owner", 412).api("user", "update", { calendarId: "work", eventId: "id", etag: "old", event }), (e: any) => e.code === "OTK_CALENDAR_CONFLICT");
});
test("Google read-only calendar permissions cannot be bypassed for writes or sharing", async () => {
  for (const action of ["create", "update", "delete", "quick-add", "move", "calendar-color", "delete-calendar", "share", "unshare", "acl"]) {
    const { api, calls } = fixture("reader");
    await assert.rejects(api("user", action, { calendarId: "work", eventId: "id", etag: "version", event }));
    assert.equal(calls.length, 1);
  }
  await assert.rejects(fixture("writer").api("user", "share", { calendarId: "work", email: "guest@example.com", role: "writer" }));
});
test("Google writes reject bad dates, unknown calendars, primary deletion, and owner access removal", async () => {
  const { api } = fixture();
  await assert.rejects(api("user", "create", { calendarId: "unknown", event }));
  await assert.rejects(api("user", "create", { calendarId: "work", event: { ...event, end: event.start } }));
  await assert.rejects(api("user", "delete-calendar", { calendarId: "primary" }));
  await assert.rejects(api("user", "unshare", { calendarId: "work", ruleId: "owner" }));
});
test("Google calendar management and availability use the intended provider endpoints", async () => {
  const { api, calls } = fixture();
  await api("user", "calendar-color", { calendarId: "work", color: "#abcdef" });
  assert.match(calls.at(-1).url, /colorRgbFormat=true/); assert.deepEqual(JSON.parse(calls.at(-1).body), { backgroundColor: "#abcdef" });
  await api("user", "share", { calendarId: "work", email: "guest@example.com", role: "reader" });
  assert.match(calls.at(-1).url, /acl\?sendNotifications=false/);
  await api("user", "freebusy", { ids: ["work"], start: "2026-10-26T00:00:00Z", end: "2026-10-27T00:00:00Z" });
  assert.match(calls.at(-1).url, /freeBusy$/); assert.equal(calls.at(-1).method, "POST");
  await api("user", "create-calendar", { name: "Job visits", timeZone: "America/New_York" });
  assert.match(calls.at(-1).url, /calendars$/); assert.equal(JSON.parse(calls.at(-1).body).summary, "Job visits");
  await api("user", "update-calendar", { calendarId: "work", name: "Renamed" });
  assert.deepEqual(JSON.parse(calls.at(-1).body), { summary: "Renamed" });
});
