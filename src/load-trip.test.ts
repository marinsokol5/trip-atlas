import test from "node:test";
import assert from "node:assert/strict";
import { loadJson, parseManifest } from "./load-trip.ts";
import { MAX_JSON_BYTES } from "./input-limits.ts";

test("manifest rejects unsafe paths, duplicate routes and values that cannot render as text", () => {
  const entry = { path: "japan/trip.json", label: "Japan", title: "A journey" };
  assert.deepEqual(parseManifest({ trips: [entry] }), [entry]);
  for (const value of [
    null,
    {},
    { trips: [] },
    { trips: [entry, entry] },
    ...[
      { title: {} },
      { title: 3 },
      { title: " " },
      { label: "" },
      { path: "../secret.json" },
    ].map((invalid) => ({ trips: [{ ...entry, ...invalid }] })),
  ])
    assert.throws(() => parseManifest(value), /expected unique relative/);
});

test("JSON loader caps streamed bytes and distinguishes invalid JSON from HTTP failures", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"title":"東京"}'),
  );
  assert.deepEqual(await loadJson("/trip.json"), { title: "東京" });
  globalThis.fetch = async () => new Response("{broken");
  await assert.rejects(loadJson("/trip.json"), /invalid JSON/);
  globalThis.fetch = async () => new Response("Not found", { status: 404 });
  await assert.rejects(loadJson("/trip.json"), /404/);
  globalThis.fetch = async () =>
    new Response('"' + "a".repeat(MAX_JSON_BYTES - 2) + '"');
  assert.equal(
    ((await loadJson("/trip.json")) as string).length,
    MAX_JSON_BYTES - 2,
  );
  globalThis.fetch = async () =>
    new Response('"' + "a".repeat(MAX_JSON_BYTES) + '"');
  await assert.rejects(loadJson("/trip.json"), /2 MiB limit/);
});

test("the loader cancels oversized streams and decodes UTF-8 across chunk boundaries", async (t) => {
  let cancelled = false;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(MAX_JSON_BYTES + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(loadJson("/trip.json"), /2 MiB limit/);
  assert.equal(cancelled, true);
  const bytes = new TextEncoder().encode('{"title":"東京"}');
  globalThis.fetch = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
          controller.close();
        },
      }),
    );
  assert.deepEqual(await loadJson("/trip.json"), { title: "東京" });
});
