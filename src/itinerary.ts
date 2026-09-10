export interface DocumentLink {
  label: string;
  path: string;
}
export interface PlaceGroup {
  name: string;
  color?: string;
}
export interface Place {
  group?: string;
  name?: string;
  country?: string;
  timezone?: string;
  coordinates?: {
    lat: number;
    lon: number;
  };
}
export interface TravelComponent {
  mode: string;
  estimatedDurationMinutes?: number;
}
export interface CountryBudget {
  /** Daily living estimate for one person, in the trip currency. */
  livingPerDay?: number;
  /** One person's accommodation share per night, in the trip currency. */
  accommodationPerNight?: number;
}
export interface TravelBlock {
  /** Estimated price for one person, in the trip currency. */
  estimatedCost?: number;
  components?: TravelComponent[];
  type: "travel";
  to: string;
  from?: string;
  start?: string;
  end?: string;
  endDay?: number;
  mode?: string;
  estimatedDurationMinutes?: number;
  notes?: string;
  documents?: DocumentLink[];
}
export interface PlaceBlock {
  type: "place";
  place: string;
}
export interface TripDay {
  title?: string;
  notes?: string;
  documents?: DocumentLink[];
  blocks?: (TravelBlock | PlaceBlock)[];
}
export interface Trip {
  currency?: string;
  budget?: { countries: Record<string, CountryBudget> };
  version: 1;
  title?: string;
  startDate?: string;
  timezone?: string;
  initialPlace?: string;
  groups?: Record<string, PlaceGroup>;
  places: Record<string, Place>;
  days: TripDay[];
}
export interface Leg {
  id: string;
  day: number;
  endDay: number;
  from?: string;
  to: string;
  block: TravelBlock;
  departure?: number;
  arrival?: number;
  durationMs?: number;
}
export interface Segment {
  type: "stay" | "travel" | "unknown";
  place?: string;
  leg?: Leg;
  start?: number;
  end?: number;
  durationMs?: number;
}
export interface NormalizedDay {
  index: number;
  date?: string;
  label: string;
  source: TripDay;
  startPlace?: string;
  overnight?: string;
  inTransit: boolean;
  legs: Leg[];
  segments: Segment[];
  start?: number;
  end?: number;
  durationMs?: number;
  hasUnknownTiming: boolean;
}
export interface Itinerary {
  trip: Trip;
  days: NormalizedDay[];
  legs: Leg[];
  start?: number;
  end?: number;
  totalDurationMs?: number;
  knownTravelDurationMs: number;
  hasUnknownTiming: boolean;
}
function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "expected an object");
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string) {
  if (typeof value !== "string" || !value.trim())
    fail(path, "expected a non-empty string");
}
// Control characters are deliberately forbidden in local paths.
export function safeRelativePath(path: string): boolean {
  return (
    !!path &&
    // oxlint-disable-next-line no-control-regex
    !/[\\:#?%\u0000-\u001f]/.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((p) => !!p && p !== "." && p !== "..")
  );
}
export function documentUrl(folder: string, path: string): string {
  if (!safeRelativePath(folder) || !safeRelativePath(path))
    fail("documents.path", "use a relative local path without traversal");
  return (
    "/trips/" +
    [...folder.split("/"), ...path.split("/")].map(encodeURIComponent).join("/")
  );
}
function documents(value: unknown, path: string) {
  if (value === undefined) return;
  if (!Array.isArray(value)) fail(path, "expected an array");
  value.forEach((v, i) => {
    const d = object(v, `${path}[${i}]`);
    string(d.label, `${path}[${i}].label`);
    if (typeof d.path !== "string" || !safeRelativePath(d.path))
      fail(`${path}[${i}].path`, "expected a safe relative local path");
  });
}
function dateValid(s: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function dateAt(date: string, offset: number): string {
  return new Date(Date.parse(date) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
function zoneValid(zone: unknown, path: string) {
  string(zone, path);
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone as string }).format();
  } catch {
    fail(path, "invalid IANA timezone");
  }
}
export function parseTrip(input: unknown): Trip {
  const t = object(input, "trip");

  let hasPrices = false;
  const price = (value: unknown, path: string) => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      fail(path, "expected a finite nonnegative amount");
    hasPrices = true;
  };
  if (
    t.currency !== undefined &&
    (typeof t.currency !== "string" || !/^[A-Z]{3}$/.test(t.currency))
  )
    fail("currency", "expected uppercase ISO3 currency code, e.g. EUR");
  if (t.budget !== undefined) {
    const budget = object(t.budget, "budget");
    const countries = object(budget.countries, "budget.countries");
    for (const [code, value] of Object.entries(countries)) {
      if (!/^[A-Z]{2}$/.test(code))
        fail(
          `budget.countries.${code}`,
          "expected uppercase ISO2 country code",
        );
      const rates = object(value, `budget.countries.${code}`);
      price(rates.livingPerDay, `budget.countries.${code}.livingPerDay`);
      price(
        rates.accommodationPerNight,
        `budget.countries.${code}.accommodationPerNight`,
      );
    }
  }
  const groups = t.groups === undefined ? {} : object(t.groups, "groups");
  for (const [id, value] of Object.entries(groups)) {
    if (!id.trim()) fail("groups", "empty group ID");
    const g = object(value, `groups.${id}`);
    string(g.name, `groups.${id}.name`);
    if (
      g.color !== undefined &&
      (typeof g.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(g.color))
    )
      fail(`groups.${id}.color`, "expected #RRGGBB");
  }
  if (t.version !== 1) fail("version", "unsupported version; expected 1");
  if (t.title !== undefined) string(t.title, "title");
  if (
    t.startDate !== undefined &&
    (typeof t.startDate !== "string" || !dateValid(t.startDate))
  )
    fail("startDate", "expected a real YYYY-MM-DD date");
  if (t.timezone !== undefined) zoneValid(t.timezone, "timezone");
  const places = object(t.places, "places");
  Object.entries(places).forEach(([id, v]) => {
    if (!id) fail("places", "empty place ID");
    const p = object(v, `places.${id}`);
    if (
      p.group !== undefined &&
      (typeof p.group !== "string" || !Object.hasOwn(groups, p.group))
    )
      fail(`places.${id}.group`, "unknown group ID");
    if (p.name !== undefined) string(p.name, `places.${id}.name`);
    if (
      p.country !== undefined &&
      (typeof p.country !== "string" || !/^[A-Z]{2}$/.test(p.country))
    )
      fail(`places.${id}.country`, "expected uppercase ISO2");
    if (p.timezone !== undefined)
      zoneValid(p.timezone, `places.${id}.timezone`);
    if (p.coordinates !== undefined) {
      const c = object(p.coordinates, `places.${id}.coordinates`);
      if (
        typeof c.lat !== "number" ||
        !Number.isFinite(c.lat) ||
        Math.abs(c.lat) > 90 ||
        typeof c.lon !== "number" ||
        !Number.isFinite(c.lon) ||
        Math.abs(c.lon) > 180
      )
        fail(`places.${id}.coordinates`, "invalid latitude/longitude");
    }
  });
  const place = (v: unknown, path: string) => {
    if (typeof v !== "string" || !Object.hasOwn(places, v))
      fail(path, "unknown place ID");
  };
  if (t.initialPlace !== undefined) place(t.initialPlace, "initialPlace");
  if (!Array.isArray(t.days) || !t.days.length)
    fail("days", "expected at least one day");
  t.days.forEach((v, i) => {
    const path = `days[${i}]`,
      d = object(v, path);
    if (d.title !== undefined) string(d.title, path + ".title");
    if (d.notes !== undefined) string(d.notes, path + ".notes");
    documents(d.documents, path + ".documents");
    if (d.blocks !== undefined) {
      if (!Array.isArray(d.blocks)) fail(path + ".blocks", "expected an array");
      d.blocks.forEach((v, j) => {
        const p = `${path}.blocks[${j}]`,
          b = object(v, p);
        if (b.type === "place") place(b.place, p + ".place");
        else if (b.type === "travel") {
          price(b.estimatedCost, p + ".estimatedCost");
          place(b.to, p + ".to");
          if (b.from !== undefined) place(b.from, p + ".from");
          for (const k of ["start", "end"])
            if (
              b[k] !== undefined &&
              (typeof b[k] !== "string" ||
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k] as string))
            )
              fail(p + "." + k, "expected HH:mm");
          if (
            b.endDay !== undefined &&
            (!Number.isInteger(b.endDay) ||
              Number(b.endDay) < i + 1 ||
              Number(b.endDay) > (t.days as unknown[]).length)
          )
            fail(
              p + ".endDay",
              "expected 1-based arrival day within trip, on or after departure day",
            );
          for (const k of ["mode", "notes"])
            if (b[k] !== undefined) string(b[k], p + "." + k);
          if (
            b.estimatedDurationMinutes !== undefined &&
            (typeof b.estimatedDurationMinutes !== "number" ||
              !Number.isFinite(b.estimatedDurationMinutes) ||
              b.estimatedDurationMinutes <= 0)
          )
            fail(
              p + ".estimatedDurationMinutes",
              "expected positive finite minutes",
            );
          if (b.components !== undefined) {
            if (!Array.isArray(b.components) || !b.components.length)
              fail(p + ".components", "expected nonempty array");
            b.components.forEach((value, k) => {
              const c = object(value, `${p}.components[${k}]`);
              string(c.mode, `${p}.components[${k}].mode`);
              if (
                c.estimatedDurationMinutes !== undefined &&
                (typeof c.estimatedDurationMinutes !== "number" ||
                  !Number.isFinite(c.estimatedDurationMinutes) ||
                  c.estimatedDurationMinutes <= 0)
              )
                fail(
                  `${p}.components[${k}].estimatedDurationMinutes`,
                  "expected positive finite minutes",
                );
            });
          }
          documents(b.documents, p + ".documents");
        } else fail(p + ".type", "expected travel or place");
      });
    }
  });
  if (hasPrices && t.currency === undefined)
    fail(
      "currency",
      "required when budget rates or estimatedCost are supplied; use one uppercase ISO3 currency for the whole trip",
    );
  return {
    ...t,
    title: t.title ?? "Untitled journey",
    places: Object.fromEntries(
      Object.entries(places).map(([id, p]) => [
        id,
        { ...(p as object), name: (p as Record<string, unknown>).name ?? id },
      ]),
    ),
  } as unknown as Trip;
}
// Find every matching instant, so DST folds and gaps cannot silently change a journey.
export function localInstant(
  date: string,
  time: string,
  zone: string,
  path: string,
): number {
  const target = `${date}T${time}`,
    naive = Date.parse(target + "Z");
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const format = (ms: number) => {
    const p = Object.fromEntries(
      fmt.formatToParts(ms).map((p) => [p.type, p.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const ms = naive + h * 3600000;
    offsets.add(Date.parse(format(ms) + "Z") - ms);
  }
  const matches = [...offsets]
    .map((o) => naive - o)
    .filter((ms) => format(ms) === target);
  if (matches.length !== 1)
    fail(
      path,
      matches.length
        ? "ambiguous local time during a clock change; needs clarification"
        : "local time does not exist during a clock change",
    );
  return matches[0];
}
export function normalizeTrip(input: unknown): Itinerary {
  const trip = parseTrip(input),
    legs: Leg[] = [],
    days: NormalizedDay[] = [];
  let current = trip.initialPlace;
  let pending: Leg | undefined;
  let knownFloor: number | undefined;
  const zone = (id?: string) =>
    id ? (trip.places[id].timezone ?? trip.timezone) : trip.timezone;
  const instant = (
    index: number,
    time: string | undefined,
    id: string | undefined,
    path: string,
  ) =>
    trip.startDate && time && zone(id)
      ? localInstant(dateAt(trip.startDate, index), time, zone(id)!, path)
      : undefined;
  trip.days.forEach((source, index) => {
    if (pending && pending.endDay === index + 1) {
      current = pending.to;
      pending = undefined;
    }
    const startPlace = current;
    const dayLegs: Leg[] = [];
    let unknown = false;
    (source.blocks ?? []).forEach((b, j) => {
      const path = `days[${index}].blocks[${j}]`;
      if (pending)
        fail(path, "cannot add a block before the overnight journey arrives");
      if (b.type === "place") {
        current = b.place;
        unknown = true;
        return;
      }
      const from = b.from ?? current,
        endDay = b.endDay ?? index + 1;
      const departure = instant(index, b.start, from, path + ".start"),
        arrival = instant(endDay - 1, b.end, b.to, path + ".end");
      if (
        departure !== undefined &&
        knownFloor !== undefined &&
        departure < knownFloor
      )
        fail(
          path + ".start",
          "journey overlaps or precedes a previous known time",
        );
      if (
        arrival !== undefined &&
        knownFloor !== undefined &&
        arrival < knownFloor
      )
        fail(path + ".end", "arrival precedes a previous known time");
      if (
        departure !== undefined &&
        arrival !== undefined &&
        arrival < departure
      )
        fail(
          path + ".end",
          "arrival precedes departure; check timezones and endDay",
        );
      const leg: Leg = {
        id: `${index + 1}-${j + 1}`,
        day: index + 1,
        endDay,
        from,
        to: b.to,
        block: b,
        departure,
        arrival,
        durationMs:
          departure !== undefined && arrival !== undefined
            ? arrival - departure
            : undefined,
      };
      legs.push(leg);
      dayLegs.push(leg);
      knownFloor = arrival ?? departure ?? knownFloor;
      if (leg.durationMs === undefined) unknown = true;
      if (endDay > index + 1) {
        pending = leg;
        current = undefined;
      } else current = b.to;
    });
    days.push({
      index,
      date: trip.startDate ? dateAt(trip.startDate, index) : undefined,
      label: trip.startDate
        ? dateAt(trip.startDate, index)
        : `Day ${index + 1}`,
      source,
      startPlace,
      overnight: current,
      inTransit: !!pending,
      legs: dayLegs,
      segments: [],
      hasUnknownTiming: unknown,
    });
  });
  days.forEach((day, index) => {
    const active = legs.filter(
      (l) => l.day <= index + 1 && l.endDay >= index + 1,
    );
    const entering = active.find((l) => l.day < index + 1);
    const exiting = active.find((l) => l.endDay > index + 1);
    // Midnight stays in the origin zone until arrival; the arrival day's end uses destination.
    const startId = entering ? entering.from : day.startPlace;
    const endId = exiting ? exiting.from : day.overnight;
    day.start = instant(index, "00:00", startId, `days[${index}].start`);
    day.end = instant(index + 1, "00:00", endId, `days[${index}].end`);
    day.hasUnknownTiming ||=
      active.some((l) => l.durationMs === undefined) ||
      day.start === undefined ||
      day.end === undefined;
    if (
      day.start !== undefined &&
      day.end !== undefined &&
      day.end <= day.start
    )
      fail(`days[${index}]`, "day boundaries are not chronological");
    if (day.hasUnknownTiming) {
      day.segments = active.length
        ? active.map((leg) => ({
            type: "travel",
            leg,
            durationMs: leg.durationMs,
          }))
        : [{ type: day.overnight ? "stay" : "unknown", place: day.overnight }];
      return;
    }
    day.durationMs = day.end! - day.start!;
    let cursor = day.start!,
      location = entering ? entering.from : day.startPlace;
    for (const leg of active) {
      // A destination-local arrival can precede the origin-zone midnight boundary.
      // Its location still carries into this day even when no travel interval remains.
      if (leg.arrival! <= day.start!) {
        location = leg.to;
        continue;
      }
      const start = Math.max(day.start!, leg.departure!),
        end = Math.min(day.end!, leg.arrival!);
      if (end < start) continue;
      if (start > cursor)
        day.segments.push({
          type: location ? "stay" : "unknown",
          place: location,
          start: cursor,
          end: start,
          durationMs: start - cursor,
        });
      if (end > start)
        day.segments.push({
          type: "travel",
          leg,
          start,
          end,
          durationMs: end - start,
        });
      cursor = Math.max(cursor, end);
      location = leg.to;
    }
    if (cursor < day.end!)
      day.segments.push({
        type: location ? "stay" : "unknown",
        place: location,
        start: cursor,
        end: day.end,
        durationMs: day.end! - cursor,
      });
  });
  const hasUnknownTiming = days.some((d) => d.hasUnknownTiming),
    start = days[0].start,
    end = days.at(-1)!.end;
  return {
    trip,
    days,
    legs,
    start,
    end,
    totalDurationMs:
      !hasUnknownTiming && start !== undefined && end !== undefined
        ? end - start
        : undefined,
    knownTravelDurationMs: legs.reduce((s, l) => s + (l.durationMs ?? 0), 0),
    hasUnknownTiming,
  };
}
export function positionAt(
  itinerary: Itinerary,
  elapsedMs: number,
): {
  place?: string;
  from?: string;
  to?: string;
  progress?: number;
  coordinates?: {
    lat: number;
    lon: number;
  };
  moving: boolean;
} {
  if (itinerary.start === undefined || itinerary.hasUnknownTiming)
    return { moving: false };
  const at = itinerary.start + Math.max(0, elapsedMs);
  const segments = itinerary.days.flatMap((d) => d.segments);
  const segment =
    segments.find(
      (s) =>
        s.start !== undefined &&
        s.end !== undefined &&
        at >= s.start &&
        at < s.end,
    ) ?? (at >= itinerary.end! ? segments.at(-1) : undefined);
  if (segment?.type === "travel" && segment.leg) {
    const l = segment.leg,
      p = l.durationMs
        ? Math.min(1, Math.max(0, (at - l.departure!) / l.durationMs))
        : 1,
      a = l.from ? itinerary.trip.places[l.from].coordinates : undefined,
      b = itinerary.trip.places[l.to].coordinates;
    let coordinates:
      | {
          lat: number;
          lon: number;
        }
      | undefined;
    if (a && b) {
      const delta = ((b.lon - a.lon + 540) % 360) - 180;
      coordinates = {
        lat: a.lat + (b.lat - a.lat) * p,
        lon: ((a.lon + delta * p + 540) % 360) - 180,
      };
    }
    return { moving: p < 1, from: l.from, to: l.to, progress: p, coordinates };
  }
  const place = segment?.place;
  return {
    moving: false,
    place,
    coordinates: place ? itinerary.trip.places[place].coordinates : undefined,
  };
}
