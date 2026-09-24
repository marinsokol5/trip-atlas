import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip, parseTrip } from "./itinerary.ts";
import type { Booking, Trip, TravelBlock } from "./itinerary.ts";
import {
  bookingAllocation,
  bookingRange,
  bookingsOnDay,
  hasBookingContent,
  nightBookingsOnDay,
} from "./booking-model.ts";
import {
  averageLabel,
  combine,
  moneyLabel,
  overview,
} from "./overview-model.ts";

const fixture = (): Trip => ({
  version: 1,
  currency: "EUR",
  startDate: "2026-11-01",
  initialPlace: "tokyo",
  places: {
    tokyo: { name: "Tokyo", country: "JP" },
    hanoi: { name: "Hanoi", country: "VN" },
  },
  budget: {
    countries: {
      JP: { livingPerDay: 20, accommodationPerNight: 50 },
      VN: { livingPerDay: 10, accommodationPerNight: 30 },
    },
  },
  days: [
    {},
    {},
    {
      blocks: [
        {
          type: "travel",
          id: "japan-vietnam",
          to: "hanoi",
          mode: "flight",
          estimatedCost: 200,
        },
      ],
    },
    {},
  ],
});
const hotel = (): Booking => ({
  type: "accommodation",
  title: "Tokyo hotel",
  place: "tokyo",
  startDate: "2026-11-01",
  endDate: "2026-11-03",
  status: "confirmed",
  reference: "ABC-123",
  documents: [{ label: "Confirmation", path: "docs/hotel.pdf" }],
  cost: { amount: 80, status: "paid" },
});

test("legacy and empty optional content add no view; independent trip, day and travel docs do", () => {
  const trip = fixture();
  assert.equal(hasBookingContent(normalizeTrip(trip)), false);
  trip.bookings = [];
  trip.documents = [];
  assert.equal(hasBookingContent(normalizeTrip(trip)), false);
  trip.bookings = [{ type: "activity", title: "Museum" }];
  assert.equal(hasBookingContent(normalizeTrip(trip)), true);
  assert.equal(parseTrip(trip).bookings![0].status, undefined);
  delete trip.bookings;
  for (const owner of [
    trip,
    trip.days[0],
    trip.days[2].blocks![0] as TravelBlock,
  ]) {
    owner.documents = [{ label: "Local file", path: "docs/旅行 pass.JPG" }];
    assert.equal(hasBookingContent(normalizeTrip(trip)), true);
    owner.documents = [];
  }
});

test("a complete hotel stay replaces each night once and remains visible on checkout", () => {
  const trip = fixture();
  trip.bookings = [hotel()];
  const model = normalizeTrip(trip),
    data = overview(model);
  assert.equal(data.costs.accommodation.value, 110);
  assert.equal(data.costs.total.value, 370);
  assert.deepEqual(data.costs.accommodation.statuses, {
    paid: 80,
    estimated: 30,
  });
  assert.deepEqual(
    [1, 2, 3, 4].map((day) => bookingsOnDay(model, day).length),
    [1, 1, 1, 0],
  );
  // Calendar days show where you sleep that night, never the checkout stay.
  assert.deepEqual(
    [1, 2, 3, 4].map((day) => nightBookingsOnDay(model, day).length),
    [1, 1, 0, 0],
  );
  assert.equal(model.days[2].overnight, "hanoi");
  assert.equal(trip.bookings[0].documents!.length, 1);
  assert.deepEqual(bookingAllocation(trip.bookings[0], trip), {
    type: "accommodation",
    nights: [1, 2],
  });
});

test("reservation dates remain authored across trip date changes and undated trips", () => {
  const trip = fixture();
  trip.bookings = [hotel()];
  trip.startDate = "2026-10-31";
  // The fixed hotel dates now point at nights 2 and 3; the changed plan must agree.
  trip.days = [{}, {}, {}, {}];
  const model = normalizeTrip(trip);
  assert.deepEqual(bookingRange(trip.bookings[0], trip), { start: 2, end: 4 });
  assert.deepEqual(
    [1, 2, 3, 4].map((day) => bookingsOnDay(model, day).length),
    [0, 1, 1, 1],
  );
  assert.equal(model.trip.bookings![0].startDate, "2026-11-01");
  delete trip.startDate;
  const undated = normalizeTrip(trip);
  assert.equal(overview(undated).unallocatedBookings.value, 80);
  assert.equal(bookingsOnDay(undated, 1).length, 0);
});

test("mixed booking costs replace distinct estimates, reconcile countries, and retain partial budgets", () => {
  const trip = fixture();
  trip.bookings = [
    hotel(),
    {
      type: "transport",
      title: "Flight",
      cost: {
        amount: 100,
        status: "confirmed",
        allocation: { type: "transport", leg: "japan-vietnam" },
      },
    },
    {
      type: "activity",
      title: "Whole day allowance",
      cost: { amount: 30, allocation: { type: "living", days: [2] } },
    },
    {
      type: "activity",
      title: "Museum outside daily budget",
      cost: {
        amount: 15,
        status: "paid",
        allocation: { type: "additional", day: 3 },
      },
    },
    {
      type: "activity",
      title: "Unassigned idea",
      cost: { amount: 999, status: "confirmed" },
    },
  ];
  const model = normalizeTrip(trip),
    data = overview(model);
  assert.equal(data.costs.total.value, 295);
  assert.deepEqual(data.costs.total.statuses, {
    estimated: 100,
    paid: 95,
    confirmed: 100,
  });
  assert.equal(data.unallocatedBookings.value, 999);
  assert.equal(data.countries.get("JP")!.total.value, 130);
  assert.equal(data.countries.get("VN")!.total.value, 65);
  assert.equal(data.betweenCountries.value, 100);
  assert.equal(averageLabel(data.countries.get("JP")!.total, 2, "EUR"), "~€65");
  assert.deepEqual(
    combine(
      ...[...data.countries.values()].map((country) => country.total),
      data.betweenCountries,
    ),
    data.costs.total,
  );
  for (const country of ["JP", "VN"])
    assert.deepEqual(
      overview(model, country).costs.total,
      data.countries.get(country)!.total,
    );
  assert.equal(overview(model, "VN", "places").stays[0].cost.value, 65);
  delete trip.budget!.countries.VN;
  const partial = overview(normalizeTrip(trip));
  assert.equal(partial.costs.total.missing, 3);
  assert.match(moneyLabel(partial.costs.total, "EUR"), /\+$/);
});

test("other expenses and bare-number costs count once in the whole-trip total only", () => {
  const trip = fixture();
  trip.bookings = [
    { type: "other", title: "eSIM", cost: 80 },
    { type: "other", title: "Visa", cost: { amount: 25, status: "paid" } },
    { type: "other", title: "Dropped plan", status: "cancelled", cost: 999 },
  ] as unknown as Booking[];
  const model = normalizeTrip(trip),
    data = overview(model);
  assert.deepEqual(model.trip.bookings![0].cost, { amount: 80 });
  assert.equal(data.costs.expenses.value, 105);
  assert.deepEqual(data.costs.expenses.statuses, { estimated: 80, paid: 25 });
  assert.equal(data.costs.total.value, 390 + 105);
  assert.equal(data.unallocatedBookings.known, 0);
  assert.equal(overview(model, "JP").costs.expenses.known, 0);
  assert.equal(overview(model, "JP").costs.total.value, 140);
  assert.equal(bookingsOnDay(model, 1).length, 0);
  trip.bookings = [
    {
      type: "other",
      title: "eSIM",
      cost: { amount: 80, allocation: { type: "additional", day: 1 } },
    },
  ];
  assert.throws(() => parseTrip(trip), /omit allocation/);
  trip.bookings = [
    { type: "other", title: "eSIM", cost: -1 },
  ] as unknown as Booking[];
  assert.throws(() => parseTrip(trip), /bookings\[0\]\.cost: expected a finite/);
});

test("zero overrides known and unknown estimates; exact status removes approximation", () => {
  const trip = fixture();
  trip.days = [{}, {}];
  delete trip.budget;
  trip.bookings = [
    {
      type: "accommodation",
      title: "Free stay",
      cost: {
        amount: 0,
        status: "paid",
        allocation: { type: "accommodation", nights: [1] },
      },
    },
    {
      type: "activity",
      title: "Full daily budget",
      cost: {
        amount: 0,
        status: "confirmed",
        allocation: { type: "living", days: [1, 2] },
      },
    },
  ];
  const data = overview(normalizeTrip(trip));
  assert.equal(data.hasBudget, true);
  assert.equal(data.costs.total.missing, 0);
  assert.equal(moneyLabel(data.costs.total, "EUR"), "€0");
  assert.deepEqual(data.costs.total.statuses, { confirmed: 0, paid: 0 });
  delete trip.bookings[0].cost!.status;
  const estimated = overview(normalizeTrip(trip));
  assert.equal(moneyLabel(estimated.costs.total, "EUR"), "~€0");
  assert.equal(normalizeTrip(trip).trip.bookings![0].status, undefined);
});

test("duplicate overrides fail deterministically; cancelled costs release estimates", () => {
  for (const allocation of [
    { type: "accommodation", nights: [1] },
    { type: "living", days: [1] },
    { type: "transport", leg: "japan-vietnam" },
  ] as const) {
    const trip = fixture();
    const type = allocation.type === "living" ? "activity" : allocation.type;
    const b = {
      type,
      title: "First",
      cost: { amount: 0, allocation },
    } as Booking;
    trip.bookings = [b, structuredClone(b)];
    assert.throws(
      () => normalizeTrip(trip),
      /already replaced by bookings\[0\]/,
    );
    trip.bookings[0].status = "cancelled";
    assert.doesNotThrow(() => normalizeTrip(trip));
    trip.bookings[1].status = "cancelled";
    assert.equal(
      overview(normalizeTrip(trip)).costs.total.value,
      overview(normalizeTrip(fixture())).costs.total.value,
    );
  }
});

test("stable travel IDs distinguish repeated routes, include zero walking fees, and retain unknown endpoints", () => {
  const trip = fixture();
  trip.days[3].blocks = [
    {
      type: "travel",
      id: "second",
      from: "tokyo",
      to: "hanoi",
      mode: "walk",
      estimatedCost: 60,
    },
  ];
  trip.bookings = [
    {
      type: "transport",
      title: "Second only",
      cost: {
        amount: 0,
        status: "paid",
        allocation: { type: "transport", leg: "second" },
      },
    },
  ];
  const data = overview(normalizeTrip(trip));
  assert.equal(data.betweenCountries.value, 200);
  assert.equal(data.costs.other.known, 1);
  assert.equal(data.costs.other.value, 0);
  delete trip.places.hanoi.country;
  assert.equal(overview(normalizeTrip(trip)).unassigned.value, 200);
});

test("range, allocation, identity, status and new document validation give field errors", () => {
  const invalid = [
    { title: "", type: "activity" },
    { title: "x", type: "hotel" },
    { title: "x", type: "activity", status: "paid" },
    { title: "x", type: "activity", place: "missing" },
    { title: "x", type: "activity", startDate: "2026-02-30" },
    { title: "x", type: "activity", startDate: "2026-11-01", startDay: 1 },
    { title: "x", type: "accommodation", startDay: 2, endDay: 2 },
    { title: "x", type: "activity", cost: {} },
    { title: "x", type: "activity", cost: { amount: -1 } },
    { title: "x", type: "activity", cost: { amount: 1, status: "booked" } },
    {
      title: "x",
      type: "activity",
      cost: { amount: 1, allocation: { type: "living", days: [1, 1] } },
    },
    {
      title: "x",
      type: "activity",
      cost: { amount: 1, allocation: { type: "living", days: [5] } },
    },
    {
      title: "x",
      type: "accommodation",
      cost: { amount: 1, allocation: { type: "accommodation", nights: [4] } },
    },
    {
      title: "x",
      type: "transport",
      cost: { amount: 1, allocation: { type: "transport", leg: "unknown" } },
    },
    {
      title: "x",
      type: "activity",
      cost: {
        amount: 1,
        allocation: { type: "transport", leg: "japan-vietnam" },
      },
    },
    {
      title: "x",
      type: "activity",
      cost: {
        amount: 1,
        allocation: { type: "additional", day: 1, nights: [1] },
      },
    },
    {
      title: "x",
      type: "activity",
      documents: [{ label: "Pass", path: "../pass.pdf" }],
    },
  ];
  for (const booking of invalid)
    assert.throws(
      () => normalizeTrip({ ...fixture(), bookings: [booking] }),
      /bookings\[0\]/,
      JSON.stringify(booking),
    );
  assert.throws(
    () =>
      normalizeTrip({
        ...fixture(),
        documents: [{ label: "Pass", path: "https://example.com/pass" }],
      }),
    /documents\[0\].path/,
  );
  const trip = fixture();
  trip.bookings = [hotel()];
  delete trip.currency;
  assert.throws(() => normalizeTrip(trip), /currency/);
  trip.currency = "EUR";
  (trip.days[2].blocks![0] as TravelBlock).id = "duplicate";
  trip.days[3].blocks = [{ type: "travel", id: "duplicate", to: "tokyo" }];
  assert.throws(() => normalizeTrip(trip), /duplicate travel ID/);
});

test("hotel allocation never claims transit, checkout, mismatched places or drifting date ranges", () => {
  const trip = fixture();
  trip.bookings = [hotel()];
  trip.bookings[0].cost!.allocation = { type: "accommodation", nights: [1] };
  assert.throws(() => normalizeTrip(trip), /agree with.*check-in/);
  delete trip.bookings[0].cost!.allocation;
  trip.bookings[0].place = "hanoi";
  assert.throws(() => normalizeTrip(trip), /overnight place does not match/);
  trip.bookings[0].cost!.allocation = { type: "unallocated" };
  assert.equal(overview(normalizeTrip(trip)).unallocatedBookings.value, 80);
  const transit = fixture();
  transit.days[0].blocks = [{ type: "travel", to: "tokyo", endDay: 2 }];
  transit.bookings = [
    {
      type: "accommodation",
      title: "Hotel",
      cost: { amount: 10, allocation: { type: "accommodation", nights: [1] } },
    },
  ];
  assert.throws(() => normalizeTrip(transit), /in transit/);
  transit.bookings[0].status = "cancelled";
  assert.doesNotThrow(() => normalizeTrip(transit));
});

test("partial/outside dates stay visible as authored without clipping booking amounts", () => {
  const trip = fixture();
  trip.bookings = [hotel()];
  trip.bookings[0].startDate = "2026-10-30";
  const data = overview(normalizeTrip(trip));
  assert.equal(data.unallocatedBookings.value, 80);
  assert.equal(data.costs.accommodation.value, 130);
  delete trip.bookings[0].startDate;
  assert.equal(bookingsOnDay(normalizeTrip(trip), 3).length, 1);
  assert.equal(bookingsOnDay(normalizeTrip(trip), 2).length, 0);
});

test("partial accommodation endpoints retain linked nights and checkout relevance", () => {
  for (const dates of [{ startDate: "2026-11-01" }, { endDate: "2026-11-03" }]) {
    const trip = fixture();
    trip.bookings = [{ type: "accommodation", title: "Partial dates", ...dates,
      cost: { amount: 40, allocation: { type: "accommodation", nights: [1, 2] } } }];
    const model = normalizeTrip(trip);
    assert.deepEqual([1, 2, 3, 4].map(day => bookingsOnDay(model, day).length), [1, 1, 1, 0]);
    assert.deepEqual([1, 2, 3, 4].map(day => nightBookingsOnDay(model, day).length), [1, 1, 0, 0]);
  }
});
