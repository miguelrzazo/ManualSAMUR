import { isMobileContentSnapshot, type MobileContentSnapshot } from "@/packages/manual-content/src/schema";

const DATABASE = "samur-publication-v1";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("publication");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readVerifiedSnapshot(): Promise<MobileContentSnapshot | null> {
  try {
    const db = await database();
    const value: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction("publication").objectStore("publication").get("active");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return isMobileContentSnapshot(value) ? value : null;
  } catch { return null; }
}

export async function saveVerifiedSnapshot(snapshot: MobileContentSnapshot): Promise<void> {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("publication", "readwrite");
      transaction.objectStore("publication").put(snapshot, "active");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  } catch { /* Storage may be disabled or full; the verified in-memory version remains usable. */ }
}
