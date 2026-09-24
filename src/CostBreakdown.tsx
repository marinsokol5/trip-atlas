import { useState } from "react";
import { moneyLabel } from "./overview-model";
import type { Amount } from "./overview-model";

export interface CostCategory {
  key: string;
  label: string;
  cost: Amount;
  /** A fixed CSS color per category, so a category keeps its color whatever its rank. */
  color: string;
}

const size = 180,
  outer = 86,
  inner = 56;

/** An annulus sector from `start` to `end`, in radians clockwise from twelve o'clock. */
function slice(start: number, end: number): string {
  const point = (radius: number, angle: number) =>
    `${size / 2 + radius * Math.sin(angle)} ${size / 2 - radius * Math.cos(angle)}`;
  // A lone category would be a zero-length arc; draw it as two halves.
  if (end - start >= Math.PI * 2 - 1e-9)
    return `${slice(0, Math.PI)} ${slice(Math.PI, Math.PI * 2)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return [
    `M${point(outer, start)}`,
    `A${outer} ${outer} 0 ${large} 1 ${point(outer, end)}`,
    `L${point(inner, end)}`,
    `A${inner} ${inner} 0 ${large} 0 ${point(inner, start)}`,
    "Z",
  ].join(" ");
}

/** Where the money goes: a donut in fixed category order beside a table sorted by amount. */
export function CostBreakdown({
  categories,
  total,
  currency,
  heading = "Category",
  table = true,
  active: sharedActive,
  onActive,
}: {
  categories: CostCategory[];
  heading?: string;
  /** Off when another table on the page already lists these amounts as the legend. */
  table?: boolean;
  /** With `onActive`, the highlighted slice is shared with that other table. */
  active?: string;
  onActive?: (key: string | undefined) => void;
  total: Amount;
  currency?: string;
}) {
  const [ownActive, setOwnActive] = useState<string>();
  const active = onActive ? sharedActive : ownActive;
  const setActive = onActive ?? setOwnActive;
  const shown = categories.filter(({ cost }) => cost.known || cost.missing);
  const sum = shown.reduce((s, { cost }) => s + Math.max(0, cost.value), 0);
  const share = (cost: Amount) => (sum > 0 ? (cost.value / sum) * 100 : 0);
  const positive = sum > 0 ? shown.filter(({ cost }) => cost.value > 0) : [];
  const ends = positive.map((_, i) =>
    positive
      .slice(0, i + 1)
      .reduce((s, { cost }) => s + (cost.value / sum) * Math.PI * 2, 0),
  );
  const slices = positive.map((category, i) => ({
    ...category,
    d: slice(i ? ends[i - 1] : 0, ends[i]),
  }));
  const focus = shown.find((category) => category.key === active);
  const rows = [...shown].sort((a, b) => b.cost.value - a.cost.value);
  return (
    <div
      className={`cost-breakdown${table ? "" : " donut-only"}`}
      onPointerLeave={() => setActive(undefined)}
    >
      <figure className="cost-donut">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Cost by ${heading.toLowerCase()}: ${rows.map((row) => `${row.label} ${Math.round(share(row.cost))}%`).join(", ")}`}
        >
          {slices.map((s) => (
            <path
              key={s.key}
              d={s.d}
              fill={s.color}
              className={active && active !== s.key ? "is-muted" : undefined}
              onPointerEnter={() => setActive(s.key)}
            />
          ))}
        </svg>
        <figcaption aria-live="polite">
          <span>{focus ? focus.label : "Total"}</span>
          <strong>{moneyLabel(focus ? focus.cost : total, currency)}</strong>
          {focus && <span>{Math.round(share(focus.cost))}%</span>}
        </figcaption>
      </figure>
      {table && (
        <table className="cost-table">
          <thead>
            <tr>
              <th>{heading}</th>
              <th>Cost</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={active === row.key ? "is-active" : undefined}
                onPointerEnter={() => setActive(row.key)}
              >
                <th scope="row">
                  <i style={{ backgroundColor: row.color }} />
                  {row.label}
                </th>
                <td>{moneyLabel(row.cost, currency)}</td>
                <td>
                  {row.cost.value > 0 ? `${Math.round(share(row.cost))}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{moneyLabel(total, currency)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
