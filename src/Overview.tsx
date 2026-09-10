import { useState } from "react";
import type { Itinerary } from "./itinerary";
import {
  averageLabel,
  headlineTimeLabel,
  moneyLabel,
  nightShare,
  overview,
  timeLabel,
} from "./overview-model";

export function Overview({
  model,
  country,
}: {
  model: Itinerary;
  country: string;
}) {
  const [breakdown, setBreakdown] = useState<"countries" | "places">(
    country ? "places" : "countries",
  );
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
  return (
    <section className="overview-view" aria-label="Overview view">
      <div className={`overview-headlines ${showCosts ? "has-budget" : ""}`}>
        <section className="overview-metric">
          <h3>Duration</h3>
          <p className="overview-number">
            {data.days} <span>days</span>
          </p>
          <p>
            {data.nights} {data.nights === 1 ? "night" : "nights"}
          </p>
        </section>
        <section className="overview-metric">
          <h3>Travel time</h3>
          <div className="overview-travel">
            <div>
              <strong title={timeLabel(data.times.flights)} tabIndex={0}>
                {headlineTimeLabel(data.times.flights)}
              </strong>
              <span>Flights</span>
            </div>
            <div>
              <strong title={timeLabel(data.times.other)} tabIndex={0}>
                {headlineTimeLabel(data.times.other)}
              </strong>
              <span>Other transport</span>
            </div>
          </div>
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
            <p>Per person</p>
            {country && (
              <p
                className="overview-average"
                title={`Total divided by ${data.budgetDays} budgeted days`}
              >
                <strong>
                  {averageLabel(data.costs.total, data.budgetDays, currency)}
                </strong>{" "}
                / day · {data.budgetDays} budgeted days
              </p>
            )}
          </section>
        )}
      </div>
      {!showCosts && (
        <p className="overview-budget-empty">
          {country ? "Country budget not provided" : "Budget not provided"}
        </p>
      )}
      {showCosts && (
        <div className="overview-costs" aria-label="Cost breakdown">
          {(
            [
              ["Living", data.costs.living],
              ["Accommodation", data.costs.accommodation],
              [country ? "Domestic flights" : "Flights", data.costs.flights],
              [
                country ? "In-country transport" : "Other transport",
                data.costs.other,
              ],
              ...(unallocatedCost
                ? [["Mixed transport", data.costs.unallocated] as const]
                : []),
            ] as const
          ).map(([label, cost]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{moneyLabel(cost, currency)}</strong>
            </div>
          ))}
        </div>
      )}
      {showSeparateCosts && (country || !countryCosts) && (
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
              {countryCosts ? "Country comparison" : "Where you’ll stay"}
            </h2>
            <p className="overview-stay-caption">
              Share of {data.nights} {data.nights === 1 ? "night" : "nights"} in
              this area
            </p>
            {(countryCosts || data.hasStayCosts) && (
              <p className="overview-stay-caption">
                {breakdown === "countries"
                  ? "Living, stays and in-country travel · per person"
                  : "Living + stay only · per person"}
              </p>
            )}
          </div>
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
                <th>Nights</th>
                {countryCosts ? (
                  <>
                    <th>Total</th>
                    <th>Average/day</th>
                  </>
                ) : (
                  data.hasStayCosts && <th>Living + stay</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.stays.map((row) => (
                <tr
                  key={row.key}
                  className={
                    row.nights === 0 ? "overview-day-visit" : undefined
                  }
                >
                  <th scope="row">
                    <span className="overview-place">
                      <i style={{ backgroundColor: row.color }} />
                      {row.name}
                    </span>
                  </th>
                  <td>
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
                {extraBuckets
                  .filter(([, cost]) => cost.known || cost.missing)
                  .map(([label, cost]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>—</td>
                      <td>{moneyLabel(cost, currency)}</td>
                      <td>—</td>
                    </tr>
                  ))}
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
          Days touched count every listed day spent in a country or place,
          including crossing days. They can overlap and should not be added
          together.
        </p>
        <dl className="overview-days-touched">
          {data.stays.map((row) => (
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
