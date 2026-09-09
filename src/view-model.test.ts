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
