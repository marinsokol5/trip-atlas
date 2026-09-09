import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { staticFiles } from './files.mjs';

// Match the viewer's local document path rules before exposing any source files.
// eslint-disable-next-line no-control-regex -- Control characters are intentionally forbidden in document paths.
const safePath = path => typeof path === 'string' && !!path && !/[\\:#?%\u0000-\u001f]/.test(path) && !path.startsWith('/') && path.split('/').every(p => !!p && p !== '.' && p !== '..');
function documentPaths(source) {
  const paths = new Set();
  for (const day of Array.isArray(source?.days) ? source.days : []) {
    for (const owner of [day, ...(Array.isArray(day?.blocks) ? day.blocks : [])]) {
      for (const doc of Array.isArray(owner?.documents) ? owner.documents : []) {
        if (safePath(doc?.path)) paths.add(doc.path);
      }
    }
  }
  return paths;
}

export function selectedTrip(file, canonicalFile) {
  const documents = staticFiles(dirname(file), '/trips/selected/');
  return async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Read-only server'); return; }
    let path;
    try { path = decodeURIComponent((req.url ?? '/').split('?')[0]); }
    catch { res.writeHead(400); res.end('Invalid path'); return; }
    if (!path.startsWith('/trips/')) { next(); return; }
    try {
      if (await realpath(file) !== canonicalFile) { res.writeHead(403); res.end('Forbidden'); return; }
      const content = await readFile(file);
      let source;
      try { source = JSON.parse(content); } catch { /* The UI reports invalid JSON. */ }
      const allowed = documentPaths(source);
      // Avoid shadowing a document, including one named trip.json.
      let virtualName = 'trip.json';
      while (allowed.has(virtualName)) virtualName = '_' + virtualName;
      if (path === '/trips/index.json' || path === `/trips/selected/${virtualName}`) {
        const body = path === '/trips/index.json'
          ? Buffer.from(JSON.stringify({ trips: [{ path: `selected/${virtualName}`, label: basename(file) }] }))
          : content;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Length': body.length });
        res.end(req.method === 'HEAD' ? undefined : body);
      } else if (path.startsWith('/trips/selected/') && allowed.has(path.slice('/trips/selected/'.length))) {
        await documents(req, res);
      } else { res.writeHead(404); res.end('Not found'); }
    } catch { res.writeHead(404); res.end('Cannot read itinerary'); }
  };
}
