/**
 * Persist the FileSystemFileHandle across sessions.
 *
 * IMPORTANT: a FileSystemFileHandle is a structured-cloneable object, NOT JSON.
 * chrome.storage.* JSON-serializes every value, so storing a handle there
 * silently turns it into `{}` and the handle is lost. IndexedDB is the only
 * place it survives — it uses structured clone.
 */

const DB_NAME = 'lcv';
const DB_VERSION = 1;
const STORE = 'handles';
export const HANDLE_KEY = 'dataFile';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        let result;
        try {
          result = run(store);
        } catch (err) {
          reject(err);
          return;
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      })
  );
}

export async function saveHandle(handle) {
  await tx('readwrite', (store) => store.put(handle, HANDLE_KEY));
}

export async function loadHandle() {
  return new Promise((resolve, reject) => {
    openDb()
      .then((db) => {
        const t = db.transaction(STORE, 'readonly');
        const req = t.objectStore(STORE).get(HANDLE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      })
      .catch(reject);
  });
}

export async function clearHandle() {
  await tx('readwrite', (store) => store.delete(HANDLE_KEY));
}
