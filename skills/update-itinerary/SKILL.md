---
name: update-itinerary
description: Create or edit Trip Atlas itinerary JSON; the default is itinerary.json beside trip-visualizer.
---

Trip Atlas is a local, read-only viewer with a map, calendar, timeline, daily details, cost overview, bookings, and preparation lists.
Compare trips by opening different JSON files (at most 2 MiB of UTF-8 each); edit the files and refresh to update the UI.

## Writing guidance

- Keep the file short: every later reader, human or LLM, reads all of it. Write only what is specific to this trip and useful on the day — no general travel advice, explanations of how estimates or pins work, disclaimers, sources, or editing history. A one-line note beats a paragraph; no note beats a redundant one.
- Structure first: put facts in their fields (times, durations, distance, climb, meals, check-in/out, coordinates, prices). A fact that keeps recurring without a field is a reason to extend the schema, not to write prose.
- Notes and tips are rare. Before writing one, ask: would a sensible traveller get this wrong without it, and does it matter? If not, leave it out. Most days, journeys and bookings have none. Never write what anyone would assume or look up anyway ("start early", "bring water", "book ahead", "check opening hours", "enjoy the view"), what a field already shows (times, modes, flight numbers, meals, distance, prices, where you sleep), subjective labels ("hard", "longest day"), or routine host courtesies. One short sentence, no lists, no markdown, no links.
- Each note has one owner, the thing it is about:
  - A booking's `notes`: doing something with or at that booking, such as paying, a shuttle, holding luggage or a pickup ("Bring ¥32,000 in cash; no cards").
  - A journey's `notes`: something about that journey you'd otherwise get wrong ("Meet the driver at Terminal 2, Pillar 17").
  - A sight's `tip`: something about that place that a local would tell you ("Skip the first deer; there are many more further in, with fewer people").
  - A day's `notes`: a must-know for that day that none of the above owns, usually a consequence you must act on today ("Buy food for tomorrow: no shops between MUI and Hongu").
- The day's plan is its `sights`, not prose. Name each place; add a verified `mapUrl` and a `tip` only when they earn it. Never describe the plan in a day note.
- Titles stay short and plain: no series numbering or group names the `group` label already shows (not "Kumano Kodo 3: …"), no superlative tags ("(hardest climb)").
- Booking titles are the property name only, without the platform ("(Airbnb)"); `reference` holds only a real confirmation code.
- Fill bookings from the confirmation document: dates, `checkIn`/`checkOut`, `meals` (details such as `"18:00, Japanese"` as text), `coordinates` from its GPS, `status`, and per-person `cost.amount` (total ÷ guests). A price fixed in a foreign currency is still `confirmed`.

## Trip

- `version` (required) is always `1`.
- `places` (required) maps place IDs to place objects and may be empty.
- `days` (required) lists at least one day in order; `{}` continues the current location unless travelling overnight.
- `title` (optional) names the trip.
- `startDate` (optional) dates day 1 as `YYYY-MM-DD`; otherwise days have numbers only.
- `initialPlace` (optional) identifies the starting place from `places`.
- `timezone` (optional) supplies an IANA timezone fallback, such as `Asia/Tokyo`.
- `groups` (optional) maps group IDs to named areas that simplify nearby places on the map.
- `currency` (optional; required with prices) sets one uppercase three-letter currency such as `EUR` for all per-person amounts, whose totals must stay finite; zero means free and omission means unknown.
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
- `notes` (optional) is the day's one must-know no booking, journey or sight owns (see Writing guidance); usually omitted.
- `sights` (optional) lists the places to see that day, in visiting order.
- `documents` (optional) lists documents relevant to this day.
- `blocks` (optional) lists travel or place blocks in order, with location carrying forward afterward.

## Sight: `days[].sights[]`

- `name` (required) is the place's name as a traveller would search for it.
- `mapUrl` (optional) is a verified Google Maps link as `https://maps.google.com/?cid=<number>`: open the place's coordinates in Google Maps, find the listing among nearby places, and confirm name and address before converting its place ID (the `0x…:0x…` pair; the second half, as a decimal, is the `cid`). Never guess one.
- `tip` (optional) is one non-obvious sentence about this place (see Writing guidance).

## Travel block: `days[].blocks[]`

- `type` (required) is `"travel"`.
- `to` (required) references the destination place ID.
- `from` (optional) overrides the origin, normally inferred from the current location.
- `id` (optional) gives this journey a unique stable reference for booking costs.
- `start` (optional) gives departure-local time as `HH:mm`.
- `end` (optional) gives destination-local arrival time as `HH:mm`.
- `endDay` (optional) is the absolute 1-based arrival day within the trip, defaulting to departure day; intervening days must have no blocks.
- `mode` (optional) names transport such as `flight`, `train`, `bus`, `ferry`, `car`, or `walk`.
- `estimatedDurationMinutes` (optional) gives positive estimated minutes for the whole journey, with finite millisecond totals, without inventing clock times.
- `estimatedCost` (optional) gives a finite, nonnegative journey price per person in the trip currency.
- `components` (optional) is a nonempty list of mixed transport parts whose estimates are summed when no whole-journey estimate is supplied.
- `distanceKm` (optional) gives the positive route length in kilometres, mainly for walks.
- `ascentMeters` / `descentMeters` (optional) give nonnegative total climb and descent in metres.
- `notes` (optional) adds plain-text journey details.
- `documents` (optional) lists tickets or other journey documents.

## Transport component: `components[]`

- `mode` (required) names this part's transport.
- `estimatedDurationMinutes` (optional) gives positive estimated minutes for this part, with finite millisecond totals.

## Place block: `days[].blocks[]`

- `type` (required) is `"place"`.
- `place` (required) references the current place ID without claiming a timed journey.

## Budget: `budget`

- `countries` (required with budget) maps uppercase two-letter country codes to rate objects.
- `countries[code].livingPerDay` (optional) gives a finite, nonnegative daily living estimate per person, not charged on home days before the first night-stay country or after the last.
- `countries[code].accommodationPerNight` (optional) gives a finite, nonnegative nightly accommodation share per person, excluding transit nights and the final day.

## Booking: `bookings[]`

- `type` (required) is `"accommodation"`, `"transport"`, `"activity"`, or `"other"` for a trip-wide expense (eSIM, visa) counted once in the whole-trip total.
- `title` (required) names the reservation.
- `place` (optional) references its place ID without changing the planned route.
- `startDate` (optional) fixes the start/check-in date as `YYYY-MM-DD`, independently of the trip's start date.
- `endDate` (optional) fixes the end/checkout date; hotels appear on checkout day without charging another night (the Calendar view lists them only on nights slept).
- `startDay` (optional) gives a 1-based trip day instead of calendar dates, which cannot be mixed with day numbers.
- `endDay` (optional) gives the last day or checkout day, after the start for accommodation.
- `status` (optional) is `"planned"`, `"confirmed"`, or `"cancelled"`; omission confirms nothing, and cancellation excludes its cost.
- `reference` (optional) stores the confirmation reference.
- `meals` (optional) marks `dinner`, `breakfast` and `lunch` (shown in that order) as `true`/`false`, or as text for an included meal such as `"18:00, Japanese"`, shown on hover; an omitted meal is unknown. Put meal times and types here, not in notes.
- `checkIn` (optional) gives the local check-in time as `HH:mm` or a `HH:mm-HH:mm` window.
- `checkOut` (optional) gives the latest local check-out time as `HH:mm`.
- `coordinates` (optional) gives the exact property `lat`/`lon`, linked to Google Maps from the booking card.
- `mapUrl` (optional) is a verified Google Maps link to the place itself, written as `https://maps.google.com/?cid=<number>` like a sight's; the map pin opens it instead of the bare coordinates, showing the listing rather than a dropped pin. Never invent one.
- `baggage` (optional) lists per-person bag allowances as `{ "type": "checked" | "cabin" | "personal", "pieces": 1, "kg": 23 }`, with `kg` as the optional limit per piece.
- `notes` (optional) adds a plain-text reminder shown on the booking card, as a quiet tip by default.
- `important` (optional) is `true` when the note is a must rather than a tip (e.g. "Bring ¥32,000 in cash"); the card then highlights it.
- `documents` (optional) lists attached files, storing a multi-night confirmation once.
- `cost` (optional) holds the booking price, or a bare number as shorthand for `{ "amount": n }`; omission keeps the existing estimates.

## Booking cost: `bookings[].cost`

- `amount` (required with cost) is the finite, nonnegative whole-booking price per person, not a nightly rate.
- `status` (optional) is `"estimated"`, `"confirmed"`, or `"paid"`, defaulting to estimated and independent of reservation status.
- `allocation` (optional) links the cost to estimates, each replaceable once; omission auto-matches hotels with a matching place and complete stay range, otherwise excluding the price from totals.

## Cost allocation: `bookings[].cost.allocation`

- `type` (required) is `"accommodation"`, `"transport"`, `"living"`, `"additional"`, or `"unallocated"`; living/additional require an activity, the first two match booking type, `other` bookings take none, and unallocated excludes the price.
- `nights` (required for accommodation) lists unique 1-based days whose following nights are replaced equally, matching any supplied hotel place/dates and excluding transit and the final day.
- `leg` (required for transport) references the travel block's authored `id` whose estimate is replaced. It is also how a flight counts as booked: once the trip has any booking, the Calendar marks every flight without a non-planned, non-cancelled booking linked this way, so give booked flights' blocks an `id`.
- `days` (required for living) lists unique 1-based days whose entire living budgets are replaced equally by the activity price.
- `day` (required for additional) identifies the 1-based day receiving an activity cost outside its living budget.

## Document: any `documents[]`

- `label` (required) names the link shown in the UI.
- `path` (required) references an existing local file relative to the itinerary folder, without absolute paths, URLs, traversal, backslashes, `:`, `%`, `?`, `#`, or control characters; PDF, raster images, text and JSON open inline, while other types download.

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
