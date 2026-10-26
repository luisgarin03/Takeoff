import test from "node:test";
import assert from "node:assert/strict";
import { googleCalendarDisplayColors, googleCalendarEvent } from "../src/lib/googleCalendarEvent.js";

const calendar = { id: "work", color: "#70a89f", textColor: "#111111" };
const base = { id: "event", calendarId: "work", title: "Bid due", start: { date: "2026-10-26" }, end: { date: "2026-10-27" }, accessRole: "owner" };

test("Google event colors map to FullCalendar 7 color fields", () => {
  const event = googleCalendarEvent({ ...base, color: "#fbd75b", textColor: "#1d1d1d" }, calendar, true);
  assert.equal(event.color, "#e7ba51");
  assert.equal(event.contrastColor, "#131314");
  assert.equal(event.editable, true);
  assert.equal("textColor" in event, false);
});

test("Google events inherit their exact calendar colors", () => {
  const event = googleCalendarEvent(base, calendar, false);
  assert.equal(event.color, "#70a89f");
  assert.equal(event.contrastColor, "#111111");
});

test("Google built-in event colors match the Calendar month-view presentation", () => {
  assert.deepEqual(googleCalendarDisplayColors("#42D692", "#000000"), { color: "#429a8e", contrastColor: "#131314" });
  assert.deepEqual(googleCalendarDisplayColors("#fbd75b", "#1d1d1d"), { color: "#e7ba51", contrastColor: "#131314" });
  assert.deepEqual(googleCalendarDisplayColors("#c0ffee", "#123456"), { color: "#c0ffee", contrastColor: "#123456" });
});
