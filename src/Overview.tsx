import { useState } from "react";
import type { Itinerary } from "./itinerary";
import {
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
  const unallocatedTime = data.times.unallocated.known > 0;
  const unallocatedCost = data.costs.unallocated.known > 0;
  return (
    <section className="overview-view" aria-label="Overview view">
      <div
        className={`overview-headlines ${data.hasBudget ? "has-budget" : ""}`}
      >
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
        {data.hasBudget && (
          <section className="overview-metric overview-budget">
            <h3>Estimated cost{currency ? ` · ${currency}` : ""}</h3>
            <p className="overview-number">
              {moneyLabel(data.costs.total, currency)}
            </p>
            <p>Per person</p>
          </section>
        )}
      </div>
      {!data.hasBudget && (
        <p className="overview-budget-empty">Budget not provided</p>
      )}
      {data.hasBudget && (
        <div className="overview-costs" aria-label="Cost breakdown">
          {(
            [
              ["Living", data.costs.living],
              ["Accommodation", data.costs.accommodation],
              ["Flights", data.costs.flights],
              ["Other transport", data.costs.other],
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
      <section className="overview-stays" aria-labelledby="stays-heading">
        <div className="overview-stay-heading">
          <div>
            <h2 id="stays-heading">Where you’ll stay</h2>
            <p className="overview-stay-caption">
              Share of {data.nights} {data.nights === 1 ? "night" : "nights"} in
              this area
            </p>
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
          <table className="overview-table">
            <thead>
              <tr>
                <th>
                  {breakdown === "countries" ? "Country" : "Place / area"}
                </th>
                <th>Nights</th>
                {data.hasStayCosts && <th>Living + stay</th>}
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
                  {data.hasStayCosts && (
                    <td>
                      {row.key === "transit"
                        ? "—"
                        : moneyLabel(row.cost, currency)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
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
          Country travel includes journeys arriving or departing there, so
          international journeys can appear in both country views. Stay rows
          contain living and accommodation only.
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
