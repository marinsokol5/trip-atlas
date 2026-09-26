# Trip Atlas

Trip Atlas is a local, read-only viewer for itinerary JSON files: map, calendar, overview of nights, travel time and per-person costs, bookings and preparation lists. The `trip-atlas` CLI serves the built app for the files it is given and validates them with `trip-atlas check`.

## Commands

- `npm run dev`: Vite dev server with the public demos in `trips/`.
- `npm run check`: lint, production build and all tests. Run it before finishing a change.
- `npm start -- <file.json>...`: build, then serve those itineraries on 127.0.0.1.
- `node scripts/cli.mjs check <file.json>...`: validate itineraries exactly as the viewer does, including linked documents.
- `npm run build:pages`: the public demo site (one demo, base `/trip-atlas/`) in `dist-pages/`; `.github/workflows/pages.yml` deploys it on every push to `main`.

## Layout

- `skills/trip-atlas-update-itinerary/itinerary.schema.json`: the JSON Schema for itinerary files; the source of truth for the format. `npm run schema` regenerates its types in `src/itinerary-schema.ts`.
- `src/itinerary.ts`: schema validation, the checks the schema cannot express (references, dates, day ranges, totals) and route normalization.
- `src/*-model.ts`: derived map, overview, booking and preparation behavior, specified by the matching `*.test.ts`.
- `src/App.tsx` and the view components: the React interface.
- `scripts/`: CLI, local HTTP server, document boundary and `check`, with integration tests.
- `trips/`: public demos; `trips/index.json` is the demo picker manifest.
- `skills/`: agent skills shipped with the package; `trip-atlas-update-itinerary/SKILL.md` links the schema as its field reference.

## Rules

- A field or field meaning changes in `itinerary.schema.json` first, followed by `npm run schema`. Any format, validation or document path change also updates `skills/trip-atlas-update-itinerary/SKILL.md`, the README and the relevant tests in the same change.
- The app never writes itineraries or documents, and it fetches nothing at runtime. The only outbound links are ones the user clicks.
- Keep the server's security boundary intact: loopback only, GET/HEAD only, Host and Origin checks (extra hosts only through the opt-in `TRIP_ATLAS_HOSTS`), and only declared document paths inside each itinerary's folder. Add a regression test when touching `scripts/files.mjs`, `http.mjs` or `serve.mjs`.
- The published package has no runtime dependencies: React, d3, lucide and @cfworker/json-schema are bundled into `dist/` (the schema validator also into `dist-node/`) and stay in `devDependencies`. Runtime scripts must run on Node 22 as plain JavaScript, without importing TypeScript.
- Develop and test with the demos or temporary files. Never commit personal itineraries, tickets, confirmation codes, names or home locations; fixtures, tests and screenshots use fictional data.
- Do not modify a user's own itinerary unless they explicitly ask for itinerary editing.
