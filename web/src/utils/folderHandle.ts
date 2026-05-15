const DB_NAME = "game-manager-fsa";
const DB_VERSION = 1;
const STORE_NAME = "folder-handles";

export function isFSASupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showDirectoryPicker" in window &&
    typeof (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker === "function"
  );
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(
  gameId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB 不可用时静默失败，不影响主流程
  }
}

export async function loadHandle(
  gameId: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(gameId);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function removeHandle(gameId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 静默失败
  }
}

// 返回值语义：'granted' 可直接读；'prompt' 需请求；'denied' 被拒；'unavailable' API 不存在
export async function checkPermission(
  handle: FileSystemDirectoryHandle
): Promise<"granted" | "prompt" | "denied" | "unavailable"> {
  try {
    // FileSystemHandle.queryPermission 是 FSA API 的一部分
    const fsh = handle as FileSystemDirectoryHandle & {
      queryPermission(desc: { mode: string }): Promise<PermissionState>;
    };
    return await fsh.queryPermission({ mode: "read" });
  } catch {
    return "unavailable";
  }
}

export async function requestPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const fsh = handle as FileSystemDirectoryHandle & {
      requestPermission(desc: { mode: string }): Promise<PermissionState>;
    };
    const state = await fsh.requestPermission({ mode: "read" });
    return state === "granted";
  } catch {
    return false;
  }
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFSASupported()) return null;
  try {
    const handle = await (
      window as unknown as {
        showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker();
    return handle;
  } catch {
    // 用户取消（AbortError）静默返回 null
    return null;
  }
}

const LS_PREFIX = "gm_source_";

export function saveSourceName(gameId: string, sourceName: string): void {
  try {
    localStorage.setItem(LS_PREFIX + gameId, sourceName);
  } catch {
    // 静默失败
  }
}

export function loadSourceName(gameId: string): string | null {
  try {
    return localStorage.getItem(LS_PREFIX + gameId);
  } catch {
    return null;
  }
}

export function removeSourceName(gameId: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + gameId);
  } catch {
    // 静默失败
  }
}
