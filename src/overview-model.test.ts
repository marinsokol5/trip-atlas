import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import type { Trip, TravelBlock } from "./itinerary.ts";
import {
  overview,
  moneyLabel,
  timeLabel,
  travelTimes,
} from "./overview-model.ts";
// Rates and fares are per person, including the accommodation share.
const fixture = (): Trip => ({
  version: 1,
  currency: "EUR",
  initialPlace: "tokyo",
  places: {
    tokyo: { name: "Tokyo", country: "JP" },
    hanoi: { name: "Hanoi", country: "VN" },
    kyoto: { name: "Kyoto", country: "JP" },
  },
  budget: {
    countries: {
      JP: { livingPerDay: 70, accommodationPerNight: 140 },
      VN: { livingPerDay: 30, accommodationPerNight: 50 },
      US: { livingPerDay: 9999 },
    },
  },
  days: [
    {},
    {
      blocks: [
        {
          type: "travel",
          to: "hanoi",
          mode: "flight",
          endDay: 3,
          estimatedDurationMinutes: 300,
          estimatedCost: 120,
        },
      ],
    },
    {},
    {
      blocks: [
        {
          type: "travel",
          to: "kyoto",
          mode: "flight",
          estimatedDurationMinutes: 180,
          estimatedCost: 80,
        },
      ],
    },
    {},
  ],
});
test("per-person budgets preserve day and night allocation across repeat visits", () => {
  const m = normalizeTrip(fixture()),
    whole = overview(m),
    jp = overview(m, "JP"),
    vn = overview(m, "VN");
  assert.equal(whole.days, 5);
  assert.equal(whole.nights, 4);
  assert.equal(jp.days, 5);
  assert.equal(jp.nights, 2);
  assert.equal(vn.days, 3);
  assert.equal(vn.nights, 1);
  assert.equal(whole.stays.find((r) => r.key === "transit")!.nights, 1);
  assert.equal(whole.stays.find((r) => r.key === "JP")!.nights, 2);
  assert.equal(whole.costs.living.value, 310);
  assert.equal(whole.costs.accommodation.value, 330);
  assert.equal(whole.costs.total.value, 840);
  assert.equal(moneyLabel(whole.costs.total, "EUR"), "~€840");
  assert.equal(jp.costs.living.value, 280);
  assert.equal(vn.costs.living.value, 30);
  assert.equal(jp.costs.flights.value, 200);
  assert.equal(vn.costs.flights.value, 200);
  assert.equal(whole.costs.flights.value, 200);
  assert.equal(
    whole.stays.reduce((s, r) => s + r.cost.value, 0),
    640,
  );
  assert.equal(timeLabel(whole.times.flights), "~8h");
});
test("one day has no accommodation night; unknown and zero prices stay distinct", () => {
  const trip = fixture();
  trip.days = [{}];
  const one = overview(normalizeTrip(trip));
  assert.equal(one.nights, 0);
  assert.equal(one.costs.accommodation.missing, 0);
  assert.equal(moneyLabel(one.costs.accommodation, "EUR"), "0");
  trip.budget = { countries: { JP: { livingPerDay: 0 } } };
  assert.equal(
    moneyLabel(overview(normalizeTrip(trip)).costs.total, "EUR"),
    "~€0",
  );
  delete trip.budget;
  delete trip.currency;
  assert.equal(moneyLabel(overview(normalizeTrip(trip)).costs.total), "?");
  const unknown = overview(
    normalizeTrip({ version: 1, places: {}, days: [{}, {}] }),
  );
  assert.equal(unknown.nights, 1);
  assert.equal(unknown.stays[0].name, "Unknown");
  assert.equal(unknown.costs.living.missing, 2);
  assert.equal(unknown.costs.accommodation.missing, 1);
});
test("partial prices use plus, unknown countries never borrow a rate, walk prices are optional", () => {
  const trip = fixture();
  delete trip.budget!.countries.VN;
  const cost = overview(normalizeTrip(trip)).costs.total;
  assert.equal(cost.value, 760);
  assert.equal(cost.missing, 2);
  assert.equal(moneyLabel(cost, "EUR"), "~€760+");
  trip.days = [
    {
      blocks: [
        {
          type: "travel",
          to: "kyoto",
          mode: "hike",
          estimatedDurationMinutes: 90,
        },
      ],
    },
    {},
  ];
  const freewalk = overview(normalizeTrip(trip));
  assert.equal(freewalk.costs.other.missing, 0);
  assert.equal(freewalk.times.other.value, 0);
  (trip.days[0].blocks![0] as TravelBlock).estimatedCost = 7;
  assert.equal(overview(normalizeTrip(trip)).costs.other.value, 7);
  trip.places.kyoto.country = undefined;
  assert.equal(overview(normalizeTrip(trip)).costs.living.missing, 2);
});
const times = (block: Partial<TravelBlock>, exact?: number) =>
  travelTimes([
    {
      id: "1",
      day: 1,
      endDay: 1,
      to: "a",
      durationMs: exact,
      block: { type: "travel", to: "a", ...block },
    },
  ]);
test("transport timing excludes walking and never adds whole connections to components", () => {
  assert.equal(
    timeLabel(
      times({ mode: "flight", estimatedDurationMinutes: 99 }, 3600000).flights,
    ),
    "1h",
  );
  assert.equal(
    timeLabel(
      times({
        components: [{ mode: "bus" }, { mode: "ferry" }],
        estimatedDurationMinutes: 120,
      }).other,
    ),
    "~2h",
  );
  assert.equal(
    timeLabel(
      times({
        components: [
          { mode: "bus", estimatedDurationMinutes: 30 },
          { mode: "hike", estimatedDurationMinutes: 360 },
        ],
      }).other,
    ),
    "~30m",
  );
  const mixed = times(
    {
      components: [
        { mode: "flight", estimatedDurationMinutes: 60 },
        { mode: "bus", estimatedDurationMinutes: 30 },
      ],
    },
    7200000,
  );
  assert.equal(timeLabel(mixed.flights), "?");
  assert.equal(timeLabel(mixed.other), "?");
  assert.equal(timeLabel(mixed.unallocated), "2h");
  const partial = times({
    components: [
      { mode: "train", estimatedDurationMinutes: 30 },
      { mode: "bus" },
    ],
  });
  assert.equal(timeLabel(partial.other), "~30m+");
  const unknown = times({
    mode: "flight + bus",
    estimatedDurationMinutes: 120,
  });
  assert.equal(timeLabel(unknown.flights), "?");
  assert.equal(timeLabel(unknown.unallocated), "~2h");
});
test("transit daily budget uses explicit departure override and no hotel; groups merge stays", () => {
  const trip = fixture();
  trip.groups = { japan: { name: "Japan stops", color: "#123456" } };
  trip.places.tokyo.group = "japan";
  trip.places.kyoto.group = "japan";
  const grouped = overview(normalizeTrip(trip), "JP");
  assert.equal(grouped.stays.length, 1);
  assert.equal(grouped.stays[0].nights, 2);
  assert.equal(grouped.stays[0].days, 5);
  assert.equal(grouped.stays[0].color, "#123456");
  trip.days = [
    {
      blocks: [
        {
          type: "travel",
          from: "hanoi",
          to: "kyoto",
          endDay: 3,
          mode: "flight",
          estimatedCost: 0,
        },
      ],
    },
    {},
    {},
  ];
  const result = overview(normalizeTrip(trip));
  assert.equal(result.costs.living.value, 130);
  assert.equal(result.costs.accommodation.value, 0);
  assert.equal(result.costs.accommodation.missing, 0);
  assert.equal(result.nights, 2);
});

test("transit living follows the last known country visited within the departure day", () => {
  const trip: Trip = {
    version: 1,
    currency: "EUR",
    initialPlace: "a",
    places: { a: { country: "JP" }, b: { country: "VN" }, u: {} },
    budget: {
      countries: { JP: { livingPerDay: 10 }, VN: { livingPerDay: 20 } },
    },
    days: [
      {},
      {
        blocks: [
          { type: "place", place: "b" },
          { type: "place", place: "u" },
          { type: "travel", to: "a", endDay: 4 },
        ],
      },
      {},
      {},
    ],
  };
  const m = normalizeTrip(trip),
    whole = overview(m),
    jp = overview(m, "JP"),
    vn = overview(m, "VN");
  assert.equal(whole.costs.living.value, 60);
  assert.equal(jp.costs.living.value, 20);
  assert.equal(vn.costs.living.value, 40);
  assert.ok(!jp.stays.some((r) => r.key === "place:u"));
  assert.equal(whole.stays.find((r) => r.key === "VN")!.cost.value, 40);
});
test("ground and walking share cost classification while unsplit modes retain missing amounts", () => {
  const trip = fixture();
  trip.days = [
    {
      blocks: [
        {
          type: "travel",
          to: "kyoto",
          components: [{ mode: "bus" }, { mode: "walk" }],
          estimatedCost: 40,
        },
      ],
    },
  ];
  const ground = overview(normalizeTrip(trip));
  assert.equal(ground.costs.other.value, 40);
  assert.equal(ground.costs.other.missing, 0);
  assert.equal(ground.costs.unallocated.known, 0);
  trip.days = [
    {
      blocks: [
        {
          type: "travel",
          to: "kyoto",
          mode: "flight + bus",
          estimatedDurationMinutes: 60,
          estimatedCost: 40,
        },
        { type: "travel", to: "tokyo", mode: "flight + bus" },
      ],
    },
  ];
  const partial = overview(normalizeTrip(trip));
  assert.equal(timeLabel(partial.times.unallocated), "~1h+");
  assert.equal(moneyLabel(partial.costs.unallocated, "EUR"), "~€40+");
  trip.days = [
    { blocks: [{ type: "travel", to: "kyoto", mode: "flight + bus" }] },
  ];
  const missing = overview(normalizeTrip(trip));
  assert.equal(timeLabel(missing.times.unallocated), "?");
  assert.equal(moneyLabel(missing.costs.unallocated, "EUR"), "?");
});
test("legacy mixed metro, subway and unknown transport aliases are never allocated to flight or walk", () => {
  for (const mode of [
    "flight + metro",
    "flight + unknown connection",
    "walk + subway",
  ]) {
    const result = times({ mode, estimatedDurationMinutes: 120 });
    assert.equal(result.flights.value, 0);
    assert.equal(result.other.value, 0);
    assert.equal(timeLabel(result.unallocated), "~2h");
    assert.equal(timeLabel(result.other), "?");
  }
  assert.equal(timeLabel(times({ mode: "flight" }).flights), "?");
});
