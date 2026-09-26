import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
async function run(args, cwd) {
  const child = spawn(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: "" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const [code] = await once(child, "close");
  return { code, output };
}

test("the published validator runs without node_modules", async (t) => {
  // The package has no runtime dependencies, so every library must be inlined.
  const root = await mkdtemp(join(tmpdir(), "trip-validator-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const copy = join(root, "validate.mjs");
  await copyFile(
    fileURLToPath(new URL("../dist-node/validate.mjs", import.meta.url)),
    copy,
  );
  const { validateTrip } = await import(pathToFileURL(copy).href);
  const demo = JSON.parse(
    await readFile(new URL("../trips/japan/trip.json", import.meta.url), "utf8"),
  );
  assert.equal(validateTrip(demo).days, demo.days.length);
});

test("check accepts valid itineraries and summarises them", async () => {
  const demos = fileURLToPath(new URL("../trips/", import.meta.url));
  const { code, output } = await run(
    ["check", "japan/trip.json", "bookings/trip.json"],
    demos,
  );
  assert.equal(code, 0, output);
  assert.match(output, /✓ japan\/trip\.json: .*\d+ days · \d+ places/);
  assert.match(output, /✓ bookings\/trip\.json: .*\d+ bookings?/);
});

test("check reports invalid JSON, schema errors and missing documents", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "broken.json"), "{");
  await writeFile(
    join(root, "unknown-place.json"),
    JSON.stringify({
      version: 1,
      places: {},
      days: [{ blocks: [{ type: "travel", to: "nowhere" }] }],
    }),
  );
  await writeFile(
    join(root, "missing-document.json"),
    JSON.stringify({
      version: 1,
      places: {},
      days: [{}],
      documents: [{ label: "Ticket", path: "ticket.pdf" }],
    }),
  );
  await writeFile(
    join(root, "valid.json"),
    JSON.stringify({ version: 1, places: {}, days: [{}] }),
  );
  const { code, output } = await run(
    [
      "check",
      "broken.json",
      "unknown-place.json",
      "missing-document.json",
      "valid.json",
    ],
    root,
  );
  assert.equal(code, 1);
  assert.match(output, /✗ broken\.json\n {2}Invalid JSON/);
  assert.match(
    output,
    /✗ unknown-place\.json\n {2}days\[0\]\.blocks\[0\]\.to: .*/,
  );
  assert.match(
    output,
    /✗ missing-document\.json\n {2}Document not found beside the itinerary: ticket\.pdf/,
  );
  assert.match(output, /✓ valid\.json: Untitled journey · 1 day · 0 places/);
});

test("check and the CLI explain their usage and version", async () => {
  for (const [args, status, message] of [
    [["check"], 1, /Usage: trip-atlas check/],
    [["check", "--strict"], 1, /Usage: trip-atlas check/],
    [["check", "--help"], 0, /Usage: trip-atlas check/],
    [["--help"], 0, /Usage: trip-atlas \[--no-open\]/],
  ]) {
    const { code, output } = await run(args);
    assert.equal(code, status, output);
    assert.match(output, message);
  }
  const { version } = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal((await run(["--version"])).output.trim(), version);
});
