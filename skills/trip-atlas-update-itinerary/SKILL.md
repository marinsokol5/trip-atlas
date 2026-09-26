---
name: trip-atlas-update-itinerary
description: Create or edit a Trip Atlas itinerary JSON file (places, days, journeys, activities, bookings, costs, documents, checklists). Use for any change to a trip plan; edit the file the user names, else itinerary.json in the working folder.
---

Trip Atlas is a local, read-only viewer with a map, calendar, timeline, daily details, cost overview, bookings, and preparation lists.
Compare trips by opening different JSON files (at most 2 MiB of UTF-8 each); edit the files and refresh to update the UI.

## Writing guidance

- The file is the agreed plan: no options, "or" days or backup plans. Ask the user about anything undecided; anything without a field goes in your chat reply.
- Keep it short and trip-specific: no general advice, explanations, sources or history.
- Only the fields in the schema exist. Put facts in fields, not prose; a recurring fact without a field means extending the schema.
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
- The Calendar's "Show unbooked" switch (off by default) marks each night away from home without a stay and each flight without a linked booking as still to book.
- Store a multi-night confirmation once, on its booking; it appears on every day of the stay.

## Fields

[`itinerary.schema.json`](itinerary.schema.json), beside this file, is the field reference: every field, whether it is required, its allowed values and what it means (JSON Schema draft 2020-12). Read it before editing. Start new files with `"$schema": "https://raw.githubusercontent.com/marinsokol5/trip-atlas/main/skills/trip-atlas-update-itinerary/itinerary.schema.json"` so editors validate them.

The schema checks the shape of every field. `trip-atlas check` also checks what it cannot express:

- Place, group, journey `id` and activity `id` references exist, and journey and activity IDs are unique.
- Dates are real calendar dates and timezones are real IANA zones.
- Day numbers (`endDay`, `startDay`, `nights`, `day`) lie within the trip; an `endDay` is on or after its departure day, and the final day has no accommodation night.
- A booking uses calendar dates or day numbers, not both, and its end follows its start (a stay needs at least one night).
- An allocation matches its booking's type, and `other` bookings take none. Allocated nights match the stay's complete check-in/checkout range, are not in transit, and are spent at the booking's place; no night, journey or activity is replaced twice.
- Journeys run in time order: arrival after departure (mind timezones and `endDay`), no overlap with the previous journey, no blocks while an overnight journey is under way, and no exact time falls on an ambiguous daylight-saving clock.
- Every `documents[].path` exists beside the itinerary.
- `mapUrl` is an https Google Maps link.
- `currency` is set once any price is; every number, and the price and duration totals, stay finite.
