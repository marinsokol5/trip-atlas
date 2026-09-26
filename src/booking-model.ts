import type {
  Booking,
  BookingAllocation,
  Itinerary,
  Leg,
  Trip,
} from "./itinerary.ts";
import { componentLegs, mapAreas, modeKind } from "./view-model.ts";

/** Dates remain authored calendar dates; offsets are only a view of this trip. */
export function bookingRange(booking: Booking, trip: Trip) {
  const offset = (date?: string) =>
    date && trip.startDate
      ? Math.round((Date.parse(date) - Date.parse(trip.startDate)) / 86400000) +
        1
      : undefined;
  return {
    start: booking.startDay ?? offset(booking.startDate),
    end: booking.endDay ?? offset(booking.endDate),
  };
}
export function accommodationNights(
  booking: Booking,
  trip: Trip,
): number[] | undefined {
  const { start, end } = bookingRange(booking, trip);
  if (
    start === undefined ||
    end === undefined ||
    start < 1 ||
    end > trip.days.length ||
    end <= start
  )
    return undefined;
  return Array.from({ length: end - start }, (_, i) => start + i);
}
export function bookingAllocation(
  booking: Booking,
  trip: Trip,
): BookingAllocation | undefined {
  if (!booking.cost) return undefined;
  if (booking.cost.allocation?.type === "unallocated") return undefined;
  if (booking.cost.allocation) return booking.cost.allocation;
  if (booking.type === "accommodation" && booking.place) {
    const nights = accommodationNights(booking, trip);
    if (nights) return { type: "accommodation", nights };
  }
  return undefined;
}
export function validateBookingAllocations(model: Itinerary) {
  const claimed = new Map<string, number>();
  for (const [index, booking] of (model.trip.bookings ?? []).entries()) {
    if (booking.status === "cancelled") continue;
    const allocation = bookingAllocation(booking, model.trip);
    if (!allocation) continue;
    const path = `bookings[${index}].cost.allocation`;
    const fail = (message: string): never => {
      throw new Error(`${path}: ${message}`);
    };
    const keys: string[] = [];
    if (allocation.type === "accommodation") {
      const hasRange =
        (booking.startDate !== undefined && booking.endDate !== undefined) ||
        (booking.startDay !== undefined && booking.endDay !== undefined);
      if (hasRange) {
        const expected = accommodationNights(booking, model.trip);
        if (
          !expected ||
          expected.length !== allocation.nights.length ||
          expected.some((n) => !allocation.nights.includes(n))
        )
          fail(
            "night allocation must agree with the complete check-in/checkout range",
          );
      }
      for (const n of allocation.nights) {
        const day = model.days[n - 1];
        if (day.inTransit)
          fail(`Day ${n} is in transit and has no accommodation estimate`);
        if (booking.place && day.overnight !== booking.place)
          fail(
            `Day ${n} overnight place does not match the accommodation place; update the plan or explicitly use allocation type unallocated`,
          );
        keys.push(`night:${n}`);
      }
    } else if (allocation.type === "transport")
      keys.push(`leg:${allocation.leg}`);
    else if (allocation.type === "activity")
      keys.push(`activity:${allocation.activity}`);
    for (const key of keys) {
      if (claimed.has(key))
        fail(
          `${key} already replaced by bookings[${claimed.get(key)}]; combine the amount or use distinct units`,
        );
      claimed.set(key, index);
    }
  }
}
export function bookingsOnDay(model: Itinerary, dayNumber: number): Booking[] {
  return (model.trip.bookings ?? []).filter((booking) => {
    const { start, end } = bookingRange(booking, model.trip);
    if (start !== undefined || end !== undefined) {
      const first = start ?? end!,
        last = end ?? start!;
      if (dayNumber >= first && dayNumber <= last) return true;
      // A partial date must not hide explicitly associated nights or journeys.
      if (start !== undefined && end !== undefined) return false;
    }
    const allocation = bookingAllocation(booking, model.trip);
    if (allocation?.type === "accommodation")
      return (
        allocation.nights.includes(dayNumber) ||
        allocation.nights.includes(dayNumber - 1)
      );
    if (allocation?.type === "activity")
      return activityDay(model, allocation.activity) === dayNumber;
    if (allocation?.type === "additional") return allocation.day === dayNumber;
    if (allocation?.type === "transport") {
      const leg = model.legs.find((leg) => leg.block.id === allocation.leg);
      return !!leg && dayNumber >= leg.day && dayNumber <= leg.endDay;
    }
    return false;
  });
}
/** An accommodation's checkout day: it is associated with the day but not slept in. */
export function isCheckoutDay(
  model: Itinerary,
  booking: Booking,
  dayNumber: number,
): boolean {
  if (booking.type !== "accommodation") return false;
  const { end } = bookingRange(booking, model.trip);
  if (end !== undefined) return end === dayNumber;
  const allocation = bookingAllocation(booking, model.trip);
  return (
    allocation?.type === "accommodation" &&
    allocation.nights.includes(dayNumber - 1) &&
    !allocation.nights.includes(dayNumber)
  );
}
/** Bookings for a day, answering "where do we sleep tonight": checkout days excluded. */
export function nightBookingsOnDay(
  model: Itinerary,
  dayNumber: number,
): Booking[] {
  return bookingsOnDay(model, dayNumber).filter(
    (booking) => !isCheckoutDay(model, booking, dayNumber),
  );
}
export function bookingCountries(model: Itinerary, booking: Booking): string[] {
  const places = new Set<string>();
  if (booking.place) places.add(booking.place);
  const allocation = bookingAllocation(booking, model.trip);
  if (allocation?.type === "transport") {
    const leg = model.legs.find((leg) => leg.block.id === allocation.leg);
    if (leg?.from) places.add(leg.from);
    if (leg?.to) places.add(leg.to);
  }
  // Dates are an explicit association to days, never a confirmation of their geography.
  if (!places.size) {
    for (const day of model.days) {
      if (!bookingsOnDay(model, day.index + 1).includes(booking)) continue;
      if (day.overnight) places.add(day.overnight);
      if (day.startPlace) places.add(day.startPlace);
    }
  }
  return [
    ...new Set(
      [...places].flatMap((id) => model.trip.places[id]?.country ?? []),
    ),
  ];
}
/** A booking the Documents view lists: a plain trip-wide expense without a file lives only in the Overview. */
export function isListedBooking(booking: Booking): boolean {
  return booking.type !== "other" || !!booking.documents?.length;
}
export function hasBookingContent(model: Itinerary): boolean {
  return !!(
    model.trip.bookings?.some(isListedBooking) ||
    model.trip.documents?.length ||
    model.days.some((day) => day.source.documents?.length) ||
    model.legs.some((leg) => leg.block.documents?.length)
  );
}
/** A booking that holds a place: planned ones are still to book, cancelled ones hold nothing. */
const isBooked = (booking: Booking) =>
  booking.status !== "planned" && booking.status !== "cancelled";
export function isFlightLeg(leg: Leg): boolean {
  return componentLegs(leg).some((part) => modeKind(part) === "flight");
}
/**
 * What still needs booking: nights slept away from home that no booked stay covers,
 * and flights no booking is linked to. Nights on a plane, the last day and the home
 * days at either end never count; trains, buses and ferries are bought on the spot.
 * A trip without any booking is a sketch of a possible route: nothing is marked.
 */
export const noBookingGaps = {
  nights: [] as number[],
  unbookedNights: new Set<number>(),
  flights: [] as Leg[],
  unbookedFlights: new Set<Leg>(),
};
export function bookingGaps(model: Itinerary) {
  if (!model.trip.bookings?.length) return noBookingGaps;
  const stayCountries = new Set(mapAreas(model).map((area) => area.country));
  const bedNights = model.days
    .slice(0, -1)
    .filter((day) => !day.inTransit && day.overnight)
    .map((day) => day.index + 1);
  const away = bedNights.filter((n) =>
    stayCountries.has(
      model.trip.places[model.days[n - 1].overnight!].country ?? "",
    ),
  );
  const nights = bedNights.filter((n) => n >= away[0] && n <= away.at(-1)!);
  const booked = model.trip.bookings?.filter(isBooked) ?? [];
  const coveredNights = new Set(
    booked.flatMap((booking) => {
      if (booking.type !== "accommodation") return [];
      const allocation = bookingAllocation(booking, model.trip);
      return (
        accommodationNights(booking, model.trip) ??
        (allocation?.type === "accommodation" ? allocation.nights : [])
      );
    }),
  );
  const bookedLegs = new Set(
    booked.flatMap((booking) =>
      booking.cost?.allocation?.type === "transport"
        ? [booking.cost.allocation.leg]
        : [],
    ),
  );
  const flights = model.legs.filter(isFlightLeg);
  return {
    nights,
    unbookedNights: new Set(nights.filter((n) => !coveredNights.has(n))),
    flights,
    unbookedFlights: new Set(
      flights.filter((leg) => !leg.block.id || !bookedLegs.has(leg.block.id)),
    ),
  };
}
/** The 1-based day an activity is planned on. */
export function activityDay(model: Itinerary, id: string): number | undefined {
  const index = model.trip.days.findIndex((day) =>
    day.activities?.some((activity) => activity.id === id),
  );
  return index < 0 ? undefined : index + 1;
}
/** The live booking that replaces an activity's estimate, if any. */
export function activityBooking(
  model: Itinerary,
  id?: string,
): Booking | undefined {
  if (!id) return undefined;
  return model.trip.bookings?.find((booking) => {
    const allocation = booking.cost?.allocation;
    return (
      booking.status !== "cancelled" &&
      allocation?.type === "activity" &&
      allocation.activity === id
    );
  });
}
