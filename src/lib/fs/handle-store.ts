/**
 * Remembers the last folder you opened so the landing screen can offer to
 * reopen it. Directory handles are structured-cloneable, so IndexedDB can hold
 * one directly — but the *permission* attached to it is not persisted, which is
 * why reopening still needs a click to re-grant.
 *
 * Hand-rolled rather than pulling in a wrapper: it is one object store and two
 * operations.
 */

const DB_NAME = "aperture";
const DB_VERSION = 1;
const STORE = "handles";
const KEY = "last-directory";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((db) =>
    new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).finally(() => db.close()),
  );
}

export async function saveLastDirectory(handle: FileSystemDirectoryHandle): Promise<void> {
  // Never let a storage problem (private browsing, quota) block opening a folder.
  await transact("readwrite", (store) => store.put(handle, KEY)).catch(() => {});
}

export async function loadLastDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await transact<FileSystemDirectoryHandle | undefined>("readonly", (store) =>
    store.get(KEY),
  ).catch(() => undefined);
  return handle ?? null;
}

export async function forgetLastDirectory(): Promise<void> {
  await transact("readwrite", (store) => store.delete(KEY)).catch(() => {});
}
