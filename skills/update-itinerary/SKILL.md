---
name: update-itinerary
description: Create or update Trip Atlas itinerary.json from the user's travel plan. Use for itinerary data edits, not visualizer UI development or general travel research alone.
---

# Update a Trip Atlas itinerary

## Find the target

Resolve this SKILL.md's real path first, including when loaded through a skill symlink. Its canonical location is `<app>/skills/update-itinerary/SKILL.md`; `<app>` is the `trip-visualizer` repository. The default target is `<app>/../itinerary.json`, whether invoked from the app, its parent workspace, or an installed skill link. Honor an explicitly requested different JSON file. See `<app>/README.md` and `<app>/src/itinerary.ts` for the current viewer and parser.

Read the user's current instructions and the existing target before editing. Preserve unrelated data and confirmed bookings. If the file is absent and itinerary creation is requested, create only the provided or supported plan. Omit unknown optional fields rather than writing null, empty strings, invented bookings, schedules, or coordinates. Label suggestions as suggestions in notes where appropriate. Do not edit `trips/` demo data unless the user explicitly assigns a demo edit.

## JSON format (version 1)

A trip across all countries belongs in one file. Required fields are `version: 1`, an object `places`, and a nonempty ordered array `days`. An unknown-location plan can use `"places": {}` and `"days": [{}]`.

- Trip options: `title`, `startDate` (real `YYYY-MM-DD`), `initialPlace` (a place ID), optional `groups` (described below), `documents`, `bookings` (described below), and `timezone` (IANA fallback for places without their own zone). Without a start date, days have Day 1, Day 2 labels.
- Each `places` key is a unique nonempty ID. Its value may contain `name`, `country` (uppercase ISO2, e.g. `JP`), `timezone` (IANA), and `coordinates: {"lat": number, "lon": number}`. Latitude must be within −90…90 and longitude within −180…180. A missing name falls back to the ID.
- Each day is an object with optional `title` (a nonempty, concise purpose label), `notes` (string), `documents` (see below), and `blocks` (ordered array). `{}` is a valid day. Empty days inherit the last destination, except while an overnight journey is in transit. Without an initial or carried place, the location remains unknown.
- A travel block requires `{"type": "travel", "to": "place-id"}`. Optional fields are `id` (unique nonempty stable cost reference), `from`, `start`, `end`, `endDay`, `mode`, `estimatedDurationMinutes`, `components`, `notes`, and `documents`. Every place reference must exist in `places`. Origin is inferred from current location; use `from` only for an explicit override.
- A location reset is `{"type": "place", "place": "place-id"}`. It claims no timed movement and makes that day's timing unknown. Prefer `initialPlace` and travel carry-forward for ordinary routes.

Provided optional strings must be nonempty. Use `days[].title` only for an activity or purpose supported by the actual plan, such as "Snow monkeys, then Tokyo"; it appears in the compact calendar and day panel. Omit it for the existing route/location heading. Reservations belong in the optional trip-level `bookings` list, never new day block types. The viewer still derives planned stays and overnight locations from the route. Do not invent bookings or confirmed statuses from planned destinations or saved documents.

### Groups and rough durations

Use optional trip `groups: {"kumano": {"name": "Kumano Kodo", "color": "#249881"}}` and explicit `places[id].group: "kumano"` to group a meaningful region or day-trip area from actual travel context, not merely nearby coordinates. For example, Nagano and its Snow Monkey Park excursion can share an area; Tokyo and Fuji Five Lakes remain separate. `color` is optional and, when supplied, must be six-digit hex. Every membership must reference a declared group. Keep all underlying place IDs, GPS coordinates and connecting travel blocks; nearby places outside the trail remain separate unless the plan supports membership. Ungrouped places remain individual destinations. Preserve distinct overnight stops even inside an explicit area. The viewer derives quieter transfer-only point styling from overnight locations and journey endpoints; do not add a mandatory role field or hide a real overnight as a transfer.

Use clean transport `mode` values: `train`, `bus`, `walk`, `hike`, `flight`, `ferry`, `car`, or `other`. Legacy strings still load. Put explanation, service names and caveats in notes. Optional `estimatedDurationMinutes` is one positive finite number. Convert a provided duration range to its upper bound and keep the original context in notes; do not invent a duration when none is supported. The UI displays these durations with `~`; an estimate never creates departure/arrival clocks or a confirmed duration.

For a single connection with multiple modes and no supported intermediate place, use optional `components: [{"mode":"bus","estimatedDurationMinutes":5},{"mode":"hike","estimatedDurationMinutes":360}]`. Components are a nonempty ordered array with required nonempty `mode` and optional positive finite `estimatedDurationMinutes`. Omit a duplicate top-level estimate when every component is estimated: the viewer derives their sum. When the only supported estimate is for the whole vehicle connection, keep it at the top level and use mode-only components, e.g. `components: [{"mode":"bus"},{"mode":"ferry"},{"mode":"bus"}]`. The map and day chips show the whole total without inventing mode shares; duration summaries retain this as mixed / unallocated. Missing component durations remain missing; don't invent GPS waypoints or split exact clocks. Component totals retain their estimated status even when the whole connection has exact clocks. The exact whole connection duration is shown separately as mixed / unallocated rather than inventing exact mode shares.

The map derives vehicle-only totals for continuous same-day connections through transfer points between overnight stops or journey endpoints. Walking time is excluded; return-to-base excursions are separate from onward travel, and unknown vehicle times or unsplit walking/vehicle mixtures have no aggregate label. Do not duplicate these display totals in the data. The map defaults to labels strictly over one hour after summing; its All / >30m / >1h / >2h / >4h / None control affects labels only. All shows known positive vehicle totals including short and internal-area journeys. Simple symmetric out-and-back excursions use a double-headed route and one-way duration (the longer direction when unequal), never a round-trip sum. Multi-stop circuits retain intermediate legs and label their total vehicle time; unrelated excursions remain separate.

Only fields documented here affect the viewer. Legacy extra metadata is preserved but is not interpreted: do not introduce unsupported fields expecting the UI to show them. Put supported travel details in notes/documents.

### Travel timing

`start` is departure-local `HH:mm`; `end` is destination-local `HH:mm`. `endDay` is the **absolute 1-based itinerary day of arrival**, defaulting to the departure day. A day-2 flight arriving day 3 uses `endDay: 3`, not an offset of 1. Arrival must be on or after departure day and inside `days`. Recalculate affected travel `endDay`, booking `startDay`/`endDay`, and cost allocation day/night references when inserting, removing, or reordering days. Preserve authored booking calendar dates and stable travel IDs; never shift a reservation to follow a changed trip start date.

An earlier arrival clock never automatically means next day. For arrival at next midnight, use `end: "00:00"` and the correct `endDay`, never `24:00`. Do not put blocks between an overnight departure and its arrival day, or after that departure on the departure day. Further travel on the arrival day must follow the arrival.

Actual elapsed duration requires `startDate`, both clocks, and applicable timezones; it is computed across zones rather than by subtracting local clocks. Missing information stays unknown. Do not invent times or elapsed percentages to fill the calendar. Rough days use schematic colored route sequences; their widths are explicitly estimated, not clock proportions. The airplane cursor also shows illustrative route progress when clocks are missing; this does not establish real departure/arrival times and must not be copied into the itinerary as a schedule. Normalization rejects chronological overlaps, arrival before departure, and ambiguous/nonexistent DST clocks. Resolve those from the user's plan or reliable evidence; do not silently shift a confirmed booking.

### Place metadata

When map coordinates are needed, look up the city coordinates once from a reliable source and save numeric `lat`/`lon` in the JSON. Reuse existing known coordinates and zones. Do not claim model guesses are verified. Omit unknown coordinates and timezones until established; the calendar still works without coordinates. The viewer does no runtime geocoding or external map requests.

### Local documents

Trip, booking, day and travel `documents` use `[{"label": "Ticket", "path": "documents/ticket.pdf"}]`. Link existing local files relative to the selected JSON file's directory, not the app or skill directory. Use nonempty labels and safe relative paths: no absolute paths, remote URLs, backslashes, colons, `%`, `?`, `#`, control characters, empty path components, `.` or `..`. Symlinks escaping the JSON directory are denied. Selected-file mode serves only explicitly declared documents. Verify file existence and containment separately; JSON normalization checks path syntax, not the filesystem.

## Example

Illustrative input only; do not copy its dates or schedule into the user's plan:

```json
{
  "version": 1,
  "title": "Two countries",
  "startDate": "2026-11-01",
  "initialPlace": "tokyo",
  "places": {
    "tokyo": { "name": "Tokyo", "country": "JP", "timezone": "Asia/Tokyo" },
    "hanoi": { "name": "Hanoi", "country": "VN", "timezone": "Asia/Ho_Chi_Minh" }
  },
  "days": [
    {},
    { "blocks": [{ "type": "travel", "to": "hanoi", "start": "23:00", "end": "03:00", "endDay": 3, "mode": "flight" }] },
    {},
    { "notes": "Suggested free day in Hanoi." }
  ]
}
```

## Validate and report

After an edit, validate the saved JSON with the actual `normalizeTrip` export using Node 24 or newer. From the canonical `<app>` directory, pass the target path as an argument (replace the example path for an explicit target):

```sh
node --input-type=module -e 'import { readFileSync, realpathSync } from "node:fs"; import { normalizeTrip } from "./src/itinerary.ts"; const file = realpathSync(process.argv[1]); const trip = normalizeTrip(JSON.parse(readFileSync(file, "utf8"))); console.log(`${file}: valid (${trip.days.length} days)`);' ../itinerary.json
```

Report the edited path, key changes, and material missing information without implying bookings were made. To view the default file, run `npm --prefix trip-visualizer start -- itinerary.json` from the parent workspace. With a selected file already running, refresh the browser after editing; no rebuild or restart is needed. Launching without a path shows the demos.

### Overview and optional budget

Overview is the initial view, with a remembered Overview / Map / Calendar / Bookings & Documents selection and the shared Area filter. It compares one journey at a time. Only Whole trip with multiple visited countries offers the Countries / Places switch, starting with Countries. A selected country, a single-country journey, or a journey without country metadata shows Places directly (the same explicit map groups and colors). Days count listed days; nights count the gaps between them (`days.length - 1`), never an extra night after the final day. Overnight journeys are In transit, and unlocated nights are Unknown. Country days can overlap on crossing days; country nights follow the actual overnight place. Repeated visits are combined without duplicating days or nights. The stay table emphasizes nights; its bars show each row’s share of all nights in the selected area, including transit and unknown nights. Days touched remain in Details with the crossing-day overlap explanation. Column headings sort nights, country totals, or daily averages; unknown values remain last and partial estimates keep their + marker. Sort order is remembered across views and files. Country names open that area directly, with a Whole trip return link when several countries are available. The budget headline shows the daily average for Whole trip as well as a selected country. Country comparisons show a countries subtotal, separately allocated travel, and a trip total. Scopes without overnight stays show Places visited without a redundant zero-night column, and inapplicable zero transport categories are omitted; explicitly entered zero prices remain visible. Country colors are stable by ISO2 in Overview; place/group colors in Map and Calendar are unchanged. Estimated travel headlines round to hours (short trips retain minutes); exact sums remain in Details.

Optional trip fields are `currency: "EUR"` (uppercase ISO3) and `budget: {"countries": {"JP": {"livingPerDay": 70, "accommodationPerNight": 140}}}`. A travel block may have `estimatedCost: 120`. These numbers are **illustrative examples only**, not price recommendations. All amounts are **per person**, in the trip's one currency: `livingPerDay` is one person's daily living budget, `accommodationPerNight` is one person's share per night, and `estimatedCost` is one person's cost for that travel block. Store shared room or transfer prices as each person's share using the known occupancy; do not assume a party size. Overview totals are also per person, with no automatic party-size multiplication or currency conversion. Every provided amount must be finite and nonnegative. Zero means free; omit unknown amounts. Any supplied price requires `currency`; existing trips without budgets remain valid. Country budget keys use uppercase ISO2. Unused country budgets have no effect. Booking and activity costs are supported as described below; per-city rates and exchange conversion remain outside this version. Do not add real estimates unless the user requests them and supplies or authorizes their basis. With no relevant prices, Overview shows “Budget not provided” and omits the cost breakdown and stay-cost column. Explicit zero is a provided price. Partial totals keep `+` and unknown parts keep `?`; transport-only pricing does not create an empty stay-cost column.

Living costs are assigned once per listed day: use the overnight country's rate, or the departing/last known country during overnight transit; the final day uses its final location. An unknown location stays unknown. Accommodation uses only known overnight places before the final day; in-transit nights require no hotel cost. Country totals include living, accommodation, explicitly additional activities and travel whose two known endpoint countries match (domestic flights, ground/sea travel and explicit walking fees). Each original international leg is counted once in a separate Between countries subtotal, including overnight journeys. Travel with either endpoint country unknown and living/stays with unknown country go to Unassigned; endpoints and fare splits are never guessed. Country totals + Between countries + Unassigned reconcile with the unchanged whole-trip total, including missing values. Average/day divides each country total by the days allocated to that country's living budget in this same daily allocation, including transit fallback and the final day—not overlapping days touched or hotel nights. The denominator is inspectable; zero budget days show a dash while retaining the total. Full precision is retained until currency display; partial averages retain `+` and wholly unknown averages `?`. Countries visibly show Total and Average/day; the selected-country headline shows the same values even in Places mode. Place rows contain living, stays and explicitly additional activities, with transport kept separate. International/unknown-endpoint travel stays separate from selected-country costs; travel time can still include entering and leaving journeys. Cost buckets are not accommodation nights. Walking/hiking time is excluded. A pure walking block does not require a price; an explicitly supplied walking `estimatedCost` is included in Other transport.

Flights and Other transport exclude walking. Exact whole-connection timing takes precedence over estimates; transfer components are never added twice. Known all-vehicle ground mixtures can contribute their whole total. Unsplit flight/ground or walking/vehicle time remains unallocated, never an invented mode share. `~` means an estimate, `+` means required values are missing, and `?` means no amount is known. A category with no applicable units is zero. Budget rates remain estimates; booking amounts can have authored confirmed or paid cost status. Absent currency is never assumed to be EUR.

### Bookings & Documents

Optional trip-level `bookings` is one list for accommodation, transport and activities. Each booking requires `type` (`"accommodation"`, `"transport"` or `"activity"`) and a nonempty `title`. Optional fields are `place` (existing place ID), `status` (`"planned"`, `"confirmed"`, `"cancelled"`), `reference` (nonempty confirmation reference), `documents`, dates and `cost`. Omit unknown fields. A title-only activity needs no dates, location, status, price or documents. Missing reservation status stays “Status not specified”; neither a document, a confirmation reference nor a paid amount establishes a confirmed reservation. Bookings never alter the route, overnight locations, nights or travel timing. Keep planned places separate from authored reservations.

Use optional `startDate` / `endDate` as real `YYYY-MM-DD` calendar dates. They remain fixed if the trip's `startDate` changes. For undated plans, `startDay` / `endDay` are 1-based listed trip days instead. Do not mix calendar dates with day numbers in one booking. Either endpoint can be omitted; a lone endpoint associates that day plus any explicitly linked cost units, not an invented range. When both endpoints are present, end must be on/after start; accommodation needs end strictly after start. Accommodation end means **checkout**, while other ranges include both endpoints. Day numbers must lie inside the trip. Calendar dates can lie outside it. Dates without a trip start date remain readable but cannot select itinerary days.

A hotel is visible on each day of its stay **including checkout**. With no authored dates, explicit cost-linked nights, living days or travel legs provide day context. Undated bookings without a day/leg association remain in the Bookings view. A booking's place alone does not guess which repeated visit it belongs to. The Bookings & Documents tab appears only when there are bookings or documents; old trips show no new warnings or empty sections. The tab respects Area; independent trip documents remain available in every area. A saved Bookings view falls back to Overview for an empty alternative without discarding the saved view. Map camera, map choices and other saved selections survive view changes.

Documents can be attached independently to the trip (`documents`), a booking, a day, or an existing travel block. Every entry is exactly a local file reference, e.g. `{"label":"Hotel confirmation","path":"documents/hotel.pdf"}`. Store a multi-night confirmation once on its booking; day panels show that same link throughout the stay and checkout. The separate document library contains independent trip/day/travel documents; booking documents stay with their booking. Paths resolve relative to the itinerary JSON file, never the application directory. References contain no embedded file contents. There are no uploads, copies, extraction, reminders, booking forms or payment tracking. Edit JSON externally and manually refresh; the viewer does not watch or rewrite data.

Use nonempty labels and safe relative paths: no absolute paths, remote URLs, backslashes, colons, `%`, `?`, `#`, control characters, empty components, `.` or `..`. Unicode and spaces are supported. Selected-file mode serves only the trip's explicitly declared references, including new trip/booking documents; each alternative has its own allowlist and folder. Escaping symlinks are denied. PDF and common screenshot formats (PNG, JPEG, WebP, GIF, AVIF, including uppercase extensions) receive their appropriate MIME types. Other file types use the existing browser behavior. Path syntax is validated without touching the filesystem; verify existing files separately. Missing files return a local 404 when opened.

#### Per-person booking costs

A cost is `{"amount":80,"status":"paid"}`: the **whole booking's per-person amount**, in the trip's `currency`, not a nightly rate or group total. Amount must be finite and nonnegative; zero is provided/free, while an unknown amount means omit the entire `cost`. Currency is required even for zero. Cost `status` may be `"estimated"`, `"confirmed"` or `"paid"`; omitted status remains estimated. These are mutually exclusive categories of the included amount, not additive charges or a payment ledger. A confirmed reservation can have an estimated cost; a paid amount does not confirm its reservation. Overview preserves separate estimated, confirmed and paid subtotals. `~` appears only when an included amount is estimated; `+` still means required estimates are missing. No party-size assumptions or exchange conversion occur.

A complete accommodation booking with `place`, check-in and checkout automatically replaces exactly those planned overnight estimates, once. Its full date range must map inside the listed trip, with that exact place on each night. No fuzzy name, route or date matching is used. The total is spread equally over its nights at full precision; checkout incurs no accommodation charge. A changed trip date recomputes the relationship without moving the reservation dates. A place mismatch is a validation error; correct the plan or explicitly leave the amount unallocated. A stay partially/wholly outside the listed trip, or a calendar stay in an undated trip, remains unallocated as a whole; the viewer never clips or prorates it silently.

Use optional `cost.allocation` for explicit associations:

| Allocation | Meaning |
| --- | --- |
| `{"type":"accommodation","nights":[1,2]}` | Replace the nights after days 1 and 2; divide the booking amount equally. No final-day or in-transit night. Optional booking place must match those overnight places. If complete dates are also given, their full night set must agree. |
| `{"type":"transport","leg":"tokyo-hanoi"}` | Replace one entire travel block's `estimatedCost`. Give that block an optional unique, nonempty `id:"tokyo-hanoi"`. The stable ID distinguishes repeated routes; use an existing composite travel block for a combined connection. |
| `{"type":"living","days":[2]}` | Activity amount replaces the **whole daily living budget** on these days, including any food/local travel/other activities already represented there. For multiple days, divide equally. This is not a per-ticket deduction from a broad allowance. |
| `{"type":"additional","day":3}` | Activity amount is **outside** the daily living budget, added once on this day. Ensure that broad budget excludes it. Country/place is the booking's explicit place, otherwise that day's living-budget location. |
| `{"type":"unallocated"}` | Keep amount visibly separate and excluded from totals/averages; also disables automatic hotel replacement. |

Accommodation and transport allocations must match their booking type; `living` and `additional` are for activities. Day arrays are nonempty, unique and within the trip. Two active costs cannot replace the same night, living day or travel leg, even when their amount is zero. Combine those costs into one booking or assign distinct units; there is no order-dependent “last wins”. Explicitly additional activities may coexist because they replace no unit. Cancelled bookings remain readable, but their cost and replacement claims are excluded; original estimates return. Cancellation does not model refunds or cancellation charges. Structural fields/references remain validated, while obsolete cancelled hotel place/date relationships do not block the current plan.

A booking amount with no allocation and no complete matching hotel association is shown as **Unallocated booking costs**, separately from the trip total and daily average. It never silently disappears or adds on top of potentially corresponding estimates. Resolve its association in JSON to include it. Missing booking costs leave the existing estimates untouched and do not create a new unknown charge. Geography and daily-average denominators keep the itinerary's original living-day allocation. Replaced domestic transport stays in its country; international fares count once Between countries; unknown endpoint costs stay Unassigned. Country totals + Between countries + Unassigned reconcile with the included whole-trip total. Place totals include living, accommodation and explicitly additional activities; transport remains separate. “Unassigned” included costs with unknown geography and “Unallocated booking costs” excluded pending associations are distinct.

Illustrative hotel entry (in a trip starting 2026-11-01 with two Tokyo nights and currency EUR):

```json
{
  "type": "accommodation",
  "title": "Tokyo guesthouse",
  "place": "tokyo",
  "startDate": "2026-11-01",
  "endDate": "2026-11-03",
  "status": "confirmed",
  "reference": "DEMO-123",
  "cost": { "amount": 80, "status": "paid" },
  "documents": [{ "label": "Confirmation", "path": "documents/guesthouse.txt" }]
}
```

See `trips/bookings/trip.json` and its existing fictional documents for a complete four-day demo: mixed estimated/confirmed/paid costs, a cancelled booking, additional activities, a whole living-day replacement and an unallocated amount. Its included total is €300 per person, with €40 separately unallocated. All amounts and reservations are examples, not recommendations or real bookings.

### Opening alternative journey files

Pass multiple explicit files to the launcher, for example `npm start -- "plans/short itinerary.json" "plans/long itinerary.json"` (or `npm run serve -- ...` for an existing build). The Journey picker switches one plan at a time in the same Overview layout and is hidden when only one plan is available. It prefers the existing trip `title`, with the filename/path as secondary text to distinguish alternatives, including duplicate titles. Use concise plan or variant titles such as “Balanced route” or “More time in Japan”, rather than repeating long country and date lists; do not invent or rewrite a user’s title without authorization. Without a title, the readable filename/path remains the label. The selected-file manifest refreshes titles from the source while retaining stable routes. Relative paths resolve from npm's invocation directory (`INIT_CWD`); quote spaces. Duplicate references to the same canonical file appear once. Single-file and no-argument demo workflows remain compatible.

Each selected file has its own stable virtual root. Duplicate filenames are distinguished by their parent folder name, or the shortest distinguishing parent path when those names also match. Route identifiers remain internal. Documents resolve relative to their own itinerary and are served only when explicitly referenced by that file; unrelated files and symlinks escaping its directory remain inaccessible. Files are read on demand, and manual browser refresh loads edits. Replacing a selected file with a symlink to a different source is rejected. An unreadable alternative does not prevent opening another selected file. A saved Area belongs to its journey; when an alternative has no saved Area, its matching country can carry across without overwriting stored preferences. The selected view persists across journeys and reloads.
