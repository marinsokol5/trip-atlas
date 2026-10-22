import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { isIPv6 } from "node:net";
import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { staticFiles } from "./files.mjs";
import { selectedTrips } from "./selected-trip.mjs";
import {
  appPolicy,
  localRequests,
  parseAllowedHosts,
  parseListenAddress,
} from "./http.mjs";

const usage = `Usage: trip-atlas [--no-open] [path/to/itinerary.json ...]
       trip-atlas check path/to/itinerary.json ...
Multiple paths appear in the Journey picker. Without a path, open the demo trips. Relative paths use the invocation directory. PORT sets the port (default 4173).
TRIP_ATLAS_HOSTS lists extra host names to accept, comma-separated, for a proxy such as tailscale serve.
TRIP_ATLAS_LISTEN sets the IP address to listen on (default 127.0.0.1), e.g. 0.0.0.0 inside a container.`;
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
        "Build the app first with pnpm run build (or use pnpm start)",
      );
    }
    const app = staticFiles(appRoot);
    const allowedHosts = parseAllowedHosts(process.env.TRIP_ATLAS_HOSTS);
    const address = parseListenAddress(process.env.TRIP_ATLAS_LISTEN);
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
    server.listen(port, address, () => {
      // An unspecified address (0.0.0.0, ::) includes loopback. Any other non-loopback
      // address is only accepted as a Host when it is also in TRIP_ATLAS_HOSTS.
      const shown = ["0.0.0.0", "::"].includes(address)
        ? "127.0.0.1"
        : isIPv6(address)
          ? `[${address}]`
          : address;
      const url = `http://${shown}:${server.address().port}`;
      console.log(`Trip Atlas: ${url}`);
      if (allowedHosts.length)
        console.log(`Trip Atlas: also accepting ${allowedHosts.join(", ")}`);
      if (!address.startsWith("127.") && address !== "::1")
        console.log(
          `Trip Atlas: listening on ${address}, so anyone who can reach this port can read these itineraries and their documents`,
        );
      // Only an interactive terminal opens a browser; tests, CI and pipes just print the URL.
      if (!noOpen && process.stdout.isTTY) openBrowser(url);
    });
  } catch (error) {
    console.error(`Trip Atlas: ${error.message}`);
    process.exitCode = 1;
  }
}
