import type { Amount, StayRow } from "./overview-model.ts";

export type StaySortKey = "nights" | "total" | "average";
export interface StaySort {
  key: StaySortKey;
  direction: "ascending" | "descending";
}
export const defaultStaySort: StaySort = {
  key: "nights",
  direction: "descending",
};

export function parseStaySort(raw: string | null): StaySort {
  try {
    const value = JSON.parse(raw ?? "null");
    if (
      value &&
      ["nights", "total", "average"].includes(value.key) &&
      ["ascending", "descending"].includes(value.direction)
    )
      return { key: value.key, direction: value.direction };
  } catch {
    /* A corrupt saved preference must not prevent opening the trip. */
  }
  return defaultStaySort;
}

/** Sort supplied estimates; keep unknown values last in either direction. */
export function orderStayRows(
  rows: readonly StayRow[],
  countries: ReadonlyMap<string, { total: Amount; budgetDays: number }>,
  sort: StaySort,
): StayRow[] {
  const value = (row: StayRow): number | undefined => {
    if (sort.key === "nights") return row.nights;
    const cost =
      row.key !== "unknown" && row.key !== "transit"
        ? countries.get(row.key)
        : undefined;
    if (!cost || (!cost.total.known && cost.total.missing)) return undefined;
    if (sort.key === "average" && !cost.budgetDays) return undefined;
    const result =
      sort.key === "average"
        ? cost.total.value / cost.budgetDays
        : cost.total.value;
    return Number.isFinite(result) ? result : undefined;
  };
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => {
      if (a.value === undefined)
        return b.value === undefined ? a.index - b.index : 1;
      if (b.value === undefined) return -1;
      return (
        (sort.direction === "ascending"
          ? a.value - b.value
          : b.value - a.value) || a.index - b.index
      );
    })
    .map(({ row }) => row);
}
