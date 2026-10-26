const keyFor = (account) => `otk:google-calendar-selection:${account}`;
export function restoreGoogleSelection(account, calendars, storage = globalThis.localStorage) {
  const available = calendars.map((calendar) => calendar.id);
  try {
    const saved = JSON.parse(storage.getItem(keyFor(account)));
    if (Array.isArray(saved)) return saved.filter((id) => available.includes(id));
  } catch { /* Missing or unavailable preference: display connected calendars. */ }
  return available;
}
export function saveGoogleSelection(account, ids, storage = globalThis.localStorage) {
  if (!account) return;
  try { storage.setItem(keyFor(account), JSON.stringify(ids)); } catch { /* Selection still works for this session. */ }
}
