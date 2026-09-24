import { open } from "node:fs/promises";
import { constants } from "node:fs";

// Mirrors src/input-limits.ts (the published CLI cannot import TypeScript); read-json.test.mjs keeps them equal.
export const MAX_JSON_BYTES = 2 * 1024 * 1024;

/** Read at most one extra byte so a growing or special file cannot exhaust memory. */
export async function readJsonFile(file) {
  const handle = await open(
    file,
    constants.O_RDONLY |
      (constants.O_NONBLOCK ?? 0) |
      (constants.O_NOFOLLOW ?? 0),
  );
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Not a regular file");
    const buffer = Buffer.alloc(MAX_JSON_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        size,
        buffer.length - size,
      );
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > MAX_JSON_BYTES) {
      const error = new Error("Itinerary exceeds the 2 MiB JSON limit");
      error.status = 413;
      throw error;
    }
    return buffer.subarray(0, size);
  } finally {
    await handle.close();
  }
}
