import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrip,
  positionAt,
  safeRelativePath,
  localInstant,
  documentUrl,
} from "./itinerary.ts";
import type { Trip } from "./itinerary.ts";
const base = (): Trip => ({
  version: 1,
  title: "Example",
  startDate: "2026-12-01",
  initialPlace: "tokyo",
  places: {
    tokyo: {
      name: "Tokyo",
      timezone: "Asia/Tokyo",
      coordinates: { lat: 35, lon: 139 },
    },
    kyoto: {
      name: "Kyoto",
      timezone: "Asia/Tokyo",
      coordinates: { lat: 35, lon: 135 },
    },
    hanoi: { name: "Hanoi", timezone: "Asia/Ho_Chi_Minh" },
  },
  days: [
    {},
    { blocks: [{ type: "travel", to: "kyoto", start: "10:00", end: "13:00" }] },
    {},
  ],
});
test("empty days inherit location; motion only during travel", () => {
  const n = normalizeTrip(base());
  assert.deepEqual(
    n.days.map((d) => d.overnight),
    ["tokyo", "kyoto", "kyoto"],
  );
  assert.equal(n.days[1].segments.length, 3);
  assert.equal(positionAt(n, 30 * 3600000).place, "tokyo");
  assert.equal(positionAt(n, 35 * 3600000).moving, true);
  assert.equal(positionAt(n, 48 * 3600000).place, "kyoto");
});
test("multiple journeys preserve ordered origin and stay", () => {
  const t = base();
  t.days[1].blocks!.push({
    type: "travel",
    to: "tokyo",
    start: "16:00",
    end: "19:00",
  });
  const n = normalizeTrip(t);
  assert.equal(n.legs[1].from, "kyoto");
  assert.equal(n.days[1].segments.length, 5);
  assert.equal(n.days[2].overnight, "tokyo");
});
test("cross-zone 10:00 Tokyo to 13:00 Hanoi is five hours; day is 26h", () => {
  const t = base();
  t.days[1].blocks = [
    { type: "travel", to: "hanoi", start: "10:00", end: "13:00" },
  ];
  const n = normalizeTrip(t);
  assert.equal(n.legs[0].durationMs, 5 * 3600000);
  assert.equal(n.days[1].durationMs, 26 * 3600000);
  assert.equal(
    n.days[1].segments.reduce((s, x) => s + x.durationMs!, 0),
    26 * 3600000,
  );
});
test("overnight arrival uses explicit day and keeps intervening day in transit", () => {
  const t = base();
  t.days = [
    {
      blocks: [
        {
          type: "travel",
          to: "hanoi",
          start: "23:00",
          end: "03:00",
          endDay: 3,
        },
      ],
    },
    {},
    {},
  ];
  const n = normalizeTrip(t);
  assert.equal(n.legs[0].durationMs, 30 * 3600000);
  assert.deepEqual(
    n.days.map((d) => d.overnight),
    [undefined, undefined, "hanoi"],
  );
  assert.equal(n.days[1].inTransit, true);
  assert.equal(n.days[0].end, n.days[1].start);
  assert.equal(n.days[1].end, n.days[2].start);
});
test("unknown timing still carries destination; no invented proportions", () => {
  const t = base();
  delete t.startDate;
  t.days[1].blocks = [{ type: "travel", to: "hanoi" }];
  const n = normalizeTrip(t);
  assert.equal(n.days[2].overnight, "hanoi");
  assert.equal(n.days[1].durationMs, undefined);
  assert.equal(n.legs[0].durationMs, undefined);
  assert.equal(n.days[0].label, "Day 1");
  assert.equal(positionAt(n, 100).coordinates, undefined);
});
test("sparse trip can have no initial location or coordinates", () => {
  const t = base();
  delete t.initialPlace;
  delete t.startDate;
  t.days = [{}, { blocks: [{ type: "travel", to: "hanoi" }] }, {}];
  const n = normalizeTrip(t);
  assert.equal(n.legs[0].from, undefined);
  assert.equal(n.days[2].overnight, "hanoi");
});
test("negative and overlapping chronology rejected with path", () => {
  const t = base();
  t.days[1].blocks = [
    { type: "travel", to: "kyoto", start: "13:00", end: "10:00" },
  ];
  assert.throws(
    () => normalizeTrip(t),
    /days\[1\].blocks\[0\].end: arrival precedes/,
  );
  t.days[1].blocks = [
    { type: "travel", to: "kyoto", start: "10:00", end: "13:00" },
    { type: "travel", to: "tokyo", start: "12:00", end: "15:00" },
  ];
  assert.throws(() => normalizeTrip(t), /overlaps/);
});
test("bad structure and references are readable errors", () => {
  assert.throws(() => normalizeTrip({ ...base(), version: 2 }), /version/);
  assert.throws(
    () => normalizeTrip({ ...base(), startDate: "2026-02-30" }),
    /startDate/,
  );
  assert.throws(
    () => normalizeTrip({ ...base(), initialPlace: "missing" }),
    /initialPlace/,
  );
  assert.throws(
    () =>
      normalizeTrip({
        ...base(),
        days: [{ blocks: [{ type: "travel", to: "kyoto", endDay: 4 }] }],
      }),
    /endDay/,
  );
});
test("DST fold and gap require clarification", () => {
  assert.throws(
    () => localInstant("2026-11-01", "01:30", "America/New_York", "start"),
    /ambiguous/,
  );
  assert.throws(
    () => localInstant("2026-03-08", "02:30", "America/New_York", "start"),
    /does not exist/,
  );
});
test("document paths stay local", () => {
  for (const path of [
    "../secret",
    "/secret",
    "https://x",
    "a/../b",
    "a\\b",
    "%2e%2e/a",
    "a?b",
  ])
    assert.equal(safeRelativePath(path), false, path);
  assert.equal(
    documentUrl("japan", "notes/booking one.pdf"),
    "/trips/japan/notes/booking%20one.pdf",
  );
  assert.throws(
    () =>
      normalizeTrip({
        ...base(),
        days: [{ documents: [{ label: "bad", path: "../secret" }] }],
      }),
    /documents\[0\].path/,
  );
});
test("optional display metadata gets readable fallbacks", () => {
  const n = normalizeTrip({ version: 1, places: { tokyo: {} }, days: [{}] });
  assert.equal(n.trip.title, "Untitled journey");
  assert.equal(n.trip.places.tokyo.name, "tokyo");
});
test("eastbound overnight never places traveler at destination before departure", () => {
  const t = base();
  t.initialPlace = "hanoi";
  t.days = [
    {
      blocks: [
        {
          type: "travel",
          to: "tokyo",
          start: "23:00",
          end: "05:00",
          endDay: 2,
        },
      ],
    },
    {},
  ];
  const n = normalizeTrip(t);
  assert.equal(n.days[0].end, n.days[1].start);
  assert.equal(n.legs[0].durationMs, 4 * 3600000);
  assert.equal(positionAt(n, 23.5 * 3600000).moving, true);
  for (const day of n.days)
    for (const s of day.segments)
      if (s.type === "stay" && s.place === "tokyo")
        assert.ok(s.start! >= n.legs[0].arrival!);
  assert.equal(n.days[1].segments[0].type, "travel");
});
test("known chronological constraints survive missing clocks", () => {
  const t = base();
  t.days = [
    {
      blocks: [
        { type: "travel", to: "kyoto", start: "10:00", end: "13:00" },
        { type: "travel", to: "tokyo" },
        { type: "travel", to: "kyoto", start: "12:00", end: "15:00" },
      ],
    },
  ];
  assert.throws(() => normalizeTrip(t), /previous known time/);
  t.days = [
    {
      blocks: [
        { type: "travel", to: "kyoto", start: "15:00" },
        { type: "travel", to: "tokyo", start: "10:00", end: "11:00" },
      ],
    },
  ];
  assert.throws(() => normalizeTrip(t), /previous known time/);
  t.days = [
    {
      blocks: [
        { type: "travel", to: "kyoto", start: "15:00" },
        { type: "travel", to: "tokyo", end: "11:00" },
      ],
    },
  ];
  assert.throws(() => normalizeTrip(t), /previous known time/);
});

test("eastbound arrival before origin midnight carries destination across boundary", () => {
  const t = base();
  t.initialPlace = "hanoi";
  t.days = [
    {
      blocks: [
        {
          type: "travel",
          to: "tokyo",
          start: "22:00",
          end: "00:30",
          endDay: 2,
        },
      ],
    },
    {},
  ];
  const n = normalizeTrip(t);
  assert.equal(n.legs[0].durationMs, 30 * 60000);
  assert.equal(n.days[0].end, n.days[1].start);
  assert.equal(n.days[1].segments[0].type, "stay");
  assert.equal(n.days[1].segments[0].place, "tokyo");
  assert.equal(positionAt(n, 30 * 3600000).place, "tokyo");
});

test("optional visual groups, estimates and components validate without breaking legacy metadata", () => {
  const base = {
    version: 1,
    customMetadata: { preserved: true },
    groups: { trail: { name: "Trail", color: "#123abc" } },
    places: { a: { group: "trail" } },
    days: [{}],
  };
  assert.equal(normalizeTrip(base).trip.places.a.group, "trail");
  assert.throws(
    () => normalizeTrip({ ...base, places: { a: { group: "absent" } } }),
    /places.a.group/,
  );
  assert.throws(
    () =>
      normalizeTrip({
        ...base,
        groups: { trail: { name: "Trail", color: "red" } },
      }),
    /groups.trail.color/,
  );
  for (const estimatedDurationMinutes of [0, -1, "3h", Infinity])
    assert.throws(
      () =>
        normalizeTrip({
          ...base,
          days: [
            { blocks: [{ type: "travel", to: "a", estimatedDurationMinutes }] },
          ],
        }),
      /estimatedDurationMinutes/,
    );
  assert.throws(
    () =>
      normalizeTrip({
        ...base,
        days: [{ blocks: [{ type: "travel", to: "a", components: [] }] }],
      }),
    /components/,
  );
  assert.throws(
    () =>
      normalizeTrip({
        ...base,
        days: [
          {
            blocks: [
              {
                type: "travel",
                to: "a",
                components: [{ mode: "bus", estimatedDurationMinutes: -2 }],
              },
            ],
          },
        ],
      }),
    /components/,
  );
});

test("optional budgets accept zero, preserve legacy trips, and require one currency", () => {
  const trip = base();
  assert.equal(normalizeTrip(trip).trip.currency, undefined);
  trip.currency = "EUR";
  trip.budget = {
    countries: { JP: { livingPerDay: 0, accommodationPerNight: 140 } },
  };
  const travel = trip.days[1].blocks![0];
  if (travel.type !== "travel") throw new Error("fixture");
  travel.estimatedCost = 0;
  assert.equal(normalizeTrip(trip).trip.budget!.countries.JP.livingPerDay, 0);
  for (const invalid of [-1, Infinity, NaN, null, "100"]) {
    assert.throws(
      () =>
        normalizeTrip({
          ...trip,
          budget: { countries: { JP: { livingPerDay: invalid } } },
        }),
      /budget.countries.JP.livingPerDay/,
    );
    assert.throws(
      () =>
        normalizeTrip({
          ...trip,
          days: [{ blocks: [{ ...travel, estimatedCost: invalid }] }],
        }),
      /estimatedCost/,
    );
  }
  assert.throws(
    () => normalizeTrip({ ...trip, currency: undefined }),
    /currency: required/,
  );
  for (const currency of ["eur", "EU", "", null])
    assert.throws(() => normalizeTrip({ ...trip, currency }), /currency:/);
  assert.throws(
    () => normalizeTrip({ ...trip, budget: { countries: { jp: {} } } }),
    /uppercase ISO2/,
  );
  assert.throws(
    () => normalizeTrip({ ...trip, budget: {} }),
    /budget.countries/,
  );
});
