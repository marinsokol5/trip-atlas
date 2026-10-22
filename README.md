# <img src="https://raw.githubusercontent.com/marinsokol5/trip-atlas/main/public/favicon.svg" alt="" width="36" height="36" align="top"> Trip Atlas

An LLM-friendly trip planner and visualizer. Your whole trip is one JSON file, and Trip Atlas turns it into (up to) five views: Overview, Map, Calendar, Documents and Checklist.

- Visualize your plan, compare different options and understand how much it all costs.
- Keep your bookings and documents in the same place.
- See day-to-day sightseeing agenda and transport plan.

See a trip example at https://marinsokol5.github.io/trip-atlas/, created fully from [asia/trip.json](https://github.com/marinsokol5/trip-atlas/blob/main/trips/asia/trip.json).

## Install

Needs [Node.js](https://nodejs.org/) 22 or newer.

```sh
npm install -g trip-atlas
npx skills add marinsokol5/trip-atlas -g
```

To update later:

```sh
npm update -g trip-atlas
npx skills update
```

## Use

1. Talk through a rough plan with your agent, then have it write the file: `/trip-atlas-update-itinerary`.
2. Look at it: `trip-atlas itinerary.json`. Edit the file, refresh the browser.
3. To compare plans, make another file and open both: `trip-atlas plan-a.json plan-b.json`.
4. To keep a booking, ticket or confirmation email, use `/trip-atlas-download-booking`. It saves a clean PDF next to your itinerary and links it to the trip.

The file format is defined by a [JSON Schema](skills/trip-atlas-update-itinerary/itinerary.schema.json). Start your file with `"$schema": "https://raw.githubusercontent.com/marinsokol5/trip-atlas/main/skills/trip-atlas-update-itinerary/itinerary.schema.json"` and your editor will validate and autocomplete it.

### Baggage

Booking baggage is per person. Each `baggage` entry records a bag type (`checked`, `cabin`, or `personal`), its `pieces`, and optionally `kg` per piece. Set `cabinTotalKg` on the booking when cabin bags and personal items share a weight limit; it excludes checked bags and requires at least one cabin or personal piece. Individual `kg` limits still apply. Without `cabinTotalKg`, no shared limit is assumed.

Record verified size limits as `dimensionsCm` (three external side lengths from longest to shortest, including wheels, handles and pockets) or `maxLinearCm` (the sum of height + width + depth). If both are present, both limits apply. Omit unknown dimensions; the viewer does not infer them or fetch airline policies.

This example shows separate dimensions for each bag, followed by a shared weight row with the cabin and personal-item icons joined by a plus sign and “10 kg”:

```json
{
  "type": "transport",
  "title": "Flight",
  "baggage": [
    { "type": "checked", "pieces": 1, "kg": 23, "maxLinearCm": 158 },
    { "type": "cabin", "pieces": 1, "dimensionsCm": [56, 36, 23] },
    { "type": "personal", "pieces": 1, "dimensionsCm": [40, 30, 15] }
  ],
  "cabinTotalKg": 10
}
```

### Weather

A day can carry its forecast: `"weather": { "lowC": 19, "highC": 27, "condition": "rain" }`. Temperatures are whole °C and `condition` (`sunny`, `partly-cloudy`, `cloudy`, `rain`, `storm` or `snow`) is optional. The Calendar shows it in the top-right corner of the day, e.g. a rain cloud and “19–27°”. Trip Atlas never fetches weather; have your agent fill it in and refresh it as the dates near.

## Host

To keep it running on a server, use Docker. Mount the folder that holds your itinerary, so its documents come along:

```sh
docker build -t trip-atlas https://github.com/marinsokol5/trip-atlas.git
docker run -d --restart unless-stopped -p 127.0.0.1:4173:4173 -v "$PWD:/trip:ro" trip-atlas /trip/itinerary.json
```

Or with Docker Compose:

```yaml
services:
  trip-atlas:
    build: https://github.com/marinsokol5/trip-atlas.git
    restart: unless-stopped
    ports: ["127.0.0.1:4173:4173"]
    volumes: ["./my-trip:/trip:ro"]
    command: ["/trip/itinerary.json"]
```

Edit the itinerary and refresh, as locally. Anyone who can reach the port can read the trip and its documents, so publish it on `127.0.0.1` and reach it through a private proxy. I recommend [Tailscale](https://tailscale.com/). Name the proxy's address in `TRIP_ATLAS_HOSTS` (e.g. `-e TRIP_ATLAS_HOSTS=trip.example.ts.net`), and have the proxy pass the original `Host` header on (Caddy and Traefik do; nginx needs `proxy_set_header Host $host;`).

Without Docker, `TRIP_ATLAS_LISTEN` sets the IP address the server listens on (default `127.0.0.1`; the image uses `0.0.0.0`).

[MIT license](LICENSE)
