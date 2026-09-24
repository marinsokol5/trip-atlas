# Contributing

Use Node 24 or newer; `.nvmrc` selects the supported baseline. From a clean checkout:

```sh
npm ci
npm run dev
```

Run `npm run check` before submitting a change. It lints, builds and runs the model, loader and local-server regression tests; the server tests bind temporary loopback ports and remove their temporary files. `npm test` also builds first, so it works on a clean checkout. CI checks Node 24 on Linux, macOS and Windows, plus the current Node release on Linux.

Keep changes focused and explain the user-visible behavior and how you checked it. Add regression coverage for corrected behavior; avoid tests that merely repeat the implementation. UI changes should also be tried in Overview, Map and Calendar at desktop and narrow widths, using the public demos. Bookings and Prepare appear only for trips that provide those sections.

## Project map

- `src/itinerary.ts`: schema validation, timezone handling and route normalization.
- `src/*-model.ts`: derived map, overview, booking and preparation behavior; corresponding tests specify the edge cases.
- `src/App.tsx` and view components: the read-only React interface.
- `scripts/`: local HTTP server, document boundary and integration tests.
- `trips/`: public demonstrations; `trips/index.json` is the demo picker manifest.
- `skills/trip-atlas-update-itinerary/SKILL.md`: compact, canonical field reference for agents.
- `skills/trip-atlas-download-booking/`: agent workflow that saves a reservation as one named PDF and links it from its booking; its template holds placeholders only.

Schema, validation or document path changes must update the README, [format guide](docs/itinerary-format.md), canonical skill and relevant tests together. Keep the skill compact: a two-sentence introduction and one required/optional sentence per authored field. Preserve unknown optional metadata rather than rewriting users' files.

The app stays local and read-only. Keep personal itineraries, tickets, confirmation numbers and books outside this repository. Use fictional attachments and public demos in tests and screenshots. Add source attribution for new third-party assets, and retain dependency license notices when upgrading.

Report bugs with a minimal fictional JSON example, the command used, Node version and browser. See [SECURITY.md](SECURITY.md) for sensitive reports.
