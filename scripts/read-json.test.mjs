import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_JSON_BYTES as CLI_LIMIT, readJsonFile } from "./read-json.mjs";
import { MAX_JSON_BYTES } from "../src/input-limits.ts";

test("the CLI and viewer share one JSON size limit", () => {
  assert.equal(CLI_LIMIT, MAX_JSON_BYTES);
});

test("JSON byte boundary accepts exactly 2 MiB and rejects one extra byte", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "trip-json-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "trip.json");
  await writeFile(file, Buffer.alloc(MAX_JSON_BYTES, 32));
  assert.equal((await readJsonFile(file)).length, MAX_JSON_BYTES);
  await writeFile(file, Buffer.alloc(MAX_JSON_BYTES + 1, 32));
  await assert.rejects(readJsonFile(file), (error) => error.status === 413);
  await assert.rejects(readJsonFile(root), /regular file|EISDIR/);
});

test(
  "a named pipe is rejected without waiting for a writer",
  { skip: process.platform === "win32", timeout: 2000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "trip-pipe-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const file = join(root, "trip.json");
    assert.equal(spawnSync("mkfifo", [file]).status, 0);
    await assert.rejects(readJsonFile(file), /regular file/);
  },
);
