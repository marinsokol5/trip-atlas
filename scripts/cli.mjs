#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const [command, ...rest] = process.argv.slice(2);
if (command === "check") {
  const { check } = await import("./check.mjs");
  process.exitCode = await check(rest);
} else if (command === "--version" || command === "-v") {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  console.log(pkg.version);
} else {
  await import("./serve.mjs");
}
