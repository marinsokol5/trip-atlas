import test from "node:test";
import assert from "node:assert/strict";
import { orderStayRows, parseStaySort } from "./overview-presentation.ts";
import type { Amount, StayRow } from "./overview-model.ts";

const amount = (value: number, known = 1, missing = 0): Amount => ({
  value,
  known,
  missing,
  estimated: true,
});
const rows: StayRow[] = [
  {
    key: "JP",
    name: "Japan",
    color: "red",
    days: 25,
    nights: 23,
    cost: amount(300),
  },
  {
    key: "VN",
    name: "Vietnam",
    color: "green",
    days: 11,
    nights: 9,
    cost: amount(100),
  },
  {
    key: "TH",
    name: "Thailand",
    color: "blue",
    days: 11,
    nights: 9,
    cost: amount(0),
  },
  {
    key: "TW",
    name: "Taiwan",
    color: "purple",
    days: 6,
    nights: 4,
    cost: amount(0, 0, 4),
  },
  {
    key: "transit",
    name: "In transit",
    color: "gray",
    days: 2,
    nights: 2,
    cost: amount(0, 0),
  },
];
const countries = new Map([
  ["JP", { total: amount(300), budgetDays: 3 }],
  ["VN", { total: amount(200, 1, 1), budgetDays: 1 }],
  ["TH", { total: amount(0), budgetDays: 2 }],
  ["TW", { total: amount(0, 0, 4), budgetDays: 4 }],
]);
const keys = (result: StayRow[]) => result.map((row) => row.key);

test("stay sorting uses totals and allocated daily averages, not touched dates", () => {
  assert.deepEqual(
    keys(
      orderStayRows(rows, countries, { key: "total", direction: "descending" }),
    ),
    ["JP", "VN", "TH", "TW", "transit"],
  );
  assert.deepEqual(
    keys(
      orderStayRows(rows, countries, {
        key: "average",
        direction: "descending",
      }),
    ),
    ["VN", "JP", "TH", "TW", "transit"],
  );
  assert.deepEqual(
    keys(
      orderStayRows(rows, countries, {
        key: "average",
        direction: "ascending",
      }),
    ),
    ["TH", "JP", "VN", "TW", "transit"],
  );
  assert.deepEqual(keys(rows), ["JP", "VN", "TH", "TW", "transit"]);
});

test("night sorting is stable and zero-day daily averages stay unavailable", () => {
  assert.deepEqual(
    keys(
      orderStayRows(rows, countries, { key: "nights", direction: "ascending" }),
    ),
    ["transit", "TW", "VN", "TH", "JP"],
  );
  const zeroDays = new Map(countries);
  zeroDays.set("TH", { total: amount(50), budgetDays: 0 });
  assert.deepEqual(
    keys(
      orderStayRows(rows, zeroDays, { key: "average", direction: "ascending" }),
    ),
    ["JP", "VN", "TH", "TW", "transit"],
  );
});

test("saved sort preferences validate keys and directions", () => {
  const fallback = { key: "nights", direction: "descending" };
  for (const raw of [
    null,
    "broken",
    "[]",
    '{"key":"cost","direction":"ascending"}',
    '{"key":"total","direction":"sideways"}',
  ])
    assert.deepEqual(parseStaySort(raw), fallback);
  assert.deepEqual(parseStaySort('{"key":"average","direction":"ascending"}'), {
    key: "average",
    direction: "ascending",
  });
});
