// Generated from skills/trip-atlas-update-itinerary/itinerary.schema.json by `npm run schema`; do not edit.

export type Text = string;
/**
 * Linked local files.
 */
export type Documents = DocumentLink[];
/**
 * How you travel; `other` for anything else (cable car, rickshaw). On a journey, omit it when `components` give each part's mode; a line or service name belongs in `notes` only when you need it to catch the right one.
 */
export type TravelMode = "walk" | "train" | "bus" | "flight" | "ferry" | "car" | "other";
/**
 * true/false, or text for an included meal such as "18:00, Japanese"; an omitted meal is unknown.
 */
export type Meal = boolean | Text;
/**
 * Per person, in the trip currency.
 */
export type Price = number;
/**
 * Links the cost to estimates, each replaceable once; omission auto-matches hotels with a matching place and complete stay range, otherwise excluding the price from totals.
 */
export type BookingAllocation =
  AccommodationAllocation | TransportAllocation | ActivityAllocation | AdditionalAllocation | UnallocatedAllocation;
/**
 * A 1-based day within the trip.
 */
export type DayNumber = number;

/**
 * A Trip Atlas itinerary. The schema checks the shape of the file; `trip-atlas check` also checks references between fields, dates, timezones and totals.
 */
export interface TripInput {
  /**
   * This schema's URL, so editors can validate and complete the file.
   */
  $schema?: string;
  /**
   * Always 1.
   */
  version: 1;
  /**
   * Names the trip.
   */
  title?: string;
  /**
   * Dates day 1 as YYYY-MM-DD; otherwise days have numbers only.
   */
  startDate?: string;
  /**
   * The starting place ID from `places`.
   */
  initialPlace?: string;
  /**
   * IANA timezone fallback, such as Asia/Tokyo.
   */
  timezone?: string;
  /**
   * One uppercase three-letter currency such as EUR for all per-person amounts, whose totals must stay finite; required once any price is set. Zero means free and omission means unknown.
   */
  currency?: string;
  budget?: Budget;
  /**
   * Maps group IDs to named areas that simplify nearby places on the map.
   */
  groups?: {
    [k: string]: PlaceGroup;
  };
  /**
   * Maps place IDs to places; may be empty.
   */
  places: {
    [k: string]: PlaceInput;
  };
  /**
   * At least one day, in order; {} continues the current location unless travelling overnight.
   *
   * @minItems 1
   */
  days: TripDay[];
  /**
   * Reservations, kept separate from planned destinations.
   */
  bookings?: BookingInput[];
  documents?: Documents;
  prepare?: TripPreparation;
}
/**
 * Country-level cost estimates.
 */
export interface Budget {
  /**
   * Maps uppercase two-letter country codes to rates.
   */
  countries: {
    [k: string]: CountryBudget;
  };
}
export interface CountryBudget {
  /**
   * Daily estimate per person for food, drinks and small local rides, never tickets or tours; not charged on home days before the first night-stay country or after the last.
   */
  livingPerDay?: number;
  /**
   * Nightly accommodation share per person, excluding transit nights and the final day.
   */
  accommodationPerNight?: number;
}
export interface PlaceGroup {
  /**
   * Labels the shared area.
   */
  name: string;
  /**
   * Its color as #RRGGBB.
   */
  color?: string;
}
export interface PlaceInput {
  /**
   * Labels the place, defaulting to its ID.
   */
  name?: string;
  /**
   * An uppercase two-letter country code such as JP.
   */
  country?: string;
  /**
   * The place's IANA timezone for local travel times.
   */
  timezone?: string;
  /**
   * An existing group ID; does not change the underlying route.
   */
  group?: string;
  coordinates?: Coordinates;
}
/**
 * A latitude/longitude pair: map placement for a place, the exact property location for a booking.
 */
export interface Coordinates {
  lat: number;
  lon: number;
}
export interface TripDay {
  /**
   * Briefly describes the day's purpose: "Fly Hanoi → Tokyo", "Day trip to Nara". Without one the viewer shows the route ("Hanoi → Cat Ba") or the stay ("Hanoi · Day 3").
   */
  title?: string;
  /**
   * The day's one must-know that no booking, journey or activity owns; usually omitted.
   */
  notes?: string;
  /**
   * What makes the date itself special, shown in full under the day title: "🎂 Ana's birthday", "Christmas Eve", "Last night in Japan". Not for plans; those are activities.
   */
  occasions?: Text[];
  /**
   * What to see or do that day, in order.
   */
  activities?: Activity[];
  documents?: Documents;
  /**
   * Travel or place blocks in order; location carries forward afterward.
   */
  blocks?: (TravelBlock | PlaceBlock)[];
}
/**
 * Something to see or do that day: a temple, a cruise, a show, a bath.
 */
export interface Activity {
  /**
   * A unique stable reference for the booking that replaces its estimate.
   */
  id?: string;
  /**
   * The place's or experience's name as a traveller would search for it.
   */
  name: string;
  /**
   * A verified Google Maps link: open the place's coordinates in Google Maps, find the listing among nearby places, and confirm name and address before converting its place ID (the 0x…:0x… pair; the second half, as a decimal, is the cid). Never guess one.
   */
  mapUrl?: string;
  /**
   * One non-obvious sentence about it.
   */
  tip?: string;
  /**
   * Ticket, pass or tour price per person, counted under Activities; omit it for free activities.
   */
  estimatedCost?: number;
}
export interface DocumentLink {
  /**
   * Names the link shown in the UI.
   */
  label: string;
  /**
   * An existing local file relative to the itinerary folder, without absolute paths, URLs, traversal, backslashes, `:`, `%`, `?`, `#` or control characters. PDF, images, text and JSON open inline; other types download. Booking files live in documents/<country>/YYYY-MM-DD-<place>-<what>.pdf; the trip-atlas-download-booking skill fetches and names them.
   */
  path: string;
}
export interface TravelBlock {
  type: "travel";
  /**
   * The destination place ID.
   */
  to: string;
  /**
   * Overrides the origin, normally inferred from the current location.
   */
  from?: string;
  /**
   * A unique stable reference for booking costs.
   */
  id?: string;
  /**
   * Departure-local time as HH:mm.
   */
  start?: string;
  /**
   * Destination-local arrival time as HH:mm.
   */
  end?: string;
  /**
   * The absolute 1-based arrival day, defaulting to the departure day; intervening days must have no blocks.
   */
  endDay?: number;
  mode?: TravelMode;
  /**
   * Estimated minutes for the whole journey, without inventing clock times.
   */
  estimatedDurationMinutes?: number;
  /**
   * Journey price per person.
   */
  estimatedCost?: number;
  /**
   * Mixed transport parts whose estimates are summed when no whole-journey estimate is supplied.
   *
   * @minItems 1
   */
  components?: TravelComponent[];
  /**
   * Route length in kilometres, mainly for walks.
   */
  distanceKm?: number;
  /**
   * Total climb in metres.
   */
  ascentMeters?: number;
  /**
   * Total descent in metres.
   */
  descentMeters?: number;
  /**
   * Plain-text journey details.
   */
  notes?: string;
  documents?: Documents;
}
export interface TravelComponent {
  mode: TravelMode;
  /**
   * Estimated minutes for this part.
   */
  estimatedDurationMinutes?: number;
}
export interface PlaceBlock {
  type: "place";
  /**
   * The current place ID, without claiming a timed journey.
   */
  place: string;
}
export interface BookingInput {
  /**
   * `other` is a trip-wide expense (eSIM, visa) counted once in the whole-trip total.
   */
  type: "accommodation" | "transport" | "activity" | "other";
  /**
   * Names the reservation; for a stay, the property name.
   */
  title: string;
  /**
   * Its place ID; does not change the planned route.
   */
  place?: string;
  /**
   * The start or check-in date, independent of the trip's start date.
   */
  startDate?: string;
  /**
   * The end or checkout date; a hotel appears on checkout day without charging another night, and the Calendar lists it only on nights slept.
   */
  endDate?: string;
  /**
   * A 1-based trip day instead of calendar dates; the two cannot be mixed.
   */
  startDay?: number;
  /**
   * The last day or checkout day, after the start for accommodation.
   */
  endDay?: number;
  /**
   * Omission confirms nothing; cancellation excludes its cost.
   */
  status?: "planned" | "confirmed" | "cancelled";
  /**
   * The confirmation reference.
   */
  reference?: string;
  /**
   * Meals with a stay, shown as dinner, breakfast, lunch; a text value is shown on hover. Put meal times and types here, not in notes.
   */
  meals?: {
    dinner?: Meal;
    breakfast?: Meal;
    lunch?: Meal;
  };
  /**
   * Local check-in time as HH:mm or a HH:mm-HH:mm window.
   */
  checkIn?: string;
  /**
   * Latest local check-out time as HH:mm.
   */
  checkOut?: string;
  /**
   * Per-person bag allowances, e.g. on a flight.
   */
  baggage?: BaggageAllowance[];
  /**
   * A plain-text reminder shown on the booking card, as a quiet tip by default.
   */
  notes?: string;
  /**
   * true when the note is a must rather than a tip (e.g. "Bring ¥32,000 in cash"); the card then highlights it.
   */
  important?: boolean;
  coordinates?: Coordinates;
  /**
   * A verified Google Maps link to the place itself; the map pin opens it instead of the bare coordinates. Never invent one.
   */
  mapUrl?: string;
  documents?: Documents;
  /**
   * The booking price, or a bare number as shorthand for { "amount": n }; omission keeps the existing estimates.
   */
  cost?: Price | BookingCost;
}
export interface BaggageAllowance {
  type: "checked" | "cabin" | "personal";
  pieces: number;
  /**
   * Weight limit per piece.
   */
  kg?: number;
}
export interface BookingCost {
  /**
   * Per person, in the trip currency.
   */
  amount: number;
  /**
   * Defaults to estimated; independent of the reservation status.
   */
  status?: "estimated" | "confirmed" | "paid";
  allocation?: BookingAllocation;
}
export interface AccommodationAllocation {
  type: "accommodation";
  /**
   * Unique 1-based days whose following nights are replaced equally. They must match the booking's complete check-in/checkout range and its place's overnight stays, and exclude transit nights and the final day.
   *
   * @minItems 1
   */
  nights: DayNumber[];
}
export interface TransportAllocation {
  type: "transport";
  /**
   * The travel block `id` whose estimate is replaced. It is also how a flight counts as booked: with "Show unbooked" on, the Calendar marks every flight without a non-planned, non-cancelled booking linked this way, so give booked flights' blocks an `id`.
   */
  leg: string;
}
export interface ActivityAllocation {
  type: "activity";
  /**
   * The planned activity `id` whose estimatedCost is replaced; the day card then marks it booked.
   */
  activity: string;
}
export interface AdditionalAllocation {
  type: "additional";
  /**
   * A 1-based day within the trip.
   */
  day: number;
}
export interface UnallocatedAllocation {
  type: "unallocated";
}
/**
 * The trip-wide checklist and packing list; the tab stays hidden without items.
 */
export interface TripPreparation {
  /**
   * Tasks in priority order, which supplies their displayed ranks even when completed.
   */
  checklist?: PreparationTask[];
  /**
   * Items grouped by category in first-appearance order.
   */
  packing?: PackingItem[];
}
export interface PreparationTask {
  title: Text;
  /**
   * Defaults to false; editable only in the file.
   */
  done?: boolean;
  notes?: Text;
}
export interface PackingItem {
  title: Text;
  /**
   * Defaults to false; editable only in the file.
   */
  packed?: boolean;
  /**
   * Groups related items.
   */
  category?: string;
  /**
   * A count; no quantity is assumed when omitted.
   */
  quantity?: number;
  notes?: Text;
}
