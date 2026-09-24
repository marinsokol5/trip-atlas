import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { readJsonFile } from "./read-json.mjs";
import { documentPaths } from "./selected-trip.mjs";

const usage = "Usage: trip-atlas check path/to/itinerary.json ...";

/** Validates each itinerary as the viewer would and confirms its local documents exist. Returns the exit code. */
export async function check(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log(usage);
    return 0;
  }
  if (!args.length || args.some((arg) => !arg || arg.startsWith("-"))) {
    console.error(usage);
    return 1;
  }
  let validateTrip;
  try {
    ({ validateTrip } = await import("../dist-node/validate.mjs"));
  } catch {
    console.error("Trip Atlas: Build the validator first with npm run build");
    return 1;
  }
  let failed = false;
  for (const arg of args) {
    const file = resolve(process.env.INIT_CWD || process.cwd(), arg);
    const problems = [];
    let summary;
    try {
      let source;
      try {
        source = JSON.parse(new TextDecoder().decode(await readJsonFile(file)));
      } catch (error) {
        throw error instanceof SyntaxError
          ? new Error(`Invalid JSON: ${error.message}`)
          : error;
      }
      summary = validateTrip(source);
      for (const path of documentPaths(source))
        try {
          await access(resolve(dirname(file), path), constants.R_OK);
        } catch {
          problems.push(`Document not found beside the itinerary: ${path}`);
        }
    } catch (error) {
      problems.push(error.message);
    }
    if (problems.length) {
      failed = true;
      console.error(`✗ ${arg}`);
      for (const problem of problems) console.error(`  ${problem}`);
    } else
      console.log(
        `✓ ${arg}: ${[
          summary.title,
          `${summary.days} ${summary.days === 1 ? "day" : "days"}`,
          `${summary.places} ${summary.places === 1 ? "place" : "places"}`,
          summary.bookings &&
            `${summary.bookings} ${summary.bookings === 1 ? "booking" : "bookings"}`,
        ]
          .filter(Boolean)
          .join(" · ")}`,
      );
  }
  return failed ? 1 : 0;
}
