# Trip Atlas

A fully local, read-only trip viewer. The sample trips are illustrative, not bookings. Overview summarizes duration, stays, travel time and optional costs. Map and Calendar share a day-and-time scrubber; all three views share Area. The route overview stays fixed while selecting days; zoom and pan change only through map controls. The traveler moves only during known travel intervals.

## Run

Use Node 24 or newer (`nvm use` reads `.nvmrc`). Install dependencies once with `npm install`.

- `npm run dev`: local development at the printed loopback address.
- `npm start`: build the UI and serve it at http://127.0.0.1:4173.
- `npm run serve`: serve an existing build without rebuilding.
- `npm test`, `npm run build`, `npm run lint`: verification.

To open your own itinerary, pass its path:

```sh
npm start -- /Users/marinsokol/projects/research/asia-trip/itinerary.json
# Or, with an existing build:
npm run serve -- /Users/marinsokol/projects/research/asia-trip/itinerary.json
```

Run these commands from `trip-visualizer/`, or use `npm --prefix trip-visualizer start -- itinerary.json` from its parent directory. Relative paths resolve from the directory where you invoked npm (the current working directory for direct `node scripts/serve.mjs` invocation). Quote paths containing spaces. The file must already exist and be readable; invalid JSON is reported in the viewer and can be corrected, then refreshed. `--help` prints launcher usage.

With a path, the launcher serves that JSON and only its explicitly referenced local documents, relative to the JSON's directory. It does not copy or bundle them. Edit the itinerary or its documents and refresh to load changes without rebuilding or restarting. Without a path, `npm start` and `npm run serve` use the `trips/` demo manifest. `npm run dev` also uses those demos.

After installation, building and running require no network. No database, accounts, external APIs, or map requests are used. The production launcher only accepts GET/HEAD, binds loopback, and serves `dist/` plus the chosen trip files. `vite preview` does not serve trip files; use the launcher instead.

## Shared itinerary skill

[`skills/update-itinerary/SKILL.md`](skills/update-itinerary/SKILL.md) is the single Git-tracked skill for creating and updating the parent workspace's `itinerary.json` with Claude Code or Codex. It describes the current JSON format, sparse plans, local documents, coordinate lookup, and parser validation. The personal itinerary and installed links live outside this app repository.

To install after cloning into a `trip-visualizer` folder, run these commands from its parent workspace. Keep `.agents`, `.claude`, and their `skills` directories as real directories. Check existing destinations first: retain an already-correct link, and do not replace an unrelated file, directory, or link.

```sh
mkdir -p .agents/skills .claude/skills
ln -s ../../trip-visualizer/skills/update-itinerary .agents/skills/update-itinerary
ln -s ../../trip-visualizer/skills/update-itinerary .claude/skills/update-itinerary
```

These project locations follow [Codex skills](https://learn.chatgpt.com/docs/build-skills) and [Claude Code skills](https://code.claude.com/docs/en/skills). Both links resolve to the same canonical skill; edit that tracked file to update both installations. The skill resolves its real path before choosing the default itinerary, so invocation from the app or workspace selects the same file. `AGENTS.md` holds the app's maintenance instructions; `CLAUDE.md` links to it for [Claude Code memory](https://code.claude.com/docs/en/memory).

## Edit trips

Edit `trips/index.json` to list `{ "path": "japan/trip.json", "label": "Japan" }` entries inside its `trips` array. A trip is one JSON file across all countries. Edit a file, then **refresh the browser** to reread it. Files are fetched with `no-store`, excluded from Vite watching, and never bundled. A production trip edit needs no rebuild or server restart. Add local document files inside the selected trip folder and link them by relative path. External URLs, traversal, encoded paths, and symlink escapes are rejected. Do not publish this directory: it may contain your private documents.

Minimal trip:

```json
{
  "version": 1,
  "title": "A journey",
  "initialPlace": "tokyo",
  "places": {
    "tokyo": { "name": "Tokyo", "timezone": "Asia/Tokyo" },
    "kyoto": { "name": "Kyoto", "timezone": "Asia/Tokyo" }
  },
  "days": [
    {},
    { "blocks": [{ "type": "travel", "to": "kyoto", "start": "10:00", "end": "13:00" }] },
    { "notes": "Explore", "documents": [{ "label": "Notes", "path": "notes.txt" }] }
  ]
}
```

`title` is optional and defaults to “Untitled journey”; a place’s optional `name` defaults to its ID. Optional `startDate` is YYYY-MM-DD; without it the viewer uses Day 1 labels. Optional trip `timezone` supplies a fallback where a place has none. Places may include `country` (uppercase ISO2) and `coordinates: {lat, lon}`. Coordinates are optional; absent coordinates do not invalidate a trip. Optional `days[].title` is a nonempty purpose label (for example, "Snow monkeys, then Tokyo"), displayed in its calendar card and day panel. Omit it to retain the current route/location heading. Empty days inherit the last destination. `initialPlace` is optional: unknown origin remains unknown.

Travel blocks require only `type: "travel"` and `to`. Origin is derived from current place; `from` can explicitly correct it. Optional `start` is departure-local HH:mm; `end` is destination-local HH:mm. `endDay` is the **1-based itinerary day of arrival**, defaulting to departure day. For a day-2 overnight flight arriving day 3, enter `endDay: 3`; an earlier clock alone never implies tomorrow. Intermediate nights remain in transit. Arrival must fall inside the declared days. Travel may also have `mode`, `estimatedDurationMinutes`, `components`, `notes`, and `documents`. A `{ "type": "place", "place": "id" }` block explicitly resets location without claiming timed movement; that day has unknown timing.

Dated instants require a date and applicable timezone. Missing time/zone/date stays unknown; no speed or elapsed share is invented. Entered invalid dates, invalid times, negative dated journeys, overlaps, unknown references, and DST ambiguous/nonexistent clocks raise errors with JSON paths. Resolve ambiguous DST clocks by choosing a different unambiguous planned time; explicit-offset input is not supported yet.

### Rough durations and place groups

Optional `groups: {"kumano": {"name": "Kumano Kodo", "color": "#249881"}}` at trip level defines visual groups. A place joins with `"group": "kumano"`. Membership is explicit and should follow a meaningful region or day-trip area, not proximity alone (for example, Nagano with its Snow Monkey Park excursion, while Tokyo and Fuji Five Lakes stay separate). All underlying coordinates and connections remain available; distinct overnight stops are never automatically merged. Ungrouped places get their own label and color. Group colors are optional six-digit hex values.

Use clean modes (`train`, `bus`, `walk`, `hike`, `flight`, `ferry`, `car`, `other`) and put explanations in notes; existing free-form mode strings remain valid. `estimatedDurationMinutes: 180` means an approximate three-hour duration, displayed `~3h`, with no inferred clocks. When migrating a supported range, choose its upper bound and preserve context in notes. For a connection with multiple modes use `components: [{"mode":"bus","estimatedDurationMinutes":5},{"mode":"hike","estimatedDurationMinutes":360}]`. This nonempty ordered array requires mode per component; its positive finite duration is optional. Omit redundant top-level estimates when all components have estimates; the viewer adds them. For an unsplit bus-and-boat transfer, keep the whole estimate and use mode-only components (for example bus, ferry, bus); no mode shares are invented. Components require no invented intermediate coordinates. Estimated component durations remain estimates, including for a connection with exact whole-leg clocks. Whole-leg durations with unallocated components are retained separately as mixed / unallocated, because exact walking versus transport time is not known. Other legacy metadata is preserved but not interpreted; use only documented fields for display behavior.

## Time and location model

`src/itinerary.ts` exports types, `parseTrip`, `normalizeTrip`, `positionAt`, `documentUrl`, and `safeRelativePath`. `normalizeTrip(unknown)` validates and returns:

- `trip`, ordered `days`, and ordered `legs` (derived origin, destination, departure/arrival Unix milliseconds, optional duration).
- Each day has source details, start place, optional overnight place, in-transit status, legs departing that day, and ordered stay/travel/unknown segments. Segment times are Unix milliseconds and duration is elapsed milliseconds.
- `hasUnknownTiming` flags timing incompleteness; duration fields stay undefined for unknown days. Known travel duration is a sum of only entered, computable legs, never a complete-total claim when timing is missing.

Calendar proportions must divide clipped segment `durationMs` by the day's real elapsed `durationMs`, not by 24 hours or wall-clock subtraction. A Tokyo-to-Hanoi day is 26 elapsed hours. Boundaries use the local midnight of the starting/ending location; in-transit midnights, including the start of the arrival day, use the origin zone. The end of the arrival day uses the destination zone. Adjacent boundaries agree. This is an explicit presentation convention, not a claim that a plane crosses a timezone at midnight.

`positionAt(model, elapsedMs)` accepts elapsed milliseconds from model.start. It is conservative: if any itinerary timing is unknown, it returns no position. Complete timing returns stationary locations except within travel intervals, which interpolate endpoint coordinates along the shortest longitude direction. The UI uses the per-day segments instead, keeping known days usable in a sparse trip. Geodesic route geometry and actual transport paths are not claimed.

The React app shares the selected trip and Area across Overview, Map and Calendar, and the selected day and within-day fraction between Map and Calendar. Load errors include the file path and remain visible. Local document links open actual files through the same read-only server.

## Using the atlas

On desktop-sized windows, Atlas fills the viewport: Map and Calendar share the same main pane, day details stay on the right, and the bottom timeline has its own reserved space. Long calendars and expanded day details scroll independently. Narrow or short windows retain the stacked layout.

The shared Area selector sits beside the Overview/Map/Calendar tabs. The map header shows the date and current location on the left, with zoom in/out, Fit area, compact Play/Pause/Replay and speed controls, and **Map labels** together on the right. Controls wrap on narrow screens. The speed slider shows only its current multiplier. Wheel zoom is anchored at the pointer and consumes scrolling over the map. Zoom buttons and wheel zoom have no fixed minimum or maximum in either country or Whole trip views; Fit area always restores the proposed framing. The Map toolbar has Play/Pause: playback starts at the current position, advances about one itinerary day every three seconds at 1×, and stops at the end. The Speed slider offers 0.5×, 1×, 2×, 4×, and 8×; changes apply during playback and are remembered in local storage. Replay starts over within the selected area. New journeys begin at day one, midnight where a clock is available. Manual date/slider navigation, switching views, or hiding the tab pauses playback. Calendar cells show their explicit area/trail groups, such as Kumano Kodo, alongside their overnight place; muted dates fill the unused days of the first and last Monday–Sunday weeks without adding days to the itinerary.

Choose a journey, switch Overview / Map / Calendar, and use the bottom timeline, its clickable day numbers, or Previous/Next day buttons. Every day and month boundary is labeled. The selected journey persists in the URL. The map keeps its overview while selecting dates; scroll down over the map to zoom in or up to zoom out around the pointer, use zoom buttons (including zooming out beyond the selected area’s initial fit), drag to pan, or **Fit selected area** to restore its framing. A prominent airplane marks the selected position above the map labels. With entered times it follows the scheduled route; on rough days it uses illustrative progress through the known route, weighted by available duration estimates. City stays keep it stationary, and overnight journeys remain continuous across days. This animation creates no departure or arrival times in the data. Frame updates are isolated to the traveler and timeline readout/input; the map, labels and day panels update only at meaningful day or location/leg changes. **Map labels** independently controls **Start / Finish** (on by default), **Place / group names** (off by default), and transport duration annotations. Enabling names replaces map numbers with the corresponding group names; disabling names restores the numbers. The numbered legend, place dots and routes remain unchanged. These two checkbox preferences persist in local storage independently of the existing duration, speed and Area settings. Hover, keyboard-focus, or tap a place dot to reveal its actual place name above the dot, regardless of permanent label settings. Tooltips retain their screen size and dismiss on camera movement. Transfer-only points are smaller and quieter than overnight stops. Their coordinates and routes remain intact.

The shared **Area** picker defaults to **Whole trip** and lists countries found in visited places. A muted third color highlights the selected country’s polygon; Whole trip highlights every visited itinerary country (including the home country), excluding unused place definitions. Highlighting stays fixed during playback and requires no runtime network or display-name matching. Selecting a country fits its mapped visits, shows only its place/group legend and domestic connections, and labels its earliest/latest itinerary locations **Start** and **Finish** (combined when both are the same place). Group membership is filtered by each place’s country while retaining its color. Border-crossing legs are excluded from country connection totals. Places without country metadata remain in Whole trip; places without coordinates remain in the scoped legend but cannot receive a map marker or endpoint label. A country with no mapped visits shows the world background. Dragging, wheel zoom and zoom buttons move the camera without changing the area or endpoints; **Fit selected area** restores its framing. Area selection also scopes the bottom day picker, timeline and playback. Arrival and departure days belong to each country present that day, including active overnight journey endpoints and explicit location resets. Repeated visits stay chronological while unrelated days between visits are skipped. Changing area pauses playback and retains the current position if its day belongs to the area; otherwise it selects the first eligible day. Replay starts at the area’s first day. Whole trip restores all days. The calendar shows weeks containing relevant scoped days, with muted, noninteractive surrounding dates as context. Intervening unrelated weeks are omitted and later visits are labeled. Whole trip shows every day. Calendar/date navigation never changes Area implicitly; selecting a date on the timeline scrolls it into the Calendar’s own viewport if needed. Area selection survives Calendar/Map switches and is saved in local storage for each journey path. Reopening a journey restores its saved area at the first eligible day; if that country is no longer present, the viewer opens Whole trip. Playback speed and the duration filter are also saved in local storage.

Map duration labels show one vehicle total per continuous same-day connection through transfer points between overnight stops or journey endpoints. Walking time is excluded; local return-to-base excursions are separate from onward travel. Unknown vehicle durations and unsplit walking/vehicle mixtures have no aggregate label. Component estimates remain approximate, and exact mixed totals are never allocated to modes. The **Transport durations** row in **Map labels** filters labels only: **>1h** (the default) means strictly more than 60 minutes after summing, **>30m**, **>2h**, and **>4h** mean strictly more than 30, 120, and 240 minutes, **All** shows every available positive vehicle total, and **None** hides durations. Routes never disappear under this filter. If map space or the current camera prevents a known label from fitting, a footer count reports the additional duration labels; zoom, pan or narrow Area to inspect them. Internal-area vehicle connections follow the same filter on every screen size. Multi-stop circuits keep their intermediate path and show total vehicle time. These display totals are derived, never duplicated in the JSON. Compatible out-and-back connections with exactly reversed waypoints share one bidirectional map path. The shared path has arrowheads at both ends and one compact duration label, such as “~2h”; when directions differ, it shows the longer available vehicle duration. The threshold is checked separately for each direction, never against a round-trip sum. Plain arrow tails also leave a small gap from their starting dots. Ambiguous repeated passes and different via routes stay separate. Calendar, day details and traveler timing retain the individual journeys.

Rough-day bars show a schematic route sequence: continuous stay and internal trail colors, with short distinct transport sections. Their widths are estimated and do not claim elapsed proportions. Exact days retain elapsed-time proportions. The collapsed **About this map** disclosure inside **Map labels** explains route geometry, illustrative timing and the ~ estimate notation. The popup stays open when interacting with controls or its interior, and dismisses on outside clicks, the trigger, Escape or Tab navigation out. The footer keeps linked Natural Earth attribution and functional notices; overnight information appears in the day details and Calendar.

Calendar shows a small muted country label beside every trip date so context remains clear across scrolled weeks and month boundaries. Crossing days show ordered country names such as “Vietnam → Thailand”; same-country stops are collapsed, while excursions retain the return country. Days without country metadata omit the label. Calendar displays only Monday–Sunday weeks touched by the trip, with compact mode icons, durations and overnight destinations. Selected details sit beside the grid on desktop and directly after the selected row of two-column cards on mobile. Notes, schedules, hotels and actual local document links are expandable. Same-zone timezone labels are omitted. The timeline remains in document flow so it cannot cover expanded details.

The examples include a 25-day Japan loop, a sparse undated trip, and an illustrative Japan–Vietnam–Thailand–Taiwan loop spanning December and January with an overnight flight. None represents a booking.

## Offline map and limits

`src/assets/world.json` bundles Natural Earth 1:50m country geometry, with country names, ISO2 identifiers, and coordinates rounded to four decimal places. ISO2 identifiers are derived offline from the same source’s `ISO_A2_EH`, falling back to valid two-letter `ISO_A2` values; unresolved features remain unhighlighted. Source: [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson), [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). Example Tokyo, Kyoto, Osaka, Hiroshima, Hanoi, Bangkok and Taipei coordinates come from Natural Earth populated places; Hakone uses [Wikidata Q671040](https://www.wikidata.org/wiki/Q671040). D3’s Mercator projection fits all declared places with supplied coordinates in Whole trip, or only visited places with supplied coordinates in a selected country, and centers across longitude gaps for dateline routes. No tiles, CDN fonts, geocoding or network map services are called. Worldwide geometry makes the local production bundle approximately 2 MB (0.8 MB compressed).

Curved arrows are schematic connections, not actual rail, road or flight paths. The traveler follows the exact rendered quadratic curve; its fraction reflects the entered elapsed journey time, not a claim about real vehicle speed. Unmapped places remain in the calendar and details. When the map is dense, readable numbered map labels match the complete group legend. Labels, badges, points and arrowheads retain screen-pixel sizes through zoom. Mercator distorts polar regions; transport routing, bookings, live location, editing forms and hotel inference are outside this read-only viewer’s scope.

`npm test` covers the itinerary engine and per-day UI state, including unknown timing, mixed known days, cross-zone proportions, overnight progress and shared route geometry. `npm run build` and `npm run lint` verify the production UI.

### Overview and optional budget

Overview is the initial view, with a remembered Overview / Map / Calendar selection and the shared Area filter. It compares one journey at a time. Whole trip starts with a Countries breakdown; a country starts with Places (the same explicit map groups and colors). Days count listed days; nights count the gaps between them (`days.length - 1`), never an extra night after the final day. Overnight journeys are In transit, and unlocated nights are Unknown. Country days can overlap on crossing days; country nights follow the actual overnight place. Repeated visits are combined without duplicating days or nights.

Optional trip fields are `currency: "EUR"` (uppercase ISO3) and `budget: {"countries": {"JP": {"livingPerDay": 70, "accommodationPerNight": 140}}}`. A travel block may have `estimatedCost: 120`. These numbers are **illustrative examples only**, not price recommendations. All amounts are **per person**, in the trip's one currency: `livingPerDay` is one person's daily living budget, `accommodationPerNight` is one person's share per night, and `estimatedCost` is one person's cost for that travel block. Store shared room or transfer prices as each person's share using the known occupancy; do not assume a party size. Overview totals are also per person, with no automatic party-size multiplication or currency conversion. Every provided amount must be finite and nonnegative. Zero means free; omit unknown amounts. Any supplied price requires `currency`; existing trips without budgets remain valid. Country budget keys use uppercase ISO2. Unused country budgets have no effect. Booking, activity, per-city, and exchange-rate pricing are outside this version. Do not add real estimates unless the user requests them and supplies or authorizes their basis.

Living costs are assigned once per listed day: use the overnight country's rate, or the departing/last known country during overnight transit; the final day uses its final location. An unknown location stays unknown. Accommodation uses only known overnight places before the final day; in-transit nights require no hotel cost. Country stay rows include living and accommodation only. Transport costs include whole travel blocks with an endpoint in the selected country, including international travel; whole-trip totals count each leg once. Country transport totals may therefore overlap and must not be added together. Walking/hiking time is excluded. A pure walking block does not require a price; an explicitly supplied walking `estimatedCost` is included in Other transport.

Flights and Other transport exclude walking. Exact whole-connection timing takes precedence over estimates; transfer components are never added twice. Known all-vehicle ground mixtures can contribute their whole total. Unsplit flight/ground or walking/vehicle time remains unallocated, never an invented mode share. `~` means an estimate, `+` means required values are missing, and `?` means no amount is known. A category with no applicable units is zero. Budget totals are estimates; absent currency is never assumed to be EUR.

### Opening alternative journey files

Pass multiple explicit files to the launcher, for example `npm start -- "plans/short itinerary.json" "plans/long itinerary.json"` (or `npm run serve -- ...` for an existing build). The Journey picker switches one plan at a time in the same Overview layout. Relative paths resolve from npm's invocation directory (`INIT_CWD`); quote spaces. Duplicate references to the same canonical file appear once. Single-file and no-argument demo workflows remain compatible.

Each selected file has its own stable virtual root. Duplicate filenames are distinguished by their parent folder name, or the shortest distinguishing parent path when those names also match. Route identifiers remain internal. Documents resolve relative to their own itinerary and are served only when explicitly referenced by that file; unrelated files and symlinks escaping its directory remain inaccessible. Files are read on demand, and manual browser refresh loads edits. Replacing a selected file with a symlink to a different source is rejected. An unreadable alternative does not prevent opening another selected file. A saved Area belongs to its journey; when an alternative has no saved Area, its matching country can carry across without overwriting stored preferences. The selected view persists across journeys and reloads.
