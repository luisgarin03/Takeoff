export async function localProjects() {
  if (!indexedDB.databases) return [];
  const databases = await indexedDB.databases();
  return (await Promise.all(databases.filter(({ name }) => name === "opentakeoff" || /^opentakeoff-project-/.test(name)).map(({ name }) => new Promise((resolve) => {
    const request = indexedDB.open(name);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) { db.close(); resolve(null); return; }
      const read = db.transaction("meta").objectStore("meta").get("annotations");
      read.onsuccess = () => { const a = read.result; db.close(); resolve(a ? { ...a.project_metadata, name: a.project_metadata?.name || a.project_name || "Untitled project", search: name === "opentakeoff" ? "" : `?localProject=${encodeURIComponent(name.slice("opentakeoff-project-".length))}` } : null); };
      read.onerror = () => { db.close(); resolve(null); };
    };
  })))).filter(Boolean);
}
