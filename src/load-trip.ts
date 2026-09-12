import { safeRelativePath } from "./itinerary.ts";
import { MAX_JSON_BYTES } from "./input-limits.ts";

export type TripEntry = { path: string; label: string; title?: string };

export function parseManifest(value: unknown): TripEntry[] {
  const entries =
    value && typeof value === "object" && "trips" in value
      ? value.trips
      : undefined;
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    !entries.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.path === "string" &&
        safeRelativePath(entry.path) &&
        entry.path.includes("/") &&
        typeof entry.label === "string" &&
        !!entry.label.trim() &&
        (entry.title === undefined ||
          (typeof entry.title === "string" && !!entry.title.trim())),
    ) ||
    new Set(entries.map((entry) => entry.path)).size !== entries.length
  )
    throw new Error(
      "/trips/index.json: expected unique relative folder/trip.json paths, nonempty labels and optional text titles",
    );
  return entries;
}

export async function loadJson(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store", signal });
  if (!response.ok)
    throw new Error(
      `${path}: ${response.status} ${response.statusText}${response.status === 413 ? " (JSON exceeds 2 MiB)" : ""}`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`${path}: empty response`);
  let size = 0;
  const decoder = new TextDecoder();
  let content = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_JSON_BYTES)
        throw new Error(`${path}: JSON exceeds the 2 MiB limit`);
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`${path}: invalid JSON`);
  }
}
