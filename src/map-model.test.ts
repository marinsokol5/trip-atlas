import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import {
  mapConnections,
  mapConnectionVisible,
  mapConnectionDuration,
  transferPlaces,
  dayTitle,
  mapRoute,
  mapPointStyle,
  routeCurve,
  zoomMap,
  mapZoomMin,
  mapZoomMax,
} from "./view-model.ts";

test("vehicle connection spans transfer points and final hiking leg before filtering", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "kyoto",
    groups: { trail: { name: "Trail" } },
    places: {
      kyoto: {},
      tanabe: {},
      takijiri: { group: "trail" },
      takahara: { group: "trail" },
    },
    days: [
      {},
      {
        blocks: [
          {
            type: "travel",
            to: "tanabe",
            mode: "train",
            estimatedDurationMinutes: 180,
          },
          {
            type: "travel",
            to: "takijiri",
            mode: "bus",
            estimatedDurationMinutes: 40,
          },
          {
            type: "travel",
            to: "takahara",
            mode: "hike",
            estimatedDurationMinutes: 180,
          },
        ],
      },
      {},
    ],
  });
  const connections = mapConnections(model);
  assert.equal(connections.length, 1);
  assert.equal(connections[0].from, "kyoto");
  assert.equal(connections[0].to, "takahara");
  assert.equal(connections[0].legs.length, 3);
  assert.equal(connections[0].minutes, 220);
  assert.equal(mapConnectionDuration(connections[0]), "~3h40");
  assert.deepEqual([...transferPlaces(model)], ["tanabe", "takijiri"]);
  assert.ok(mapConnectionVisible(model, connections[0], "120"));
  assert.equal(mapConnectionVisible(model, connections[0], "none"), false);
});

test("strict hour filters apply to the sum, without rounding or removing routes", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: {}, x: {}, b: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "x",
            mode: "train",
            estimatedDurationMinutes: 45,
          },
          {
            type: "travel",
            to: "b",
            mode: "bus",
            estimatedDurationMinutes: 40,
          },
        ],
      },
    ],
  });
  const [connection] = mapConnections(model);
  assert.equal(connection.minutes, 85);
  assert.equal(mapConnectionVisible(model, connection, "60"), true);
  for (const [minutes, oneHour, twoHours] of [
    [60, false, false],
    [60.01, true, false],
    [120, true, false],
    [120.01, true, true],
  ] as const) {
    assert.equal(
      mapConnectionVisible(model, { ...connection, minutes }, "60"),
      oneHour,
    );
    assert.equal(
      mapConnectionVisible(model, { ...connection, minutes }, "120"),
      twoHours,
    );
  }
  for (const filter of ["all", "60", "120", "none"] as const) {
    mapConnectionVisible(model, connection, filter);
    assert.equal(connection.legs.length, 2);
    assert.equal(model.legs.length, 2);
  }
});

test("return-to-base excursion cannot inflate onward intercity label or another day", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "nagano",
    groups: { area: { name: "Nagano" } },
    places: { nagano: { group: "area" }, park: { group: "area" }, tokyo: {} },
    days: [
      {},
      {
        blocks: [
          {
            type: "travel",
            to: "park",
            components: [
              { mode: "bus", estimatedDurationMinutes: 45 },
              { mode: "walk", estimatedDurationMinutes: 35 },
            ],
          },
          {
            type: "travel",
            to: "nagano",
            components: [
              { mode: "walk", estimatedDurationMinutes: 35 },
              { mode: "bus", estimatedDurationMinutes: 45 },
            ],
          },
          {
            type: "travel",
            to: "tokyo",
            mode: "train",
            estimatedDurationMinutes: 120,
          },
        ],
      },
      {
        blocks: [
          {
            type: "travel",
            to: "nagano",
            mode: "train",
            estimatedDurationMinutes: 120,
          },
        ],
      },
    ],
  });
  const connections = mapConnections(model);
  assert.deepEqual(
    connections.map((c) => [c.from, c.to, c.minutes]),
    [
      ["nagano", "nagano", 90],
      ["nagano", "tokyo", 120],
      ["tokyo", "nagano", 120],
    ],
  );
  assert.equal(mapConnectionVisible(model, connections[0], "all"), false);
  assert.equal(mapConnectionDuration(connections[1]), "~2h");
});

test("missing vehicle shares suppress totals; unknown walking time does not invent vehicle time", () => {
  const connection = (block: object) =>
    mapConnections(
      normalizeTrip({
        version: 1,
        initialPlace: "a",
        startDate: "2026-11-24",
        timezone: "Asia/Tokyo",
        places: { a: {}, b: {} },
        days: [{ blocks: [{ type: "travel", to: "b", ...block }] }],
      }),
    )[0];
  assert.equal(
    connection({
      components: [
        { mode: "bus", estimatedDurationMinutes: 85 },
        { mode: "hike" },
      ],
    }).minutes,
    85,
  );
  assert.equal(
    connection({
      components: [
        { mode: "bus" },
        { mode: "hike", estimatedDurationMinutes: 85 },
      ],
    }).minutes,
    undefined,
  );
  assert.equal(
    connection({ mode: "train + walk", estimatedDurationMinutes: 85 }).minutes,
    undefined,
  );
  assert.equal(
    connection({ mode: "other", estimatedDurationMinutes: 85 }).minutes,
    undefined,
  );
  assert.equal(
    connection({ mode: "walk", estimatedDurationMinutes: 85 }).minutes,
    0,
  );
  assert.equal(
    connection({ mode: "Shinkansen or coach", estimatedDurationMinutes: 85 })
      .minutes,
    85,
  );
  const mixed = connection({
    start: "10:00",
    end: "12:00",
    components: [
      { mode: "bus", estimatedDurationMinutes: 45 },
      { mode: "walk" },
    ],
  });
  assert.equal(mixed.minutes, 45);
  assert.equal(mixed.approximate, true);
  assert.equal(
    connection({
      start: "10:00",
      end: "12:00",
      components: [{ mode: "bus" }, { mode: "walk" }],
    }).minutes,
    undefined,
  );
  const vehicle = connection({
    start: "10:00",
    end: "12:00",
    components: [{ mode: "bus" }, { mode: "train" }],
  });
  assert.equal(vehicle.minutes, 120);
  assert.equal(vehicle.approximate, false);
});

test("major overnight stops and explicit origin overrides break aggregation", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    groups: { area: { name: "Area" } },
    places: { a: { group: "area" }, b: { group: "area" }, x: {}, c: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            mode: "bus",
            estimatedDurationMinutes: 40,
          },
        ],
      },
      {
        blocks: [
          {
            type: "travel",
            to: "a",
            mode: "bus",
            estimatedDurationMinutes: 40,
          },
          {
            type: "travel",
            from: "x",
            to: "c",
            mode: "bus",
            estimatedDurationMinutes: 45,
          },
        ],
      },
    ],
  });
  const connections = mapConnections(model);
  assert.deepEqual(
    connections.map((c) => c.minutes),
    [40, 40, 45],
  );
  assert.equal(transferPlaces(model).has("b"), false);
  assert.equal(connections[2].from, "x");
});

test("day titles are optional validated purpose labels with a route fallback", () => {
  const input = {
    version: 1,
    initialPlace: "a",
    places: { a: { name: "Base" }, b: { name: "Tokyo" } },
    days: [
      {},
      {
        title: "Snow monkeys, then Tokyo",
        blocks: [{ type: "travel", to: "b" }],
      },
    ],
  };
  const model = normalizeTrip(input);
  assert.equal(dayTitle(model, model.days[0]), "Base");
  assert.equal(dayTitle(model, model.days[1]), "Snow monkeys, then Tokyo");
  const untitled = normalizeTrip({
    ...input,
    days: [{ blocks: [{ type: "travel", to: "b" }] }],
  });
  assert.equal(dayTitle(untitled, untitled.days[0]), "Base → Tokyo");
  for (const title of ["", "  ", null, 9, {}])
    assert.throws(
      () => normalizeTrip({ ...input, days: [{ title }] }),
      /days\[0\].title/,
    );
});

test("arrow tips clear each painted circle by 2.5 screen pixels at every zoom", () => {
  const curve = routeCurve([0, 0], [500, 300]);
  for (const frame of [0.4, 0.79, 1])
    for (const k of [mapZoomMin, 1, mapZoomMax])
      for (const transfer of [false, true])
        for (const active of [false, true])
          for (const traveler of [false, true]) {
            const scale = frame * k,
              point = mapPointStyle(transfer, active, traveler),
              route = mapRoute(curve, false, scale, point);
            const gap =
              Math.hypot(
                route.curve.b[0] - curve.b[0],
                route.curve.b[1] - curve.b[1],
              ) *
                scale -
              point.radius -
              point.stroke / 2;
            assert.ok(Math.abs(gap - 2.5) < 0.001);
            assert.equal(route.arrow, true);
            assert.deepEqual(mapRoute(curve, true, scale, point).curve, curve);
          }
  assert.ok(zoomMap({ x: 0, y: 0, k: 1 }, 1 / 1.5).k < 1);
  assert.equal(zoomMap({ x: 0, y: 0, k: 1 }, 0.001).k, mapZoomMin);
  assert.equal(zoomMap({ x: 0, y: 0, k: 1 }, 100).k, mapZoomMax);
});
