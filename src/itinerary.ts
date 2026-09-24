import { validateBookingAllocations } from "./booking-model.ts";

const clock = "([01]\\d|2[0-3]):[0-5]\\d";

export interface DocumentLink {
  label: string;
  path: string;
}
export type Meal = boolean | string;
export interface BaggageAllowance {
  type: "checked" | "cabin" | "personal";
  pieces: number;
  /** Weight limit per piece. */
  kg?: number;
}
export type CostStatus = "estimated" | "confirmed" | "paid";
export type BookingAllocation =
  | { type: "accommodation"; nights: number[] }
  | { type: "transport"; leg: string }
  | { type: "living"; days: number[] }
  | { type: "additional"; day: number }
  | { type: "unallocated" };
export interface Booking {
  /** `other` is a trip-wide expense (eSIM, visa) counted once in the whole-trip total. */
  type: "accommodation" | "transport" | "activity" | "other";
  title: string;
  place?: string;
  startDate?: string;
  endDate?: string;
  startDay?: number;
  endDay?: number;
  status?: "planned" | "confirmed" | "cancelled";
  reference?: string;
  /** Meals with a stay: true/false, or text (e.g. "18:00, Japanese") for an included meal; omission means unknown. */
  meals?: { dinner?: Meal; breakfast?: Meal; lunch?: Meal };
  /** Local check-in time as `HH:mm` or a `HH:mm-HH:mm` window. */
  checkIn?: string;
  /** Latest local check-out time as `HH:mm`. */
  checkOut?: string;
  /** Bags each person may carry, e.g. on a flight. */
  baggage?: BaggageAllowance[];
  /** Plain-text reminder shown on the booking card. */
  notes?: string;
  /** Marks the note as a must, not a tip (e.g. "Bring ¥32,000 in cash"). */
  important?: boolean;
  /** Exact property location, linked to an external map. */
  coordinates?: { lat: number; lon: number };
  /** A Google Maps link to the place itself, opened instead of the coordinates. */
  mapUrl?: string;
  documents?: DocumentLink[];
  cost?: {
    /** Whole booking amount for one person, in the trip currency. */
    amount: number;
    status?: CostStatus;
    allocation?: BookingAllocation;
  };
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
  /** Stable optional ID for explicit booking cost replacement. */
  id?: string;
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
  /** Route length in kilometres, mainly for walks. */
  distanceKm?: number;
  /** Total climb and descent in metres. */
  ascentMeters?: number;
  descentMeters?: number;
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
export interface PreparationTask {
  title: string;
  done?: boolean;
  notes?: string;
}
export interface PackingItem {
  title: string;
  packed?: boolean;
  notes?: string;
  category?: string;
  quantity?: number;
}
export interface TripPreparation {
  /** Array order is priority order, including completed tasks. */
  checklist?: PreparationTask[];
  packing?: PackingItem[];
}
export interface Trip {
  prepare?: TripPreparation;
  bookings?: Booking[];
  documents?: DocumentLink[];
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
function coordinates(value: unknown, path: string) {
  const c = object(value, path);
  if (
    typeof c.lat !== "number" ||
    !Number.isFinite(c.lat) ||
    Math.abs(c.lat) > 90 ||
    typeof c.lon !== "number" ||
    !Number.isFinite(c.lon) ||
    Math.abs(c.lon) > 180
  )
    fail(path, "invalid latitude/longitude");
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
  if (!Array.isArray(t.days) || !t.days.length)
    fail("days", "expected at least one day");

  let hasPrices = false;
  let priceTotal = 0;
  let durationTotalMs = 0;
  const duration = (value: unknown, path: string) => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      fail(path, "expected positive finite minutes");
    durationTotalMs += value * 60000;
    if (!Number.isFinite(durationTotalMs))
      fail(path, "duration is too large to total safely in milliseconds");
  };
  const price = (value: unknown, path: string, units = 1) => {
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      fail(path, "expected a finite nonnegative amount");
    hasPrices = true;
    priceTotal += value * units;
    if (!Number.isFinite(priceTotal))
      fail(path, "amount is too large to total safely across the trip");
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
      price(
        rates.livingPerDay,
        `budget.countries.${code}.livingPerDay`,
        t.days.length,
      );
      price(
        rates.accommodationPerNight,
        `budget.countries.${code}.accommodationPerNight`,
        Math.max(0, t.days.length - 1),
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
    if (p.coordinates !== undefined)
      coordinates(p.coordinates, `places.${id}.coordinates`);
  });
  const place = (v: unknown, path: string) => {
    if (typeof v !== "string" || !Object.hasOwn(places, v))
      fail(path, "unknown place ID");
  };
  if (t.initialPlace !== undefined) place(t.initialPlace, "initialPlace");
  const travelIds = new Set<string>();
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
          if (b.id !== undefined) {
            string(b.id, p + ".id");
            if (travelIds.has(b.id as string))
              fail(p + ".id", "duplicate travel ID");
            travelIds.add(b.id as string);
          }
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
            b.distanceKm !== undefined &&
            (typeof b.distanceKm !== "number" ||
              !Number.isFinite(b.distanceKm) ||
              b.distanceKm <= 0)
          )
            fail(p + ".distanceKm", "expected positive finite kilometres");
          for (const k of ["ascentMeters", "descentMeters"])
            if (
              b[k] !== undefined &&
              (typeof b[k] !== "number" ||
                !Number.isFinite(b[k]) ||
                (b[k] as number) < 0)
            )
              fail(p + "." + k, "expected nonnegative finite metres");
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
          duration(b.estimatedDurationMinutes, p + ".estimatedDurationMinutes");
          if (b.components !== undefined) {
            if (!Array.isArray(b.components) || !b.components.length)
              fail(p + ".components", "expected nonempty array");
            b.components.forEach((value, k) => {
              const c = object(value, `${p}.components[${k}]`);
              string(c.mode, `${p}.components[${k}].mode`);
              duration(
                c.estimatedDurationMinutes,
                `${p}.components[${k}].estimatedDurationMinutes`,
              );
            });
          }
          documents(b.documents, p + ".documents");
        } else fail(p + ".type", "expected travel or place");
      });
    }
  });
  documents(t.documents, "documents");
  if (t.prepare !== undefined) {
    const prepare = object(t.prepare, "prepare");
    for (const key of ["checklist", "packing"] as const) {
      const items = prepare[key];
      if (items === undefined) continue;
      if (!Array.isArray(items)) fail(`prepare.${key}`, "expected an array");
      items.forEach((value, index) => {
        const path = `prepare.${key}[${index}]`,
          item = object(value, path),
          status = key === "checklist" ? "done" : "packed";
        string(item.title, path + ".title");
        if (item.notes !== undefined) string(item.notes, path + ".notes");
        if (item[status] !== undefined && typeof item[status] !== "boolean")
          fail(path + "." + status, "expected a boolean");
        if (key === "packing") {
          if (item.category !== undefined)
            string(item.category, path + ".category");
          if (
            item.quantity !== undefined &&
            (typeof item.quantity !== "number" ||
              !Number.isSafeInteger(item.quantity) ||
              item.quantity <= 0)
          )
            fail(path + ".quantity", "expected a positive safe integer");
        }
      });
    }
  }
  const dayNumber = (value: unknown, path: string) => {
    if (
      !Number.isInteger(value) ||
      Number(value) < 1 ||
      Number(value) > (t.days as unknown[]).length
    )
      fail(path, "expected a 1-based day within the trip");
  };
  if (t.bookings !== undefined) {
    if (!Array.isArray(t.bookings)) fail("bookings", "expected an array");
    t.bookings.forEach((value, index) => {
      const path = `bookings[${index}]`,
        b = object(value, path);
      string(b.title, path + ".title");
      if (
        !["accommodation", "transport", "activity", "other"].includes(
          b.type as string,
        )
      )
        fail(
          path + ".type",
          "expected accommodation, transport, activity or other",
        );
      if (b.place !== undefined) place(b.place, path + ".place");
      if (b.reference !== undefined) string(b.reference, path + ".reference");
      if (b.meals !== undefined) {
        const meals = object(b.meals, path + ".meals");
        for (const [key, value] of Object.entries(meals)) {
          if (!["dinner", "breakfast", "lunch"].includes(key))
            fail(path + ".meals." + key, "expected dinner, breakfast or lunch");
          if (
            typeof value !== "boolean" &&
            (typeof value !== "string" || !value.trim())
          )
            fail(path + ".meals." + key, "expected a boolean or text");
        }
      }
      if (
        b.checkIn !== undefined &&
        (typeof b.checkIn !== "string" ||
          !new RegExp(`^${clock}(-${clock})?$`).test(b.checkIn))
      )
        fail(path + ".checkIn", "expected HH:mm or HH:mm-HH:mm");
      if (
        b.checkOut !== undefined &&
        (typeof b.checkOut !== "string" ||
          !new RegExp(`^${clock}$`).test(b.checkOut))
      )
        fail(path + ".checkOut", "expected HH:mm");
      if (b.coordinates !== undefined)
        coordinates(b.coordinates, path + ".coordinates");
      if (b.mapUrl !== undefined && !isGoogleMapsUrl(b.mapUrl))
        fail(path + ".mapUrl", "expected an https Google Maps link");
      if (b.notes !== undefined) string(b.notes, path + ".notes");
      if (b.important !== undefined && typeof b.important !== "boolean")
        fail(path + ".important", "expected a boolean");
      if (b.baggage !== undefined) {
        if (!Array.isArray(b.baggage))
          fail(path + ".baggage", "expected an array");
        b.baggage.forEach((value, i) => {
          const bagPath = `${path}.baggage[${i}]`,
            bag = object(value, bagPath);
          if (!["checked", "cabin", "personal"].includes(bag.type as string))
            fail(bagPath + ".type", "expected checked, cabin or personal");
          if (!Number.isSafeInteger(bag.pieces) || (bag.pieces as number) < 0)
            fail(bagPath + ".pieces", "expected a nonnegative whole number");
          if (
            bag.kg !== undefined &&
            (typeof bag.kg !== "number" ||
              !Number.isFinite(bag.kg) ||
              bag.kg <= 0)
          )
            fail(bagPath + ".kg", "expected positive finite kilograms");
        });
      }
      if (
        b.status !== undefined &&
        !["planned", "confirmed", "cancelled"].includes(b.status as string)
      )
        fail(path + ".status", "expected planned, confirmed or cancelled");
      documents(b.documents, path + ".documents");
      for (const key of ["startDate", "endDate"])
        if (
          b[key] !== undefined &&
          (typeof b[key] !== "string" || !dateValid(b[key] as string))
        )
          fail(path + "." + key, "expected a real YYYY-MM-DD date");
      for (const key of ["startDay", "endDay"])
        if (b[key] !== undefined) dayNumber(b[key], path + "." + key);
      if (
        (b.startDate !== undefined || b.endDate !== undefined) &&
        (b.startDay !== undefined || b.endDay !== undefined)
      )
        fail(path, "use calendar dates or trip day numbers, not both");
      for (const [start, end] of [
        ["startDate", "endDate"],
        ["startDay", "endDay"],
      ])
        if (
          b[start] !== undefined &&
          b[end] !== undefined &&
          (b[end]! < b[start]! ||
            (b.type === "accommodation" && b[end] === b[start]))
        )
          fail(
            path + "." + end,
            "must follow the start (accommodation needs at least one night)",
          );
      // A bare number is shorthand for `{ "amount": n }`.
      if (typeof b.cost === "number") price(b.cost, path + ".cost");
      else if (b.cost !== undefined) {
        const c = object(b.cost, path + ".cost");
        if (c.amount === undefined)
          fail(
            path + ".cost.amount",
            "required when cost is supplied; omit cost if unknown",
          );
        price(c.amount, path + ".cost.amount");
        if (
          c.status !== undefined &&
          !["estimated", "confirmed", "paid"].includes(c.status as string)
        )
          fail(path + ".cost.status", "expected estimated, confirmed or paid");
        if (c.allocation !== undefined && b.type === "other")
          fail(
            path + ".cost.allocation",
            "other bookings count once in the trip total; omit allocation",
          );
        if (c.allocation !== undefined) {
          const a = object(c.allocation, path + ".cost.allocation"),
            ap = path + ".cost.allocation";
          const keys =
            a.type === "accommodation"
              ? ["type", "nights"]
              : a.type === "transport"
                ? ["type", "leg"]
                : a.type === "living"
                  ? ["type", "days"]
                  : a.type === "additional"
                    ? ["type", "day"]
                    : a.type === "unallocated"
                      ? ["type"]
                      : [];
          if (!keys.length)
            fail(
              ap + ".type",
              "expected accommodation, transport, living, additional or unallocated",
            );
          if (Object.keys(a).some((key) => !keys.includes(key)))
            fail(ap, "unexpected allocation field");
          if (
            (a.type === "accommodation" && b.type !== "accommodation") ||
            (a.type === "transport" && b.type !== "transport") ||
            (["living", "additional"].includes(a.type as string) &&
              b.type !== "activity")
          )
            fail(ap + ".type", "allocation must match the booking type");
          if (a.type === "transport") {
            if (typeof a.leg !== "string" || !travelIds.has(a.leg))
              fail(ap + ".leg", "unknown travel block ID");
          } else if (a.type === "additional") dayNumber(a.day, ap + ".day");
          else if (a.type !== "unallocated") {
            const key = a.type === "accommodation" ? "nights" : "days",
              units = a[key];
            if (!Array.isArray(units) || !units.length)
              fail(ap + "." + key, "expected a nonempty array of day numbers");
            units.forEach((n, i) => dayNumber(n, `${ap}.${key}[${i}]`));
            if (new Set(units).size !== units.length)
              fail(ap + "." + key, "duplicate day number");
            if (
              a.type === "accommodation" &&
              units.includes((t.days as unknown[]).length)
            )
              fail(
                ap + ".nights",
                "the final trip day has no accommodation night",
              );
          }
        }
      }
    });
  }
  if (hasPrices && t.currency === undefined)
    fail(
      "currency",
      "required when budget rates, estimatedCost or booking amounts are supplied; use one uppercase ISO3 currency for the whole trip",
    );
  return {
    ...t,
    title: t.title ?? "Untitled journey",
    ...(Array.isArray(t.bookings) && {
      bookings: t.bookings.map((b: Record<string, unknown>) =>
        typeof b.cost === "number" ? { ...b, cost: { amount: b.cost } } : b,
      ),
    }),
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
