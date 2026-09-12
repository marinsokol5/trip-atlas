---
name: update-itinerary
description: Create or edit Trip Atlas itinerary JSON; the default is itinerary.json beside trip-visualizer.
---

Trip Atlas is a local, read-only viewer with a map, calendar, timeline, daily details, cost overview, bookings, and preparation lists.
Compare trips by opening different JSON files; edit the files and refresh to update the UI.

## Trip

- `version` (required) is always `1`.
- `places` (required) maps place IDs to place objects and may be empty.
- `days` (required) lists at least one day in order; `{}` continues the current location unless travelling overnight.
- `title` (optional) names the trip.
- `startDate` (optional) dates day 1 as `YYYY-MM-DD`; otherwise days have numbers only.
- `initialPlace` (optional) identifies the starting place from `places`.
- `timezone` (optional) supplies an IANA timezone fallback, such as `Asia/Tokyo`.
- `groups` (optional) maps group IDs to named areas that simplify nearby places on the map.
- `currency` (optional; required with prices) sets one uppercase three-letter currency such as `EUR` for all per-person amounts; zero means free and omission means unknown.
- `budget` (optional) holds country-level cost estimates.
- `bookings` (optional) lists reservations separately from planned destinations.
- `documents` (optional) lists documents for the whole trip.
- `prepare` (optional) holds the trip-wide checklist and packing list; the tab stays hidden without items.

## Place: `places[id]`

- `name` (optional) labels the place, defaulting to its ID.
- `country` (optional) is an uppercase two-letter country code such as `JP`.
- `timezone` (optional) gives the place's IANA timezone for local travel times.
- `group` (optional) references an existing group ID without changing the underlying route.
- `coordinates` (optional) contains a latitude/longitude object for map placement.
- `coordinates.lat` (required with coordinates) is a number from −90 to 90.
- `coordinates.lon` (required with coordinates) is a number from −180 to 180.

## Group: `groups[id]`

- `name` (required) labels the shared area.
- `color` (optional) sets its color as `#RRGGBB`.

## Day: `days[]`

- `title` (optional) briefly describes the day's purpose.
- `notes` (optional) adds plain-text details.
- `documents` (optional) lists documents relevant to this day.
- `blocks` (optional) lists travel or place blocks in order, with location carrying forward afterward.

## Travel block: `days[].blocks[]`

- `type` (required) is `"travel"`.
- `to` (required) references the destination place ID.
- `from` (optional) overrides the origin, normally inferred from the current location.
- `id` (optional) gives this journey a unique stable reference for booking costs.
- `start` (optional) gives departure-local time as `HH:mm`.
- `end` (optional) gives destination-local arrival time as `HH:mm`.
- `endDay` (optional) is the absolute 1-based arrival day within the trip, defaulting to departure day; intervening days must have no blocks.
- `mode` (optional) names transport such as `flight`, `train`, `bus`, `ferry`, `car`, or `walk`.
- `estimatedDurationMinutes` (optional) gives positive estimated minutes for the whole journey without inventing clock times.
- `estimatedCost` (optional) gives a finite, nonnegative journey price per person in the trip currency.
- `components` (optional) is a nonempty list of mixed transport parts whose estimates are summed when no whole-journey estimate is supplied.
- `notes` (optional) adds plain-text journey details.
- `documents` (optional) lists tickets or other journey documents.

## Transport component: `components[]`

- `mode` (required) names this part's transport.
- `estimatedDurationMinutes` (optional) gives positive estimated minutes for this part.

## Place block: `days[].blocks[]`

- `type` (required) is `"place"`.
- `place` (required) references the current place ID without claiming a timed journey.

## Budget: `budget`

- `countries` (required with budget) maps uppercase two-letter country codes to rate objects.
- `countries[code].livingPerDay` (optional) gives a finite, nonnegative daily living estimate per person.
- `countries[code].accommodationPerNight` (optional) gives a finite, nonnegative nightly accommodation share per person, excluding transit nights and the final day.

## Booking: `bookings[]`

- `type` (required) is `"accommodation"`, `"transport"`, or `"activity"`.
- `title` (required) names the reservation.
- `place` (optional) references its place ID without changing the planned route.
- `startDate` (optional) fixes the start/check-in date as `YYYY-MM-DD`, independently of the trip's start date.
- `endDate` (optional) fixes the end/checkout date; hotels appear on checkout day without charging another night.
- `startDay` (optional) gives a 1-based trip day instead of calendar dates, which cannot be mixed with day numbers.
- `endDay` (optional) gives the last day or checkout day, after the start for accommodation.
- `status` (optional) is `"planned"`, `"confirmed"`, or `"cancelled"`; omission confirms nothing, and cancellation excludes its cost.
- `reference` (optional) stores the confirmation reference.
- `documents` (optional) lists attached files, storing a multi-night confirmation once.
- `cost` (optional) holds the booking price; omission keeps the existing estimates.

## Booking cost: `bookings[].cost`

- `amount` (required with cost) is the finite, nonnegative whole-booking price per person, not a nightly rate.
- `status` (optional) is `"estimated"`, `"confirmed"`, or `"paid"`, defaulting to estimated and independent of reservation status.
- `allocation` (optional) links the cost to estimates, each replaceable once; omission auto-matches hotels with a matching place and complete stay range, otherwise excluding the price from totals.

## Cost allocation: `bookings[].cost.allocation`

- `type` (required) is `"accommodation"`, `"transport"`, `"living"`, `"additional"`, or `"unallocated"`; living/additional require an activity, the first two match booking type, and unallocated excludes the price.
- `nights` (required for accommodation) lists unique 1-based days whose following nights are replaced equally, matching any supplied hotel place/dates and excluding transit and the final day.
- `leg` (required for transport) references the travel block's authored `id` whose estimate is replaced.
- `days` (required for living) lists unique 1-based days whose entire living budgets are replaced equally by the activity price.
- `day` (required for additional) identifies the 1-based day receiving an activity cost outside its living budget.

## Document: any `documents[]`

- `label` (required) names the link shown in the UI.
- `path` (required) references an existing local file relative to the itinerary folder, without absolute paths, URLs, traversal, backslashes, `:`, `%`, `?`, `#`, or control characters.

## Preparation: `prepare`

- `checklist` (optional) lists tasks in priority order, which supplies their displayed ranks even when completed.
- `packing` (optional) lists items grouped by category in first-appearance order.

## Checklist item: `prepare.checklist[]`

- `title` (required) names the task.
- `done` (optional) is a boolean completion status, defaulting to `false` and editable only in the file.
- `notes` (optional) adds plain-text context.

## Packing item: `prepare.packing[]`

- `title` (required) names the item.
- `packed` (optional) is a boolean packing status, defaulting to `false` and editable only in the file.
- `category` (optional) groups related items.
- `quantity` (optional) supplies a positive safe integer count, with no assumed quantity when omitted.
- `notes` (optional) adds plain-text context.
