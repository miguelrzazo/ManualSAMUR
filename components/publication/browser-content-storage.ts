import type { ContentStorage } from "@/packages/manual-content/src/lifecycle/content-transaction";

/** A single IndexedDB record write is atomic, including the active pointer. */
export async function browserContentStorage(): Promise<ContentStorage> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("samur-content-lifecycle-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  return {
    getItem: (key) => new Promise((resolve, reject) => {
      const request = db.transaction("records").objectStore("records").get(key);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error);
    }),
    setItem: (key, value) => new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }),
    removeItem: (key) => new Promise((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.objectStore("records").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }),
  };
}
