import { createServer } from "node:http";
import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { staticFiles } from "./files.mjs";
import { selectedTrips } from "./selected-trip.mjs";

const usage =
  "Usage: npm start -- [path/to/itinerary.json ...]\n       npm run serve -- [path/to/itinerary.json ...]\nMultiple paths appear in the Journey picker. Without a path, serve the trips/ demos. Relative paths use the invocation directory.";
const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log(usage);
} else {
  try {
    if (args.some((arg) => !arg || arg.startsWith("-"))) throw new Error(usage);
    let trip;
    if (args.length) {
      const files = [];
      for (const arg of args) {
        const path = resolve(process.env.INIT_CWD || process.cwd(), arg);
        try {
          if (!(await stat(path)).isFile())
            throw new Error("not a regular file");
          await access(path, constants.R_OK);
          files.push({ file: path, canonicalFile: await realpath(path) });
        } catch (error) {
          throw new Error(`Cannot read itinerary ${path}: ${error.message}`);
        }
      }
      trip = selectedTrips(files);
    } else {
      trip = staticFiles(
        fileURLToPath(new URL("../trips/", import.meta.url)),
        "/trips/",
      );
    }
    const app = staticFiles(
      fileURLToPath(new URL("../dist/", import.meta.url)),
    );
    const port = Number(process.env.PORT ?? 4173);
    const server = createServer((req, res) =>
      trip(req, res, () => app(req, res)),
    );
    server.on("error", (error) => {
      console.error(`Trip Atlas: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () =>
      console.log(`Trip Atlas: http://127.0.0.1:${server.address().port}`),
    );
  } catch (error) {
    console.error(`Trip Atlas: ${error.message}`);
    process.exitCode = 1;
  }
}
