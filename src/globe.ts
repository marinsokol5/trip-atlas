import {
  geoArea,
  geoCentroid,
  geoDistance,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import type { GeoProjection } from "d3-geo";
import { spanCenter } from "./view-model.ts";
import type { Curve, Point } from "./view-model.ts";

/** A globe turned to face `center` ([longitude, latitude]), zoomed `k` times its fitted scale. */
export interface GlobeView {
  center: Point;
  k: number;
}
export interface WorldFeature {
  geometry: { type: string; coordinates: unknown };
}
type Vector = [number, number, number];

/** The globe's middle in the 900×480 map frame, just below the header controls. */
export const globeOrigin: Point = [450, 250];
// A fitted globe stays small enough that its horizon curves on both sides.
const maxFitScale = 300;
const radians = Math.PI / 180;

/** Face the middle of the trip and fit its places, without zooming in past a visible globe. */
export function fitGlobe(points: Point[]) {
  const center = spanCenter(points);
  const projection = geoOrthographic()
    .rotate([-center[0], -center[1]])
    .scale(1)
    .translate([0, 0]);
  let x = 0,
    y = 0;
  for (const point of points.filter((p) => globeFacing(center, p))) {
    const [px, py] = projection(point)!;
    x = Math.max(x, Math.abs(px));
    y = Math.max(y, Math.abs(py));
  }
  return {
    center,
    scale: Math.min(
      maxFitScale,
      345 / Math.max(x, 0.001),
      170 / Math.max(y, 0.001),
    ),
  };
}

export function globeProjection({ center, k }: GlobeView, fitScale: number) {
  // Coastlines are already denser than a pixel, so skip adaptive resampling.
  return geoOrthographic()
    .rotate([-center[0], -center[1]])
    .scale(fitScale * k)
    .translate(globeOrigin)
    .precision(0);
}

/** Whether a [longitude, latitude] point is on the hemisphere facing the viewer. */
export function globeFacing(center: Point, point: Point) {
  return geoDistance(center, point) < Math.PI / 2;
}

/** Turn the globe so a drag of (dx, dy) map units moves the surface at its middle with the pointer. */
export function rotateGlobe(
  view: GlobeView,
  dx: number,
  dy: number,
  radius: number,
): GlobeView {
  const degrees = 1 / radius / radians;
  const lon =
    view.center[0] -
    (dx * degrees) / Math.max(0.2, Math.cos(view.center[1] * radians));
  const lat = view.center[1] + dy * degrees;
  if (![lon, lat].every(Number.isFinite)) return view;
  return {
    ...view,
    center: [
      (((lon % 360) + 540) % 360) - 180,
      Math.max(-85, Math.min(85, lat)),
    ],
  };
}

/** Face the equator at the current longitude and zoom: poles straight up and down, like a desk globe. */
export function levelGlobe(view: GlobeView): GlobeView {
  return { ...view, center: [view.center[0], 0] };
}

/** Zoom the globe, keeping the surface under `anchor` in place when it is on the globe. */
export function zoomGlobe(
  view: GlobeView,
  factor: number,
  fitScale: number,
  anchor?: Point,
): GlobeView {
  const k = view.k * factor;
  if (k <= 0 || !Number.isFinite(k)) return view;
  let next = { ...view, k };
  const target = anchor && globeProjection(view, fitScale).invert?.(anchor);
  if (
    anchor &&
    target &&
    target.every(Number.isFinite) &&
    globeFacing(view.center, target)
  )
    for (let i = 0; i < 4; i++) {
      const [x, y] = globeProjection(next, fitScale)(target)!;
      next = rotateGlobe(next, anchor[0] - x, anchor[1] - y, fitScale * k);
    }
  return next;
}

const vector = ([lon, lat]: Point): Vector => [
  Math.cos(lat * radians) * Math.cos(lon * radians),
  Math.cos(lat * radians) * Math.sin(lon * radians),
  Math.sin(lat * radians),
];
const spherical = ([x, y, z]: Vector): Point => [
  Math.atan2(y, x) / radians,
  Math.asin(Math.max(-1, Math.min(1, z))) / radians,
];
const add = (a: Vector, b: Vector, s = 1): Vector => [
  a[0] + b[0] * s,
  a[1] + b[1] * s,
  a[2] + b[2] * s,
];
const normalize = (v: Vector): Vector | undefined => {
  const length = Math.hypot(...v);
  return length > 1e-9
    ? [v[0] / length, v[1] / length, v[2] / length]
    : undefined;
};

/**
 * Midpoint of a route bowed to the right of travel, like the flat map's curves:
 * a spherical quadratic whose control point sits `bow` of the leg's length off its great circle.
 */
export function bowedMidpoint(a: Point, b: Point, bow = 0.2) {
  const from = vector(a),
    to = vector(b);
  const middle = normalize(add(from, to));
  const along = normalize(add(to, from, -1));
  if (!middle) return undefined;
  if (!along) return a;
  const right: Vector = [
    along[1] * middle[2] - along[2] * middle[1],
    along[2] * middle[0] - along[0] * middle[2],
    along[0] * middle[1] - along[1] * middle[0],
  ];
  const angle = bow * geoDistance(a, b);
  const control = add(
    middle.map((v) => v * Math.cos(angle)) as Vector,
    right,
    Math.sin(angle),
  );
  const start = normalize(add(from, control)),
    end = normalize(add(control, to));
  const midpoint = start && end && normalize(add(start, end));
  return midpoint && spherical(midpoint);
}

/** A screen quadratic through a route's projected ends and bowed middle, or undefined when any is out of sight. */
export function globeRouteCurve(
  projection: GeoProjection,
  center: Point,
  from: Point,
  to: Point,
): Curve | undefined {
  const middle = bowedMidpoint(from, to);
  if (!middle || ![from, middle, to].every((p) => globeFacing(center, p)))
    return undefined;
  const a = projection(from)!,
    b = projection(to)!,
    m = projection(middle)!;
  return {
    a,
    b,
    c: [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2],
  };
}

interface WorldPart {
  geometry: { type: "Polygon"; coordinates: Point[][] };
  center: Point;
  radius: number;
}
// Degrees between kept vertices; the finest level is the source data.
const detailLevels = [0.8, 0.4, 0.3, 0.2, 0.1, 0.05, 0];
const partCache = new WeakMap<
  readonly WorldFeature[],
  Map<number, WorldPart[][]>
>();

function thinRing(ring: Point[], tolerance: number) {
  const kept = [ring[0]];
  for (const point of ring.slice(1, -1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= tolerance)
      kept.push(point);
  }
  kept.push(ring[ring.length - 1]);
  return kept.length >= 4 ? kept : undefined;
}

/** Each country's polygons at one level of detail, with a bounding cap for culling. */
function worldParts(features: readonly WorldFeature[], tolerance: number) {
  let levels = partCache.get(features);
  if (!levels) partCache.set(features, (levels = new Map()));
  let parts = levels.get(tolerance);
  if (!parts) {
    parts = features.map(({ geometry }) =>
      (
        (geometry.type === "Polygon"
          ? [geometry.coordinates]
          : geometry.coordinates) as Point[][][]
      ).flatMap(([outer, ...holes]) => {
        const thin = (ring: Point[]) =>
          tolerance ? thinRing(ring, tolerance) : ring;
        const shell = thin(outer);
        // An island too small to keep at this detail takes its holes with it,
        // as does one whose few remaining vertices turned it inside out.
        if (
          !shell ||
          geoArea({ type: "Polygon", coordinates: [shell] }) > 2 * Math.PI
        )
          return [];
        const kept = [
          shell,
          ...holes.flatMap((ring) => {
            const thinned = thin(ring);
            return thinned ? [thinned] : [];
          }),
        ];
        const geometry = { type: "Polygon" as const, coordinates: kept };
        const center = geoCentroid(geometry) as Point;
        return [
          {
            geometry,
            center,
            radius: kept[0].reduce(
              (radius, point) => Math.max(radius, geoDistance(center, point)),
              0,
            ),
          },
        ];
      }),
    );
    levels.set(tolerance, parts);
  }
  return parts;
}

/**
 * Country outlines on the globe, one SVG path per feature (null when out of sight).
 * Detail follows the globe's size and polygons beyond the visible cap are skipped,
 * so turning the globe stays fast at every zoom.
 * `extent` is the distance in map units from the globe's middle to the farthest visible corner;
 * `spacing` is the most map units allowed between kept vertices, raised for a draft while dragging.
 */
export function globeShapes(
  features: readonly WorldFeature[],
  projection: GeoProjection,
  extent: number,
  spacing = 2.5,
) {
  const radius = projection.scale();
  const [lon, lat] = projection.rotate();
  const center: Point = [-lon, -lat];
  const tolerance =
    detailLevels.find((level) => level * radians * radius <= spacing) ?? 0;
  const reach = Math.asin(Math.min(1, extent / radius));
  const path = geoPath(projection);
  return worldParts(features, tolerance).map(
    (parts) =>
      parts
        .filter(
          (part) => geoDistance(center, part.center) - part.radius < reach,
        )
        .map((part) => path(part.geometry) ?? "")
        .join("") || null,
  );
}
