// Development tool, not shipped: splits Natural Earth's 1:10m countries into
// src/assets/detail/<ISO2>.json, the shapes the map swaps in when zoomed in.
// Each file maps a world.json feature name to its 1:10m MultiPolygon.
// Usage: node scripts/world-detail.mjs ne_10m_admin_0_countries.geojson [tolerance]
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [input, toleranceArg] = process.argv.slice(2);
if (!input) {
  console.error(
    "Usage: node scripts/world-detail.mjs <ne_10m_admin_0_countries.geojson> [tolerance]",
  );
  process.exit(1);
}
// Degrees; about 200 m. Natural Earth 1:10m is already generalized, so this only drops near-collinear points.
const tolerance = Number(toleranceArg ?? 0.002);
const out = fileURLToPath(new URL("../src/assets/detail/", import.meta.url));

// Same identifiers as world.json: ISO_A2_EH, else a valid ISO_A2.
function iso2(properties) {
  for (const code of [properties.ISO_A2_EH, properties.ISO_A2])
    if (/^[A-Z]{2}$/.test(code ?? "")) return code;
  return undefined;
}
const round = ([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];

// Douglas-Peucker on an open line, keeping both ends.
function simplify(points) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first],
      [bx, by] = points[last];
    const dx = bx - ax,
      dy = by - ay,
      length = Math.hypot(dx, dy);
    let farthest = -1,
      distance = tolerance;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const d = length
        ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length
        : Math.hypot(px - ax, py - ay);
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
const distinct = (points) =>
  points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1],
  );
function ring(points) {
  // A closed ring starts and ends on one point; split it at the vertex farthest from there so neither half is degenerate.
  const [sx, sy] = points[0];
  let split = 1;
  for (let i = 1; i < points.length - 1; i++)
    if (
      Math.hypot(points[i][0] - sx, points[i][1] - sy) >
      Math.hypot(points[split][0] - sx, points[split][1] - sy)
    )
      split = i;
  const simplified = distinct(
    [
      ...simplify(points.slice(0, split + 1)),
      ...simplify(points.slice(split)).slice(1),
    ].map(round),
  );
  if (simplified.length >= 4) return simplified;
  // Rings narrower than the tolerance (the Vatican, atolls) keep their rounded original shape.
  const original = distinct(points.map(round));
  return original.length >= 4 ? original : undefined;
}
function polygons(geometry) {
  const list =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return list.flatMap((polygon) => {
    const [outer, ...holes] = polygon.map(ring);
    return outer ? [[outer, ...holes.filter(Boolean)]] : [];
  });
}

// world.json decides which features can be swapped: by country code, then by name.
const coarse = new Map();
for (const { properties } of JSON.parse(
  await readFile(new URL("../src/assets/world.json", import.meta.url), "utf8"),
).features)
  if (properties.iso2)
    coarse.set(properties.iso2, [
      ...(coarse.get(properties.iso2) ?? []),
      properties.name,
    ]);
const countries = new Map();
for (const feature of JSON.parse(await readFile(input, "utf8")).features) {
  const code = iso2(feature.properties);
  const names = code && coarse.get(code);
  if (!names) continue;
  // Parts only 1:10m separates (Baikonur, Clipperton) join the country's main feature.
  const name = names.includes(feature.properties.NAME)
    ? feature.properties.NAME
    : names[0];
  const shapes = countries.get(code) ?? {};
  shapes[name] = [...(shapes[name] ?? []), ...polygons(feature.geometry)];
  countries.set(code, shapes);
}
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let bytes = 0,
  written = 0;
for (const [code, shapes] of [...countries].sort(([a], [b]) =>
  a.localeCompare(b),
)) {
  const entries = Object.entries(shapes).filter(([, polygons]) => polygons.length);
  if (!entries.length) continue;
  const text = JSON.stringify(
    Object.fromEntries(
      entries.map(([name, coordinates]) => [
        name,
        { type: "MultiPolygon", coordinates },
      ]),
    ),
  );
  bytes += text.length;
  written++;
  await writeFile(join(out, `${code}.json`), text + "\n");
}
console.log(
  `${written} countries, ${(bytes / 1e6).toFixed(1)} MB at tolerance ${tolerance}°`,
);
