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
test("rejects estimates whose derived totals overflow", () => {
  const trip = {
    version: 1,
    initialPlace: "a",
    places: { a: { country: "JP" }, b: { country: "JP" } },
    days: [{}, {}],
  };
  assert.throws(
    () =>
      normalizeTrip({
        ...trip,
        currency: "EUR",
        budget: { countries: { JP: { livingPerDay: 1e308 } } },
      }),
    /too large to total safely/,
  );
  assert.throws(
    () =>
      normalizeTrip({
        ...trip,
        days: [
          {
            blocks: [
              { type: "travel", to: "b", estimatedDurationMinutes: 1e308 },
            ],
          },
        ],
      }),
    /too large to total safely/,
  );
  assert.throws(
    () =>
      normalizeTrip({
        ...trip,
        days: [
          {
            blocks: [
              {
                type: "travel",
                to: "b",
                components: [
                  { mode: "train", estimatedDurationMinutes: 1e308 },
                ],
              },
            ],
          },
        ],
      }),
    /too large to total safely/,
  );
});
test("booking stay details validate meals, times, notes, coordinates and map links", () => {
  const stay = (extra: Record<string, unknown>) => ({
    ...base(),
    bookings: [
      { type: "accommodation", title: "Inn", place: "tokyo", ...extra },
    ],
  });
  const ok = normalizeTrip(
    stay({
      meals: { dinner: "18:00, Japanese", breakfast: true, lunch: false },
      checkIn: "15:00-18:00",
      checkOut: "10:00",
      notes: "Pay cash",
      important: true,
      coordinates: { lat: 33.8, lon: 135.7 },
      mapUrl: "https://maps.app.goo.gl/AbC123",
    }),
  );
  assert.equal(ok.trip.bookings![0].important, true);
  assert.deepEqual(ok.trip.bookings![0].meals, {
    dinner: "18:00, Japanese",
    breakfast: true,
    lunch: false,
  });
  assert.throws(
    () => normalizeTrip(stay({ meals: { supper: true } })),
    /meals.supper/,
  );
  assert.throws(
    () => normalizeTrip(stay({ meals: { dinner: 1 } })),
    /meals.dinner/,
  );
  assert.throws(
    () => normalizeTrip(stay({ meals: { lunch: " " } })),
    /meals.lunch/,
  );
  assert.throws(() => normalizeTrip(stay({ checkIn: "3pm" })), /checkIn/);
  assert.throws(
    () => normalizeTrip(stay({ checkOut: "09:00-10:00" })),
    /checkOut/,
  );
  assert.throws(
    () => normalizeTrip(stay({ coordinates: { lat: 91, lon: 0 } })),
    /coordinates/,
  );
  assert.throws(() => normalizeTrip(stay({ notes: " " })), /notes/);
  assert.throws(() => normalizeTrip(stay({ important: "yes" })), /important/);
  for (const mapUrl of [
    "https://www.google.com/maps/place/Inn/@33.8,135.7,17z",
    "https://www.google.co.jp/maps?q=Inn",
    "https://maps.google.com/?cid=123",
    "https://goo.gl/maps/xyz",
  ])
    assert.doesNotThrow(() => normalizeTrip(stay({ mapUrl })), mapUrl);
  for (const mapUrl of [
    "http://maps.app.goo.gl/AbC123",
    "https://www.google.com/search?q=Inn",
    "https://evil.example/maps/x",
    "https://google.com.evil.example/maps/x",
    "https://user@maps.app.goo.gl/x",
    "javascript:alert(1)",
    "not a url",
    42,
  ])
    assert.throws(() => normalizeTrip(stay({ mapUrl })), /mapUrl/);
});
test("walk legs validate distance and climb", () => {
  const walk = (extra: Record<string, unknown>) => ({
    ...base(),
    days: [
      { blocks: [{ type: "travel", to: "kyoto", mode: "walk", ...extra }] },
    ],
  });
  const ok = normalizeTrip(
    walk({ distanceKm: 14, ascentMeters: 800, descentMeters: 0 }),
  );
  assert.equal(ok.legs[0].block.distanceKm, 14);
  assert.throws(() => normalizeTrip(walk({ distanceKm: 0 })), /distanceKm/);
  assert.throws(
    () => normalizeTrip(walk({ ascentMeters: -5 })),
    /ascentMeters/,
  );
  assert.throws(
    () => normalizeTrip(walk({ descentMeters: "650" })),
    /descentMeters/,
  );
});
test("booking baggage validates type, pieces and weight", () => {
  const flight = (baggage: unknown) => ({
    ...base(),
    bookings: [{ type: "transport", title: "Flight", baggage }],
  });
  const ok = normalizeTrip(
    flight([
      { type: "checked", pieces: 1, kg: 23 },
      { type: "personal", pieces: 1 },
    ]),
  );
  assert.equal(ok.trip.bookings![0].baggage![0].kg, 23);
  assert.throws(() => normalizeTrip(flight({})), /baggage/);
  assert.throws(
    () => normalizeTrip(flight([{ type: "hold", pieces: 1 }])),
    /baggage\[0\].type/,
  );
  assert.throws(
    () => normalizeTrip(flight([{ type: "cabin", pieces: 1.5 }])),
    /pieces/,
  );
  assert.throws(
    () => normalizeTrip(flight([{ type: "cabin", pieces: 1, kg: 0 }])),
    /kg/,
  );
});
test("day sights take a name, an optional Google Maps link and an optional tip", () => {
  const day = (sights: unknown) => ({ ...base(), days: [{ sights }] });
  const ok = normalizeTrip(
    day([
      {
        name: "Nara Park",
        tip: "Skip the first deer; there are more further in.",
      },
      { name: "Nakatanidou", mapUrl: "https://maps.google.com/?cid=123" },
    ]),
  );
  assert.equal(ok.trip.days[0].sights!.length, 2);
  assert.throws(() => normalizeTrip(day({ name: "x" })), /sights/);
  assert.throws(
    () => normalizeTrip(day([{ tip: "No name" }])),
    /sights\[0\]\.name/,
  );
  assert.throws(
    () => normalizeTrip(day([{ name: "x", mapUrl: "https://example.com" }])),
    /sights\[0\]\.mapUrl/,
  );
  assert.throws(
    () => normalizeTrip(day([{ name: "x", tip: " " }])),
    /sights\[0\]\.tip/,
  );
});
