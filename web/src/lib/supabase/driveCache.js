// Separate, disposable binary cache; never alters project IndexedDB schemas.
export function createDriveCache(namespace, indexedDB = globalThis.indexedDB) {
  let database;
  const open = () => database ||= new Promise((resolve, reject) => {
    const request = indexedDB.open("otk-drive-cache", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("chunks");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function operation(mode, action) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction("chunks", mode), request = action(tx.objectStore("chunks"));
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } catch { return undefined; } // Quota/private-mode failures must not block a valid download.
  }
  const key = (path, part) => `${namespace}/${path}/${part}`;
  return {
    get: (path, part) => operation("readonly", (s) => s.get(key(path, part))),
    put: (path, part, value) => operation("readwrite", (s) => s.put(value, key(path, part))),
    clear: (path) => operation("readwrite", (s) => s.delete(IDBKeyRange.bound(`${namespace}/${path}/`, `${namespace}/${path}/\uffff`))),
  };
}
