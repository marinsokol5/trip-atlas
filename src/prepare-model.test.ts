import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrip } from "./itinerary.ts";
import type { Trip, TripPreparation } from "./itinerary.ts";
import { hasPreparationContent, preparationLists } from "./prepare-model.ts";
import {
  activeTripView,
  availableTripViews,
  parseTripView,
} from "./trip-view.ts";

const fixture = (prepare?: TripPreparation): Trip => ({
  version: 1,
  places: {},
  days: [{}],
  ...(prepare === undefined ? {} : { prepare }),
});

test("preparation is optional; only populated lists expose the view", () => {
  for (const prepare of [
    undefined,
    {},
    { checklist: [] },
    { packing: [] },
    { checklist: [], packing: [] },
  ]) {
    const model = normalizeTrip(fixture(prepare));
    assert.equal(hasPreparationContent(model), false);
    assert.deepEqual(availableTripViews(model), [
      "overview",
      "map",
      "calendar",
    ]);
  }
  for (const prepare of [
    { checklist: [{ title: "Demo task" }] },
    { packing: [{ title: "Demo item" }] },
    {
      checklist: [{ title: "Demo task", done: true }],
      packing: [{ title: "Demo item", packed: true }],
    },
  ]) {
    const model = normalizeTrip(fixture(prepare));
    assert.equal(hasPreparationContent(model), true);
    assert.equal(availableTripViews(model).at(-1), "prepare");
  }
});

test("completed tasks retain their authored ranks and do not reorder outstanding work", () => {
  const prepare: TripPreparation = {
    checklist: [
      { title: "First", done: true, notes: "A demo note" },
      { title: "Second" },
      { title: "Third", done: false },
    ],
  };
  const before = structuredClone(prepare);
  const list = preparationLists(normalizeTrip(fixture(prepare)).trip.prepare!);
  assert.deepEqual(
    list.checklist.map(({ item, rank }) => [item.title, rank]),
    [
      ["First", 1],
      ["Second", 2],
      ["Third", 3],
    ],
  );
  assert.equal(list.checklistRemaining, 2);
  assert.equal(list.checklist[1].item.done, undefined);
  assert.deepEqual(prepare, before);
  const allDone = preparationLists({
    checklist: prepare.checklist!.map((item) => ({ ...item, done: true })),
  });
  assert.equal(allDone.checklistRemaining, 0);
  assert.deepEqual(
    allDone.checklist.map(({ rank }) => rank),
    [1, 2, 3],
  );
  assert.equal(allDone.checklist.length, 3);
});

test("packing groups follow first appearance and preserve item order, quantities and statuses", () => {
  const prepare: TripPreparation = {
    packing: [
      { title: "Pencils", category: "Sketching", quantity: 3, packed: true },
      { title: "Pouch" },
      { title: "Cap", category: "Clothing", quantity: 1, packed: false },
      { title: "Paper", category: "Sketching", notes: "Fictional supplies" },
      { title: "Clips", quantity: 6 },
    ],
  };
  const before = structuredClone(prepare);
  const lists = preparationLists(prepare);
  assert.deepEqual(
    lists.packingGroups.map(({ category, items }) => [
      category,
      items.map((item) => item.title),
    ]),
    [
      ["Sketching", ["Pencils", "Paper"]],
      [undefined, ["Pouch", "Clips"]],
      ["Clothing", ["Cap"]],
    ],
  );
  assert.equal(lists.packingRemaining, 4); // Entries, not a guessed or summed quantity.
  assert.equal(lists.packingGroups[0].items[0].quantity, 3);
  assert.equal(lists.packingGroups[1].items[0].quantity, undefined);
  assert.equal(lists.packingGroups[1].items[0].packed, undefined);
  assert.deepEqual(prepare, before);
  const packed = preparationLists({
    packing: prepare.packing!.map((item) => ({ ...item, packed: true })),
  });
  assert.equal(packed.packingRemaining, 0);
  assert.equal(packed.packingGroups.flatMap((group) => group.items).length, 5);
});

test("invalid preparation gives precise JSON paths without coercing values", () => {
  const cases: [unknown, string][] = [
    [null, "prepare:"],
    [[], "prepare:"],
    ["tasks", "prepare:"],
    [{ checklist: {} }, "prepare.checklist:"],
    [{ packing: null }, "prepare.packing:"],
    [{ checklist: [null] }, "prepare.checklist[0]:"],
    [{ packing: ["hat"] }, "prepare.packing[0]:"],
    [{ checklist: [{}] }, "prepare.checklist[0].title:"],
    [{ packing: [{ title: "  " }] }, "prepare.packing[0].title:"],
    [
      { checklist: [{ title: "Task", done: "true" }] },
      "prepare.checklist[0].done:",
    ],
    [{ packing: [{ title: "Item", packed: 1 }] }, "prepare.packing[0].packed:"],
    [
      { packing: [{ title: "Item", packed: null }] },
      "prepare.packing[0].packed:",
    ],
    [
      { checklist: [{ title: "Task", notes: "" }] },
      "prepare.checklist[0].notes:",
    ],
    [{ packing: [{ title: "Item", notes: [] }] }, "prepare.packing[0].notes:"],
    [
      { packing: [{ title: "Item", category: " " }] },
      "prepare.packing[0].category:",
    ],
    ...[0, -1, 1.5, "2", null, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].map(
      (quantity): [unknown, string] => [
        { packing: [{ title: "Item", quantity }] },
        "prepare.packing[0].quantity:",
      ],
    ),
  ];
  for (const [prepare, path] of cases) {
    assert.throws(
      () => normalizeTrip({ ...fixture(), prepare }),
      (error: Error) => {
        assert.ok(error.message.startsWith(path), error.message);
        return true;
      },
    );
  }
});

test("saved Prepare falls back for empty alternatives and returns when content exists", () => {
  const preferred = parseTripView("prepare");
  const prepared = normalizeTrip(
    fixture({ packing: [{ title: "Sample", packed: true }] }),
  );
  const empty = normalizeTrip(fixture({}));
  assert.equal(activeTripView(preferred, prepared), "prepare");
  assert.equal(activeTripView(preferred, empty), "overview");
  assert.equal(activeTripView(preferred), "overview");
  assert.equal(activeTripView(preferred, prepared), "prepare");
  for (const saved of [null, "unknown", "", "Prepare"]) {
    assert.equal(parseTripView(saved), "overview");
  }
  for (const saved of [
    "overview",
    "map",
    "calendar",
    "bookings",
    "prepare",
  ] as const) {
    assert.equal(parseTripView(saved), saved);
  }
  const booked = normalizeTrip({
    ...fixture(),
    bookings: [{ type: "activity", title: "Demo booking" }],
  });
  assert.equal(activeTripView("bookings", booked), "bookings");
  assert.equal(activeTripView("bookings", empty), "overview");
  assert.equal(activeTripView("map", empty), "map");
  assert.equal(activeTripView("calendar", empty), "calendar");
});
