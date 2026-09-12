import type { Itinerary } from "./itinerary.ts";
import { hasBookingContent } from "./booking-model.ts";
import { hasPreparationContent } from "./prepare-model.ts";

export type TripView = "overview" | "map" | "calendar" | "bookings" | "prepare";

export function parseTripView(saved: string | null): TripView {
  return saved === "map" ||
    saved === "calendar" ||
    saved === "bookings" ||
    saved === "prepare"
    ? saved
    : "overview";
}

export function availableTripViews(model?: Itinerary): TripView[] {
  return [
    "overview",
    "map",
    "calendar",
    ...(model && hasBookingContent(model) ? ["bookings" as const] : []),
    ...(model && hasPreparationContent(model) ? ["prepare" as const] : []),
  ];
}

/** Derive a fallback without replacing the user's remembered preference. */
export function activeTripView(
  preferred: TripView,
  model?: Itinerary,
): TripView {
  return availableTripViews(model).includes(preferred) ? preferred : "overview";
}
