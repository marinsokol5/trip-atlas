import { Validator, type OutputUnit, type Schema } from "@cfworker/json-schema";
import schema from "../skills/trip-atlas-update-itinerary/itinerary.schema.json" with { type: "json" };
import { validateBookingAllocations } from "./booking-model.ts";
import type {
  BookingCost,
  BookingInput,
  PlaceInput,
  TravelBlock,
  TripDay,
  TripInput,
} from "./itinerary-schema.ts";

// The file format lives in the shipped JSON Schema; these are its generated types.
export type {
  Activity,
  BaggageAllowance,
  BookingAllocation,
  BookingCost,
  BookingInput,
  CountryBudget,
  DocumentLink,
  Meal,
  PackingItem,
  PlaceBlock,
  PlaceGroup,
  PlaceInput,
  PreparationTask,
  TravelBlock,
  TravelComponent,
  TravelMode,
  TripDay,
  TripInput,
  TripPreparation,
} from "./itinerary-schema.ts";
export type CostStatus = NonNullable<BookingCost["status"]>;
/** A booking after parsing: a bare-number cost becomes `{ amount }`. */
export type Booking = Omit<BookingInput, "cost"> & { cost?: BookingCost };
/** A place after parsing, named by its ID when the file gives none. */
export type Place = PlaceInput & { name: string };
/** A trip after parsing, with defaults filled in. */
export type Trip = Omit<TripInput, "title" | "places" | "bookings"> & {
  title: string;
  places: Record<string, Place>;
  bookings?: Booking[];
};
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

const validator = new Validator(schema as Schema, "2020-12", true);
/** `#/days/0/to` as `days[0].to`, walking the input to tell array indexes from object keys. */
function schemaPath(input: unknown, pointer: string): string {
  let path = "trip",
    value = input;
  for (const raw of pointer.split("/").slice(1)) {
    const key = decodeURIComponent(raw)
      .replaceAll("~1", "/")
      .replaceAll("~0", "~");
    path = Array.isArray(value)
      ? `${path}[${key}]`
      : path === "trip"
        ? key
        : `${path}.${key}`;
    value = (value as Record<string, unknown> | undefined)?.[key];
  }
  return path;
}
type SchemaNode = Record<string, unknown>;
/** The schema node at a cfworker keyword location, following each `$ref` on the way. */
function schemaAt(keywordLocation: string): SchemaNode {
  let node: unknown = schema;
  for (const raw of keywordLocation.split("/").slice(1)) {
    node = (node as SchemaNode)[decodeURIComponent(raw)];
    if (raw === "$ref")
      node = (node as string)
        .slice(2)
        .split("/")
        .reduce((n: unknown, key) => (n as SchemaNode)[key], schema);
  }
  return node as SchemaNode;
}
const list = (values: unknown[]) =>
  [...new Set(values.flat())].map((v) => JSON.stringify(v)).join(" or ");
/** What a failed keyword expected, in words; the schema's `errorMessage` wins where it has one. */
function expected(error: OutputUnit): string {
  const at = error.keywordLocation,
    node = schemaAt(at.slice(0, at.lastIndexOf("/"))),
    value = node[error.keyword];
  switch (error.keyword) {
    case "type":
      return `expected ${[value].flat().join(" or ")}`;
    case "enum":
      return `expected one of ${(value as unknown[]).join(", ")}`;
    case "const":
      return `expected ${JSON.stringify(value)}`;
    case "pattern":
      return (node.errorMessage as string) ?? `expected to match ${value}`;
    case "minimum":
      return `expected at least ${value}`;
    case "exclusiveMinimum":
      return `expected more than ${value}`;
    case "maximum":
      return `expected at most ${value}`;
    case "minLength":
      return "expected a non-empty string";
    case "minItems":
      return `expected at least ${value} ${value === 1 ? "item" : "items"}`;
    case "uniqueItems":
      return "expected unique items";
  }
  return error.error;
}
const branch = /\/(oneOf|anyOf)\/\d+/g;
/**
 * Throws the one schema error worth reading: the first concrete failure, skipping union
 * branches whose JSON type or `type` discriminator shows they were never the intended shape.
 */
function schemaFailure(input: unknown, errors: OutputUnit[]): never {
  const unionAt = new Map(
    errors
      .filter((e) => e.keyword === "oneOf" || e.keyword === "anyOf")
      .map((e) => [e.keywordLocation, e.instanceLocation]),
  );
  const wrong = new Set<string>();
  for (const e of errors) {
    if (e.keyword !== "const" && e.keyword !== "type") continue;
    const last = [...e.keywordLocation.matchAll(branch)].at(-1);
    if (!last) continue;
    const prefix = e.keywordLocation.slice(0, last.index + last[0].length),
      at = unionAt.get(prefix.replace(/\/\d+$/, ""));
    if (e.instanceLocation === at || e.instanceLocation === `${at}/type`)
      wrong.add(prefix);
  }
  const relevant = errors.filter(
    (e) =>
      ![...wrong].some(
        (p) => e.keywordLocation === p || e.keywordLocation.startsWith(p + "/"),
      ),
  );
  const wrappers = [
    "properties",
    "items",
    "$ref",
    "oneOf",
    "anyOf",
    "not",
    "additionalProperties",
  ];
  const leaf =
      relevant.find((e) => !wrappers.includes(e.keyword)) ?? relevant.at(-1)!,
    path = schemaPath(input, leaf.instanceLocation),
    quoted = /"(.*?)"/.exec(leaf.error)?.[1];
  switch (leaf.keyword) {
    case "false":
      fail(path, "unknown field");
    case "required":
      fail(schemaPath(input, `${leaf.instanceLocation}/${quoted}`), "required");
    case "propertyNames": {
      const key = errors.find(
        (e) =>
          e.keywordLocation.startsWith(leaf.keywordLocation + "/") &&
          !wrappers.includes(e.keyword),
      );
      fail(
        schemaPath(input, `${leaf.instanceLocation}/${quoted}`),
        key ? expected(key) : leaf.error,
      );
    }
    case "dependentSchemas": {
      const node = schemaAt(leaf.keywordLocation) as Record<string, SchemaNode>;
      fail(path, (node[quoted!]?.errorMessage as string) ?? leaf.error);
    }
    case "oneOf":
    case "anyOf": {
      // Every branch was the wrong shape: name the discriminators or JSON types it accepts.
      const union = leaf.keywordLocation;
      const branches = (schemaAt(union) as unknown as unknown[]).map((_, i) => {
        const b = schemaAt(`${union}/${i}`);
        return b.$ref ? schemaAt(`${union}/${i}/$ref`) : b;
      });
      const discriminators = branches.map(
        (b) =>
          (b.properties as Record<string, SchemaNode> | undefined)?.type?.const,
      );
      const value = errors.find(
        (e) =>
          e.instanceLocation === leaf.instanceLocation && e.keyword === "type",
      );
      if (!value && discriminators.every((d) => d !== undefined))
        fail(
          schemaPath(input, `${leaf.instanceLocation}/type`),
          `expected ${list(discriminators)}`,
        );
      fail(
        path,
        `expected ${[...new Set(branches.flatMap((b) => b.type ?? []))].join(" or ")}`,
      );
    }
  }
  fail(path, expected(leaf));
}
/** JSON.parse can still yield Infinity (1e400); objects built in code can hold anything. */
function assertJsonData(value: unknown, path: string) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "expected a finite number");
  } else if (typeof value === "string") {
    if (/\p{Cs}/u.test(value)) fail(path, "contains an unpaired surrogate");
  } else if (Array.isArray(value))
    value.forEach((v, i) => assertJsonData(v, `${path}[${i}]`));
  else if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      const child = path === "trip" ? key : `${path}.${key}`;
      if (/\p{Cs}/u.test(key)) fail(child, "contains an unpaired surrogate");
      assertJsonData(v, child);
    }
  else if (value !== null && typeof value !== "boolean")
    fail(path, `expected JSON data, not ${typeof value}`);
}
function assertTripShape(input: unknown): asserts input is TripInput {
  assertJsonData(input, "trip");
  const { valid, errors } = validator.validate(input);
  if (!valid) schemaFailure(input, errors);
}

/** The one external site Trip Atlas links to: Google Maps, over https. */
export function isGoogleMapsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname,
    path = url.pathname;
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (host === "maps.app.goo.gl" ||
      /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) ||
      (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) &&
        (path === "/maps" || path.startsWith("/maps/"))) ||
      (host === "goo.gl" && path.startsWith("/maps/")))
  );
}
// Control characters are deliberately forbidden in local paths; the schema's document path pattern matches this.
export function safeRelativePath(path: string): boolean {
  return (
    !!path &&
    // oxlint-disable-next-line no-control-regex
    !/[\\:#?%\u0000-\u001f]/.test(path) &&
    !path.startsWith("/") &&
    path.split("/").every((p) => !!p && p !== "." && p !== "..")
  );
}
/** Where demo trips are served: under the site's base path in a Vite build (e.g. GitHub Pages), else the root. */
export const tripsRoot = (import.meta.env?.BASE_URL ?? "/") + "trips/";
export function documentUrl(folder: string, path: string): string {
  if (!safeRelativePath(folder) || !safeRelativePath(path))
    fail("documents.path", "use a relative local path without traversal");
  return (
    tripsRoot +
    [...folder.split("/"), ...path.split("/")].map(encodeURIComponent).join("/")
  );
}
function dateValid(s: string) {
  return (
    !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s
  );
}
export function dateAt(date: string, offset: number): string {
  return new Date(Date.parse(date) + offset * 86400000)
    .toISOString()
    .slice(0, 10);
}
function zoneValid(zone: string, path: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  } catch {
    fail(path, "invalid IANA timezone");
  }
}
/**
 * Checks the file against the schema, then everything the schema cannot express:
 * references between fields, real dates and timezones, day ranges and finite totals.
 */
export function parseTrip(input: unknown): Trip {
  assertTripShape(input);
  const t = input,
    dayCount = t.days.length;

  let hasPrices = false;
  let priceTotal = 0;
  let durationTotalMs = 0;
  const duration = (value: number | undefined, path: string) => {
    if (value === undefined) return;
    durationTotalMs += value * 60000;
    if (!Number.isFinite(durationTotalMs))
      fail(path, "duration is too large to total safely in milliseconds");
  };
  const price = (value: number | undefined, path: string, units = 1) => {
    if (value === undefined) return;
    hasPrices = true;
    priceTotal += value * units;
    if (!Number.isFinite(priceTotal))
      fail(path, "amount is too large to total safely across the trip");
  };
  const dayNumber = (value: number, path: string) => {
    if (value > dayCount) fail(path, "expected a 1-based day within the trip");
  };
  for (const [code, rates] of Object.entries(t.budget?.countries ?? {})) {
    price(
      rates.livingPerDay,
      `budget.countries.${code}.livingPerDay`,
      dayCount,
    );
    price(
      rates.accommodationPerNight,
      `budget.countries.${code}.accommodationPerNight`,
      Math.max(0, dayCount - 1),
    );
  }
  if (t.startDate !== undefined && !dateValid(t.startDate))
    fail("startDate", "expected a real YYYY-MM-DD date");
  if (t.timezone !== undefined) zoneValid(t.timezone, "timezone");
  const groups = t.groups ?? {};
  for (const [id, p] of Object.entries(t.places)) {
    if (p.group !== undefined && !Object.hasOwn(groups, p.group))
      fail(`places.${id}.group`, "unknown group ID");
    if (p.timezone !== undefined)
      zoneValid(p.timezone, `places.${id}.timezone`);
  }
  const place = (id: string, path: string) => {
    if (!Object.hasOwn(t.places, id)) fail(path, "unknown place ID");
  };
  if (t.initialPlace !== undefined) place(t.initialPlace, "initialPlace");
  const travelIds = new Set<string>(),
    activityIds = new Set<string>();
  t.days.forEach((d, i) => {
    const path = `days[${i}]`;
    d.activities?.forEach((activity, j) => {
      const p = `${path}.activities[${j}]`;
      if (activity.id !== undefined) {
        if (activityIds.has(activity.id))
          fail(p + ".id", "duplicate activity ID");
        activityIds.add(activity.id);
      }
      if (activity.mapUrl !== undefined && !isGoogleMapsUrl(activity.mapUrl))
        fail(p + ".mapUrl", "expected an https Google Maps link");
      price(activity.estimatedCost, p + ".estimatedCost");
    });
    d.blocks?.forEach((b, j) => {
      const p = `${path}.blocks[${j}]`;
      if (b.type === "place") return place(b.place, p + ".place");
      if (b.id !== undefined) {
        if (travelIds.has(b.id)) fail(p + ".id", "duplicate travel ID");
        travelIds.add(b.id);
      }
      price(b.estimatedCost, p + ".estimatedCost");
      place(b.to, p + ".to");
      if (b.from !== undefined) place(b.from, p + ".from");
      if (b.endDay !== undefined && (b.endDay < i + 1 || b.endDay > dayCount))
        fail(
          p + ".endDay",
          "expected 1-based arrival day within trip, on or after departure day",
        );
      duration(b.estimatedDurationMinutes, p + ".estimatedDurationMinutes");
      b.components?.forEach((c, k) =>
        duration(
          c.estimatedDurationMinutes,
          `${p}.components[${k}].estimatedDurationMinutes`,
        ),
      );
    });
  });
  t.bookings?.forEach((b, index) => {
    const path = `bookings[${index}]`;
    if (b.place !== undefined) place(b.place, path + ".place");
    if (b.mapUrl !== undefined && !isGoogleMapsUrl(b.mapUrl))
      fail(path + ".mapUrl", "expected an https Google Maps link");
    for (const key of ["startDate", "endDate"] as const) {
      const date = b[key];
      if (date !== undefined && !dateValid(date))
        fail(path + "." + key, "expected a real YYYY-MM-DD date");
    }
    for (const key of ["startDay", "endDay"] as const) {
      const day = b[key];
      if (day !== undefined) dayNumber(day, path + "." + key);
    }
    if (
      (b.startDate !== undefined || b.endDate !== undefined) &&
      (b.startDay !== undefined || b.endDay !== undefined)
    )
      fail(path, "use calendar dates or trip day numbers, not both");
    for (const [start, end] of [
      [b.startDate, b.endDate],
      [b.startDay, b.endDay],
    ] as const)
      if (
        start !== undefined &&
        end !== undefined &&
        (end < start || (b.type === "accommodation" && end === start))
      )
        fail(
          path + (typeof end === "string" ? ".endDate" : ".endDay"),
          "must follow the start (accommodation needs at least one night)",
        );
    // A bare number is shorthand for `{ "amount": n }`.
    if (typeof b.cost === "number") return price(b.cost, path + ".cost");
    if (b.cost === undefined) return;
    price(b.cost.amount, path + ".cost.amount");
    const a = b.cost.allocation,
      ap = path + ".cost.allocation";
    if (a === undefined) return;
    if (b.type === "other")
      fail(ap, "other bookings count once in the trip total; omit allocation");
    if (
      (a.type === "accommodation" && b.type !== "accommodation") ||
      (a.type === "transport" && b.type !== "transport") ||
      ((a.type === "activity" || a.type === "additional") &&
        b.type !== "activity")
    )
      fail(ap + ".type", "allocation must match the booking type");
    if (a.type === "transport" && !travelIds.has(a.leg))
      fail(ap + ".leg", "unknown travel block ID");
    if (a.type === "activity" && !activityIds.has(a.activity))
      fail(ap + ".activity", "unknown activity ID");
    if (a.type === "additional") dayNumber(a.day, ap + ".day");
    if (a.type === "accommodation") {
      a.nights.forEach((n, i) => dayNumber(n, `${ap}.nights[${i}]`));
      if (a.nights.includes(dayCount))
        fail(ap + ".nights", "the final trip day has no accommodation night");
    }
  });
  if (hasPrices && t.currency === undefined)
    fail(
      "currency",
      "required when budget rates, estimatedCost or booking amounts are supplied; use one uppercase ISO3 currency for the whole trip",
    );
  const { title, places, bookings, ...rest } = t;
  return {
    ...rest,
    title: title ?? "Untitled journey",
    ...(bookings && {
      bookings: bookings.map(({ cost, ...b }): Booking =>
        cost === undefined
          ? b
          : { ...b, cost: typeof cost === "number" ? { amount: cost } : cost },
      ),
    }),
    places: Object.fromEntries(
      Object.entries(places).map(([id, p]) => [
        id,
        { ...p, name: p.name ?? id },
      ]),
    ),
  };
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
  const model: Itinerary = {
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
  validateBookingAllocations(model);
  return model;
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
