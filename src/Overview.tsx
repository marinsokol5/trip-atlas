import { Fragment, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  ArrowLeft,
  CalendarRange,
  Hourglass,
  Plane,
  TrainFront,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Itinerary } from "./itinerary";
import type { Amount } from "./overview-model";
import { CostBreakdown } from "./CostBreakdown";
import { areaDays, dateLabel, mapAreas } from "./view-model";
import {
  averageLabel,
  combine,
  countryColor,
  costStatusAmounts,
  headlineTimeLabel,
  moneyLabel,
  overview,
  timeLabel,
} from "./overview-model";
import {
  defaultStaySort,
  orderStayRows,
  parseStaySort,
} from "./overview-presentation";
import type { StaySortKey } from "./overview-presentation";

/** One summary figure: an icon says what it is before any label is read. */
function SummaryTile({
  icon: Icon,
  value,
  label,
  title,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  title?: string;
}) {
  return (
    <div className="overview-tile" title={title}>
      <span className="overview-tile-icon" aria-hidden="true">
        <Icon strokeWidth={1.8} />
      </span>
      <span>
        <strong>{value}</strong>
        <span>{label}</span>
      </span>
    </div>
  );
}

export function Overview({
  model,
  country,
  onSelectCountry,
}: {
  model: Itinerary;
  country: string;
  onSelectCountry: (country: string) => void;
}) {
  const areas = mapAreas(model);
  const visitedCountries = new Set(areas.map((area) => area.country));
  const canCompareCountries = !country && areas.length > 1;
  const breakdown = canCompareCountries ? "countries" : "places";
  const [costView, setCostView] = useState<"country" | "category">("country");
  const data = overview(model, country, breakdown);
  const currency = model.trip.currency;
  const showCosts = data.hasBudget;
  const showSeparateCosts =
    showCosts || data.betweenCountries.known > 0 || data.unassigned.known > 0;
  const countryCosts =
    breakdown === "countries" &&
    data.stays.some(
      (row) =>
        row.key !== "unknown" &&
        (data.countries.get(row.key)?.total.known ?? 0) > 0,
    );
  const extraBuckets = [
    ["Between countries", data.betweenCountries],
    ["Unassigned", data.unassigned],
  ] as const;
  const unallocatedCost = data.costs.unallocated.known > 0;
  const [preferredSort, setSort] = useState(() => {
    try {
      return parseStaySort(
        window.localStorage.getItem("trip-atlas-overview-sort"),
      );
    } catch {
      return defaultStaySort;
    }
  });
  const sort =
    countryCosts || preferredSort.key === "nights"
      ? preferredSort
      : defaultStaySort;
  const rows = orderStayRows(data.stays, data.countries, sort);
  const hasNights = data.nights > 0;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleCountry = (code: string) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  const costColumns = countryCosts || data.hasStayCosts;
  const percent = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
  // Every breakdown row: Cost, Cost %, Nights, Nights %, Avg/day (as the table has them).
  const rowCells = ({
    cost,
    nights,
    days = 0,
  }: {
    cost?: Amount;
    nights?: number;
    days?: number;
  }) => (
    <>
      {costColumns && <td>{cost ? moneyLabel(cost, currency) : "—"}</td>}
      {countryCosts && (
        <td className="overview-share">
          {cost && cost.value > 0
            ? percent(cost.value, data.costs.total.value)
            : "—"}
        </td>
      )}
      <td hidden={!hasNights}>{nights ?? "—"}</td>
      <td hidden={!hasNights} className="overview-share">
        {nights !== undefined ? percent(nights, data.nights) : "—"}
      </td>
      {countryCosts && (
        <td>{cost && days ? averageLabel(cost, days, currency) : "—"}</td>
      )}
    </>
  );
  // A country opens in place into the places its Area view lists, plus travel within it.
  const countryPlaces = (code: string) => {
    const scoped = overview(model, code, "places");
    // Stops with no night and nothing spent there say nothing about where money goes.
    const places = scoped.stays.filter(
      (place) => place.nights > 0 || place.cost.known || place.cost.missing,
    );
    const costs = new Map(
      places.map((place) => [
        place.key,
        { total: place.cost, budgetDays: place.days },
      ]),
    );
    const transport = scoped.costs.transport;
    return (
      <>
        {orderStayRows(places, costs, sort).map((place, index) => (
          <tr
            key={place.key}
            id={index ? undefined : `overview-places-${code}`}
            className={`overview-subrow${place.nights === 0 ? " overview-day-visit" : ""}`}
          >
            <th scope="row">
              <span className="overview-place">
                <i style={{ backgroundColor: place.color }} />
                <span className="overview-place-name">{place.name}</span>
              </span>
            </th>
            {rowCells({
              cost: place.cost,
              nights: place.nights,
              days: place.days,
            })}
          </tr>
        ))}
        {(transport.known > 0 || transport.missing > 0) && (
          <tr className="overview-subrow overview-day-visit">
            <th scope="row">
              <span className="overview-place">
                <i />
                <span className="overview-place-name">Getting around</span>
              </span>
            </th>
            {rowCells({ cost: transport })}
          </tr>
        )}
      </>
    );
  };
  // A footer total that opens in place into the journeys or expenses it adds up.
  const bucketRow = (
    key: string,
    label: string,
    cost: Amount,
    items: { label: string; cost: Amount }[],
    nights = 0,
  ) => (
    <>
      <tr
        {...costHover(key)}
        className={`overview-bucket ${costHover(key).className ?? ""}`}
      >
        <th scope="row">
          <button
            className="overview-place overview-country-link"
            type="button"
            aria-expanded={expanded.has(key)}
            aria-controls={`overview-items-${key}`}
            onClick={() => toggleCountry(key)}
          >
            <i
              style={{
                backgroundColor:
                  key === "between" ? "var(--transit)" : "var(--cost-other)",
              }}
            />
            <span className="overview-place-name">{label}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        </th>
        {rowCells({ cost, nights: nights || undefined })}
      </tr>
      {expanded.has(key) &&
        [...items]
          .sort((a, b) => b.cost.value - a.cost.value)
          .map((item, index) => (
            <tr
              key={`${item.label}-${index}`}
              id={index ? undefined : `overview-items-${key}`}
              className="overview-subrow"
            >
              <th scope="row">
                <span className="overview-place-name">{item.label}</span>
              </th>
              {rowCells({ cost: item.cost })}
            </tr>
          ))}
    </>
  );
  const byCountry = countryCosts && costView === "country";
  const [activeCost, setActiveCost] = useState<string>();
  // Breakdown rows light up their donut slice, and the other way round.
  // The table reads the row under the pointer, so rows without a slice clear it.
  const costHover = (key: string) =>
    byCountry
      ? {
          "data-cost-key": key,
          className: activeCost === key ? "is-active" : undefined,
        }
      : {};
  // Countries in visit order, then what belongs to none; together they make the trip total.
  const countrySlices = [
    ...[...data.countries]
      .filter(([code, value]) => code !== "unknown" && value.total.value > 0)
      .sort(
        ([a], [b]) =>
          areas.findIndex((area) => area.country === a) -
          areas.findIndex((area) => area.country === b),
      )
      .map(([code, value]) => ({
        key: code,
        label:
          areas.find((area) => area.country === code)?.name ??
          new Intl.DisplayNames(["en"], { type: "region" }).of(code) ??
          code,
        cost: value.total,
        color: countryColor(code),
      })),
    {
      key: "between",
      label: "Between countries",
      cost: data.betweenCountries,
      color: "var(--transit)",
    },
    {
      key: "unassigned",
      label: "Unassigned",
      cost: data.unassigned,
      color: "#96929a",
    },
    {
      key: "expenses",
      label: "Other expenses",
      cost: data.costs.expenses,
      color: "var(--cost-other)",
    },
  ];
  const placeCostLabel = data.costs.activities.known
    ? "Living + stay + activities"
    : hasNights
      ? "Living + stay"
      : "Living";
  const mixedStatuses =
    data.costs.total.statuses?.confirmed !== undefined ||
    data.costs.total.statuses?.paid !== undefined;
  const statuses = costStatusAmounts(data.costs.total);
  const statusTotals = [
    [
      "Estimated",
      combine(...statuses.filter(([s]) => s === "estimated").map(([, a]) => a)),
    ],
    [
      "Confirmed",
      combine(...statuses.filter(([s]) => s !== "estimated").map(([, a]) => a)),
    ],
  ] as const;
  const hasExpenses = data.costs.expenses.known > 0;
  const sortColumn = (key: StaySortKey) => {
    const next = {
      key,
      direction:
        sort.key === key && sort.direction === "descending"
          ? ("ascending" as const)
          : ("descending" as const),
    };
    setSort(next);
    try {
      window.localStorage.setItem(
        "trip-atlas-overview-sort",
        JSON.stringify(next),
      );
    } catch {
      /* Sorting remains usable without storage. */
    }
  };
  const sortHeading = (key: StaySortKey, label: string, hidden = false) => {
    const active = sort.key === key;
    const SortIcon = active
      ? sort.direction === "descending"
        ? ArrowDown
        : ArrowUp
      : ArrowUpDown;
    return (
      <th hidden={hidden} aria-sort={active ? sort.direction : "none"}>
        {rows.length > 1 ? (
          <button
            className="overview-sort"
            type="button"
            onClick={() => sortColumn(key)}
            aria-label={`Sort by ${key === "average" ? "average daily cost" : key === "total" ? "total cost" : "nights"}`}
            title={`Sort ${active && sort.direction === "descending" ? "ascending" : "descending"} by ${key === "nights" ? "nights" : "the supplied estimate"}`}
          >
            {label}
            <SortIcon className="overview-sort-icon" aria-hidden="true" />
          </button>
        ) : (
          label
        )}
      </th>
    );
  };
  const scopeDays = areaDays(model, country);
  const dateRange =
    scopeDays[0]?.date && scopeDays.at(-1)?.date
      ? `${dateLabel(scopeDays[0].date)} – ${dateLabel(scopeDays.at(-1)!.date!, { day: "numeric", month: "short", year: "numeric" })}`
      : undefined;
  const travelItems = [
    ["Flights", data.times.flights],
    ["Other transport", data.times.other],
  ] as const;
  const applicableTravel = travelItems.filter(
    ([, value]) => value.known || value.missing,
  );
  // Fixed order: it sets each category's color and its place around the donut.
  const costItems = [
    ["living", "Living", data.costs.living],
    ["accommodation", "Accommodation", data.costs.accommodation],
    ["activities", "Additional activities", data.costs.activities],
    ["flights", country ? "Domestic flights" : "Flights", data.costs.flights],
    [
      "transport",
      country ? "In-country transport" : "Other transport",
      data.costs.other,
    ],
    ["expenses", "Other expenses", data.costs.expenses],
    ...(unallocatedCost
      ? [["mixed", "Mixed transport", data.costs.unallocated] as const]
      : []),
  ] as const;
  return (
    <section className="overview-view" aria-label="Overview view">
      {country && areas.length > 1 && (
        <button
          className="overview-back"
          type="button"
          onClick={() => onSelectCountry("")}
        >
          <ArrowLeft aria-hidden="true" />
          Whole trip
        </button>
      )}
      <div className="overview-headlines">
        {dateRange && (
          <SummaryTile icon={CalendarRange} value={dateRange} label="Dates" />
        )}
        <SummaryTile
          icon={Hourglass}
          value={`${data.days} ${data.days === 1 ? "day" : "days"}`}
          label={
            hasNights
              ? `${data.nights} ${data.nights === 1 ? "night" : "nights"}`
              : "No overnight stays"
          }
        />
        {applicableTravel.map(([label, value]) => (
          <SummaryTile
            key={label}
            icon={label === "Flights" ? Plane : TrainFront}
            value={headlineTimeLabel(value)}
            label={label === "Flights" ? "Flying" : "Other transport"}
            title={`${timeLabel(value)} ${label.toLowerCase()}`}
          />
        ))}
      </div>
      {/* Wide screens fit the Overview to the window: costs on the left, breakdown on the right. */}
      <div className="overview-columns">
        <div className="overview-column">
          {!showCosts && (
            <p className="overview-budget-empty">
              {country
                ? data.costs.total.missing
                  ? "Country budget not provided"
                  : "No in-country costs"
                : "Budget not provided"}
            </p>
          )}
          {showCosts && (
            <section
              className="overview-cost-categories"
              aria-labelledby="cost-categories-heading"
            >
              <div className="overview-stay-heading">
                <h2 id="cost-categories-heading">Cost</h2>
                {countryCosts && (
                  <div className="overview-toggle" aria-label="Group costs by">
                    {(["country", "category"] as const).map((option) => (
                      <button
                        key={option}
                        aria-pressed={costView === option}
                        onClick={() => setCostView(option)}
                      >
                        {option === "country" ? "Country" : "Category"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <CostBreakdown
                key={byCountry ? "country" : "category"}
                categories={
                  byCountry
                    ? countrySlices
                    : costItems.map(([key, label, cost], index) => ({
                        key,
                        label,
                        cost,
                        color: `var(--cost-${index + 1})`,
                      }))
                }
                total={data.costs.total}
                currency={currency}
                heading={byCountry ? "Country" : "Category"}
                table={!byCountry}
                active={byCountry ? activeCost : undefined}
                onActive={byCountry ? setActiveCost : undefined}
              />
            </section>
          )}
          {data.unallocatedBookings.known > 0 && (
            <section
              className="overview-unallocated-bookings"
              aria-label="Unallocated booking costs"
              title="Not in the total until linked to an estimate"
            >
              Unallocated booking costs
              <strong>{moneyLabel(data.unallocatedBookings, currency)}</strong>
            </section>
          )}
          {showSeparateCosts &&
            (country || !countryCosts) &&
            extraBuckets.some(([, cost]) => cost.known || cost.missing) && (
              <div
                className="overview-costs overview-cost-buckets"
                aria-label="Separate travel costs"
              >
                {extraBuckets
                  .filter(([, cost]) => cost.known || cost.missing)
                  .map(([label, cost]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{moneyLabel(cost, currency)}</strong>
                    </div>
                  ))}
              </div>
            )}
        </div>
        <section className="overview-stays" aria-labelledby="stays-heading">
          <div className="overview-stay-heading">
            <div>
              <h2 id="stays-heading">
                {countryCosts
                  ? "Breakdown"
                  : hasNights
                    ? "Where you’ll stay"
                    : "Places visited"}
              </h2>
            </div>
          </div>
          <div className="overview-table-scroll">
            <table
              className={`overview-table ${countryCosts ? "overview-country-costs" : ""}`}
              onPointerOver={(event) => {
                if (!byCountry) return;
                const row = (event.target as Element).closest<HTMLElement>(
                  "tr[data-cost-key]",
                );
                setActiveCost(row?.dataset.costKey);
              }}
              onPointerLeave={() => setActiveCost(undefined)}
            >
              <colgroup>
                <col />
                {costColumns && <col className="overview-col-cost" />}
                {countryCosts && <col className="overview-col-share" />}
                {hasNights && <col className="overview-col-nights" />}
                {hasNights && <col className="overview-col-share" />}
                {countryCosts && <col className="overview-col-cost" />}
              </colgroup>
              <thead>
                <tr>
                  <th>
                    {breakdown === "countries" ? "Country" : "Place / area"}
                  </th>
                  {countryCosts
                    ? sortHeading("total", "Cost")
                    : data.hasStayCosts && <th>{placeCostLabel}</th>}
                  {countryCosts && <th>Cost %</th>}
                  {sortHeading("nights", "Nights", !hasNights)}
                  <th hidden={!hasNights}>Nights %</th>
                  {countryCosts && sortHeading("average", "Avg/day")}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.key}>
                    <tr
                      {...costHover(row.key)}
                      className={
                        [
                          row.nights === 0 ? "overview-day-visit" : "",
                          byCountry && activeCost === row.key
                            ? "is-active"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                    >
                      <th scope="row">
                        {canCompareCountries &&
                        breakdown === "countries" &&
                        visitedCountries.has(row.key) ? (
                          <button
                            className="overview-place overview-country-link"
                            type="button"
                            aria-expanded={expanded.has(row.key)}
                            aria-controls={`overview-places-${row.key}`}
                            onClick={() => toggleCountry(row.key)}
                          >
                            <i style={{ backgroundColor: row.color }} />
                            <span className="overview-place-name">
                              {row.name}
                            </span>
                            <ChevronRight aria-hidden="true" />
                          </button>
                        ) : (
                          <span className="overview-place">
                            <i style={{ backgroundColor: row.color }} />
                            <span className="overview-place-name">
                              {row.name}
                            </span>
                          </span>
                        )}
                      </th>
                      {rowCells(
                        countryCosts
                          ? {
                              cost:
                                row.key === "unknown"
                                  ? undefined
                                  : data.countries.get(row.key)?.total,
                              nights: row.nights,
                              days: data.countries.get(row.key)?.budgetDays,
                            }
                          : {
                              cost:
                                row.key === "transit" ? undefined : row.cost,
                              nights: row.nights,
                            },
                      )}
                    </tr>
                    {expanded.has(row.key) && countryPlaces(row.key)}
                  </Fragment>
                ))}
              </tbody>
              {countryCosts && !country && (
                <tfoot>
                  {extraBuckets
                    .filter(([, cost]) => cost.known || cost.missing)
                    .map(([label, cost]) =>
                      label === "Between countries" ? (
                        <Fragment key={label}>
                          {bucketRow(
                            "between",
                            label,
                            cost,
                            data.betweenItems,
                            data.betweenNights,
                          )}
                        </Fragment>
                      ) : (
                        <tr key={label}>
                          <th scope="row">{label}</th>
                          {rowCells({ cost })}
                        </tr>
                      ),
                    )}
                  {hasExpenses &&
                    bucketRow(
                      "expenses",
                      "Other expenses",
                      data.costs.expenses,
                      data.expenseItems,
                    )}
                  <tr className="overview-grand-total">
                    <th scope="row">
                      {mixedStatuses ? (
                        <button
                          className="overview-place overview-country-link"
                          type="button"
                          aria-expanded={expanded.has("total")}
                          aria-controls="overview-items-total"
                          onClick={() => toggleCountry("total")}
                        >
                          <span className="overview-place-name">
                            Trip total
                          </span>
                          <ChevronRight aria-hidden="true" />
                        </button>
                      ) : (
                        "Trip total"
                      )}
                    </th>
                    {rowCells({
                      cost: data.costs.total,
                      nights: data.nights,
                      days: data.budgetDays,
                    })}
                  </tr>
                  {mixedStatuses &&
                    expanded.has("total") &&
                    statusTotals.map(([label, amount], index) => (
                      <tr
                        key={label}
                        id={index ? undefined : "overview-items-total"}
                        className="overview-subrow"
                      >
                        <th scope="row">
                          <span className="overview-place-name">{label}</span>
                        </th>
                        {rowCells({ cost: amount })}
                      </tr>
                    ))}
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
