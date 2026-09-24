# <img src="https://raw.githubusercontent.com/marinsokol5/trip-atlas/main/public/favicon.svg" alt="" width="36" height="36" align="top"> Trip Atlas

See a travel plan kept in a JSON file as a map, a calendar and a cost overview, on your own machine.

## Why

I was planning seven weeks across five countries with an AI agent. The plan lived in one JSON file the agent kept editing, and I couldn't _see_ it: where I sleep each night, how long the transfers take, what it costs per person, what's still unbooked. Travel apps wanted an account and my data. So Trip Atlas just reads the file, locally, and shows it. You or your agent edit the JSON; refresh the browser to see the change.

## Use it

Needs [Node.js](https://nodejs.org/) 22 or newer.

```sh
npx trip-atlas my-trip.json
```

This opens your browser on `127.0.0.1:4173`. Pass several files to switch between alternative plans, or none to explore the demo trips. To install it once instead:

```sh
npm install -g trip-atlas
trip-atlas my-trip.json
```

`trip-atlas check my-trip.json` validates a file and points at the exact field that's wrong. `--no-open` skips the browser; `PORT=4180` picks another port.

## Let your agent write the file

Two agent skills teach Claude Code, Codex and other agents the format:

```sh
npx skills add marinsokol5/trip-atlas
```

- **trip-atlas-update-itinerary** creates and edits the itinerary, then runs `check`.
- **trip-atlas-download-booking** saves a booking, ticket or confirmation email as a clean PDF beside the itinerary and links it to the trip. It only reads booking sites; it never pays, cancels or logs in for you.

## Private by design

No account, no upload, no analytics, no map API. It fetches nothing and never changes your files. The server listens only on your own machine and serves only the files you pass plus the documents they link. See [SECURITY.md](SECURITY.md).

[MIT license](LICENSE) · [Contributing](CONTRIBUTING.md)
