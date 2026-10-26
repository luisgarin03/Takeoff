// Google Calendar's current month view presents these built-in API swatches
// with darker surfaces. Keep the mapping narrow so custom RGB calendar colors
// continue to pass through unchanged.
const GOOGLE_CALENDAR_PRESENTATION = {
  "#a4bdfc": { color: "#828bc2", contrastColor: "#131314" }, // Lavender
  "#7ae7bf": { color: "#55b080", contrastColor: "#131314" }, // Sage
  "#dbadff": { color: "#a75aba", contrastColor: "#131314" }, // Grape
  "#ff887c": { color: "#d6837a", contrastColor: "#131314" }, // Flamingo
  "#42d692": { color: "#429a8e", contrastColor: "#131314" }, // Eucalyptus
  "#fbd75b": { color: "#e7ba51", contrastColor: "#131314" }, // Banana
  "#ffb878": { color: "#e3683e", contrastColor: "#131314" }, // Tangerine
  "#46d6db": { color: "#4b99d2", contrastColor: "#131314" }, // Peacock
  "#e1e1e1": { color: "#7c7c7c", contrastColor: "#131314" }, // Graphite
  "#5484ed": { color: "#6e72c3", contrastColor: "#131314" }, // Blueberry
  "#51b749": { color: "#489160", contrastColor: "#131314" }, // Basil
  "#dc2127": { color: "#da5234", contrastColor: "#131314" }, // Tomato
};

export const GOOGLE_EVENT_COLOR_NAMES = {
  1: "Lavender", 2: "Sage", 3: "Grape", 4: "Flamingo", 5: "Banana", 6: "Tangerine",
  7: "Peacock", 8: "Graphite", 9: "Blueberry", 10: "Basil", 11: "Tomato",
};

export const GOOGLE_EVENT_COLOR_FALLBACK = {
  1: { background: "#a4bdfc", foreground: "#1d1d1d" },
  2: { background: "#7ae7bf", foreground: "#1d1d1d" },
  3: { background: "#dbadff", foreground: "#1d1d1d" },
  4: { background: "#ff887c", foreground: "#1d1d1d" },
  5: { background: "#fbd75b", foreground: "#1d1d1d" },
  6: { background: "#ffb878", foreground: "#1d1d1d" },
  7: { background: "#46d6db", foreground: "#1d1d1d" },
  8: { background: "#e1e1e1", foreground: "#1d1d1d" },
  9: { background: "#5484ed", foreground: "#ffffff" },
  10: { background: "#51b749", foreground: "#ffffff" },
  11: { background: "#dc2127", foreground: "#ffffff" },
};

export function googleCalendarDisplayColors(color, textColor) {
  const sourceColor = typeof color === "string" ? color.toLowerCase() : "";
  return GOOGLE_CALENDAR_PRESENTATION[sourceColor] || {
    color: color || "#70a89f",
    contrastColor: textColor || "#101414",
  };
}

export function googleEventColorOptions(colors) {
  const palette = colors && Object.keys(colors).length ? colors : GOOGLE_EVENT_COLOR_FALLBACK;
  return Object.entries(palette)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([id, value]) => ({
      id,
      name: GOOGLE_EVENT_COLOR_NAMES[id] || `Color ${id}`,
      ...googleCalendarDisplayColors(value?.background, value?.foreground),
    }));
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
