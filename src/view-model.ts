import type { Itinerary, Leg, NormalizedDay } from "./itinerary.ts";

export const palette = [
  "#3775cf",
  "#249881",
  "#a580bc",
  "#d49237",
  "#d07172",
  "#4d9caf",
  "#a29346",
];
export function duration(ms: number) {
  const minutes = Math.round(ms / 60000);
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    ...options,
    timeZone: "UTC",
  });
}
export function dayLabel(day: NormalizedDay) {
  return day.date ? dateLabel(day.date) : `Day ${day.index + 1}`;
}
export function activeLegs(model: Itinerary, day: NormalizedDay) {
  return model.legs.filter(
    (leg) => leg.day <= day.index + 1 && leg.endDay >= day.index + 1,
  );
}
export interface Moment {
  place?: string;
  leg?: Leg;
  progress?: number;
  at?: number;
  unknown: boolean;
}
export function momentAt(model: Itinerary, value: number): Moment {
  const index = Math.min(model.days.length - 1, Math.max(0, Math.floor(value)));
  const day = model.days[index];
  const fraction = Math.max(0, Math.min(0.999999, value - index));
  if (day.hasUnknownTiming) {
    // A timeless stay is still a known location. A travel day is not a fabricated clock.
    const stay =
      !day.source.blocks?.some((b) => b.type === "place") &&
      day.segments.length === 1 &&
      day.segments[0].type === "stay"
        ? day.segments[0]
        : undefined;
    return { place: stay?.place, unknown: !stay?.place };
  }
  const at = day.start! + fraction * day.durationMs!;
  const segment = day.segments.find((s) => at >= s.start! && at < s.end!);
  if (segment?.type === "travel" && segment.leg) {
    const leg = segment.leg;
    return {
      leg,
      at,
      progress: leg.durationMs ? (at - leg.departure!) / leg.durationMs : 1,
      unknown: false,
    };
  }
  return { place: segment?.place, at, unknown: !segment?.place };
}
export function clockAt(
  model: Itinerary,
  instant: number | undefined,
  place?: string,
) {
  const zone = place
    ? (model.trip.places[place].timezone ?? model.trip.timezone)
    : model.trip.timezone;
  return instant !== undefined && zone
    ? new Date(instant).toLocaleTimeString("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : undefined;
}
export type Point = [number, number];
export interface Curve {
  a: Point;
  b: Point;
  c: Point;
}
export function routeCurve(a: Point, b: Point): Curve {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  return {
    a,
    b,
    c: [(a[0] + b[0]) / 2 - dy * 0.2, (a[1] + b[1]) / 2 + dx * 0.2],
  };
}
export function curvePoint({ a, b, c }: Curve, t: number): Point {
  return [
    (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
    (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
  ];
}
