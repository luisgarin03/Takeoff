const DB = "opentakeoff-calendar-cache";
async function access(userId, action, value) {
  if (!userId) return null;
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("accounts"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("accounts", action === "get" ? "readonly" : "readwrite"), store = tx.objectStore("accounts");
      const request = action === "get" ? store.get(userId) : action === "delete" ? store.delete(userId) : store.put(value, userId);
      tx.oncomplete = () => resolve(request.result || null); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export const readCalendarCache = (key) => access(key, "get");
export const writeCalendarCache = (key, value) => access(key, "put", { ...value, cachedAt: new Date().toISOString() });
export const clearCalendarCache = (key) => access(key, "delete");
