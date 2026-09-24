import { normalizeTrip } from "./itinerary.ts";

/** Validates parsed itinerary JSON exactly as the viewer does; throws "path: message" on the first problem. */
export function validateTrip(input: unknown) {
  const { trip, days } = normalizeTrip(input);
  return {
    title: trip.title,
    days: days.length,
    places: Object.keys(trip.places).length,
    bookings: trip.bookings?.length ?? 0,
  };
}
