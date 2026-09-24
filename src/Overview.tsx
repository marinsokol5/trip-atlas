import { Fragment, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import type { Itinerary } from "./itinerary";
import type { Amount } from "./overview-model";
import { CostBreakdown } from "./CostBreakdown";
import { mapAreas } from "./view-model";
import {
  averageLabel,
  combine,
  countryColor,
  costStatusAmounts,
  headlineTimeLabel,
  moneyLabel,
  nightShare,
  overview,
  timeLabel,
} from "./overview-model";
import {
  defaultStaySort,
  orderStayRows,
  parseStaySort,
} from "./overview-presentation";
import type { StaySortKey } from "./overview-presentation";

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
  const nightsCell = (nights?: number) => (
    <td hidden={!hasNights}>
      {nights !== undefined && (
        <div className="overview-night-measure">
          <span className="overview-bar" aria-hidden="true">
            <span
              style={{ width: `${nightShare(nights, data.nights)}%` }}
              className="overview-subbar"
            />
          </span>
          <span className="overview-night-count">
            <strong>{nights}</strong>
            <span>{Math.round(nightShare(nights, data.nights))}%</span>
          </span>
        </div>
      )}
    </td>
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
    const costCells = (cost?: Amount, days = 0) =>
      countryCosts ? (
        <>
          <td>{cost ? moneyLabel(cost, currency) : "—"}</td>
          <td>{cost && days ? averageLabel(cost, days, currency) : "—"}</td>
        </>
      ) : (
        data.hasStayCosts && <td>{cost ? moneyLabel(cost, currency) : "—"}</td>
      );
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
            {nightsCell(place.nights)}
            {costCells(place.cost, place.days)}
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
            {nightsCell()}
            {costCells(transport)}
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
      <tr>
        <th scope="row">
          <button
            className="overview-place overview-country-link"
            type="button"
            aria-expanded={expanded.has(key)}
            aria-controls={`overview-items-${key}`}
            onClick={() => toggleCountry(key)}
          >
            <span className="overview-place-name">{label}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        </th>
        {nights ? nightsCell(nights) : <td hidden={!hasNights}>—</td>}
        <td>{moneyLabel(cost, currency)}</td>
        <td>—</td>
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
              <th scope="row" colSpan={hasNights ? 2 : 1}>
                <span className="overview-place-name">{item.label}</span>
              </th>
              <td>{moneyLabel(item.cost, currency)}</td>
              <td>—</td>
            </tr>
          ))}
    </>
  );
  const byCountry = countryCosts && costView === "country";
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
      color: "var(--coast)",
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
  const countrySubtotal = combine(
    ...[...data.countries]
      .filter(([code]) => code !== "unknown")
      .map(([, value]) => value.total),
  );
  const hasExpenses = data.costs.expenses.known > 0;
  const hasExtraAmounts =
    hasExpenses ||
    extraBuckets.some(([, value]) => value.value > 0 || value.missing > 0);
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
      <div className={`overview-headlines ${showCosts ? "has-budget" : ""}`}>
        <section className="overview-metric">
          <h3>Duration</h3>
          <p className="overview-number">
            {data.days} <span>{data.days === 1 ? "day" : "days"}</span>
          </p>
          <p>
            {hasNights
              ? `${data.nights} ${data.nights === 1 ? "night" : "nights"}`
              : "No overnight stays"}
          </p>
        </section>
        <section className="overview-metric">
          <h3>Travel time</h3>
          {applicableTravel.length ? (
            <div className="overview-travel">
              {applicableTravel.map(([label, value]) => (
                <div key={label}>
                  <strong title={timeLabel(value)} tabIndex={0}>
                    {headlineTimeLabel(value)}
                  </strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="overview-empty-metric">No vehicle travel</p>
          )}
        </section>
        {showCosts && (
          <section className="overview-metric overview-budget">
            <h3>
              {country
                ? "In-country total"
                : mixedStatuses
                  ? "Trip cost"
                  : "Estimated cost"}
              {currency ? ` · ${currency}` : ""}
            </h3>
            <p className="overview-number">
              {moneyLabel(data.costs.total, currency)}
            </p>
            <p className="overview-average">
              Per person
              {data.budgetDays > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span
                    title={`Total divided by ${data.budgetDays} ${country ? "days assigned to this country's living budget" : "trip days"}`}
                  >
                    <strong>
                      {averageLabel(
                        data.costs.total,
                        data.budgetDays,
                        currency,
                      )}
                    </strong>{" "}
                    / day
                  </span>
                </>
              )}
            </p>
            {mixedStatuses && (
              <p
                className="overview-status-amounts"
                aria-label="Cost status breakdown"
              >
                {statusTotals.map(([label, amount]) => (
                  <span key={label}>
                    {label}
                    <strong>{moneyLabel(amount, currency)}</strong>
                  </span>
                ))}
              </p>
            )}
            <p className="overview-cost-legend">
              ~ estimated · + some prices missing · ? unknown
            </p>
          </section>
        )}
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
                <h2 id="cost-categories-heading">
                  {byCountry ? "Cost by country" : "Cost by category"}
                </h2>
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
              <p className="overview-stay-caption">
                {hasNights
                  ? `Share of ${data.nights} ${data.nights === 1 ? "night" : "nights"}`
                  : "Day visits and travel stops"}
              </p>
              {(countryCosts || data.hasStayCosts) && (
                <p className="overview-stay-caption">
                  {breakdown === "countries"
                    ? "In-country costs"
                    : `${placeCostLabel} only`}
                </p>
              )}
            </div>
          </div>
          <div className="overview-table-scroll">
            <table
              className={`overview-table ${countryCosts ? "overview-country-costs" : ""}`}
            >
              <thead>
                <tr>
                  <th>
                    {breakdown === "countries" ? "Country" : "Place / area"}
                  </th>
                  {sortHeading("nights", "Nights", !hasNights)}
                  {countryCosts ? (
                    <>
                      {sortHeading("total", "Total")}
                      {sortHeading("average", "Avg/day")}
                    </>
                  ) : (
                    data.hasStayCosts && <th>{placeCostLabel}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.key}>
                    <tr
                      className={
                        row.nights === 0 ? "overview-day-visit" : undefined
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
                      <td hidden={!hasNights}>
                        <div className="overview-night-measure">
                          <span
                            className="overview-bar"
                            role="img"
                            aria-label={`${row.nights} of ${data.nights} nights, ${Math.round(nightShare(row.nights, data.nights))}%`}
                          >
                            <span
                              style={{
                                width: `${nightShare(row.nights, data.nights)}%`,
                                backgroundColor: row.color,
                              }}
                            />
                          </span>
                          <span className="overview-night-count">
                            <strong>{row.nights}</strong>
                            <span>
                              {Math.round(nightShare(row.nights, data.nights))}%
                            </span>
                          </span>
                        </div>
                      </td>
                      {countryCosts ? (
                        <>
                          <td>
                            {data.countries.has(row.key) &&
                            row.key !== "unknown"
                              ? moneyLabel(
                                  data.countries.get(row.key)!.total,
                                  currency,
                                )
                              : "—"}
                          </td>
                          <td
                            title={
                              data.countries.get(row.key)?.budgetDays
                                ? `Total divided by ${data.countries.get(row.key)!.budgetDays} budgeted days`
                                : undefined
                            }
                          >
                            {row.key !== "unknown" &&
                            data.countries.has(row.key)
                              ? averageLabel(
                                  data.countries.get(row.key)!.total,
                                  data.countries.get(row.key)!.budgetDays,
                                  currency,
                                )
                              : "—"}
                          </td>
                        </>
                      ) : (
                        data.hasStayCosts && (
                          <td>
                            {row.key === "transit"
                              ? "—"
                              : moneyLabel(row.cost, currency)}
                          </td>
                        )
                      )}
                    </tr>
                    {expanded.has(row.key) && countryPlaces(row.key)}
                  </Fragment>
                ))}
              </tbody>
              {countryCosts && !country && (
                <tfoot>
                  {hasExtraAmounts && (
                    <tr>
                      <th scope="row">Countries subtotal</th>
                      <td hidden={!hasNights}>—</td>
                      <td>{moneyLabel(countrySubtotal, currency)}</td>
                      <td>—</td>
                    </tr>
                  )}
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
                          <td hidden={!hasNights}>—</td>
                          <td>{moneyLabel(cost, currency)}</td>
                          <td>—</td>
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
                    <th scope="row">Trip total</th>
                    <td hidden={!hasNights}>—</td>
                    <td>{moneyLabel(data.costs.total, currency)}</td>
                    <td>
                      {averageLabel(
                        data.costs.total,
                        data.budgetDays,
                        currency,
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
