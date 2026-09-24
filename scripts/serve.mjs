import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { staticFiles } from "./files.mjs";
import { selectedTrips } from "./selected-trip.mjs";
import { appPolicy, localRequests, parseAllowedHosts } from "./http.mjs";

const usage = `Usage: trip-atlas [--no-open] [path/to/itinerary.json ...]
       trip-atlas check path/to/itinerary.json ...
Multiple paths appear in the Journey picker. Without a path, open the demo trips. Relative paths use the invocation directory. PORT sets the port (default 4173).
TRIP_ATLAS_HOSTS lists extra host names to accept, comma-separated, for a proxy such as tailscale serve.`;
const noOpen = process.argv.includes("--no-open");
const args = process.argv.slice(2).filter((arg) => arg !== "--no-open");

/** Best effort: the printed URL still works when no browser can be launched. */
function openBrowser(url) {
  const [command, commandArgs] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, commandArgs, {
    stdio: "ignore",
    detached: true,
  });
  child.on("error", () => {});
  child.unref();
}
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
        { documents: true },
      );
    }
    const appRoot = fileURLToPath(new URL("../dist/", import.meta.url));
    try {
      await access(resolve(appRoot, "index.html"), constants.R_OK);
    } catch {
      throw new Error(
        "Build the app first with npm run build (or use npm start)",
      );
    }
    const app = staticFiles(appRoot);
    const allowedHosts = parseAllowedHosts(process.env.TRIP_ATLAS_HOSTS);
    const port = Number(process.env.PORT ?? 4173);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("PORT must be an integer from 0 to 65535");
    const server = createServer((req, res) => {
      localRequests(req, res, allowedHosts, () => {
        res.setHeader("Content-Security-Policy", appPolicy);
        void trip(req, res, () => app(req, res));
      });
    });
    server.on("error", (error) => {
      console.error(`Trip Atlas: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${server.address().port}`;
      console.log(`Trip Atlas: ${url}`);
      if (allowedHosts.length)
        console.log(`Trip Atlas: also accepting ${allowedHosts.join(", ")}`);
      // Only an interactive terminal opens a browser; tests, CI and pipes just print the URL.
      if (!noOpen && process.stdout.isTTY) openBrowser(url);
    });
  } catch (error) {
    console.error(`Trip Atlas: ${error.message}`);
    process.exitCode = 1;
  }
}
