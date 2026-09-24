---
name: trip-atlas-update-itinerary
description: Create or edit a Trip Atlas itinerary JSON file (places, days, journeys, activities, bookings, costs, documents, checklists). Use for any change to a trip plan; edit the file the user names, else itinerary.json in the working folder.
---

Trip Atlas is a local, read-only viewer with a map, calendar, timeline, daily details, cost overview, bookings, and preparation lists.
Compare trips by opening different JSON files (at most 2 MiB of UTF-8 each); edit the files and refresh to update the UI.

## Writing guidance

- The file is the agreed plan: no options, "or" days or backup plans. Ask the user about anything undecided; anything without a field goes in your chat reply.
- Keep it short and trip-specific: no general advice, explanations, sources or history.
- Only the fields below exist. Put facts in fields, not prose; a recurring fact without a field means extending the schema.
- Notes and tips are rare: only what a sensible traveller would otherwise get wrong. Never the obvious ("start early", "book ahead"), what a field shows, subjective labels or host courtesies. One sentence, no markdown or links.
- A note belongs to what it's about: a booking ("Bring ¥32,000 in cash"), a journey ("Meet the driver at Pillar 17"), an activity's `tip` ("Skip the first deer; more further in"), or else the day ("No shops tomorrow; buy food today").
- The day's plan is its `activities`, never a day note.
- `livingPerDay` is food, drinks and local rides; tickets and tours are an activity's `estimatedCost`.
- Titles short and plain, no numbering or superlatives. Booking titles are the property name; `reference` is a real code.
- Fill bookings from the confirmation: dates, check-in/out, `meals`, GPS `coordinates`, `status`, per-person `cost.amount`.
- Add checklist or packing items only once the user agrees to them.
- After every edit run `npx trip-atlas check <file>` (in a Trip Atlas checkout: `node scripts/cli.mjs check <file>`) and fix everything it reports.

## Conventions

Follow these so every trip file reads alike, rather than copying whatever file is nearby. When editing, keep the file's existing style.

- Place IDs are lowercase kebab-case names (`hoi-an`, `cat-ba-park`); airports use their lowercase IATA code (`han`) and a name like `Hanoi Noi Bai Airport (HAN)`.
- An airport is its own place, joined to its city by a transfer journey; flights run airport to airport.
- Journey `id`s are `<from>-<to>` place IDs (`han-nrt`), added only where a booking references the leg; add a suffix only to tell repeats apart.
- Day titles are short and say what the day is: "Fly Hanoi → Tokyo", "Day trip to Nara", "Temples and old streets".
- Estimates are round per-person numbers; set `0` for what a package includes, and omit what nobody knows yet.

## How the viewer reads it

- To compare alternatives, keep each in its own trip file and open them together.
- Ten listed days are nine nights: the final day adds none. A night is at a place, in transit or unknown.
- Clocks are local: `start` in the origin's timezone, `end` in the destination's. An earlier arrival clock never implies the next day; set `endDay`. Exact times need `startDate` plus a timezone at each end or trip level; ambiguous daylight-saving clocks are rejected and UTC offsets are not supported.
- Journey time comes from exact clocks first, then the whole-journey estimate, then the summed component estimates. Walking time is not counted as transport.
- Every price is per person in the trip `currency`: divide a shared room by its guests; nothing is converted. Zero is free, omission unknown.
- Living is charged once per day in the country you sleep in; accommodation per known hotel night; a journey's `estimatedCost` once, international ones under Between countries.
- Bookings never change the route, times or nights. Documents, references and paid amounts do not imply `status: "confirmed"`; set it.
- An accommodation's end is its checkout day; other booking ranges include both ends. Calendar dates stay fixed if the trip start moves.
- A stay with a matching place and complete range replaces those nights' estimates automatically, only if it lies entirely inside the trip; otherwise it stays unallocated rather than prorated. Two active bookings cannot replace the same night, journey or activity.
- Once the trip has any booking, the Calendar marks each night away from home without a stay and each flight without a linked booking as still to book.
- Store a multi-night confirmation once, on its booking; it appears on every day of the stay.

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
- `notes` (optional) is the day's one must-know no booking, journey or activity owns (see Writing guidance); usually omitted.
- `activities` (optional) lists what to see or do that day, in order.
- `documents` (optional) lists documents relevant to this day.
- `blocks` (optional) lists travel or place blocks in order, with location carrying forward afterward.

## Activity: `days[].activities[]`

- `id` (optional) gives the activity a unique stable reference for the booking that replaces its estimate.
- `name` (required) is the place's or experience's name as a traveller would search for it.
- `mapUrl` (optional) is a verified Google Maps link as `https://maps.google.com/?cid=<number>`: open the place's coordinates in Google Maps, find the listing among nearby places, and confirm name and address before converting its place ID (the `0x…:0x…` pair; the second half, as a decimal, is the `cid`). Never guess one.
- `tip` (optional) is one non-obvious sentence about it (see Writing guidance).
- `estimatedCost` (optional) gives the ticket, pass or tour price per person in the trip currency, counted under Activities; omit it for free activities.

## Travel block: `days[].blocks[]`

- `type` (required) is `"travel"`.
- `to` (required) references the destination place ID.
- `from` (optional) overrides the origin, normally inferred from the current location.
- `id` (optional) gives this journey a unique stable reference for booking costs.
- `start` (optional) gives departure-local time as `HH:mm`.
- `end` (optional) gives destination-local arrival time as `HH:mm`.
- `endDay` (optional) is the absolute 1-based arrival day within the trip, defaulting to departure day; intervening days must have no blocks.
- `mode` (optional) is one of `walk`, `train`, `bus`, `flight`, `ferry`, `car` or `other` (cable car, rickshaw); omit it when `components` give each part's mode. A line or service name ("Narita Express") belongs in the journey's `notes` only when you need it to catch the right one.
- `estimatedDurationMinutes` (optional) gives positive estimated minutes for the whole journey, with finite millisecond totals, without inventing clock times.
- `estimatedCost` (optional) gives a finite, nonnegative journey price per person in the trip currency.
- `components` (optional) is a nonempty list of mixed transport parts whose estimates are summed when no whole-journey estimate is supplied.
- `distanceKm` (optional) gives the positive route length in kilometres, mainly for walks.
- `ascentMeters` / `descentMeters` (optional) give nonnegative total climb and descent in metres.
- `notes` (optional) adds plain-text journey details.
- `documents` (optional) lists tickets or other journey documents.

## Transport component: `components[]`

- `mode` (required) is this part's mode, from the same list.
- `estimatedDurationMinutes` (optional) gives positive estimated minutes for this part, with finite millisecond totals.

## Place block: `days[].blocks[]`

- `type` (required) is `"place"`.
- `place` (required) references the current place ID without claiming a timed journey.

## Budget: `budget`

- `countries` (required with budget) maps uppercase two-letter country codes to rate objects.
- `countries[code].livingPerDay` (optional) gives a finite, nonnegative daily estimate per person for food, drinks and small local rides, never tickets or tours, not charged on home days before the first night-stay country or after the last.
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
- `mapUrl` (optional) is a verified Google Maps link to the place itself, written as `https://maps.google.com/?cid=<number>` like an activity's; the map pin opens it instead of the bare coordinates, showing the listing rather than a dropped pin. Never invent one.
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

- `type` (required) is `"accommodation"`, `"transport"`, `"activity"`, `"additional"`, or `"unallocated"`. `accommodation` and `transport` need that booking type, `activity` and `additional` need an activity booking, `other` bookings take none, and unallocated excludes the price. No booking replaces the living budget.
- `nights` (required for accommodation) lists unique 1-based days whose following nights are replaced equally, matching any supplied hotel place/dates and excluding transit and the final day.
- `leg` (required for transport) references the travel block's authored `id` whose estimate is replaced. It is also how a flight counts as booked: once the trip has any booking, the Calendar marks every flight without a non-planned, non-cancelled booking linked this way, so give booked flights' blocks an `id`.
- `activity` (required for activity) references the planned activity's `id` whose `estimatedCost` is replaced; the day card then marks it booked.
- `day` (required for additional) identifies the 1-based day of an activity cost that no planned activity covers.

## Document: any `documents[]`

- `label` (required) names the link shown in the UI.
- `path` (required) references an existing local file relative to the itinerary folder, without absolute paths, URLs, traversal, backslashes, `:`, `%`, `?`, `#`, or control characters; PDF, raster images, text and JSON open inline, while other types download. Booking files live in `documents/<country>/YYYY-MM-DD-<place>-<what>.pdf`; the trip-atlas-download-booking skill fetches and names them.

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
