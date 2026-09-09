# Trip Atlas

A fully local, read-only trip viewer. The sample trips are illustrative, not bookings. The Map and Calendar views share a day-and-time scrubber. The route overview stays fixed while the traveler moves only during known travel intervals.

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

`title` is optional and defaults to “Untitled journey”; a place’s optional `name` defaults to its ID. Optional `startDate` is YYYY-MM-DD; without it the viewer uses Day 1 labels. Optional trip `timezone` supplies a fallback where a place has none. Places may include `country` (uppercase ISO2) and `coordinates: {lat, lon}`. Coordinates are optional; absent coordinates do not invalidate a trip. Empty days inherit the last destination. `initialPlace` is optional: unknown origin remains unknown.

Travel blocks require only `type: "travel"` and `to`. Origin is derived from current place; `from` can explicitly correct it. Optional `start` is departure-local HH:mm; `end` is destination-local HH:mm. `endDay` is the **1-based itinerary day of arrival**, defaulting to departure day. For a day-2 overnight flight arriving day 3, enter `endDay: 3`; an earlier clock alone never implies tomorrow. Intermediate nights remain in transit. Arrival must fall inside the declared days. Travel may also have `mode`, `notes`, and `documents`. A `{ "type": "place", "place": "id" }` block explicitly resets location without claiming timed movement; that day has unknown timing.

Dated instants require a date and applicable timezone. Missing time/zone/date stays unknown; no speed or elapsed share is invented. Entered invalid dates, invalid times, negative dated journeys, overlaps, unknown references, and DST ambiguous/nonexistent clocks raise errors with JSON paths. Resolve ambiguous DST clocks by choosing a different unambiguous planned time; explicit-offset input is not supported yet.

## Time and location model

`src/itinerary.ts` exports types, `parseTrip`, `normalizeTrip`, `positionAt`, `documentUrl`, and `safeRelativePath`. `normalizeTrip(unknown)` validates and returns:

- `trip`, ordered `days`, and ordered `legs` (derived origin, destination, departure/arrival Unix milliseconds, optional duration).
- Each day has source details, start place, optional overnight place, in-transit status, legs departing that day, and ordered stay/travel/unknown segments. Segment times are Unix milliseconds and duration is elapsed milliseconds.
- `hasUnknownTiming` flags timing incompleteness; duration fields stay undefined for unknown days. Known travel duration is a sum of only entered, computable legs, never a complete-total claim when timing is missing.

Calendar proportions must divide clipped segment `durationMs` by the day's real elapsed `durationMs`, not by 24 hours or wall-clock subtraction. A Tokyo-to-Hanoi day is 26 elapsed hours. Boundaries use the local midnight of the starting/ending location; in-transit midnights, including the start of the arrival day, use the origin zone. The end of the arrival day uses the destination zone. Adjacent boundaries agree. This is an explicit presentation convention, not a claim that a plane crosses a timezone at midnight.

`positionAt(model, elapsedMs)` accepts elapsed milliseconds from model.start. It is conservative: if any itinerary timing is unknown, it returns no position. Complete timing returns stationary locations except within travel intervals, which interpolate endpoint coordinates along the shortest longitude direction. The UI uses the per-day segments instead, keeping known days usable in a sparse trip. Geodesic route geometry and actual transport paths are not claimed.

The React app shares the selected trip, day and within-day fraction between both views. Load errors include the file path and remain visible. Local document links open actual files through the same read-only server.

## Using the atlas

Choose a journey at the top, switch Map / Calendar, and drag the bottom timeline or use its arrow keys. The chosen manifest entry is kept in the page URL, so refreshing rereads that same trip; an unknown URL selection falls back to the first manifest entry. The desktop timeline stays accessible while scrolling. Each timeline day has equal width; the position within that day uses its actual elapsed duration. Clicking a calendar day preserves this fraction. Known stays remain stationary. Unclocked travel has an unknown band and no traveler marker; an undated stay can still show its known place. Departure and arrival times in selected-day details are local to their respective places. During transit, the readout shows both local clocks.

Calendar months align Monday–Sunday on desktop; small screens use readable two-column day cards. Transport appears on its applicable calendar days and in the selected-day detail, including overnight arrivals. Day and travel documents open their real local files in a new tab. The theme starts from your system preference and can be switched in the header.

The examples include a 25-day Japan loop, a sparse undated trip, and an illustrative Japan–Vietnam–Thailand–Taiwan loop spanning December and January with an overnight flight. None represents a booking.

## Offline map and limits

`src/assets/world.json` bundles Natural Earth 1:50m country geometry, with properties reduced to country names and coordinates rounded to four decimal places. Source: [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson), [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). Example Tokyo, Kyoto, Osaka, Hiroshima, Hanoi, Bangkok and Taipei coordinates come from Natural Earth populated places; Hakone uses [Wikidata Q671040](https://www.wikidata.org/wiki/Q671040). D3’s Mercator projection fits the trip’s supplied coordinates once per trip and centers across longitude gaps for dateline routes. No tiles, CDN fonts, geocoding or network map services are called. Worldwide geometry makes the local production bundle approximately 2 MB (0.8 MB compressed).

Curved arrows are schematic connections, not actual rail, road or flight paths. The traveler follows the exact rendered quadratic curve; its fraction reflects the entered elapsed journey time, not a claim about real vehicle speed. Unmapped places remain in the calendar and details. On narrow screens numbered map points match the complete place legend. Mercator distorts polar regions; transport routing, bookings, live location, editing forms and hotel inference are outside this read-only viewer’s scope.

`npm test` covers the itinerary engine and per-day UI state, including unknown timing, mixed known days, cross-zone proportions, overnight progress and shared route geometry. `npm run build` and `npm run lint` verify the production UI.
