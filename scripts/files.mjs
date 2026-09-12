import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, sep, extname } from "node:path";
const types = {
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
};
const inlineDocuments = new Set([
  ".json",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".avif",
  ".pdf",
]);
export function staticFiles(root, prefix = "/", { documents = false } = {}) {
  return async (
    req,
    res,
    next = () => {
      res.statusCode = 404;
      res.end("Not found");
    },
  ) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.statusCode = 405;
      res.end("Read-only server");
      return;
    }
    let path;
    let handle;
    try {
      path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    } catch {
      res.statusCode = 400;
      res.end("Invalid path");
      return;
    }
    if (!path.startsWith(prefix)) {
      next();
      return;
    }
    const relative = path.slice(prefix.length) || "index.html";
    if (
      relative.split("/").some((p) => p === ".." || p === ".") ||
      relative.includes("\\") ||
      relative.includes("\0")
    ) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
    try {
      const base = await realpath(root),
        file = await realpath(resolve(base, relative));
      if (!file.startsWith(base + sep)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }
      handle = await open(
        file,
        constants.O_RDONLY |
          (constants.O_NONBLOCK ?? 0) |
          (constants.O_NOFOLLOW ?? 0),
      );
      const info = await handle.stat();
      if (!info.isFile()) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      const extension = extname(file).toLowerCase();
      const inline = !documents || inlineDocuments.has(extension);
      res.setHeader(
        "Content-Type",
        inline
          ? (types[extension] ?? "application/octet-stream")
          : "application/octet-stream",
      );
      if (documents) {
        res.setHeader(
          "Content-Security-Policy",
          "sandbox; default-src 'none'; frame-ancestors 'none'",
        );
        if (!inline) res.setHeader("Content-Disposition", "attachment");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", info.size);
      if (req.method === "HEAD") res.end();
      else {
        // Keep the opened descriptor: a later path replacement must not change the response.
        const stream = handle.createReadStream();
        handle = undefined; // The stream owns and closes it, including on disconnect/error.
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      }
    } catch {
      next();
    } finally {
      await handle?.close();
    }
  };
}
