import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
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
export function staticFiles(root, prefix = "/") {
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
      const info = await stat(file);
      if (!info.isFile()) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Type",
        types[extname(file).toLowerCase()] ?? "application/octet-stream",
      );
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Length", info.size);
      if (req.method === "HEAD") res.end();
      else createReadStream(file).pipe(res);
    } catch {
      next();
    }
  };
}
