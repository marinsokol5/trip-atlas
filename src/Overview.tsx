import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import type { Itinerary } from "./itinerary";
import { mapAreas } from "./view-model";
import {
  averageLabel,
  combine,
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
  const [preferredBreakdown, setBreakdown] = useState<"countries" | "places">(
    "countries",
  );
  const breakdown = canCompareCountries ? preferredBreakdown : "places";
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
  const unallocatedTime = data.times.unallocated.known > 0;
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
  const placeCostLabel = hasNights ? "Living + stay" : "Living";
  const countrySubtotal = combine(
    ...[...data.countries]
      .filter(([code]) => code !== "unknown")
      .map(([, value]) => value.total),
  );
  const hasExtraAmounts = extraBuckets.some(
    ([, value]) => value.value > 0 || value.missing > 0,
  );
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
  const costItems = [
    ["Living", data.costs.living],
    ["Accommodation", data.costs.accommodation],
    [country ? "Domestic flights" : "Flights", data.costs.flights],
    [country ? "In-country transport" : "Other transport", data.costs.other],
    ...(unallocatedCost
      ? [["Mixed transport", data.costs.unallocated] as const]
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
              {country ? "In-country total" : "Estimated cost"}
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
          </section>
        )}
      </div>
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
        <div className="overview-costs" aria-label="Cost breakdown">
          {costItems
            .filter(([, cost]) => cost.known || cost.missing)
            .map(([label, cost]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{moneyLabel(cost, currency)}</strong>
              </div>
            ))}
        </div>
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
                  <span>{label} · per person</span>
                  <strong>{moneyLabel(cost, currency)}</strong>
                </div>
              ))}
          </div>
        )}
      <section className="overview-stays" aria-labelledby="stays-heading">
        <div className="overview-stay-heading">
          <div>
            <h2 id="stays-heading">
              {countryCosts
                ? "Country comparison"
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
                  ? "In-country costs · per person"
                  : `${placeCostLabel} only · per person`}
              </p>
            )}
          </div>
          {canCompareCountries && (
            <div className="overview-toggle" aria-label="Stay breakdown">
              {(["countries", "places"] as const).map((option) => (
                <button
                  key={option}
                  aria-pressed={breakdown === option}
                  onClick={() => setBreakdown(option)}
                >
                  {option === "countries" ? "Countries" : "Places"}
                </button>
              ))}
            </div>
          )}
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
                <tr
                  key={row.key}
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
                        aria-label={`View ${row.name}`}
                        onClick={() => onSelectCountry(row.key)}
                      >
                        <i style={{ backgroundColor: row.color }} />
                        <span className="overview-place-name">{row.name}</span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    ) : (
                      <span className="overview-place">
                        <i style={{ backgroundColor: row.color }} />
                        <span className="overview-place-name">{row.name}</span>
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
                        {data.countries.has(row.key) && row.key !== "unknown"
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
                        {row.key !== "unknown" && data.countries.has(row.key)
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
                  .map(([label, cost]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td hidden={!hasNights}>—</td>
                      <td>{moneyLabel(cost, currency)}</td>
                      <td>—</td>
                    </tr>
                  ))}
                <tr className="overview-grand-total">
                  <th scope="row">Trip total</th>
                  <td hidden={!hasNights}>—</td>
                  <td>{moneyLabel(data.costs.total, currency)}</td>
                  <td>
                    {averageLabel(data.costs.total, data.budgetDays, currency)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      <details className="overview-notes">
        <summary>Details &amp; how estimates work</summary>
        <p>
          Travel totals before headline rounding: flights{" "}
          {timeLabel(data.times.flights)}; other transport{" "}
          {timeLabel(data.times.other)}.
        </p>
        <p>
          Column headings sort the supplied figures; incomplete estimates keep
          their + marker and unknown values stay last. Country names open that
          area's overview.
        </p>
        <p>
          Days touched count every listed day spent in a country or place,
          including crossing days. They can overlap and should not be added
          together.
        </p>
        <dl className="overview-days-touched">
          {rows.map((row) => (
            <div key={row.key}>
              <dt>{row.name}</dt>
              <dd>
                {row.days} {row.days === 1 ? "day" : "days"} touched
                {breakdown === "countries" &&
                  row.key !== "unknown" &&
                  row.key !== "transit" &&
                  ` · ${data.countries.get(row.key)?.budgetDays ?? 0} budgeted days`}
                {row.nights === 0 ? " · no overnight stay" : ""}
              </dd>
            </div>
          ))}
        </dl>
        <p>
          Walking is excluded from travel time. Nights end before the final day.
          Crossing days can appear in more than one country.
        </p>
        <p>
          All costs are per person. ~ means estimated; + means some values are
          missing; ? means unknown. No daily budget or travel prices are
          assumed. Living costs use one country per day; accommodation excludes
          nights in transit.
        </p>
        <p>
          Country totals include living, accommodation and travel with both
          endpoints in that country. Between countries contains each
          international fare once; unknown-country costs are Unassigned.
          Average/day divides the country total by its living-budget days
          (including transit fallback), not days touched or hotel nights. Zero
          budget days show a dash. Travel time still includes arriving and
          departing journeys. Place rows contain living and stays only.
        </p>
        {unallocatedTime && (
          <p>
            {timeLabel(data.times.unallocated)} of mixed travel cannot be split
            between flights, other transport or walking.
          </p>
        )}
        {unallocatedCost && (
          <p>
            {moneyLabel(data.costs.unallocated, currency)} of mixed travel is
            included in the total but cannot be split between the transport
            categories.
          </p>
        )}
      </details>
    </section>
  );
}
