import test from "node:test";
import assert from "node:assert/strict";
import { GOOGLE_EVENT_COLOR_FALLBACK, googleCalendarDisplayColors, googleCalendarEvent, googleEventColorOptions } from "../src/lib/googleCalendarEvent.js";

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
  assert.deepEqual(googleCalendarDisplayColors("#a4bdfc", "#1d1d1d"), { color: "#828bc2", contrastColor: "#131314" });
  assert.deepEqual(googleCalendarDisplayColors("#42D692", "#000000"), { color: "#429a8e", contrastColor: "#131314" });
  assert.deepEqual(googleCalendarDisplayColors("#fbd75b", "#1d1d1d"), { color: "#e7ba51", contrastColor: "#131314" });
  assert.deepEqual(googleCalendarDisplayColors("#c0ffee", "#123456"), { color: "#c0ffee", contrastColor: "#123456" });
});

test("Google event color choices remain available while the provider palette loads", () => {
  const fallback = googleEventColorOptions();
  assert.equal(fallback.length, Object.keys(GOOGLE_EVENT_COLOR_FALLBACK).length);
  assert.deepEqual(fallback.map(({ id }) => id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  assert.deepEqual(fallback.find(({ id }) => id === "5"), { id: "5", name: "Banana", color: "#e7ba51", contrastColor: "#131314" });
});

test("Google event color choices use the live provider palette when available", () => {
  assert.deepEqual(googleEventColorOptions({ 15: { background: "#c0ffee", foreground: "#123456" } }), [
    { id: "15", name: "Color 15", color: "#c0ffee", contrastColor: "#123456" },
  ]);
});
