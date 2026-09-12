# Itinerary format

[Back to Trip Atlas](../README.md) · [Compact field reference](../skills/update-itinerary/SKILL.md)

The compact reference lists every authored field. This guide explains the less obvious behavior: time, overnight location, budget replacement and local documents. Itineraries and manifests are UTF-8 JSON, each limited to 2 MiB. Attachments stream separately. Amounts must remain finite when summed across the trip (including daily/nightly rates); duration estimates must remain finite when converted to milliseconds and summed.

## Sparse plans and time

A trip needs `version: 1`, a `places` object and at least one item in `days`. Place IDs are references; names fall back to those IDs. Unknown optional metadata is retained but has no display meaning. Empty days carry the latest known location forward. An omitted origin stays unknown. Dates, coordinates, country codes and clocks are optional.

Travel blocks need only `type: "travel"` and `to`. Their origin is inferred from the current place unless `from` overrides it. A `{ "type": "place", "place": "kyoto" }` block resets location without claiming a timed journey. Place groups simplify map labels without merging the underlying route or overnight stays.

`start` is departure-local time; `end` is destination-local time. `endDay` is an absolute, 1-based arrival day in the listed trip, defaulting to the departure day. An earlier arrival clock does not imply tomorrow. Intermediate days of an overnight journey cannot contain blocks, and their nights stay in transit.

For example, this departure on day 2 arrives on day 3:

```json
{
  "type": "travel",
  "to": "destination",
  "start": "22:00",
  "end": "07:00",
  "endDay": 3
}
```

To compute instants, provide the trip's `startDate` and a timezone at each endpoint or at trip level. Timezones are IANA names such as `Asia/Tokyo`. Missing date, time or timezone stays unknown. Invalid dates, times, references, overlapping journeys and negative elapsed durations produce field-path errors. Ambiguous or nonexistent daylight-saving clocks are rejected; choose an unambiguous time. Explicit UTC offsets are not supported.

A rough journey can use `estimatedDurationMinutes: 180` with no clock times. Mixed transport uses ordered `components`, such as `[{"mode":"bus","estimatedDurationMinutes":30},{"mode":"walk","estimatedDurationMinutes":90}]`. Estimates do not establish departure or arrival times. Exact whole-leg timing takes precedence; otherwise a whole-leg estimate takes precedence over summed complete component estimates. Incomplete component durations do not invent mode shares.

Days use real elapsed time across timezone changes. For display, an in-transit midnight uses the origin zone; the end of the arrival day uses the destination zone. Calendar bars use elapsed durations, not a fixed 24-hour denominator. Unknown timing remains explicitly schematic. Map connections are illustrative curves, not actual roads or tracks.

## Days, nights and costs

Ten listed days contain nine overnight gaps. The final day adds no accommodation night. A night can be at a known place, in transit or unknown. Days touching multiple countries can appear in each country's view; nights follow their actual location.

Every price is **per person**, in one trip `currency`. A shared room price must already be divided by the known occupancy; the viewer does not assume a party size or convert currencies. Zero means free, while omission means unknown. A supplied zero still requires currency.

```json
{
  "currency": "EUR",
  "budget": {
    "countries": {
      "JP": { "livingPerDay": 45, "accommodationPerNight": 60 }
    }
  }
}
```

These are illustrative inputs, not price recommendations. `livingPerDay` is charged once per day, assigned to the overnight country or the last known/departing country during transit; the final day uses its final location. `accommodationPerNight` applies only to known hotel nights before the final day. In-transit nights incur no hotel estimate. Unknown countries do not borrow another country's rates; unused country budgets have no effect.

A travel block's `estimatedCost` covers that entire journey. Domestic travel is assigned to its country. International travel is counted once in **Between countries**; travel with unknown endpoint country goes to **Unassigned**. Country totals + Between countries + Unassigned reconcile with the whole trip. Place rows show living, accommodation and explicitly additional activities; transport remains separate.

Average/day divides costs by the days assigned to that country's daily living budget, not hotel nights or overlapping days touched. Calculation retains precision until display. `~` marks estimated amounts, `+` marks missing required estimates, and `?` means no amount is known. Pure walking does not require a price; an explicit walking fee counts. Walking time is excluded from transport time. Unsplit mixed-mode time is not silently assigned to a transport category.

## Reservations and replacement costs

Bookings are separate from the route. They never change travel times, destinations or nights. An optional reservation `status` is planned, confirmed or cancelled; missing status confirms nothing. Documents, references and paid amounts do not imply confirmation.

Use fixed calendar `startDate` / `endDate`, or 1-based `startDay` / `endDay`, never both systems in one booking. Calendar dates stay fixed when the trip start moves. Day numbers must be inside the trip; calendar dates may be outside it. Accommodation's end is checkout and must follow its start; other date ranges include both endpoints. Either endpoint can be omitted.

A hotel appears during its stay including checkout. Explicit cost-linked nights, living days and travel legs can also associate a booking with days; its place alone does not guess a repeated visit. An unassociated booking remains visible in Bookings. Dates in an undated trip remain readable without selecting itinerary days.

```json
{
  "type": "accommodation",
  "title": "Illustrative Kyoto stay",
  "place": "kyoto",
  "startDay": 1,
  "endDay": 3,
  "cost": { "amount": 120, "status": "paid" }
}
```

In a trip whose nights 1 and 2 are both Kyoto, this replaces their nightly estimates with a total of €120 per person, divided equally. It is a whole-booking amount, not a nightly rate. No reservation status is inferred.

Cost status is estimated, confirmed or paid; omission means estimated. These are mutually exclusive categories of the included amount, not payments to add together. Missing `cost` preserves the original estimates.

A complete accommodation range and matching place automatically replace exactly those planned nights once. Its entire stay must fit within the trip at that place. A place mismatch is an error. A partially/outside trip stay, or a calendar stay in an undated trip, remains unallocated as a whole; the viewer never silently clips or prorates it.

Explicit `cost.allocation` can replace or add specific units:

| Allocation | Effect |
| --- | --- |
| `{"type":"accommodation","nights":[1,2]}` | Divide the amount over the nights after days 1 and 2. No final-day or transit night. Supplied place and complete dates must match. |
| `{"type":"transport","leg":"kyoto-nara"}` | Replace one travel block's estimate, identified by its unique authored `id`. |
| `{"type":"living","days":[2]}` | Replace the **whole daily living allowance** for day 2 with this activity amount. This is not a ticket deduction from a larger allowance. |
| `{"type":"additional","day":3}` | Add an activity amount outside the daily living allowance, once on day 3. Keep that expense out of the broad allowance. |
| `{"type":"unallocated"}` | Show the amount separately, excluded from totals and automatic hotel replacement. |

Accommodation/transport allocations require the corresponding booking type; living/additional require an activity. Day arrays must be nonempty, unique and inside the trip. Two active costs cannot replace the same night, living day or travel leg, even if an amount is zero. Additional activities may coexist because they replace nothing.

Cancelled bookings remain readable but their costs and replacements are excluded, restoring the original estimates. Refunds and cancellation charges are not modeled. Structural references remain validated; obsolete cancelled hotel place/date relationships do not block a changed plan.

Unallocated booking costs stay visibly separate from included totals and averages until their association is resolved. They differ from included costs with unknown geography (**Unassigned**). A booking's supplied place determines additional-activity geography; otherwise the day's daily-budget location does.

The [bookings demo](../trips/bookings/trip.json) reconciles to €300 included per person and €40 separately unallocated, with fictional documents and mixed statuses.

## Local documents

Documents attach independently to the trip, bookings, days or travel blocks:

```json
{ "label": "Hotel confirmation", "path": "documents/hotel.pdf" }
```

The file must exist relative to the itinerary JSON directory. Store a multi-night confirmation once on its booking; the same link appears on relevant day panels. Independent trip/day/travel documents appear in the document library, while booking documents stay with their booking.

Paths must be nonempty, relative and local: no absolute paths, remote URLs, backslashes, colons, percent signs, query/fragment characters, control characters, empty components, `.` or `..`. Spaces and Unicode are supported. Selected-file mode serves only explicitly declared references, independently for each alternative. Symlinks escaping the source directory are denied; missing files return 404.

PDF, PNG, JPEG, WebP, GIF, AVIF, text and JSON receive inline MIME types, including uppercase extensions. HTML, SVG, JavaScript and unrecognized types download as attachments. Document responses have a restrictive sandbox policy. The JSON byte cap does not limit streamed attachments. Document contents are never embedded, copied, extracted or uploaded.

## Preparation and manifests

Preparation is trip-wide. Checklist array order supplies priority ranks; completed tasks keep their original rank. Packing groups follow first appearance of category, preserving item order within each group. Missing completion flags display as outstanding. Quantities appear only when supplied and must be positive safe integers. Counts refer to entries, not summed quantities. Edit status flags in JSON and refresh; there are no UI write actions.

Bookings/Documents and Prepare tabs appear only when their data is present. A saved unavailable view falls back to Overview without losing the preference. Area belongs to each journey; Prepare hides the selector without discarding it.

The bundled demo manifest is `trips/index.json`:

```json
{ "trips": [{ "path": "japan/trip.json", "label": "Japan", "title": "A short journey" }] }
```

Paths must be unique safe relative paths containing a folder; labels must be nonempty text, and optional titles must be nonempty text. The selected-file launcher generates its manifest automatically and rereads source titles on refresh. Duplicate references to one canonical file appear once. Identical filenames gain the shortest distinguishing parent path. An unreadable alternative does not block the others.
