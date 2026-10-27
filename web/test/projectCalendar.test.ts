import test from "node:test";
import assert from "node:assert/strict";
import { createProjectCalendar, CALENDAR_SCOPES } from "../../supabase/functions/_shared/project-calendar.js";
test("Calendar scopes are read only", () => {
 assert.deepEqual(CALENDAR_SCOPES.split(" "), ["https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"]);
});
test("Calendar events page, omit cancellations, and include bid descriptions", async () => {
 const methods: string[] = []; let page=0;
 const api=createProjectCalendar({token:async()=>"test",fetcher:async(input,init:any)=>{
  methods.push(init.method);
  if(String(input).includes("calendarList")) return Response.json({items:[{id:"mine",summary:"Work"}]});
  page++;
  return Response.json(page===1 ? {items:[{id:"cancel",status:"cancelled"},{id:"one",summary:"Bid",description:"Bid details",location:"Site",start:{date:"2026-10-07"},end:{date:"2026-10-08"}}],nextPageToken:"next"} : {items:[{id:"two",summary:"Visit",start:{dateTime:"2026-10-08T15:00:00Z"}}]});
 }});
 const result=await api("user","events",{calendarId:"mine",start:"2026-10-01",end:"2026-11-01"});
 assert.ok(result?.events); assert.equal(result.events.length,2); assert.equal(result.events[0].description,"Bid details"); assert.equal(result.events[0].location,"Site"); assert.equal(page,2); assert.ok(methods.every(m=>m==="GET"));
});
test("Calendar reads reject sources not in the user's calendar list", async()=>{
 let calls=0;const api=createProjectCalendar({token:async()=>"test",fetcher:async()=>{calls++;return Response.json({items:[]});}});
 await assert.rejects(()=>api("user","events",{calendarId:"other",start:"2026-10-01",end:"2026-11-01"}));assert.equal(calls,1);
});
test("Calendar writes are unavailable", async()=>{
 const api=createProjectCalendar({token:async()=>"test",fetcher:async()=>Response.json({items:[]})});
 await assert.rejects(()=>api("user","sync",{}));
});

test("Google calendar colors and per-event overrides retain background and foreground", async () => {
 const api = createProjectCalendar({ token: async () => "test", fetcher: async (input) => {
  const url = String(input);
  if (url.includes("calendarList")) return Response.json({ items: [{ id: "mine", summary: "Work", backgroundColor: "#70a89f", foregroundColor: "#111111" }] });
  if (url.endsWith("/colors")) return Response.json({ event: { "5": { background: "#fbd75b", foreground: "#1d1d1d" } } });
  return Response.json({ items: [{ id: "default" }, { id: "custom", colorId: "5" }, { id: "unknown", colorId: "999" }] });
 } });
 const list = await api("user", "calendars", {});
 assert.ok(list?.calendars);
 assert.equal(list.calendars[0].color, "#70a89f");
 const result = await api("user", "events", { calendarId: "mine", start: "2026-10-01", end: "2026-11-01" });
 assert.ok(result?.events);
 assert.deepEqual(result.events.map(({ color, textColor }: any) => [color, textColor]), [["#70a89f", "#111111"], ["#fbd75b", "#1d1d1d"], ["#70a89f", "#111111"]]);
});
