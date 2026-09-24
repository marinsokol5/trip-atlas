import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import {
  mapDisplayConnections,
  mapDisplayDuration,
  mapArea,
  mapAreas,
  areaDays,
  dayCountries,
  calendarCountries,
  scopedCalendarSlots,
  scopedPosition,
  tripPosition,
  advancePlayback,
  zoomMap,
  wheelZoomFactor,
  momentAt,
  curvePoint,
  routeCurve,
} from "./view-model.ts";

test("undated stays retain location; unknown travel has no invented movement", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [{}, { blocks: [{ type: "travel", to: "b" }] }, {}],
  });
  assert.equal(momentAt(model, 0.5).place, "a");
  assert.deepEqual(momentAt(model, 1.5), { place: undefined, unknown: true });
  assert.equal(momentAt(model, 2.5).place, "b");
});
test("known days remain usable after an unknown travel day", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-01",
    timezone: "Asia/Tokyo",
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [{ blocks: [{ type: "travel", to: "b" }] }, {}],
  });
  assert.equal(momentAt(model, 0.5).unknown, true);
  assert.equal(momentAt(model, 1.5).place, "b");
  assert.ok(momentAt(model, 1.5).at);
});
test("day scrubber uses actual cross-zone elapsed duration and stationary stays", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-01",
    initialPlace: "a",
    places: {
      a: { timezone: "Asia/Tokyo" },
      b: { timezone: "Asia/Ho_Chi_Minh" },
    },
    days: [
      { blocks: [{ type: "travel", to: "b", start: "10:00", end: "13:00" }] },
    ],
  });
  assert.equal(momentAt(model, 9 / 26).place, "a");
  assert.equal(momentAt(model, 12.5 / 26).progress, 0.5);
  assert.equal(momentAt(model, 15 / 26).place, "b");
});
test("overnight progress remains continuous across day boundary", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-01",
    initialPlace: "a",
    places: { a: { timezone: "Asia/Bangkok" }, b: { timezone: "Asia/Taipei" } },
    days: [
      {
        blocks: [
          { type: "travel", to: "b", start: "23:00", end: "04:00", endDay: 2 },
        ],
      },
      {},
    ],
  });
  assert.equal(momentAt(model, 23.5 / 24).progress, 0.125);
  assert.equal(momentAt(model, 1 + 1 / 23).progress, 0.5);
  assert.equal(momentAt(model, 1 + 4 / 23).place, "b");
});
test("traveler points use the same quadratic route with exact endpoints", () => {
  const curve = routeCurve([10, 20], [210, 120]);
  assert.deepEqual(curvePoint(curve, 0), [10, 20]);
  assert.deepEqual(curvePoint(curve, 1), [210, 120]);
  assert.deepEqual(curvePoint(curve, 0.5), [100, 90]);
});

test("explicit location reset does not fabricate a full-day stay", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [{ blocks: [{ type: "place", place: "b" }] }, {}],
  });
  assert.equal(momentAt(model, 0.5).unknown, true);
  assert.equal(momentAt(model, 1.5).place, "b");
});

test("rough grouped trails stay colored and transfers stay distinct", async () => {
  const {
    dayBands,
    visualGroups,
    groupKey,
    durationTotals,
    calendarSlots,
    trimCurve,
    legDuration,
  } = await import("./view-model.ts");
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-11-24",
    initialPlace: "a",
    groups: { trail: { name: "Trail" } },
    places: { a: { group: "trail" }, b: { group: "trail" }, c: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            mode: "hike",
            estimatedDurationMinutes: 180,
          },
        ],
      },
      {
        blocks: [
          {
            type: "travel",
            to: "c",
            mode: "bus",
            estimatedDurationMinutes: 40,
          },
        ],
      },
      ...Array.from({ length: 20 }, () => ({})),
    ],
  });
  assert.equal(visualGroups(model).length, 2);
  assert.equal(groupKey(model, "a"), groupKey(model, "b"));
  assert.ok(
    dayBands(model, model.days[0]).every((b) => !b.transfer && b.place),
  );
  assert.equal(
    dayBands(model, model.days[1]).filter((b) => b.transfer).length,
    1,
  );
  assert.equal(legDuration(model.legs[0]), "~3h");
  assert.equal(durationTotals(model)[0].estimatedMs, 40 * 60000);
  assert.equal(durationTotals(model)[1].estimatedMs, 180 * 60000);
  assert.equal(calendarSlots(model).length, 28);
  assert.equal(calendarSlots(model)[0], undefined);
  assert.equal(calendarSlots(model)[1]?.date, "2026-11-24");
  assert.equal(calendarSlots(model)[22]?.date, "2026-12-15");
  for (const zoom of [1, 2, 12]) {
    const c = routeCurve([0, 0], [100, 70]),
      trimmed = trimCurve(c, 16 / zoom)!;
    assert.ok(
      Math.abs(Math.hypot(trimmed.b[0] - 100, trimmed.b[1] - 70) * zoom - 16) <
        0.001,
    );
  }
});
test("mixed components separate approximate walking and transport without invented clocks", async () => {
  const { durationTotals, legDuration } = await import("./view-model.ts");
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
            components: [
              { mode: "bus", estimatedDurationMinutes: 5 },
              { mode: "hike", estimatedDurationMinutes: 360 },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(model.legs[0].durationMs, undefined);
  assert.equal(legDuration(model.legs[0]), "~6h 5m");
  const totals = durationTotals(model);
  assert.equal(totals[0].estimatedMs, 5 * 60000);
  assert.equal(totals[1].estimatedMs, 360 * 60000);
  assert.equal(totals[0].knownMs, 0);
});

test("exact mixed duration survives components without fabricated allocation", async () => {
  const { durationTotals } = await import("./view-model.ts");
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-11-24",
    timezone: "Asia/Tokyo",
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            start: "10:00",
            end: "12:00",
            components: [{ mode: "bus" }, { mode: "hike" }],
          },
        ],
      },
    ],
  });
  const totals = durationTotals(model);
  assert.equal(
    totals.find((t) => t.category === "mixed")?.knownMs,
    120 * 60000,
  );
  assert.equal(totals[0].knownMs, 0);
  assert.equal(totals[1].knownMs, 0);
});

test("map arrows keep screen-pixel clearance while internal trails reach exact GPS endpoints", async () => {
  const { mapRoute } = await import("./view-model.ts");
  const curve = routeCurve([0, 0], [150, 100]);
  for (const frameScale of [0.4, 0.79, 1])
    for (const zoom of [0.35, 1, 7.59375, 12]) {
      const pixelScale = frameScale * zoom,
        major = mapRoute(curve, false, pixelScale),
        trail = mapRoute(curve, true, pixelScale);
      assert.equal(major.arrow, true);
      assert.ok(
        Math.abs(
          Math.hypot(major.curve.b[0] - 150, major.curve.b[1] - 100) *
            pixelScale -
            8.5,
        ) < 0.001,
      );
      assert.equal(trail.arrow, false);
      assert.deepEqual(trail.curve, curve);
    }
});

test("legacy mixed transport aliases stay unallocated instead of inflating walking", async () => {
  const { durationTotals, modeKind } = await import("./view-model.ts");
  for (const mode of [
    "ferry + walk",
    "Shinkansen + walk",
    "boat + hike",
    "coach + trek",
    "rail + walk",
  ]) {
    const model = normalizeTrip({
      version: 1,
      places: { a: {}, b: {} },
      initialPlace: "a",
      days: [
        {
          blocks: [
            { type: "travel", to: "b", mode, estimatedDurationMinutes: 80 },
          ],
        },
      ],
    });
    const totals = durationTotals(model);
    assert.equal(totals.find((t) => t.category === "walking")?.estimatedMs, 0);
    assert.equal(
      totals.find((t) => t.category === "mixed")?.estimatedMs,
      80 * 60000,
    );
    assert.equal(modeKind(model.legs[0]), "other");
  }
});

test("map areas follow visits and scope chronological endpoints and cross-country groups", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "home",
    groups: { shared: { name: "Shared group", color: "#123456" } },
    places: {
      home: { country: "NL" },
      tokyo: {
        country: "JP",
        group: "shared",
        coordinates: { lat: 35, lon: 139 },
      },
      kyoto: { country: "JP" },
      hanoi: { country: "VN", group: "shared" },
      unknown: {},
      unused: { country: "TH" },
    },
    days: [
      { blocks: [{ type: "travel", from: "unknown", to: "tokyo" }] },
      {
        blocks: [
          { type: "place", place: "kyoto" },
          { type: "travel", to: "hanoi" },
        ],
      },
      {
        blocks: [
          { type: "travel", to: "tokyo" },
          { type: "travel", to: "home" },
        ],
      },
    ],
  });
  assert.deepEqual(mapAreas(model), [
    { country: "NL", name: "Netherlands" },
    { country: "JP", name: "Japan" },
    { country: "VN", name: "Vietnam" },
  ]);
  const japan = mapArea(model, "JP");
  assert.deepEqual([...japan.placeIds], ["tokyo", "kyoto"]);
  assert.equal(japan.first, "tokyo");
  assert.equal(japan.last, "tokyo");
  assert.deepEqual(
    japan.groups.find((group) => group.key === "group:shared"),
    {
      key: "group:shared",
      name: "Shared group",
      color: "#123456",
      members: ["tokyo"],
    },
  );
  assert.equal(mapArea(model).first, "home");
  assert.equal(mapArea(model).last, "home");
  assert.ok(mapArea(model).placeIds.has("unknown"));
  assert.equal(mapArea(model, "VN").first, "hanoi");
  assert.equal(mapArea(model, "VN").last, "hanoi");
  assert.equal(mapArea(model, "TH").placeIds.size, 0);
});

test("map groups are numbered in travel order, not file order", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "ams",
    groups: { trail: { name: "Trail" } },
    places: {
      kyoto: { country: "JP" },
      unused: { country: "TH" },
      hike: { country: "JP", group: "trail" },
      hanoi: { country: "VN" },
      ams: { country: "NL" },
    },
    days: [
      { blocks: [{ type: "travel", to: "hanoi" }] },
      { blocks: [{ type: "travel", to: "kyoto" }] },
      { blocks: [{ type: "travel", to: "hike" }] },
    ],
  });
  const names = (country?: string) =>
    mapArea(model, country).groups.map((group) => group.name);
  assert.deepEqual(names(), ["ams", "hanoi", "kyoto", "Trail", "unused"]);
  assert.deepEqual(names("JP"), ["kyoto", "Trail"]);
});

test("country endpoints retain unmapped place resets, even without travel legs", () => {
  const model = normalizeTrip({
    version: 1,
    places: {
      a: { country: "JP" },
      b: { country: "JP", coordinates: { lat: 35, lon: 139 } },
      c: { country: "JP" },
    },
    days: [
      {
        blocks: [
          { type: "place", place: "a" },
          { type: "place", place: "b" },
          { type: "place", place: "c" },
        ],
      },
    ],
  });
  assert.equal(mapArea(model, "JP").first, "a");
  assert.equal(mapArea(model, "JP").last, "c");
  assert.deepEqual([...mapArea(model, "JP").placeIds], ["a", "b", "c"]);
});

test("country connection totals exclude border crossings and preserve domestic transfers", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "home",
    places: {
      home: { country: "NL" },
      airport: { country: "JP" },
      transfer: { country: "JP" },
      city: { country: "JP" },
      abroad: { country: "VN" },
    },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "airport",
            mode: "flight",
            estimatedDurationMinutes: 600,
          },
          {
            type: "travel",
            to: "transfer",
            mode: "train",
            estimatedDurationMinutes: 40,
          },
          {
            type: "travel",
            to: "city",
            mode: "bus",
            estimatedDurationMinutes: 50,
          },
          {
            type: "travel",
            to: "abroad",
            mode: "flight",
            estimatedDurationMinutes: 200,
          },
        ],
      },
    ],
  });
  const connections = mapDisplayConnections(model, "JP");
  assert.equal(connections.length, 1);
  assert.equal(connections[0].outbound.from, "airport");
  assert.equal(connections[0].outbound.to, "city");
  assert.equal(connections[0].outbound.minutes, 90);
  assert.equal(connections[0].outbound.legs.length, 2);
  assert.equal(mapDisplayDuration(model, connections[0], "60"), "~1h30");
  assert.deepEqual(mapDisplayConnections(model, "NL"), []);
});

const scopeTrip = () =>
  normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: { country: "JP" }, b: { country: "VN" }, c: {} },
    days: [
      {},
      { blocks: [{ type: "travel", to: "b" }] },
      {},
      {},
      { blocks: [{ type: "travel", to: "a" }] },
      {},
      {
        blocks: [
          { type: "place", place: "c" },
          { type: "place", place: "b" },
        ],
      },
      {},
    ],
  });
test("country days include both crossing endpoints, repeated visits and explicit presence", () => {
  const model = scopeTrip();
  assert.deepEqual(
    areaDays(model, "JP").map((day) => day.index),
    [0, 1, 4, 5, 6],
  );
  assert.deepEqual(
    areaDays(model, "VN").map((day) => day.index),
    [1, 2, 3, 4, 6, 7],
  );
  assert.equal(areaDays(model).length, model.days.length);
  assert.deepEqual(dayCountries(model, model.days[6]), ["JP", "VN"]);
});
test("compact timeline round-trips real trip dates and skips absent days", () => {
  const days = areaDays(scopeTrip(), "JP");
  for (const day of days)
    for (const fraction of [0, 0.25, 0.99]) {
      const value = day.index + fraction;
      assert.ok(
        Math.abs(tripPosition(days, scopedPosition(days, value)) - value) <
          1e-10,
      );
    }
  assert.equal(tripPosition(days, 2.5), 4.5);
  assert.equal(scopedPosition(days, 3.5), 0);
  assert.equal(tripPosition(days, -1), 0);
  assert.equal(tripPosition(days, 100), 6.99);
});
test("playback crosses scope gaps, starts outside at first scope, caps stalls and stops at its end", () => {
  const days = areaDays(scopeTrip(), "JP");
  assert.equal(advancePlayback(days, 1.99, 60, 1).value, 4.01);
  assert.equal(advancePlayback(days, 3.5, 0, 1).value, 0);
  assert.deepEqual(advancePlayback(days, 6.98, 250, 8), {
    value: 6.99,
    atEnd: true,
  });
  assert.equal(advancePlayback(days, 0, 99999, 1).value, 250 / 3000);
});
test("overnight crossing endpoints belong to every active day", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: { country: "JP" }, b: { country: "VN" } },
    days: [{ blocks: [{ type: "travel", to: "b", endDay: 3 }] }, {}, {}, {}],
  });
  assert.deepEqual(
    areaDays(model, "JP").map((day) => day.index),
    [0, 1, 2],
  );
  assert.deepEqual(
    areaDays(model, "VN").map((day) => day.index),
    [0, 1, 2, 3],
  );
});

test("wheel down zooms in, up zooms out, and wheel units normalize", () => {
  assert.ok(wheelZoomFactor(20, 0, 480) > 1);
  assert.ok(wheelZoomFactor(-20, 0, 480) < 1);
  assert.equal(wheelZoomFactor(0, 0, 480), 1);
  assert.equal(wheelZoomFactor(1, 1, 480), wheelZoomFactor(16, 0, 480));
  assert.equal(wheelZoomFactor(1, 2, 480), wheelZoomFactor(480, 0, 480));
});
test("pointer-anchored zoom keeps the same map coordinate under cursor, far beyond the former zoom bounds", () => {
  const view = { x: -120, y: 80, k: 2 };
  for (const anchor of [
    [0, 0],
    [173, 392],
    [900, 480],
  ] as [number, number][]) {
    for (const factor of [0.001, 0.8, 1.2, 100]) {
      const next = zoomMap(view, factor, anchor);
      assert.equal(next.k, view.k * factor);
      assert.ok(
        Math.abs(
          (anchor[0] - view.x) / view.k - (anchor[0] - next.x) / next.k,
        ) < 1e-9,
      );
      assert.ok(
        Math.abs(
          (anchor[1] - view.y) / view.k - (anchor[1] - next.y) / next.k,
        ) < 1e-9,
      );
    }
  }
  assert.deepEqual(zoomMap(view, 1.5), zoomMap(view, 1.5, [450, 240]));
});

test("calendar countries retain chronological crossings, excursions and mixed place resets", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: {
      a: { country: "JP" },
      b: { country: "VN" },
      c: { country: "TH" },
      local: { country: "TH" },
    },
    days: [
      {},
      {
        blocks: [
          { type: "travel", to: "b" },
          { type: "travel", to: "a" },
        ],
      },
      {
        blocks: [
          { type: "travel", to: "b" },
          { type: "place", place: "c" },
          { type: "travel", to: "local" },
        ],
      },
      {},
    ],
  });
  assert.equal(calendarCountries(model, model.days[0]), "Japan");
  assert.equal(
    calendarCountries(model, model.days[1]),
    "Japan → Vietnam → Japan",
  );
  assert.equal(
    calendarCountries(model, model.days[2]),
    "Japan → Vietnam → Thailand",
  );
  assert.equal(calendarCountries(model, model.days[3]), "Thailand");
});
test("calendar country context survives overnight arrivals and absent metadata", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: { country: "JP" }, b: { country: "VN" } },
    days: [{ blocks: [{ type: "travel", to: "b", endDay: 3 }] }, {}, {}, {}],
  });
  assert.deepEqual(
    model.days.map((day) => calendarCountries(model, day)),
    ["Japan → Vietnam", "Japan → Vietnam", "Japan → Vietnam", "Vietnam"],
  );
  const sparse = normalizeTrip({ version: 1, places: { a: {} }, days: [{}] });
  assert.equal(calendarCountries(sparse, sparse.days[0]), "");
});

test("scoped calendar preserves whole boundary weeks, skips gaps and marks revisits", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-28",
    initialPlace: "jp",
    places: { jp: { country: "JP" }, vn: { country: "VN" } },
    days: Array.from({ length: 24 }, (_, i) =>
      i === 2
        ? { blocks: [{ type: "place", place: "vn" }] }
        : i === 22
          ? { blocks: [{ type: "place", place: "jp" }] }
          : {},
    ),
  });
  const slots = scopedCalendarSlots(model, "JP");
  assert.equal(slots.length, 14);
  assert.deepEqual(
    slots.filter((slot) => slot.inScope).map((slot) => slot.day?.index),
    [0, 1, 2, 22, 23],
  );
  assert.equal(slots[0].date, "2026-12-28");
  assert.equal(slots[6].date, "2027-01-03");
  assert.equal(slots[7].date, "2027-01-18");
  assert.equal(slots[7].gapBefore, true);
  assert.equal(slots[3].inScope, false);
  assert.equal(slots.at(-1)?.day, undefined);
  assert.equal(scopedCalendarSlots(model).length, 28);
  assert.equal(scopedCalendarSlots(model, "VN")[0].gapBefore, false);
});

test("scoped calendar handles undated gaps, unknown countries and a single day", () => {
  const model = scopeTrip();
  assert.deepEqual(
    scopedCalendarSlots(model, "JP").map((slot) => slot.day?.index),
    [0, 1, 4, 5, 6],
  );
  assert.equal(scopedCalendarSlots(model, "JP")[2].gapBefore, true);
  assert.equal(scopedCalendarSlots(model, "TH").length, 0);
  const sparse = normalizeTrip({
    version: 1,
    startDate: "2026-12-31",
    places: {},
    days: [{}],
  });
  assert.equal(scopedCalendarSlots(sparse).length, 7);
  assert.equal(
    scopedCalendarSlots(sparse).filter((slot) => slot.inScope).length,
    1,
  );
});

test("first scoped calendar week is never labeled a later visit", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-28",
    initialPlace: "a",
    places: { a: { country: "VN" }, b: { country: "JP" } },
    days: Array.from({ length: 15 }, (_, i) =>
      i === 10 ? { blocks: [{ type: "travel", to: "b" }] } : {},
    ),
  });
  assert.equal(scopedCalendarSlots(model, "JP")[0].date, "2027-01-04");
  assert.equal(scopedCalendarSlots(model, "JP")[0].gapBefore, false);
});

test("calendar chips merge legs by mode; round trips have no transfer bands", async () => {
  const { modeDurations, dayBands } = await import("./view-model.ts");
  const model = normalizeTrip({
    version: 1,
    initialPlace: "home",
    places: { home: {}, pagoda: {}, street: {}, park: {}, city: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "pagoda",
            mode: "walk",
            estimatedDurationMinutes: 40,
          },
          {
            type: "travel",
            to: "street",
            mode: "walk",
            estimatedDurationMinutes: 15,
          },
          {
            type: "travel",
            to: "park",
            components: [
              { mode: "train", estimatedDurationMinutes: 15 },
              { mode: "bus", estimatedDurationMinutes: 25 },
            ],
          },
          {
            type: "travel",
            to: "home",
            mode: "bus",
            estimatedDurationMinutes: 25,
          },
        ],
      },
      { blocks: [{ type: "travel", to: "city", mode: "train" }] },
    ],
  });
  const legs = (day: number) => model.legs.filter((l) => l.day === day);
  assert.deepEqual(modeDurations(legs(1)), [
    { kind: "walk", label: "~55m" },
    { kind: "train", label: "~15m" },
    { kind: "bus", label: "~50m" },
  ]);
  assert.deepEqual(modeDurations(legs(2)), [{ kind: "train", label: "" }]);
  assert.ok(dayBands(model, model.days[0]).every((b) => !b.transfer));
  assert.ok(dayBands(model, model.days[1]).some((b) => b.transfer));
});
