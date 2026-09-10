import type { Itinerary, Leg } from "./itinerary.ts";
import {
  activeLegs,
  areaDays,
  dayCountries,
  duration,
  groupKey,
  mapAreas,
  placeColor,
  visualGroups,
} from "./view-model.ts";

/** Values stay separate from missing units so explicit zero never means unknown. */
export interface Amount {
  value: number;
  known: number;
  missing: number;
  estimated: boolean;
}
const amount = (): Amount => ({
  value: 0,
  known: 0,
  missing: 0,
  estimated: false,
});
function add(target: Amount, value?: number, estimated = true) {
  if (value === undefined) target.missing++;
  else {
    target.value += value;
    target.known++;
    target.estimated ||= estimated;
  }
}
export function combine(...values: Amount[]): Amount {
  return values.reduce(
    (sum, a) => ({
      value: sum.value + a.value,
      known: sum.known + a.known,
      missing: sum.missing + a.missing,
      estimated: sum.estimated || a.estimated,
    }),
    amount(),
  );
}
export function moneyLabel(value: Amount, currency?: string): string {
  if (!value.known && value.missing) return "?";
  if (!value.known && !value.missing) return "0";
  if (!currency) return "?";
  return `~${new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: 0 }).format(value.value)}${value.missing ? "+" : ""}`;
}
export function averageLabel(
  total: Amount,
  budgetDays: number,
  currency?: string,
): string {
  return budgetDays
    ? moneyLabel({ ...total, value: total.value / budgetDays }, currency)
    : "—";
}
export function timeLabel(value: Amount): string {
  if (!value.known && value.missing) return "?";
  return `${value.estimated ? "~" : ""}${duration(value.value * 60000)}${value.missing ? "+" : ""}`;
}
/** Estimated headline totals use hours; detailed and map labels retain minutes. */
export function headlineTimeLabel(value: Amount): string {
  if (!value.estimated || value.value < 60 || !value.known)
    return timeLabel(value);
  return `~${Math.round(value.value / 60)}h${value.missing ? "+" : ""}`;
}
export function nightShare(nights: number, total: number): number {
  return total > 0 ? (nights / total) * 100 : 0;
}
const countryPalette: Record<string, string> = {
  JP: "#bd5963",
  VN: "#498879",
  TH: "#b58938",
  TW: "#8070aa",
  NL: "#5485ad",
  CN: "#a65b45",
  KR: "#6a83b3",
  SG: "#a26891",
  MY: "#628946",
  ID: "#b56f45",
  PH: "#4a92a0",
  LA: "#858447",
  KH: "#a77c98",
  GB: "#5b7595",
  FR: "#8375aa",
  DE: "#9a7d52",
  IT: "#548979",
  ES: "#be8350",
  US: "#657da6",
  AU: "#8b8b50",
};
/** ISO codes alone determine Overview country colors, independent of place order. */
export function countryColor(code: string): string {
  const normalized = code.toUpperCase();
  if (countryPalette[normalized]) return countryPalette[normalized];
  const hash = [...normalized].reduce(
    (sum, char) => sum * 31 + char.charCodeAt(0),
    0,
  );
  return `hsl(${hash % 360} 35% 48%)`;
}
type Kind = "flights" | "other" | "walk";
function kinds(mode?: string): Kind[] {
  const text = (mode ?? "").toLowerCase();
  const result: Kind[] = [];
  if (/flight|plane|fly/.test(text)) result.push("flights");
  if (/walk|hike|trek/.test(text)) result.push("walk");
  if (
    /train|rail|shinkansen|bus|coach|ferry|boat|car|taxi|drive|metro|subway|tram|bicycle|bike|scooter|tuk.?tuk|helicopter|other/.test(
      text,
    ) ||
    text
      .split(/[+/,;&]|\band\b|\bwith\b/)
      .some(
        (part) => part.trim() && !/flight|plane|fly|walk|hike|trek/.test(part),
      ) ||
    !result.length
  )
    result.push("other");
  return result;
}
function legKinds(leg: Leg): Kind[] {
  return [
    ...new Set(
      leg.block.components?.flatMap((part) => kinds(part.mode)) ??
        kinds(leg.block.mode),
    ),
  ];
}
export function scopedLegs(model: Itinerary, country = "") {
  return model.legs.filter(
    (leg) =>
      !country ||
      [leg.from, leg.to].some(
        (id) => id && model.trip.places[id].country === country,
      ),
  );
}
export function travelTimes(legs: Leg[]) {
  const result = { flights: amount(), other: amount(), unallocated: amount() };
  for (const leg of legs) {
    const categories = legKinds(leg);
    if (categories.length === 1 && categories[0] === "walk") continue;
    const parts = leg.block.components;
    const whole =
      leg.durationMs !== undefined
        ? leg.durationMs / 60000
        : leg.block.estimatedDurationMinutes;
    if (categories.length === 1) {
      const value =
        whole ??
        (parts?.every((part) => part.estimatedDurationMinutes !== undefined)
          ? parts.reduce((sum, part) => sum + part.estimatedDurationMinutes!, 0)
          : undefined);
      if (value !== undefined || !parts)
        add(
          result[categories[0] as "flights" | "other"],
          value,
          leg.durationMs === undefined,
        );
      else
        for (const part of parts)
          add(
            result[categories[0] as "flights" | "other"],
            part.estimatedDurationMinutes,
          );
    } else if (parts && leg.durationMs === undefined && whole === undefined) {
      for (const part of parts) {
        const cs = kinds(part.mode);
        if (cs.length === 1 && cs[0] !== "walk")
          add(result[cs[0]], part.estimatedDurationMinutes);
        else if (cs.length > 1) {
          for (const c of cs) if (c !== "walk") add(result[c]);
          add(result.unallocated, part.estimatedDurationMinutes);
        }
      }
    } else {
      for (const category of categories)
        if (category !== "walk") add(result[category]);
      add(result.unallocated, whole, leg.durationMs === undefined);
    }
  }
  return result;
}
export interface StayRow {
  key: string;
  name: string;
  color: string;
  days: number;
  nights: number;
  cost: Amount;
}
export function overview(
  model: Itinerary,
  country = "",
  breakdown: "countries" | "places" = country ? "places" : "countries",
) {
  const countryOf = (id?: string) =>
    id ? model.trip.places[id]?.country : undefined;
  // Populate cost buckets alongside the existing daily allocation, never from days touched.
  const countries = new Map<string, { total: Amount; budgetDays: number }>();
  const countryBucket = (code?: string) => {
    const key = code ?? "unknown";
    if (!countries.has(key))
      countries.set(key, { total: amount(), budgetDays: 0 });
    return countries.get(key)!;
  };
  const betweenCountries = amount(),
    unassignedTravel = amount();
  const rows = new Map<string, StayRow & { daySet: Set<number> }>();
  const areas = mapAreas(model);
  const groups = visualGroups(model);
  const row = (place?: string, special?: "transit" | "unknown") => {
    const code = countryOf(place);
    if (code) countryBucket(code);
    const key =
      special ??
      (breakdown === "countries"
        ? (code ?? "unknown")
        : groupKey(model, place));
    if (!rows.has(key))
      rows.set(key, {
        key,
        name:
          key === "transit"
            ? "In transit"
            : key === "unknown"
              ? "Unknown"
              : breakdown === "countries"
                ? (areas.find((a) => a.country === code)?.name ?? code!)
                : (groups.find((g) => g.key === key)?.name ?? "Unknown"),
        color:
          key === "transit"
            ? "var(--transit)"
            : key === "unknown"
              ? "#96929a"
              : breakdown === "countries"
                ? countryColor(code!)
                : placeColor(model, place),
        days: 0,
        nights: 0,
        cost: amount(),
        daySet: new Set(),
      });
    return rows.get(key)!;
  };
  const living = amount(),
    accommodation = amount();
  let lastKnownPlace = countryOf(model.trip.initialPlace)
    ? model.trip.initialPlace
    : undefined;
  const remember = (place?: string) => {
    if (countryOf(place)) lastKnownPlace = place;
  };
  for (const day of model.days) {
    const places = [
      day.startPlace,
      ...(day.source.blocks?.flatMap((b) =>
        b.type === "place" ? [b.place] : [b.from, b.to],
      ) ?? []),
      ...activeLegs(model, day).flatMap((l) => [l.from, l.to]),
      day.overnight,
    ];
    for (const place of places)
      if (place && (!country || countryOf(place) === country))
        row(place).daySet.add(day.index);
    // Follow real block order; a visit before an unknown-location departure can
    // change the last known country without ever becoming an overnight stay.
    remember(day.startPlace);
    for (const [index, block] of (day.source.blocks ?? []).entries()) {
      if (block.type === "place") remember(block.place);
      else {
        const leg = day.legs.find(
          (leg) => leg.id === `${day.index + 1}-${index + 1}`,
        );
        remember(leg?.from);
        if ((block.endDay ?? day.index + 1) === day.index + 1)
          remember(block.to);
      }
    }
    if (!day.inTransit) remember(day.overnight);
    const livingPlace = day.inTransit ? lastKnownPlace : day.overnight;
    const livingCountry = countryOf(livingPlace);
    const rate = livingCountry
      ? model.trip.budget?.countries[livingCountry]
      : undefined;
    const budgetBucket = countryBucket(livingCountry);
    budgetBucket.budgetDays++;
    add(budgetBucket.total, rate?.livingPerDay);
    if (!country || livingCountry === country) {
      add(living, rate?.livingPerDay);
      // During transit, country rows can still show the departing country's daily living cost.
      add(row(livingPlace).cost, rate?.livingPerDay);
    }
    if (!country && !dayCountries(model, day).length)
      row(undefined, day.inTransit ? "transit" : "unknown").daySet.add(
        day.index,
      );
    if (day.index === model.days.length - 1) continue;
    if (day.inTransit) {
      if (!country) {
        const r = row(undefined, "transit");
        r.nights++;
        r.daySet.add(day.index);
      }
    } else {
      const nightCountry = countryOf(day.overnight);
      const nightRate = nightCountry
        ? model.trip.budget?.countries[nightCountry]?.accommodationPerNight
        : undefined;
      add(countryBucket(nightCountry).total, nightRate);
      if (country && nightCountry !== country) continue;
      const r = row(day.overnight);
      r.nights++;
      add(accommodation, nightRate);
      add(r.cost, nightRate);
    }
  }
  const legs = scopedLegs(model, country);
  const flights = amount(),
    other = amount(),
    unallocated = amount(),
    transport = amount();
  for (const leg of model.legs) {
    const cs = legKinds(leg);
    if (
      cs.length === 1 &&
      cs[0] === "walk" &&
      leg.block.estimatedCost === undefined
    )
      continue;
    const from = countryOf(leg.from),
      to = countryOf(leg.to);
    if (!from || !to) {
      if (!country || from === country || to === country)
        add(unassignedTravel, leg.block.estimatedCost);
    } else if (from !== to) {
      if (!country || from === country || to === country)
        add(betweenCountries, leg.block.estimatedCost);
    } else add(countryBucket(from).total, leg.block.estimatedCost);
    // Country cost categories have the same domestic scope as the country total.
    if (country && (from !== country || to !== country)) continue;
    add(transport, leg.block.estimatedCost);
    const costKinds = [
      ...new Set(cs.map((kind) => (kind === "flights" ? "flights" : "other"))),
    ];
    if (costKinds.length === 1)
      add(
        costKinds[0] === "flights" ? flights : other,
        leg.block.estimatedCost,
      );
    else {
      for (const c of costKinds) add(c === "flights" ? flights : other);
      add(unallocated, leg.block.estimatedCost);
    }
  }
  const stays = [...rows.values()]
    .map(({ daySet, ...r }) => ({ ...r, days: daySet.size }))
    .sort((a, b) => b.nights - a.nights || b.days - a.days);
  return {
    days: areaDays(model, country).length,
    nights: stays.reduce((sum, r) => sum + r.nights, 0),
    stays,
    countries,
    budgetDays: country
      ? (countries.get(country)?.budgetDays ?? 0)
      : model.days.length,
    betweenCountries,
    unassigned: combine(
      ...(!country ? [countries.get("unknown")?.total ?? amount()] : []),
      unassignedTravel,
    ),
    times: travelTimes(legs),
    hasBudget: combine(living, accommodation, transport).known > 0,
    hasStayCosts: combine(living, accommodation).known > 0,
    costs: {
      living,
      accommodation,
      flights,
      other,
      unallocated,
      total: combine(living, accommodation, transport),
    },
  };
}
