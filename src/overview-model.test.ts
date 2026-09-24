import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import type { Trip, TravelBlock } from "./itinerary.ts";
import {
  overview,
  averageLabel,
  combine,
  countryColor,
  headlineTimeLabel,
  nightShare,
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
  // The overnight flight crosses a border, so its night sits between countries.
  assert.equal(
    whole.stays.find((r) => r.key === "transit"),
    undefined,
  );
  assert.equal(whole.betweenNights, 1);
  assert.equal(
    overview(m, "", "places").stays.find((r) => r.key === "transit")!.nights,
    1,
  );
  assert.equal(whole.stays.find((r) => r.key === "JP")!.nights, 2);
  assert.equal(whole.costs.living.value, 310);
  assert.equal(whole.costs.accommodation.value, 330);
  assert.equal(whole.costs.total.value, 840);
  assert.equal(moneyLabel(whole.costs.total, "EUR"), "~€840");
  assert.equal(jp.costs.living.value, 280);
  assert.equal(vn.costs.living.value, 30);
  assert.equal(jp.costs.flights.value, 0);
  assert.equal(jp.betweenCountries.value, 200);
  assert.equal(vn.costs.flights.value, 0);
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

test("Overview budget presence counts explicit zero and only scoped prices", () => {
  const trip = fixture();
  delete trip.budget;
  const transportOnly = overview(normalizeTrip(trip));
  assert.equal(transportOnly.hasBudget, true);
  assert.equal(transportOnly.hasStayCosts, false);
  for (const day of trip.days)
    for (const block of day.blocks ?? [])
      if (block.type === "travel") delete block.estimatedCost;
  trip.budget = { countries: { US: { livingPerDay: 999 } } };
  assert.equal(overview(normalizeTrip(trip)).hasBudget, false);
  trip.budget.countries.JP = { livingPerDay: 0 };
  const free = overview(normalizeTrip(trip));
  assert.equal(free.hasBudget, true);
  assert.equal(free.hasStayCosts, true);
  assert.equal(free.costs.total.value, 0);
  assert.equal(moneyLabel(free.costs.total, "EUR"), "~€0+");
  assert.equal(overview(normalizeTrip(trip), "VN").hasBudget, false);
});
test("country colors survive place reorder, unused places and explicit groups", () => {
  const trip = fixture();
  const before = overview(normalizeTrip(trip)).stays.find(
    (r) => r.key === "JP",
  )!.color;
  trip.groups = { japan: { name: "Japan", color: "#ffffff" } };
  trip.places.tokyo.group = "japan";
  trip.places = {
    unused: { name: "Unused", country: "NL" },
    ...Object.fromEntries(Object.entries(trip.places).reverse()),
  };
  assert.equal(
    overview(normalizeTrip(trip)).stays.find((r) => r.key === "JP")!.color,
    before,
  );
  assert.equal(
    new Set(["JP", "VN", "TH", "TW", "NL"].map(countryColor)).size,
    5,
  );
  assert.equal(countryColor("zz"), countryColor("ZZ"));
});
test("night shares include transit and unknown nights in the scope denominator", () => {
  const data = overview(normalizeTrip(fixture()));
  assert.equal(
    nightShare(data.stays.find((r) => r.key === "JP")!.nights, data.nights),
    50,
  );
  assert.equal(nightShare(23, 48), 47.91666666666667);
  assert.equal(nightShare(0, 0), 0);
  assert.equal(nightShare(1, 1), 100);
  const unknown = overview(
    normalizeTrip({ version: 1, places: {}, days: [{}, {}] }),
  );
  assert.equal(nightShare(unknown.stays[0].nights, unknown.nights), 100);
});
test("estimated headlines round hours while exact and short durations retain detail", () => {
  const a = { value: 2800, known: 1, missing: 0, estimated: true };
  assert.equal(headlineTimeLabel(a), "~47h");
  assert.equal(timeLabel(a), "~46h 40m");
  assert.equal(headlineTimeLabel({ ...a, value: 5331, missing: 1 }), "~89h+");
  assert.equal(headlineTimeLabel({ ...a, value: 25 }), "~25m");
  assert.equal(headlineTimeLabel({ ...a, estimated: false }), "46h 40m");
  assert.equal(
    headlineTimeLabel({ ...a, value: 0, known: 0, missing: 1 }),
    "?",
  );
});

function reconcile(trip: Trip) {
  const model = normalizeTrip(trip),
    whole = overview(model);
  const buckets = [...whole.countries.entries()].filter(
    ([key]) => key !== "unknown",
  );
  assert.deepEqual(
    combine(
      ...buckets.map(([, bucket]) => bucket.total),
      whole.betweenCountries,
      whole.unassigned,
    ),
    whole.costs.total,
  );
  assert.equal(
    [...whole.countries.values()].reduce((sum, b) => sum + b.budgetDays, 0),
    model.days.length,
  );
  for (const [code, bucket] of buckets) {
    const selected = overview(model, code);
    assert.deepEqual(selected.costs.total, bucket.total);
    assert.equal(selected.budgetDays, bucket.budgetDays);
  }
  return whole;
}
test("country totals reconcile every amount and missing unit, counting international overnight legs once", () => {
  const trip = fixture();
  const whole = reconcile(trip);
  assert.equal(whole.betweenCountries.value, 200);
  assert.equal(whole.betweenCountries.known, 2);
  assert.equal(whole.countries.get("JP")!.total.value, 560);
  assert.equal(whole.countries.get("JP")!.budgetDays, 4);
  assert.equal(whole.stays.find((r) => r.key === "JP")!.days, 5);
  assert.equal(
    averageLabel(whole.countries.get("JP")!.total, 4, "EUR"),
    "~€140",
  );
  assert.equal(whole.countries.get("VN")!.budgetDays, 1);
  delete trip.budget!.countries.VN;
  delete (trip.days[3].blocks![0] as TravelBlock).estimatedCost;
  const partial = reconcile(trip);
  assert.equal(partial.betweenCountries.missing, 1);
  assert.equal(averageLabel(partial.countries.get("VN")!.total, 1, "EUR"), "?");
});
test("domestic flight, sea and paid walking costs remain local; missing pure walks need no price", () => {
  const trip = fixture();
  trip.days = [
    {
      blocks: [
        { type: "travel", to: "kyoto", mode: "flight", estimatedCost: 11.125 },
        { type: "travel", to: "tokyo", mode: "ferry", estimatedCost: 0 },
        { type: "travel", to: "kyoto", mode: "walk" },
        { type: "travel", to: "tokyo", mode: "hike", estimatedCost: 7 },
        { type: "travel", to: "kyoto", mode: "bus" },
      ],
    },
  ];
  const data = reconcile(trip),
    jp = data.countries.get("JP")!;
  assert.equal(jp.total.value, 88.125);
  assert.equal(jp.total.missing, 1);
  assert.equal(jp.total.known, 4);
  assert.equal(jp.budgetDays, 1);
  assert.equal(data.costs.accommodation.known, 0);
  assert.equal(data.betweenCountries.known, 0);
  assert.equal(averageLabel(jp.total, jp.budgetDays, "EUR"), "~€88+");
});
test("unknown endpoints and unknown living/stays stay unassigned without borrowing countries", () => {
  const trip = fixture();
  trip.places.u = {};
  trip.initialPlace = "u";
  trip.days = [
    {},
    {
      blocks: [
        { type: "travel", to: "tokyo", mode: "bus", estimatedCost: 9 },
        { type: "travel", to: "u", mode: "flight" },
      ],
    },
    {},
  ];
  const data = reconcile(trip);
  assert.equal(data.unassigned.value, 9);
  assert.equal(data.unassigned.missing, 6); // three living days, two nights, one fare
  assert.equal(data.countries.get("JP")!.budgetDays, 0);
  assert.equal(data.countries.get("JP")!.total.value, 0);
  delete trip.initialPlace;
  trip.days = [{ blocks: [{ type: "travel", to: "tokyo", estimatedCost: 8 }] }];
  assert.equal(reconcile(trip).unassigned.value, 8);
});
test("zero-day country retains domestic total and transit fallback owns budget days", () => {
  const trip = fixture();
  trip.days = [
    {
      blocks: [
        { type: "travel", to: "kyoto", mode: "train", estimatedCost: 13 },
        { type: "travel", to: "hanoi", mode: "flight", estimatedCost: 0 },
      ],
    },
  ];
  let data = reconcile(trip),
    jp = data.countries.get("JP")!;
  assert.equal(jp.total.value, 13);
  assert.equal(jp.budgetDays, 0);
  assert.equal(averageLabel(jp.total, jp.budgetDays, "EUR"), "—");
  trip.days = [
    {
      blocks: [
        { type: "place", place: "hanoi" },
        {
          type: "travel",
          to: "tokyo",
          mode: "flight",
          endDay: 3,
          estimatedCost: 0,
        },
      ],
    },
    {},
    {},
  ];
  data = reconcile(trip);
  assert.equal(data.countries.get("VN")!.budgetDays, 2);
  assert.equal(data.countries.get("JP")!.budgetDays, 1);
  assert.equal(data.costs.accommodation.known, 0);
  assert.equal(data.betweenCountries.known, 1);
  trip.budget = {
    countries: { JP: { livingPerDay: 0 }, VN: { livingPerDay: 0 } },
  };
  data = reconcile(trip);
  assert.equal(averageLabel(data.countries.get("VN")!.total, 2, "EUR"), "~€0");
});

test("home days before the first stay country and after the last carry no living budget", () => {
  const trip = (homeLeg = false) =>
    normalizeTrip({
      version: 1,
      currency: "EUR",
      initialPlace: "home",
      places: {
        home: { country: "NL" },
        ams: { country: "NL" },
        hanoi: { country: "VN" },
        zagreb: { country: "HR" },
      },
      budget: {
        countries: {
          NL: { livingPerDay: 30 },
          VN: { livingPerDay: 35 },
          HR: { livingPerDay: 25 },
        },
      },
      days: [
        {
          blocks: [
            ...(homeLeg
              ? [
                  {
                    type: "travel" as const,
                    to: "ams",
                    mode: "taxi",
                    estimatedCost: 40,
                  },
                ]
              : []),
            {
              type: "travel" as const,
              ...(homeLeg ? {} : { from: "ams" }),
              to: "hanoi",
              mode: "flight",
              start: "16:00",
              end: "09:00",
              endDay: 2,
            },
          ],
        },
        {},
        {},
        { blocks: [{ type: "travel", to: "zagreb", mode: "flight" }] },
      ],
    });
  const plain = overview(trip(), "", "countries");
  // Day 1 at Schiphol and the final day at home in Zagreb are ordinary life.
  assert.equal(plain.costs.living.value, 2 * 35);
  assert.equal(plain.costs.living.missing, 0);
  assert.deepEqual(
    plain.stays.map((row) => row.key),
    ["VN"],
  );
  assert.equal(plain.betweenNights, 1);
  assert.equal(plain.countries.get("VN")!.budgetDays, 2);
  // Something spent at home brings the country back as a row.
  const taxi = overview(trip(true), "", "countries");
  assert.equal(taxi.countries.get("NL")!.total.value, 40);
  assert.ok(taxi.stays.some((row) => row.key === "NL"));
  assert.equal(taxi.costs.living.value, 2 * 35);
});

test("a trip that starts at its destination counts its first day", () => {
  const model = normalizeTrip({
    version: 1,
    currency: "EUR",
    initialPlace: "tokyo",
    places: { tokyo: { country: "JP" } },
    budget: { countries: { JP: { livingPerDay: 40 } } },
    days: [{}, {}, {}],
  });
  assert.equal(overview(model).costs.living.value, 3 * 40);
});

test("country comparison gives each overnight journey's night to its country or to between countries", () => {
  const model = normalizeTrip({
    version: 1,
    currency: "EUR",
    initialPlace: "hanoi",
    places: {
      hanoi: { country: "VN", name: "Hanoi" },
      hue: { country: "VN", name: "Hue" },
      bangkok: { country: "TH", name: "Bangkok" },
    },
    bookings: [
      { type: "other", title: "eSIM", cost: { amount: 20, status: "paid" } },
    ],
    days: [
      {
        blocks: [
          {
            type: "travel",
            to: "hue",
            mode: "train",
            start: "22:00",
            end: "08:00",
            endDay: 2,
          },
        ],
      },
      {
        blocks: [
          {
            type: "travel",
            to: "bangkok",
            mode: "bus",
            estimatedCost: 30,
            start: "20:00",
            end: "10:00",
            endDay: 3,
          },
        ],
      },
      {},
      {},
    ],
  });
  const data = overview(model, "", "countries");
  assert.equal(data.stays.find((r) => r.key === "VN")!.nights, 1);
  assert.equal(
    data.stays.find((r) => r.key === "transit"),
    undefined,
  );
  assert.equal(data.betweenNights, 1);
  assert.equal(data.nights, 3);
  assert.deepEqual(
    data.betweenItems.map((item) => [item.label, item.cost.value]),
    [["Hue → Bangkok", 30]],
  );
  assert.deepEqual(
    data.expenseItems.map((item) => [item.label, item.cost.value]),
    [["eSIM", 20]],
  );
});
