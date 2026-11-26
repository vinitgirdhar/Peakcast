// Starts the on-device API and routes the app's /api/ requests to it, so
// Peakcast needs no server or network. Data lives in this browser's IndexedDB.
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { createEngine } from "./engine.js";

const DATABASE = "peakcast";
const FILES = "files";
const KEY = "database.sqlite";

function openStorage() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FILES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSaved(): Promise<Uint8Array | undefined> {
  const storage = await openStorage();
  return new Promise((resolve, reject) => {
    const request = storage
      .transaction(FILES, "readonly")
      .objectStore(FILES)
      .get(KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeSaved(bytes: Uint8Array) {
  const storage = await openStorage();
  return new Promise<void>((resolve, reject) => {
    const transaction = storage.transaction(FILES, "readwrite");
    transaction.objectStore(FILES).put(bytes, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function startOnDeviceApi() {
  const [SQL, saved] = await Promise.all([
    initSqlJs({ locateFile: () => wasmUrl }),
    readSaved(),
  ]);
  let dirty = false;
  const engine = createEngine(SQL, saved, () => {
    dirty = true;
  });
  // Saves run one at a time, each writing the whole (small) database.
  let saving = Promise.resolve();
  const save = () => {
    if (!dirty) return saving;
    dirty = false;
    saving = saving
      .then(() => writeSaved(engine.export()))
      .catch((error) =>
        console.error("Peakcast could not save on this device", error),
      );
    return saving;
  };
  // Sample players and activity, once per device. A brand-new install gets
  // them before the first screen, so the app never opens empty; an install
  // that already has data gets them just after it appears, so the one-time
  // work does not hold up its boot animation.
  const seed = () => {
    try {
      engine.seedSamples();
    } catch (error) {
      console.error("Sample activity could not be added", error);
    }
    void save();
  };
  if (saved) setTimeout(seed, 1500);
  else seed();
  // Asks the browser not to evict the data when storage runs low.
  void navigator.storage?.persist?.().catch(() => undefined);
  // Payouts must not depend on someone pressing "Finalize".
  setInterval(() => {
    try {
      engine.settleDue();
    } catch (error) {
      console.error("Automatic settlement failed", error);
    }
    void save();
  }, 15_000);

  const network = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
      return network(input, init);
    const response = await engine.handle(request);
    // A change is on disk before the app is told it happened, so closing the
    // app right after a trade never loses it.
    await save();
    return response;
  };
}
