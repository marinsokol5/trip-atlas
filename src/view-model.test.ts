import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import { momentAt, curvePoint, routeCurve } from "./view-model.ts";

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
    for (const zoom of [1, 7.59375, 12]) {
      const pixelScale = frameScale * zoom,
        major = mapRoute(curve, false, pixelScale),
        trail = mapRoute(curve, true, pixelScale);
      assert.equal(major.arrow, true);
      assert.ok(
        Math.abs(
          Math.hypot(major.curve.b[0] - 150, major.curve.b[1] - 100) *
            pixelScale -
            16,
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
