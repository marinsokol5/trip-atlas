import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { get } from "node:http";
import { MAX_JSON_BYTES } from "../src/input-limits.ts";

const script = fileURLToPath(new URL("./serve.mjs", import.meta.url));
async function launch(t, args = [], env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    env: { ...process.env, INIT_CWD: "", PORT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  let output = "";
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  return await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) resolve(url);
    });
    child.once("exit", (code) =>
      reject(new Error(`Server exited ${code}: ${output}`)),
    );
    child.once("error", reject);
  });
}

test("localhost serving rejects hostile origins and active documents cannot execute in the app origin", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip-security-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "trip.json");
  const paths = [
    "page.html",
    "image.svg",
    "module.js",
    "note.TXT",
    "ticket.PDF",
  ];
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      places: {},
      days: [{}],
      documents: paths.map((path) => ({ label: path, path })),
    }),
  );
  for (const path of paths)
    await writeFile(
      join(root, path),
      "<script>fetch('/trips/index.json')</script>",
    );
  const url = await launch(t, [file]);
  for (const headers of [
    { host: "attacker.example" },
    { host: "127.0.0.1:123" },
    { origin: "https://attacker.example" },
    { origin: "null" },
    { "sec-fetch-site": "cross-site" },
    { "sec-fetch-site": "same-site" },
  ]) {
    const status = await new Promise((resolve, reject) => {
      get(url + "/trips/index.json", { headers }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  assert.equal(
    (await fetch(url + "/trips/index.json", { headers: { origin: url } }))
      .status,
    200,
  );
  const jsonHead = await fetch(url + "/trips/selected/trip.json", {
    method: "HEAD",
  });
  assert.equal(jsonHead.status, 200);
  assert.ok(Number(jsonHead.headers.get("content-length")) > 0);
  assert.equal(await jsonHead.text(), "");
  for (const path of paths) {
    const response = await fetch(url + "/trips/selected/" + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /sandbox/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    if (["page.html", "image.svg", "module.js"].includes(path)) {
      assert.equal(response.headers.get("content-disposition"), "attachment");
      assert.equal(
        response.headers.get("content-type"),
        "application/octet-stream",
      );
    } else assert.equal(response.headers.get("content-disposition"), null);
  }
  const app = await fetch(url);
  assert.equal(app.status, 200);
  assert.match(app.headers.get("content-security-policy"), /script-src 'self'/);
  await writeFile(file, " ".repeat(MAX_JSON_BYTES + 1));
  const large = await fetch(url + "/trips/selected/trip.json");
  assert.equal(large.status, 413);
  assert.match(await large.text(), /2 MiB/);
  assert.equal((await fetch(url + "/trips/index.json")).status, 200);
});

test("TRIP_ATLAS_HOSTS admits only the listed proxy names, documents included", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip-hosts-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "trip.json");
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      places: {},
      days: [{}],
      documents: [{ label: "Ticket", path: "ticket.pdf" }],
    }),
  );
  await writeFile(join(root, "ticket.pdf"), "%PDF-1.4");
  const status = (url, headers) =>
    new Promise((resolve, reject) => {
      get(url, { headers }, (response) => {
        response.resume();
        resolve([response.statusCode, response.headers["content-type"]]);
      }).on("error", reject);
    });
  const plain = await launch(t, [file]);
  assert.equal(
    (
      await status(plain + "/trips/index.json", { host: "trip.example.ts.net" })
    )[0],
    403,
  );
  const url = await launch(t, [file], {
    TRIP_ATLAS_HOSTS: " Trip.Example.ts.net , other.example.ts.net:8443",
  });
  for (const headers of [
    { host: "trip.example.ts.net" },
    { host: "TRIP.example.ts.net" },
    { host: "trip.example.ts.net", origin: "https://trip.example.ts.net" },
    { host: "other.example.ts.net:8443" },
    { host: `127.0.0.1:${new URL(url).port}` },
  ])
    assert.equal(
      (await status(url + "/trips/index.json", headers))[0],
      200,
      JSON.stringify(headers),
    );
  assert.deepEqual(
    await status(url + "/trips/selected/ticket.pdf", {
      host: "trip.example.ts.net",
    }),
    [200, "application/pdf"],
  );
  for (const headers of [
    { host: "attacker.example" },
    { host: "trip.example.ts.net.attacker.example" },
    { host: "other.example.ts.net" },
    { host: "trip.example.ts.net", origin: "https://attacker.example" },
    // A listed name never widens what the loopback origins accept.
    { host: `127.0.0.1:${new URL(url).port}`, origin: "https://127.0.0.1" },
    { host: "trip.example.ts.net", "sec-fetch-site": "cross-site" },
  ])
    assert.equal(
      (await status(url + "/trips/index.json", headers))[0],
      403,
      JSON.stringify(headers),
    );
  for (const value of ["https://trip.example.ts.net", "trip.example/path", "*"])
    await assert.rejects(
      launch(t, [file], { TRIP_ATLAS_HOSTS: value }),
      /TRIP_ATLAS_HOSTS/,
      value,
    );
});

test("selected file stays live and exposes only safe referenced documents", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip atlas "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "journey 東京.json");
  const docs = (paths) => ({
    version: 1,
    days: [{ documents: paths.map((path) => ({ label: path, path })) }],
  });
  await mkdir(join(root, "docs"));
  await writeFile(
    file,
    JSON.stringify(
      docs([
        "docs/boarding pass.txt",
        "escape.txt",
        "../outside.txt",
        "/absolute",
        "https://example.com",
        "trip.json",
      ]),
    ),
  );
  await writeFile(join(root, "docs/boarding pass.txt"), "first document");
  await writeFile(join(root, "trip.json"), "document named trip.json");
  await writeFile(join(root, "secret.txt"), "private");
  await symlink(script, join(root, "escape.txt"));
  const url = await launch(t, ["journey 東京.json"], { INIT_CWD: root });
  const manifest = await fetch(url + "/trips/index.json");
  assert.equal(manifest.headers.get("cache-control"), "no-store");
  const entry = (await manifest.json()).trips[0];
  assert.equal(entry.label, "journey 東京.json");
  assert.equal(entry.path, "selected/_trip.json");
  assert.equal(
    (await (await fetch(url + "/trips/" + entry.path)).json()).version,
    1,
  );
  assert.equal(
    await (await fetch(url + "/trips/selected/trip.json")).text(),
    "document named trip.json",
  );
  const document = url + "/trips/selected/docs/boarding%20pass.txt";
  assert.equal(await (await fetch(document)).text(), "first document");
  await writeFile(join(root, "docs/boarding pass.txt"), "edited document");
  assert.equal(await (await fetch(document)).text(), "edited document");
  for (const path of [
    "secret.txt",
    "escape.txt",
    "%2e%2e%2foutside.txt",
    "%2fabsolute",
    ".git/config",
  ]) {
    assert.ok(
      [403, 404].includes(
        (await fetch(url + "/trips/selected/" + path)).status,
      ),
      path,
    );
  }
  assert.equal((await fetch(url + "/trips/japan/trip.json")).status, 404);
  assert.equal(
    (await fetch(url + "/trips/index.json", { method: "POST" })).status,
    405,
  );
  const head = await fetch(document, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  await writeFile(file, "{broken");
  assert.equal(
    await (await fetch(url + "/trips/selected/trip.json")).text(),
    "{broken",
  );
  await writeFile(file, JSON.stringify(docs([])));
  assert.deepEqual(
    (await (await fetch(url + "/trips/selected/trip.json")).json()).days[0]
      .documents,
    [],
  );
  assert.equal((await fetch(document)).status, 404);
  await rm(file);
  await symlink(script, file);
  assert.equal((await fetch(url + "/trips/selected/trip.json")).status, 403);
});

test("no argument preserves the demo manifest", async (t) => {
  const url = await launch(t);
  const manifest = await (await fetch(url + "/trips/index.json")).json();
  assert.ok(manifest.trips.length > 1);
  assert.equal(
    (await fetch(url + "/trips/" + manifest.trips[0].path)).status,
    200,
  );
});

test("CLI reports missing files, directories and invalid arguments, and supports help", async () => {
  for (const [args, status, message] of [
    [["/does-not-exist/itinerary.json"], 1, /Cannot read itinerary/],
    [[tmpdir()], 1, /not a regular file/],
    [["one", "two"], 1, /Cannot read itinerary/],
    [["--unknown"], 1, /Usage:/],
    [["--help"], 0, /Usage:/],
  ]) {
    const child = spawn(process.execPath, [script, ...args]);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const [code] = await once(child, "close");
    assert.equal(code, status);
    assert.match(output, message);
  }
});

test("multiple paths isolate document roots, distinguish names, and retain stable routes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip choices "));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const folder of ["Plan A", "Plan B"]) {
    await mkdir(join(root, folder));
    await writeFile(
      join(root, folder, "itinerary.json"),
      JSON.stringify({
        version: 1,
        title: folder,
        places: {},
        days: [
          {
            documents: [
              { label: "Document", path: "ticket.txt" },
              { label: "Escape", path: "escape.txt" },
            ],
          },
        ],
      }),
    );
    await writeFile(join(root, folder, "ticket.txt"), folder);
    await writeFile(join(root, folder, "secret.txt"), "private");
  }
  await symlink(
    join(root, "Plan B", "ticket.txt"),
    join(root, "Plan A", "escape.txt"),
  );
  const args = ["Plan A/itinerary.json", "Plan B/itinerary.json"];
  const url = await launch(t, args, { INIT_CWD: root });
  const entries = (await (await fetch(url + "/trips/index.json")).json()).trips;
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.map((entry) => entry.label),
    ["itinerary.json · Plan A", "itinerary.json · Plan B"],
  );
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ["Plan A", "Plan B"],
  );
  assert.notEqual(entries[0].path, entries[1].path);
  for (const [i, entry] of entries.entries()) {
    const folder = entry.path.slice(0, entry.path.lastIndexOf("/"));
    assert.equal(
      (await (await fetch(url + "/trips/" + entry.path)).json()).title,
      ["Plan A", "Plan B"][i],
    );
    assert.equal(
      await (await fetch(url + "/trips/" + folder + "/ticket.txt")).text(),
      ["Plan A", "Plan B"][i],
    );
    for (const path of [
      "/secret.txt",
      "/escape.txt",
      "/%2e%2e%2fPlan%20B/ticket.txt",
    ])
      assert.ok(
        [403, 404].includes(
          (await fetch(url + "/trips/" + folder + path)).status,
        ),
      );
  }
  const reverseUrl = await launch(t, [...args].reverse(), { INIT_CWD: root });
  const reverse = (await (await fetch(reverseUrl + "/trips/index.json")).json())
    .trips;
  assert.deepEqual(reverse, [...entries].reverse());
  const changed = JSON.parse(
    await (await fetch(url + "/trips/" + entries[0].path)).text(),
  );
  changed.title = "Plan B";
  await writeFile(
    join(root, "Plan A", "itinerary.json"),
    JSON.stringify(changed),
  );
  const refreshed = (await (await fetch(url + "/trips/index.json")).json())
    .trips;
  assert.equal(refreshed[0].title, "Plan B");
  assert.equal(refreshed[0].path, entries[0].path);
  assert.notEqual(refreshed[0].label, refreshed[1].label);
  delete changed.title;
  await writeFile(
    join(root, "Plan A", "itinerary.json"),
    JSON.stringify(changed),
  );
  assert.equal(
    (await (await fetch(url + "/trips/index.json")).json()).trips[0].title,
    undefined,
  );
  await writeFile(join(root, "Plan A", "itinerary.json"), "{bad json");
  assert.equal(
    await (await fetch(url + "/trips/" + entries[0].path)).text(),
    "{bad json",
  );
  assert.equal((await fetch(url + "/trips/" + entries[1].path)).status, 200);
  await rm(join(root, "Plan A", "itinerary.json"));
  await symlink(
    join(root, "Plan B", "itinerary.json"),
    join(root, "Plan A", "itinerary.json"),
  );
  assert.equal((await fetch(url + "/trips/" + entries[0].path)).status, 403);
  assert.equal(
    (await (await fetch(url + "/trips/index.json")).json()).trips.length,
    2,
  );
  assert.equal((await fetch(url + "/trips/" + entries[1].path)).status, 200);
});

test("duplicate selected paths do not duplicate a journey", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip duplicate "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "trip.json");
  await writeFile(file, "{}");
  const url = await launch(t, [file, file]);
  const entries = (await (await fetch(url + "/trips/index.json")).json()).trips;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "selected/trip.json");
});

test("duplicate basenames and parent names use readable distinguishing parent paths", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip readable labels "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [];
  for (const alternative of ["shorter", "longer"]) {
    const folder = join(root, alternative, "plan");
    await mkdir(folder, { recursive: true });
    const file = join(folder, "trip.json");
    await writeFile(file, "{}");
    files.push(file);
  }
  const url = await launch(t, files);
  const entries = (await (await fetch(url + "/trips/index.json")).json()).trips;
  assert.deepEqual(
    entries.map((entry) => entry.label),
    [
      `trip.json · ${join("shorter", "plan")}`,
      `trip.json · ${join("longer", "plan")}`,
    ],
  );
  assert.notEqual(entries[0].path, entries[1].path);
});

test("trip and booking documents use isolated live allowlists and screenshot MIME types", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "booking documents "));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "itinerary.json");
  const source = {
    version: 1,
    places: {},
    days: [{}],
    documents: [
      { label: "Trip file", path: "trip.json" },
      { label: "Screenshot", path: "screen.JPG" },
    ],
    bookings: [
      {
        type: "accommodation",
        title: "Hotel",
        documents: [
          { label: "Confirmation", path: "hotel.pdf" },
          { label: "Image", path: "screen.WebP" },
          { label: "Escaping symlink", path: "escape.pdf" },
          { label: "Unsafe", path: "../secret" },
        ],
      },
    ],
  };
  await writeFile(file, JSON.stringify(source));
  await writeFile(join(root, "trip.json"), "trip document");
  await writeFile(join(root, "hotel.pdf"), "%PDF-1.4\nexample");
  await writeFile(join(root, "screen.JPG"), "image data");
  await writeFile(join(root, "screen.WebP"), "image data");
  await writeFile(join(root, "private.pdf"), "unreferenced");
  await symlink(script, join(root, "escape.pdf"));
  const url = await launch(t, [file]);
  const entry = (await (await fetch(url + "/trips/index.json")).json())
    .trips[0];
  assert.equal(entry.path, "selected/_trip.json");
  for (const [path, contentType] of [
    ["trip.json", "application/json; charset=utf-8"],
    ["hotel.pdf", "application/pdf"],
    ["screen.JPG", "image/jpeg"],
    ["screen.WebP", "image/webp"],
  ]) {
    const response = await fetch(`${url}/trips/selected/${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("content-type"), contentType);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  assert.equal((await fetch(url + "/trips/selected/private.pdf")).status, 404);
  assert.equal((await fetch(url + "/trips/selected/escape.pdf")).status, 403);
  source.bookings = [];
  await writeFile(file, JSON.stringify(source));
  assert.equal((await fetch(url + "/trips/selected/hotel.pdf")).status, 404);
  assert.equal((await fetch(url + "/trips/selected/screen.JPG")).status, 200);
});
