# <img src="https://raw.githubusercontent.com/marinsokol5/trip-atlas/main/public/favicon.svg" alt="" width="36" height="36" align="top"> Trip Atlas

An LLM-friendly trip planner and visualizer. Your whole trip is one JSON file, and Trip Atlas turns it into up to five views: Overview, Map, Calendar, Documents and Checklist.

- See your plan, compare options and understand what it costs.
- Keep your bookings and documents linked in one place.
- Give your trip a structure you and an LLM can discuss and edit together.

**[Try the demo](https://marinsokol5.github.io/trip-atlas/)** in your browser, no install needed.

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

Everything stays on your machine: no account, no upload, and your files are never changed. [MIT license](LICENSE)
