// Offline copy: the app, trip list, itineraries and documents saved in this browser's
// Cache Storage, which public/sw.js serves when the server can't be reached. The
// server's /offline.json lists every file with its hash, so a sync downloads only
// what changed.

export type OfflineFile = { url: string; size: number; hash: string };
export type OfflineManifest = { version: string; files: OfflineFile[] };
export type OfflineState = OfflineManifest & { cache: string; savedAt: string };
export type OfflineChanges = {
  download: OfflineFile[];
  bytes: number;
  removed: number;
};

const STATE_CACHE = "trip-atlas-offline-state";
const STATE_KEY = "/offline-state";
const COPY_PREFIX = "trip-atlas-offline-v-";
const TIMEOUT_MS = 5000;

export const offlineSupported = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "caches" in window;

/** An iOS Home Screen app opens new tabs outside its own storage, so documents stay in the app there. */
export const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true);

const isFile = (file: unknown): file is OfflineFile =>
  !!file &&
  typeof file === "object" &&
  typeof (file as OfflineFile).url === "string" &&
  (file as OfflineFile).url.startsWith("/") &&
  Number.isSafeInteger((file as OfflineFile).size) &&
  typeof (file as OfflineFile).hash === "string";

export function parseOfflineManifest(value: unknown): OfflineManifest {
  const manifest = value as OfflineManifest;
  if (
    !manifest ||
    typeof manifest.version !== "string" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.every(isFile)
  )
    throw new Error("/offline.json: unexpected content");
  return { version: manifest.version, files: manifest.files };
}

/** What a sync from the saved copy (if any) to this manifest would download and drop. */
export function offlineChanges(
  saved: OfflineManifest | undefined,
  manifest: OfflineManifest,
): OfflineChanges {
  const savedHashes = new Map(saved?.files.map((f) => [f.url, f.hash]));
  const urls = new Set(manifest.files.map((f) => f.url));
  const download = manifest.files.filter(
    (f) => savedHashes.get(f.url) !== f.hash,
  );
  return {
    download,
    bytes: download.reduce((sum, f) => sum + f.size, 0),
    removed: saved?.files.filter((f) => !urls.has(f.url)).length ?? 0,
  };
}

export const isDocument = (url: string) =>
  url.startsWith("/trips/") &&
  url !== "/trips/index.json" &&
  !/\/_*trip\.json$/.test(url);

export async function readOfflineState(): Promise<OfflineState | undefined> {
  if (!offlineSupported()) return undefined;
  try {
    // Matching through caches never creates the state cache, unlike opening it.
    const response = await caches.match(STATE_KEY, { cacheName: STATE_CACHE });
    return response ? ((await response.json()) as OfflineState) : undefined;
  } catch {
    return undefined;
  }
}

/** The server's current file list; fails offline or when the network does not answer. */
export async function fetchOfflineManifest(): Promise<OfflineManifest> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("/offline.json", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`/offline.json: ${response.status}`);
    return parseOfflineManifest(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function sha256(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Save the manifest's files into a new copy, reusing unchanged files from the current
 * one, and switch to it only once every file is in. An interrupted sync keeps the old copy.
 */
export async function syncOffline(
  manifest: OfflineManifest,
  onProgress: (done: number, total: number) => void,
): Promise<OfflineState> {
  await navigator.serviceWorker.register("/sw.js");
  void navigator.storage?.persist?.().catch(() => {});
  const saved = await readOfflineState();
  const savedCopy = saved && (await caches.open(saved.cache));
  const savedHashes = new Map(saved?.files.map((f) => [f.url, f.hash]));
  const name = COPY_PREFIX + manifest.version.slice(0, 16);
  if (name !== saved?.cache) await caches.delete(name);
  const copy = await caches.open(name);
  const { download } = offlineChanges(saved, manifest);
  let done = 0;
  onProgress(done, download.length);
  for (const file of manifest.files) {
    if (savedHashes.get(file.url) === file.hash) {
      const kept = await savedCopy?.match(file.url);
      if (kept) {
        if (name !== saved?.cache) await copy.put(file.url, kept);
        continue;
      }
    }
    const response = await fetch(file.url, {
      cache: "no-store",
      headers: { "X-Trip-Atlas-Sync": "1" },
    });
    if (!response.ok) throw new Error(`${file.url}: ${response.status}`);
    const body = await response.arrayBuffer();
    if ((await sha256(body)) !== file.hash)
      throw new Error("A file changed while saving; sync again");
    await copy.put(
      file.url,
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
    onProgress(++done, download.length);
  }
  const state: OfflineState = {
    ...manifest,
    cache: name,
    savedAt: new Date().toISOString(),
  };
  await (
    await caches.open(STATE_CACHE)
  ).put(STATE_KEY, new Response(JSON.stringify(state)));
  for (const key of await caches.keys())
    if (key.startsWith(COPY_PREFIX) && key !== name) await caches.delete(key);
  return state;
}

export async function removeOffline() {
  for (const key of await caches.keys())
    if (key === STATE_CACHE || key.startsWith(COPY_PREFIX))
      await caches.delete(key);
  for (const registration of await navigator.serviceWorker.getRegistrations())
    await registration.unregister();
}
