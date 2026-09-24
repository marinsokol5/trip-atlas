import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the build lists every bundled runtime library with its license text", async () => {
  const text = await readFile(
    new URL("../dist/THIRD_PARTY_LICENSES.txt", import.meta.url),
    "utf8",
  );
  for (const name of [
    "react",
    "react-dom",
    "scheduler",
    "lucide-react",
    "d3-geo",
  ])
    assert.match(
      text,
      new RegExp(`^${name}@\\d+\\.\\d+\\.\\d+ \\(`, "m"),
      name,
    );
  assert.match(text, /Permission is hereby granted/);
  assert.match(text, /GeographicLib/);
});
