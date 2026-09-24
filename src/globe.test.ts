import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { geoDistance } from "d3-geo";
import {
  bowedMidpoint,
  fitGlobe,
  levelGlobe,
  globeProjection,
  globeRouteCurve,
  globeShapes,
  rotateGlobe,
  zoomGlobe,
} from "./globe.ts";
import { routeCurve, spanCenter } from "./view-model.ts";
import type { Point } from "./view-model.ts";

const world = JSON.parse(
  readFileSync(new URL("./assets/world.json", import.meta.url), "utf8"),
) as {
  features: {
    geometry: { type: string; coordinates: unknown };
    properties: { name: string };
  }[];
};
const amsterdam: Point = [4.76, 52.31];
const tokyo: Point = [139.75, 35.69];
const bangkok: Point = [100.51, 13.75];
const close = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} is not within ${tolerance} of ${expected}`,
  );
const extent = (d: string) => {
  const numbers = d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!.map(Number);
  const xs = numbers.filter((_, i) => i % 2 === 0),
    ys = numbers.filter((_, i) => i % 2 === 1);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

test("trip middle keeps a dateline crossing together", () => {
  const [lon, lat] = spanCenter([
    [170, -10],
    [-170, 10],
  ]);
  close(Math.abs(lon), 180, 1e-9);
  close(lat, 0, 1e-9);
  assert.deepEqual(spanCenter([]), [0, 0]);
});

test("fitted globe faces the trip and stays small enough to show its horizon", () => {
  const wide = fitGlobe([amsterdam, bangkok, tokyo]);
  close(wide.center[0], (amsterdam[0] + tokyo[0]) / 2, 1e-9);
  close(wide.center[1], (bangkok[1] + amsterdam[1]) / 2, 1e-9);
  const projection = globeProjection({ center: wide.center, k: 1 }, wide.scale);
  for (const place of [amsterdam, bangkok, tokyo]) {
    const [x, y] = projection(place)!;
    assert.ok(x >= 450 - 345 && x <= 450 + 345, `x ${x}`);
    assert.ok(y >= 250 - 170 && y <= 250 + 170, `y ${y}`);
  }
  // Two nearby cities would fill the frame on a flat map; the globe stays a globe.
  assert.equal(fitGlobe([tokyo, [135.5, 34.7]]).scale, 300);
});

test("dragging turns the globe with the pointer and keeps latitude away from the poles", () => {
  const view = { center: [100, 20] as Point, k: 1 };
  const right = rotateGlobe(view, 50, 0, 300);
  assert.ok(right.center[0] < 100, "dragging right brings western places in");
  close(right.center[1], 20, 1e-9);
  const down = rotateGlobe(view, 0, 50, 300);
  assert.ok(down.center[1] > 20, "dragging down brings northern places in");
  assert.equal(rotateGlobe(view, 0, 1e6, 300).center[1], 85);
  const wrapped = rotateGlobe({ center: [-179, 0], k: 1 }, 30, 0, 300);
  assert.ok(wrapped.center[0] > 170 && wrapped.center[0] <= 180);
  assert.deepEqual(rotateGlobe(view, Number.NaN, 0, 300), view);
});

test("wheel zoom keeps the place under the pointer in place", () => {
  const view = { center: [72, 33] as Point, k: 1 };
  const anchor: Point = [560, 190];
  const before = globeProjection(view, 300).invert!(anchor)!;
  const zoomed = zoomGlobe(view, 1.8, 300, anchor);
  close(zoomed.k, 1.8, 1e-9);
  const [x, y] = globeProjection(zoomed, 300)(before)!;
  close(x, anchor[0], 0.5);
  close(y, anchor[1], 0.5);
  // Off the globe there is nothing to hold, so zoom centers on the globe.
  const space = zoomGlobe(view, 2, 300, [2000, 2000]);
  assert.deepEqual(space.center, view.center);
  assert.deepEqual(zoomGlobe(view, 0, 300), view);
});

test("globe routes bow to the right of travel like flat routes", () => {
  const [lon, lat] = bowedMidpoint([0, 0], [10, 0])!;
  close(lon, 5, 1e-6);
  assert.ok(lat < -0.9 && lat > -1.1, `eastward leg bows south, got ${lat}`);
  assert.deepEqual(bowedMidpoint(tokyo, tokyo), tokyo);
  assert.equal(bowedMidpoint([0, 0], [180, 0]), undefined);

  // A short leg near the middle matches the flat map's quadratic.
  const center: Point = [100, 15];
  const projection = globeProjection({ center, k: 20 }, 300);
  const from: Point = [100, 14],
    to: Point = [101, 15];
  const curve = globeRouteCurve(projection, center, from, to)!;
  const flat = routeCurve(projection(from)!, projection(to)!);
  close(curve.c[0], flat.c[0], 1);
  close(curve.c[1], flat.c[1], 1);
});

test("globe routes with an end out of sight are left out", () => {
  const center: Point = [100, 15];
  const projection = globeProjection({ center, k: 1 }, 300);
  assert.equal(
    globeRouteCurve(projection, center, bangkok, [-80, 0]),
    undefined,
  );
  assert.ok(globeRouteCurve(projection, center, amsterdam, tokyo));
});

test("globe outlines skip the far side and never turn an island inside out", () => {
  for (const [center, k] of [
    [[72, 33], 1],
    [[-77, 24], 1.2],
    [[-150, -17], 1.5],
    [[0, 54], 2],
    [[35, -6], 1],
  ] as [Point, number][]) {
    const projection = globeProjection({ center, k }, 300);
    const radius = projection.scale();
    // Both the settled detail and the draft shown while dragging.
    for (const spacing of [2.5, 5]) {
      const shapes = globeShapes(world.features, projection, 525, spacing);
      assert.equal(shapes.length, world.features.length);
      shapes.forEach((d, i) => {
        if (!d) return;
        const { width, height } = extent(d);
        assert.ok(
          width < 1.95 * radius || height < 1.95 * radius,
          `${world.features[i].properties.name} covers the whole globe at ${center}`,
        );
      });
      const hidden = world.features.findIndex(
        (f) => f.properties.name === "Chile",
      );
      if (geoDistance(center, [-71, -35]) > Math.PI / 2 + 0.5)
        assert.equal(shapes[hidden], null);
    }
  }
});

test("globe outlines thin out as the globe shrinks and while dragging", () => {
  const size = (k: number, spacing?: number) =>
    globeShapes(
      world.features,
      globeProjection({ center: [72, 33], k }, 300),
      525,
      spacing,
    ).reduce((sum, d) => sum + (d?.length ?? 0), 0);
  assert.ok(size(1, 5) < size(1) * 0.75, "a drag draws a lighter draft");
  assert.ok(size(0.5) < size(1), "a smaller globe needs less detail");
});

test("levelling keeps longitude and zoom and faces the equator", () => {
  assert.deepEqual(levelGlobe({ center: [72.6, 33], k: 2.5 }), {
    center: [72.6, 0],
    k: 2.5,
  });
});
