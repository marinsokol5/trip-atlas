import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import {
  mapHighlightedCountries,
  mapConnections,
  mapDisplayConnections,
  mapDisplayDuration,
  durationTotals,
  mapConnectionVisible,
  mapConnectionDuration,
  transferPlaces,
  dayTitle,
  mapRoute,
  mapPointStyle,
  routeCurve,
  zoomMap,
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
      ["nagano", "park", 45],
      ["park", "nagano", 45],
      ["nagano", "tokyo", 120],
      ["tokyo", "nagano", 120],
    ],
  );
  assert.equal(mapConnectionVisible(model, connections[0], "all"), true);
  assert.equal(mapConnectionDuration(connections[2]), "~2h");
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
    for (const k of [0.35, 1, 12])
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
  assert.equal(zoomMap({ x: 0, y: 0, k: 1 }, 0.001).k, 0.001);
  assert.equal(zoomMap({ x: 0, y: 0, k: 1 }, 100).k, 100);
});

test("unsplit bus and boat estimates survive as total without invented component shares", () => {
  for (const minutes of [360, 270]) {
    const model = normalizeTrip({
      version: 1,
      initialPlace: "a",
      places: { a: {}, b: {} },
      days: [
        {
          blocks: [
            {
              type: "travel",
              to: "b",
              mode: "other",
              estimatedDurationMinutes: minutes,
              components: [{ mode: "bus" }, { mode: "ferry" }, { mode: "bus" }],
            },
          ],
        },
      ],
    });
    const [connection] = mapDisplayConnections(model);
    assert.equal(connection.outbound.minutes, minutes);
    assert.equal(
      mapDisplayDuration(model, connection, "60"),
      minutes === 360 ? "~6h" : "~4h30",
    );
    assert.equal(
      durationTotals(model).find((t) => t.category === "mixed")?.estimatedMs,
      minutes * 60000,
    );
    assert.equal(durationTotals(model)[0].estimatedMs, 0);
    assert.ok(
      model.legs[0].block.components!.every(
        (part) => part.estimatedDurationMinutes === undefined,
      ),
    );
  }
});

test("internal circuits retain all waypoints while return trips display one-way durations", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "base",
    groups: { area: { name: "Area" } },
    places: {
      base: { group: "area" },
      a: { group: "area" },
      b: { group: "area" },
      park: { group: "area" },
    },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "a",
            mode: "car",
            estimatedDurationMinutes: 30,
          },
          {
            type: "travel",
            to: "b",
            mode: "car",
            estimatedDurationMinutes: 25,
          },
          {
            type: "travel",
            to: "base",
            mode: "car",
            estimatedDurationMinutes: 20,
          },
        ],
      },
      {
        blocks: [
          {
            type: "travel",
            to: "park",
            mode: "car",
            estimatedDurationMinutes: 150,
          },
          {
            type: "travel",
            to: "base",
            mode: "car",
            estimatedDurationMinutes: 150,
          },
        ],
      },
    ],
  });
  const [circuit, excursion] = mapDisplayConnections(model);
  assert.deepEqual(
    circuit.outbound.legs.map((leg) => leg.to),
    ["a", "b", "base"],
  );
  assert.equal(mapDisplayDuration(model, circuit, "all"), "~1h15");
  assert.equal(excursion.inbound?.minutes, 150);
  assert.equal(mapDisplayDuration(model, excursion, "120"), "~2h30");
  assert.equal(mapDisplayDuration(model, excursion, "240"), "");
  for (const threshold of ["30", "60", "120", "240"] as const) {
    assert.equal(
      mapConnectionVisible(
        model,
        { ...circuit.outbound, minutes: Number(threshold) },
        threshold,
      ),
      false,
    );
    assert.equal(
      mapConnectionVisible(
        model,
        { ...circuit.outbound, minutes: Number(threshold) + 0.1 },
        threshold,
      ),
      true,
    );
  }
  assert.equal(
    mapConnectionVisible(model, { ...circuit.outbound, minutes: 45 }, "all"),
    true,
  );
  assert.equal(
    mapConnectionVisible(model, { ...circuit.outbound, minutes: 45 }, "60"),
    false,
  );
});

test("a partially allocated whole estimate is counted once in summaries", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            estimatedDurationMinutes: 100,
            components: [
              { mode: "bus", estimatedDurationMinutes: 20 },
              { mode: "ferry" },
            ],
          },
        ],
      },
    ],
  });
  const totals = durationTotals(model);
  assert.equal(
    totals.reduce((sum, total) => sum + total.estimatedMs, 0),
    100 * 60000,
  );
  assert.equal(model.legs[0].block.components![0].estimatedDurationMinutes, 20);
});

test("country highlighting uses complete visited scope including home, excluding unused definitions", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "home",
    places: {
      home: { country: "NL" },
      tokyo: { country: "JP" },
      unknown: {},
      unused: { country: "FR" },
    },
    days: [
      { blocks: [{ type: "travel", to: "tokyo", mode: "flight" }] },
      { blocks: [{ type: "travel", to: "unknown", mode: "train" }] },
      { blocks: [{ type: "travel", to: "home", mode: "flight" }] },
    ],
  });
  assert.deepEqual([...mapHighlightedCountries(model)], ["NL", "JP"]);
  assert.deepEqual([...mapHighlightedCountries(model, "JP")], ["JP"]);
  assert.deepEqual([...mapHighlightedCountries(model, "ZZ")], ["ZZ"]);
});

test("bundled country IDs cover worldwide names and Natural Earth ISO exceptions", () => {
  const world = JSON.parse(
    readFileSync(new URL("./assets/world.json", import.meta.url), "utf8"),
  );
  const countries = new Map<string, string>(
    world.features.map(
      (feature: { properties: { name: string; iso2: string } }) => [
        feature.properties.name,
        feature.properties.iso2,
      ],
    ),
  );
  for (const [name, code] of [
    ["Japan", "JP"],
    ["Vietnam", "VN"],
    ["Thailand", "TH"],
    ["Taiwan", "TW"],
    ["Netherlands", "NL"],
    ["France", "FR"],
    ["Norway", "NO"],
    ["Brazil", "BR"],
    ["Australia", "AU"],
  ]) {
    assert.equal(countries.get(name), code, name);
  }
  assert.equal(countries.get("N. Cyprus"), "");
  assert.ok(
    [...countries.values()].every(
      (code) => code === "" || /^[A-Z]{2}$/.test(code),
    ),
  );
  assert.ok(![...countries.values()].includes("ZZ"));
});
