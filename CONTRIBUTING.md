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
- `skills/trip-atlas-update-itinerary/itinerary.schema.json`: the canonical field reference, validated first by the app and the CLI; `SKILL.md` beside it holds the writing guidance for agents.
- `skills/trip-atlas-download-booking/`: agent workflow that saves a reservation as one named PDF and links it from its booking; its template holds placeholders only.

Schema, validation or document path changes must update the README, canonical skill and relevant tests together. Keep the skill compact: a two-sentence introduction and the writing rules; each field's meaning is one `description` sentence in the schema, followed by `npm run schema`. Preserve unknown optional metadata rather than rewriting users' files.

The app stays local and read-only. Keep personal itineraries, tickets, confirmation numbers and books outside this repository. Use fictional attachments and public demos in tests and screenshots. Add source attribution for new third-party assets; the build regenerates bundled dependency licenses, and fails on an unlicensed or non-permissive one.

Report bugs with a minimal fictional JSON example, the command used, Node version and browser. See [SECURITY.md](SECURITY.md) for sensitive reports.

## Releasing

Run `npm run release` from a clean, pushed `main` after `npm login`. It shows the current and published versions, asks which to release, then runs the full check, bumps and tags the version, publishes to npm, pushes the tag and creates the GitHub release. `npm run release -- --dry-run` goes through the same steps without tagging, publishing or pushing.
