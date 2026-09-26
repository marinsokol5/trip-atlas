import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { schemaTypes, typesFile } from "./schema-types.mjs";

test("generated itinerary types match the schema", async () => {
  assert.equal(
    await readFile(typesFile, "utf8"),
    await schemaTypes(),
    "src/itinerary-schema.ts is stale; run npm run schema",
  );
});
