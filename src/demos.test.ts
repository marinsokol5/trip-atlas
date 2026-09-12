import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { normalizeTrip } from "./itinerary.ts";
import { parseManifest } from "./load-trip.ts";
import { overview, timeLabel } from "./overview-model.ts";

const root = new URL("../trips/", import.meta.url);
const read = (path: string) =>
  JSON.parse(readFileSync(new URL(path, root), "utf8"));

test("every public demo and its declared document links are usable", () => {
  for (const entry of parseManifest(read("index.json"))) {
    const { trip } = normalizeTrip(read(entry.path));
    const owners = [
      trip,
      ...(trip.bookings ?? []),
      ...trip.days.flatMap((day) => [day, ...(day.blocks ?? [])]),
    ];
    for (const owner of owners) {
      if (!("documents" in owner)) continue;
      for (const document of owner.documents ?? []) {
        const url = new URL(document.path, new URL(entry.path, root));
        assert.ok(existsSync(url), `${entry.path}: missing ${document.path}`);
      }
    }
  }
});

test("featured Japan comparison matches its published day, night, travel and cost figures", () => {
  for (const [path, bases, travel, fare, total] of [
    ["japan-classic/trip.json", 3, "~10h 45m", 240, 1230],
    ["japan-kyushu/trip.json", 6, "~17h 30m", 275, 1265],
  ] as const) {
    const model = normalizeTrip(read(path));
    const summary = overview(model);
    assert.equal(summary.days, 10);
    assert.equal(summary.nights, 9);
    assert.equal(
      new Set(model.days.slice(0, -1).map((day) => day.overnight)).size,
      bases,
    );
    assert.equal(timeLabel(summary.times.other), travel);
    assert.equal(summary.costs.living.value, 450);
    assert.equal(summary.costs.accommodation.value, 540);
    assert.equal(summary.costs.other.value, fare);
    assert.equal(summary.costs.total.value, total);
    assert.equal(summary.costs.total.missing, 0);
    assert.equal(model.trip.startDate, "2027-05-10");
    assert.equal(model.days.at(-1)?.date, "2027-05-19");
  }
});
