// Adds the one showcase demo to the GitHub Pages build in dist-pages/.
import { cp, mkdir, writeFile } from "node:fs/promises";

const demo = "bookings";
const out = new URL("../dist-pages/trips/", import.meta.url);
await mkdir(out, { recursive: true });
await cp(
  new URL(`../trips/${demo}/`, import.meta.url),
  new URL(`${demo}/`, out),
  {
    recursive: true,
  },
);
await writeFile(
  new URL("index.json", out),
  JSON.stringify({
    trips: [{ path: `${demo}/trip.json`, label: "Demo trip" }],
  }) + "\n",
);
