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

## Open it on your phone

Trip Atlas only listens on your own computer. To reach it from your phone, put [Tailscale](https://tailscale.com/) in front of it and name your computer's tailnet address in `TRIP_ATLAS_HOSTS` (comma-separated for several):

```sh
TRIP_ATLAS_HOSTS=your-mac.your-tailnet.ts.net PORT=4173 trip-atlas --no-open itinerary.json
tailscale serve --bg 4173
```

Then open `https://your-mac.your-tailnet.ts.net` on any device in your tailnet. Linked documents come from the same server, so PDFs open too while your computer is awake and Trip Atlas is running. Use `tailscale serve`, never `tailscale funnel`: funnel publishes your tickets and passports to the internet.

[MIT license](LICENSE)
