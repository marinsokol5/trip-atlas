import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import { mapMomentAt, momentAt } from "./view-model.ts";

test("the airplane uses entered flight timing and stays at cities outside travel", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-01",
    timezone: "UTC",
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            mode: "flight",
            start: "06:00",
            end: "18:00",
          },
        ],
      },
    ],
  });
  assert.equal(mapMomentAt(model, 0.1).place, "a");
  assert.equal(mapMomentAt(model, 0.5).progress, 0.5);
  assert.equal(mapMomentAt(model, 0.5).schematic, false);
  assert.equal(mapMomentAt(model, 0.9).place, "b");
});

test("illustrative overnight playback stays continuous and then follows the arrival transfer", () => {
  const model = normalizeTrip({
    version: 1,
    startDate: "2026-12-01",
    timezone: "UTC",
    initialPlace: "a",
    places: { a: {}, b: {}, c: {} },
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            mode: "flight",
            estimatedDurationMinutes: 720,
            endDay: 2,
          },
        ],
      },
      {
        blocks: [
          {
            type: "travel",
            to: "c",
            mode: "bus",
            estimatedDurationMinutes: 60,
          },
        ],
      },
      {},
    ],
  });
  const original = JSON.stringify(model);
  assert.equal(mapMomentAt(model, 0).place, "a");
  const before = mapMomentAt(model, 0.999999),
    after = mapMomentAt(model, 1);
  assert.equal(before.leg?.id, after.leg?.id);
  assert.ok(Math.abs(before.progress! - after.progress!) < 0.00001);
  assert.equal(after.progress, 0.5);
  assert.equal(after.schematic, true);
  assert.equal(after.at, undefined);
  assert.equal(momentAt(model, 1).unknown, true);
  assert.equal(mapMomentAt(model, 1.7).leg?.block.mode, "bus");
  assert.equal(mapMomentAt(model, 1.99).place, "c");
  assert.equal(mapMomentAt(model, 2.5).place, "c");
  assert.equal(JSON.stringify(model), original);
});

test("undated stays remain stationary and untimed walking has explicitly illustrative progress", () => {
  const model = normalizeTrip({
    version: 1,
    initialPlace: "a",
    places: { a: {}, b: {} },
    days: [
      {},
      {
        blocks: [
          {
            type: "travel",
            to: "b",
            mode: "walk",
            estimatedDurationMinutes: 120,
          },
        ],
      },
      {},
    ],
  });
  assert.equal(mapMomentAt(model, 0.1).place, "a");
  assert.equal(mapMomentAt(model, 0.9).place, "a");
  assert.equal(mapMomentAt(model, 1.5).progress, 0.5);
  assert.equal(mapMomentAt(model, 1.5).schematic, true);
  assert.equal(mapMomentAt(model, 2.5).place, "b");
});
