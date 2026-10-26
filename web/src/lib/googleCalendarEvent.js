// Google Calendar's current month view presents these built-in API swatches
// with darker surfaces. Keep the mapping narrow so custom RGB calendar colors
// continue to pass through unchanged.
const GOOGLE_CALENDAR_PRESENTATION = {
  "#42d692": { color: "#429a8e", contrastColor: "#131314" }, // Eucalyptus
  "#fbd75b": { color: "#e7ba51", contrastColor: "#131314" }, // Banana
};

export function googleCalendarDisplayColors(color, textColor) {
  const sourceColor = typeof color === "string" ? color.toLowerCase() : "";
  return GOOGLE_CALENDAR_PRESENTATION[sourceColor] || {
    color: color || "#70a89f",
    contrastColor: textColor || "#101414",
  };
}

export function googleCalendarEvent(event, calendar, editable) {
  const sourceColor = event.color || calendar?.color;
  const sourceTextColor = event.textColor || calendar?.textColor;
  const { color, contrastColor } = googleCalendarDisplayColors(sourceColor, sourceTextColor);
  return {
    id: `google:${event.calendarId}:${event.id}`,
    title: event.title,
    start: event.start.date || event.start.dateTime,
    end: event.end?.date || event.end?.dateTime,
    allDay: !!event.start.date,
    color,
    // FullCalendar 7 renamed its foreground field to contrastColor. Supplying
    // textColor is silently ignored and lets the theme replace Google's text.
    contrastColor,
    editable,
    extendedProps: { kind: "google", url: event.url, google: event },
  };
}
