// Trip Atlas offline copy. The page saves the files (src/offline.ts); this worker
// answers from that copy whenever the server can't be reached.
const STATE_CACHE = "trip-atlas-offline-state";
const STATE_KEY = "/offline-state";
// A hotel network can hang instead of failing, so give up on it quickly.
const TIMEOUT_MS = 4000;
// After one failure, go straight to the copy for a while instead of waiting each time.
const RETRY_MS = 30000;
let unreachableUntil = 0;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

async function savedCopy() {
  const state = await caches.match(STATE_KEY, { cacheName: STATE_CACHE });
  return state ? caches.open((await state.json()).cache) : undefined;
}

// Every Trip Atlas response sets this header; a captive portal or proxy error page does not.
const fromTripAtlas = (response) =>
  response.headers.get("Cross-Origin-Resource-Policy") === "same-origin";

async function network(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function respond(request, url) {
  const copy = await savedCopy();
  if (!copy) return fetch(request);
  const navigate = request.mode === "navigate";
  const saved = async () =>
    (await copy.match(request, { ignoreSearch: navigate })) ??
    // Any other page of the app opens the saved app; documents never fall back to it.
    (navigate && !url.pathname.startsWith("/trips/")
      ? await copy.match("/")
      : undefined);
  // Built files never change under the same name.
  if (url.pathname.startsWith("/assets/"))
    return (await copy.match(request)) ?? fetch(request);
  if (Date.now() < unreachableUntil) {
    const hit = await saved();
    if (hit) return hit;
  }
  try {
    const response = await network(request);
    if (fromTripAtlas(response)) {
      unreachableUntil = 0;
      return response;
    }
    unreachableUntil = Date.now() + RETRY_MS;
    return (await saved()) ?? response;
  } catch (error) {
    unreachableUntil = Date.now() + RETRY_MS;
    const hit = await saved();
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Saving and checking the copy always ask the server itself.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/offline.json" ||
    request.headers.has("X-Trip-Atlas-Sync")
  )
    return;
  event.respondWith(respond(request, url));
});
