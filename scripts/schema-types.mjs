import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = new URL("../", import.meta.url);
export const schemaFile = fileURLToPath(
  new URL("skills/trip-atlas-update-itinerary/itinerary.schema.json", root),
);
export const typesFile = fileURLToPath(
  new URL("src/itinerary-schema.ts", root),
);

/** The TypeScript types for itinerary files, generated from the shipped JSON Schema. */
export async function schemaTypes() {
  const schema = JSON.parse(await readFile(schemaFile, "utf8"));
  return compile(schema, "TripInput", {
    additionalProperties: false,
    ignoreMinAndMaxItems: true,
    bannerComment:
      "// Generated from skills/trip-atlas-update-itinerary/itinerary.schema.json by `npm run schema`; do not edit.",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await writeFile(typesFile, await schemaTypes());
