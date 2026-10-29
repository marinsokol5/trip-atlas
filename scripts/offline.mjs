import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Hashing ~10 MB of documents per request is cheap, but unchanged files need not be reread.
const hashes = new Map();
async function hashFile(file) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Not a regular file");
  const cached = hashes.get(file);
  if (cached?.size === info.size && cached.mtimeMs === info.mtimeMs)
    return cached;
  const entry = {
    size: info.size,
    mtimeMs: info.mtimeMs,
    hash: sha256(await readFile(file)),
  };
  hashes.set(file, entry);
  return entry;
}

/** The file a document path names, only when it stays inside root (as the server's own boundary). */
async function fileInside(root, path) {
  const base = await realpath(root);
  const file = await realpath(resolve(base, path));
  if (!file.startsWith(base + sep)) throw new Error("Outside the folder");
  return file;
}

/**
 * GET /offline.json: every file a browser keeps for offline use, with its hash, so it
 * downloads only what changed. The app without its zoomed-in map outlines (listed at
 * build time in offline-shell.json), the trip list, each itinerary and its documents.
 */
export function offlineManifest(appRoot, tripFiles) {
  return async (req, res, next) => {
    if ((req.url ?? "/").split("?")[0] !== "/offline.json") {
      next();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end("Read-only server");
      return;
    }
    try {
      const shell = JSON.parse(
        await readFile(resolve(appRoot, "offline-shell.json"), "utf8"),
      );
      const sources = [
        ...shell.map((name) => ({
          url: name === "index.html" ? "/" : `/${name}`,
          root: appRoot,
          path: name,
        })),
        ...(await tripFiles()),
      ];
      const files = [];
      for (const source of sources) {
        try {
          files.push({
            url: source.url,
            ...(source.content === undefined
              ? await hashFile(await fileInside(source.root, source.path))
              : { size: source.content.length, hash: sha256(source.content) }),
          });
        } catch {
          /* A missing document is left out; `trip-atlas check` reports it. */
        }
      }
      const listed = files
        .map(({ url, size, hash }) => ({ url, size, hash }))
        .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
      const body = Buffer.from(
        JSON.stringify({
          version: sha256(JSON.stringify(listed)),
          files: listed,
        }),
      );
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Length": body.length,
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(500);
      res.end("Cannot list offline files");
    }
  };
}
