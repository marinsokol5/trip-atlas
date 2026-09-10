import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import { staticFiles } from "./files.mjs";

// Match the viewer's local document path rules before exposing any source files.
const safePath = (path) =>
  typeof path === "string" &&
  !!path &&
  // oxlint-disable-next-line no-control-regex -- Control characters are intentionally forbidden.
  !/[\\:#?%\u0000-\u001f]/.test(path) &&
  !path.startsWith("/") &&
  path.split("/").every((p) => !!p && p !== "." && p !== "..");
function documentPaths(source) {
  const paths = new Set();
  for (const day of Array.isArray(source?.days) ? source.days : []) {
    for (const owner of [
      day,
      ...(Array.isArray(day?.blocks) ? day.blocks : []),
    ]) {
      for (const doc of Array.isArray(owner?.documents)
        ? owner.documents
        : []) {
        if (safePath(doc?.path)) paths.add(doc.path);
      }
    }
  }
  return paths;
}

function sendJson(req, res, body) {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Length": body.length,
  });
  res.end(req.method === "HEAD" ? undefined : body);
}
async function readEntry(entry) {
  if ((await realpath(entry.file)) !== entry.canonicalFile) {
    const error = new Error("Forbidden");
    error.status = 403;
    throw error;
  }
  const content = await readFile(entry.file);
  let source;
  try {
    source = JSON.parse(content);
  } catch {
    /* The UI reports invalid JSON. */
  }
  const allowed = documentPaths(source);
  let virtualName = "trip.json";
  while (allowed.has(virtualName)) virtualName = "_" + virtualName;
  return {
    content,
    allowed,
    virtualName,
    title:
      typeof source?.title === "string" && source.title.trim()
        ? source.title
        : undefined,
  };
}

/** Explicit selected files each get an isolated virtual root and document allowlist. */
export function selectedTrips(files) {
  const unique = [
    ...new Map(files.map((entry) => [entry.canonicalFile, entry])).values(),
  ];
  const entries = unique.map((entry) => {
    const hash = createHash("sha256")
      .update(entry.canonicalFile)
      .digest("hex")
      .slice(0, 24);
    const folder = unique.length === 1 ? "selected" : `selected-${hash}`;
    const sameName = unique.filter(
      (other) => basename(other.file) === basename(entry.file),
    );
    const parentTail = (file, depth) =>
      dirname(file).split(sep).filter(Boolean).slice(-depth).join(sep) || sep;
    let depth = 1;
    while (
      sameName.some(
        (other) =>
          other !== entry &&
          parentTail(other.file, depth) === parentTail(entry.file, depth),
      )
    )
      depth++;
    const label =
      basename(entry.file) +
      (sameName.length > 1 ? ` · ${parentTail(entry.file, depth)}` : "");
    return {
      ...entry,
      folder,
      label,
      documents: staticFiles(dirname(entry.file), `/trips/${folder}/`),
    };
  });
  return async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end("Read-only server");
      return;
    }
    let path;
    try {
      path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    } catch {
      res.writeHead(400);
      res.end("Invalid path");
      return;
    }
    if (!path.startsWith("/trips/")) {
      next();
      return;
    }
    if (path === "/trips/index.json") {
      const trips = await Promise.all(
        entries.map(async (entry) => {
          // One broken or removed alternative must not prevent opening the others.
          let virtualName = "trip.json";
          let title;
          try {
            ({ virtualName, title } = await readEntry(entry));
          } catch {
            /* Its own route reports the read error. */
          }
          return {
            path: `${entry.folder}/${virtualName}`,
            label: entry.label,
            ...(title ? { title } : {}),
          };
        }),
      );
      sendJson(req, res, Buffer.from(JSON.stringify({ trips })));
      return;
    }
    const entry = entries.find((entry) =>
      path.startsWith(`/trips/${entry.folder}/`),
    );
    if (!entry) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const { content, allowed, virtualName } = await readEntry(entry);
      const relative = path.slice(`/trips/${entry.folder}/`.length);
      if (relative === virtualName) sendJson(req, res, content);
      else if (allowed.has(relative)) await entry.documents(req, res);
      else {
        res.writeHead(404);
        res.end("Not found");
      }
    } catch (error) {
      res.writeHead(error.status ?? 404);
      res.end(error.status === 403 ? "Forbidden" : "Cannot read itinerary");
    }
  };
}
export function selectedTrip(file, canonicalFile) {
  return selectedTrips([{ file, canonicalFile }]);
}
