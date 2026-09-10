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
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
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
export function dayTitle(model: Itinerary, day: NormalizedDay) {
  const name = (id?: string) =>
    id ? (model.trip.places[id].name ?? id) : "Location open";
  const legs = activeLegs(model, day);
  return (
    day.source.title ??
    (legs.length
      ? `${name(legs[0].from)} → ${name(legs.at(-1)!.to)}`
      : name(day.overnight))
  );
}

export function dayGroups(model: Itinerary, day: NormalizedDay) {
  const seen = new Set<string>();
  const places = [
    day.startPlace,
    ...activeLegs(model, day).flatMap((leg) => [leg.from, leg.to]),
    day.overnight,
  ];
  return places.flatMap((place) => {
    const id = place ? model.trip.places[place]?.group : undefined;
    const group = id ? model.trip.groups?.[id] : undefined;
    if (!id || !group || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: group.name, color: placeColor(model, place) }];
  });
}

/** Preserve occurrence order, including explicit location resets and repeated visits. */
export function mapPlaceOccurrences(model: Itinerary) {
  const occurrences: string[] = [];
  const add = (id?: string) => {
    if (id && model.trip.places[id]) occurrences.push(id);
  };
  add(model.trip.initialPlace);
  for (const day of model.days) {
    add(day.startPlace);
    for (const [index, block] of (day.source.blocks ?? []).entries()) {
      if (block.type === "place") add(block.place);
      else {
        const leg = day.legs.find(
          (leg) => leg.id === `${day.index + 1}-${index + 1}`,
        );
        add(leg?.from);
        add(block.to);
      }
    }
    add(day.overnight);
  }
  return occurrences;
}

export function mapAreas(model: Itinerary) {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return [
    ...new Set(
      mapPlaceOccurrences(model).flatMap((id) =>
        model.trip.places[id].country ? [model.trip.places[id].country!] : [],
      ),
    ),
  ].map((country) => ({ country, name: names.of(country) ?? country }));
}

export function mapArea(model: Itinerary, country = "") {
  const occurrences = mapPlaceOccurrences(model).filter(
    (id) => !country || model.trip.places[id].country === country,
  );
  const placeIds = new Set(
    country ? occurrences : Object.keys(model.trip.places),
  );
  const groups = visualGroups(model).flatMap((group) => {
    const members = group.members.filter((id) => placeIds.has(id));
    return members.length ? [{ ...group, members }] : [];
  });
  return { placeIds, groups, first: occurrences[0], last: occurrences.at(-1) };
}

/** Overnight bases and the journey endpoints remain major stops, even in a group. */
export function majorStops(model: Itinerary) {
  return new Set(
    [
      model.legs[0]?.from ?? model.days[0].startPlace,
      ...model.days.map((day) => day.overnight),
      model.days.at(-1)?.overnight ?? model.legs.at(-1)?.to,
    ].filter((id): id is string => !!id),
  );
}
export function transferPlaces(model: Itinerary) {
  const stops = majorStops(model);
  return new Set(
    model.legs
      .flatMap((leg) => [leg.from, leg.to])
      .filter((id): id is string => !!id && !stops.has(id)),
  );
}

export interface MapConnection {
  id: string;
  from?: string;
  to: string;
  legs: Leg[];
  minutes?: number;
  approximate: boolean;
}
function vehicleDuration(leg: Leg): { minutes?: number; approximate: boolean } {
  const kinds = modeCategories(leg);
  const vehicle = kinds.length > 0 && !kinds.includes("walk");
  const parts = leg.block.components;
  if (parts) {
    const components = componentLegs(leg);
    const allVehicle = components.every((part) => {
      const kinds = modeCategories(part);
      return kinds.length > 0 && !kinds.includes("walk");
    });
    // A whole-leg duration is usable only when all components are vehicles.
    if (
      allVehicle &&
      (leg.durationMs !== undefined ||
        leg.block.estimatedDurationMinutes !== undefined)
    )
      return {
        minutes:
          leg.durationMs !== undefined
            ? leg.durationMs / 60000
            : leg.block.estimatedDurationMinutes,
        approximate: leg.durationMs === undefined,
      };
    const durations = components.map(vehicleDuration);
    return {
      minutes: durations.every((part) => part.minutes !== undefined)
        ? durations.reduce((sum, part) => sum + part.minutes!, 0)
        : undefined,
      approximate: durations.some((part) => part.approximate),
    };
  }
  if (kinds.length === 1 && kinds[0] === "walk")
    return { minutes: 0, approximate: false };
  // Unknown modes and unsplit walk+vehicle durations cannot be allocated to vehicles.
  if (!vehicle) return { approximate: false };
  return {
    minutes:
      leg.durationMs !== undefined
        ? leg.durationMs / 60000
        : leg.block.estimatedDurationMinutes,
    approximate: leg.durationMs === undefined,
  };
}
export function mapConnections(
  model: Itinerary,
  country = "",
): MapConnection[] {
  const stops = majorStops(model),
    result: MapConnection[] = [];
  let pending: Leg[] = [];
  const flush = () => {
    if (!pending.length) return;
    const durations = pending.map(vehicleDuration);
    result.push({
      id: pending[0].id,
      from: pending[0].from,
      to: pending.at(-1)!.to,
      legs: pending,
      minutes: durations.every((part) => part.minutes !== undefined)
        ? durations.reduce((sum, part) => sum + part.minutes!, 0)
        : undefined,
      approximate: durations.some((part) => part.approximate),
    });
    pending = [];
  };
  for (const leg of model.legs) {
    // A border crossing must never be included in a country's vehicle total.
    if (
      country &&
      (!leg.from ||
        model.trip.places[leg.from].country !== country ||
        model.trip.places[leg.to].country !== country)
    ) {
      flush();
      continue;
    }
    const previous = pending.at(-1);
    // Never absorb another day's excursion or bridge an explicit location reset.
    if (previous && (previous.day !== leg.day || previous.to !== leg.from))
      flush();
    pending.push(leg);
    if (stops.has(leg.to)) flush();
  }
  flush();
  return result;
}
export type MapDurationFilter = "all" | "60" | "120" | "none";
export function mapConnectionVisible(
  model: Itinerary,
  connection: MapConnection,
  filter: MapDurationFilter,
) {
  return (
    filter !== "none" &&
    groupKey(model, connection.from) !== groupKey(model, connection.to) &&
    connection.minutes !== undefined &&
    connection.minutes > (filter === "all" ? 0 : Number(filter))
  );
}
export function mapConnectionDuration(connection: MapConnection) {
  if (connection.minutes === undefined) return "";
  const minutes = Math.round(connection.minutes);
  return `${connection.approximate ? "~" : ""}${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h${minutes % 60 || ""}`}`;
}
export interface MapDisplayConnection {
  outbound: MapConnection;
  inbound?: MapConnection;
}
export function mapDisplayConnections(
  model: Itinerary,
  country = "",
): MapDisplayConnection[] {
  const connections = mapConnections(model, country);
  const pairs = new Map<string, MapConnection[]>();
  for (const connection of connections) {
    if (
      !connection.from ||
      groupKey(model, connection.from) === groupKey(model, connection.to)
    )
      continue;
    const key = JSON.stringify([connection.from, connection.to].sort());
    pairs.set(key, [...(pairs.get(key) ?? []), connection]);
  }
  const consumed = new Set<string>();
  return connections.flatMap((outbound) => {
    if (consumed.has(outbound.id)) return [];
    const candidates = pairs.get(
      JSON.stringify([outbound.from, outbound.to].sort()),
    );
    const inbound =
      candidates?.length === 2
        ? candidates.find((c) => c !== outbound)
        : undefined;
    const path = [outbound.from, ...outbound.legs.map((leg) => leg.to)];
    const reversePath = inbound
      ? [inbound.from, ...inbound.legs.map((leg) => leg.to)].reverse()
      : [];
    // Match actual waypoints, not just group labels; ambiguous repeated passes stay separate.
    if (
      inbound &&
      new Set(path).size === path.length &&
      path.length === reversePath.length &&
      path.every((id, i) => id === reversePath[i])
    ) {
      consumed.add(inbound.id);
      return [{ outbound, inbound }];
    }
    return [{ outbound }];
  });
}
export function mapDisplayDuration(
  model: Itinerary,
  connection: MapDisplayConnection,
  filter: MapDurationFilter,
) {
  const directions = connection.inbound
    ? [connection.outbound, connection.inbound]
    : [connection.outbound];
  const longest = directions
    .filter((direction) => mapConnectionVisible(model, direction, filter))
    .sort(
      (a, b) =>
        b.minutes! - a.minutes! ||
        Number(b.approximate) - Number(a.approximate),
    )[0];
  return longest ? mapConnectionDuration(longest) : "";
}
export const mapZoomMin = 0.35;
export const mapZoomMax = 12;
export function zoomMap(
  view: { x: number; y: number; k: number },
  factor: number,
) {
  const k = Math.max(mapZoomMin, Math.min(mapZoomMax, view.k * factor));
  return {
    k,
    x: 450 - ((450 - view.x) * k) / view.k,
    y: 240 - ((240 - view.y) * k) / view.k,
  };
}
export function mapPointStyle(
  transfer: boolean,
  active: boolean,
  traveler = false,
) {
  // The stationary traveler's solid core is larger than a transfer dot; its translucent halo is not an obstacle.
  if (transfer && traveler) return { radius: 6, stroke: 2 };
  return {
    radius: transfer ? (active ? 3 : 2.5) : active ? 7 : 5,
    stroke: transfer ? 1 : 2,
  };
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

/** A replay cursor, not a new schedule: untimed routes use illustrative progress. */
export function mapMomentAt(
  model: Itinerary,
  value: number,
): Moment & { schematic: boolean } {
  const entered = momentAt(model, value);
  if (!entered.unknown) return { ...entered, schematic: false };
  const index = Math.min(model.days.length - 1, Math.max(0, Math.floor(value)));
  const day = model.days[index];
  const legs = activeLegs(model, day);
  if (!legs.length)
    return {
      place: day.overnight ?? day.startPlace,
      unknown: true,
      schematic: true,
    };
  const steps: {
    place?: string;
    leg?: Leg;
    start?: number;
    end?: number;
    weight: number;
  }[] = [];
  // Omit an origin pause when the selected day begins partway through an overnight leg.
  if (legs[0].day === index + 1 && legs[0].from)
    steps.push({ place: legs[0].from, weight: 1.5 });
  for (const [i, leg] of legs.entries()) {
    const span = leg.endDay - leg.day + 1;
    const parts = leg.block.components;
    const estimate =
      leg.durationMs !== undefined
        ? leg.durationMs / 60000
        : (leg.block.estimatedDurationMinutes ??
          (parts?.every((p) => p.estimatedDurationMinutes !== undefined)
            ? parts.reduce((sum, p) => sum + p.estimatedDurationMinutes!, 0)
            : undefined));
    steps.push({
      leg,
      start: (index + 1 - leg.day) / span,
      end: (index + 2 - leg.day) / span,
      weight: Math.max(
        0.1,
        (estimate === undefined ? 1 : estimate / 120) / span,
      ),
    });
    if (leg.endDay === index + 1)
      steps.push({ place: leg.to, weight: i === legs.length - 1 ? 1.5 : 0.5 });
  }
  const total = steps.reduce((sum, step) => sum + step.weight, 0);
  let progress = Math.max(0, Math.min(0.999999, value - index)) * total;
  for (const step of steps) {
    if (progress < step.weight) {
      return step.leg
        ? {
            leg: step.leg,
            progress:
              step.start! +
              (progress / step.weight) * (step.end! - step.start!),
            unknown: true,
            schematic: true,
          }
        : { place: step.place, unknown: true, schematic: true };
    }
    progress -= step.weight;
  }
  return { place: day.overnight, unknown: true, schematic: true };
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
export function reverseCurve(curve: Curve): Curve {
  return { a: curve.b, b: curve.a, c: curve.c };
}
export function directedCurvePoint(
  curve: Curve,
  progress: number,
  reverse = false,
): Point {
  return curvePoint(curve, reverse ? 1 - progress : progress);
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

export function groupKey(model: Itinerary, id?: string) {
  return id
    ? model.trip.places[id].group
      ? `group:${model.trip.places[id].group}`
      : `place:${id}`
    : "unknown";
}
export function visualGroups(model: Itinerary) {
  const result = new Map<
    string,
    { key: string; name: string; members: string[]; color: string }
  >();
  for (const [id, p] of Object.entries(model.trip.places)) {
    const key = groupKey(model, id),
      group = p.group ? model.trip.groups?.[p.group] : undefined;
    if (!result.has(key))
      result.set(key, {
        key,
        name: group?.name ?? p.name ?? id,
        members: [],
        color: group?.color ?? palette[result.size % palette.length],
      });
    result.get(key)!.members.push(id);
  }
  return [...result.values()];
}
export function placeColor(model: Itinerary, id?: string) {
  return (
    visualGroups(model).find((g) => g.key === groupKey(model, id))?.color ??
    "var(--transit)"
  );
}
const modePatterns = [
  ["walk", /walk|hike|trek/],
  ["train", /train|rail|shinkansen/],
  ["bus", /bus|coach/],
  ["flight", /flight|plane|fly/],
  ["ferry", /ferry|boat/],
  ["car", /car|taxi|drive/],
] as const;
function modeCategories(leg: Leg) {
  const mode = leg.block.mode?.toLowerCase() ?? "";
  return modePatterns
    .filter(([, pattern]) => pattern.test(mode))
    .map(([kind]) => kind);
}
export function modeKind(leg: Leg) {
  const kinds = modeCategories(leg);
  return kinds.length === 1 ? kinds[0] : "other";
}
export function estimatedMinutes(leg: Leg) {
  const parts = leg.block.components;
  return (
    leg.block.estimatedDurationMinutes ??
    (parts?.every((p) => p.estimatedDurationMinutes !== undefined)
      ? parts.reduce((s, p) => s + p.estimatedDurationMinutes!, 0)
      : undefined)
  );
}
export function componentLegs(leg: Leg): Leg[] {
  return (
    leg.block.components?.map((p, i) => ({
      ...leg,
      id: `${leg.id}-c${i}`,
      durationMs: undefined,
      block: { type: "travel", to: leg.to, ...p },
    })) ?? [leg]
  );
}
export function legDuration(leg: Leg) {
  return leg.durationMs !== undefined
    ? duration(leg.durationMs)
    : estimatedMinutes(leg) !== undefined
      ? `~${duration(estimatedMinutes(leg)! * 60000)}`
      : "";
}
export function durationTotals(model: Itinerary) {
  return (["transport", "walking", "mixed"] as const).map((category) => {
    const legs = model.legs
      .flatMap((leg) => {
        const parts = componentLegs(leg);
        return leg.block.components && leg.durationMs !== undefined
          ? [
              ...parts,
              {
                ...leg,
                block: {
                  type: "travel" as const,
                  to: leg.to,
                  mode: "mixed / unallocated",
                },
              },
            ]
          : parts;
      })
      .filter((l) => {
        const mode = l.block.mode?.toLowerCase() ?? "";
        const kind =
          mode === "mixed / unallocated" ||
          (modeCategories(l).includes("walk") &&
            modeCategories(l).some((kind) => kind !== "walk"))
            ? "mixed"
            : modeKind(l) === "walk"
              ? "walking"
              : "transport";
        return kind === category;
      });
    const known = legs.filter((l) => l.durationMs !== undefined),
      estimated = legs.filter(
        (l) =>
          l.durationMs === undefined &&
          l.block.estimatedDurationMinutes !== undefined,
      );
    return {
      category,
      count: legs.length,
      covered: known.length + estimated.length,
      knownMs: known.reduce((s, l) => s + l.durationMs!, 0),
      estimatedMs: estimated.reduce(
        (s, l) => s + l.block.estimatedDurationMinutes! * 60000,
        0,
      ),
    };
  });
}
export interface DisplayBand {
  place?: string;
  transfer: boolean;
  weight: number;
}
export function dayBands(model: Itinerary, day: NormalizedDay): DisplayBand[] {
  const internal = (leg: Leg) =>
    modeKind(leg) === "walk" &&
    !!leg.from &&
    groupKey(model, leg.from) === groupKey(model, leg.to);
  if (!day.hasUnknownTiming)
    return day.segments.map((s) => ({
      place: s.leg && internal(s.leg) ? s.leg.to : s.place,
      transfer: s.type === "travel" && !internal(s.leg!),
      weight: s.durationMs!,
    }));
  const legs = activeLegs(model, day);
  if (!legs.length)
    return [{ place: day.overnight, transfer: false, weight: 1 }];
  const bands: DisplayBand[] = [];
  if (day.startPlace)
    bands.push({ place: day.startPlace, transfer: false, weight: 4 });
  for (const leg of legs)
    bands.push({
      place: internal(leg) ? leg.to : undefined,
      transfer: !internal(leg),
      weight: internal(leg) ? 5 : 1,
    });
  if (day.overnight)
    bands.push({ place: day.overnight, transfer: false, weight: 4 });
  return bands;
}
// Trim a quadratic at a real distance from the destination. Marker tip uses refX=10.
export function trimCurve(curve: Curve, gap: number): Curve | undefined {
  if (Math.hypot(curve.a[0] - curve.b[0], curve.a[1] - curve.b[1]) <= gap * 1.5)
    return undefined;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2,
      p = curvePoint(curve, t);
    if (Math.hypot(p[0] - curve.b[0], p[1] - curve.b[1]) > gap) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return {
    a: curve.a,
    b: curvePoint(curve, t),
    c: [
      curve.a[0] + t * (curve.c[0] - curve.a[0]),
      curve.a[1] + t * (curve.c[1] - curve.a[1]),
    ],
  };
}
export function calendarSlots(model: Itinerary): (NormalizedDay | undefined)[] {
  const first = model.days[0];
  const offset = first.date
    ? (new Date(`${first.date}T12:00:00Z`).getUTCDay() + 6) % 7
    : 0;
  return Array.from(
    { length: Math.ceil((offset + model.days.length) / 7) * 7 },
    (_, i) => model.days[i - offset],
  );
}

export function mapRoute(
  curve: Curve,
  internal: boolean,
  pixelScale: number,
  point = mapPointStyle(false, false),
  startPoint = mapPointStyle(false, false),
  bidirectional = false,
) {
  // refX=10 pins the marker tip to this endpoint: 2.5 physical pixels beyond the dot's painted edge.
  const trimmed = internal
    ? undefined
    : trimCurve(curve, (point.radius + point.stroke / 2 + 2.5) / pixelScale);
  if (trimmed) {
    // A plain tail has a small gap too; a double-headed route matches the tip gap at both ends.
    const startGap = bidirectional ? 2.5 : 2;
    const startTrimmed = trimCurve(
      reverseCurve(trimmed),
      (startPoint.radius + startPoint.stroke / 2 + startGap) / pixelScale,
    );
    return startTrimmed
      ? {
          curve: reverseCurve(startTrimmed),
          arrow: true,
          arrowStart: bidirectional,
        }
      : { curve, arrow: false, arrowStart: false };
  }
  return { curve: trimmed ?? curve, arrow: !!trimmed, arrowStart: false };
}
