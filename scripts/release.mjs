#!/usr/bin/env node
// Interactive release: bump the version, publish to npm, push the tag and create a GitHub release.
// Usage: npm run release [-- --dry-run]
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const dryRun = process.argv.includes("--dry-run");
const root = new URL("..", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

const output = (command, args) => {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};
const run = (command, args, undo) => {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`\n${command} failed; stopping.`);
    if (undo) console.error(`Undo the local release before retrying: ${undo}`);
    process.exit(result.status ?? 1);
  }
};
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const bump = (version, part) => {
  const [major, minor, patch] = version.split("-")[0].split(".").map(Number);
  if (part === "major") return `${major + 1}.0.0`;
  if (part === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

// Preconditions: a clean, pushed main branch and an npm login; a dry run only warns.
const guard = dryRun ? (message) => console.warn(`warning: ${message}`) : fail;
if (output("git", ["branch", "--show-current"]) !== "main")
  guard("Release from the main branch.");
if (output("git", ["status", "--porcelain"]))
  guard("Commit or stash your changes first.");
output("git", ["fetch", "--quiet", "origin", "main"]);
if (output("git", ["rev-list", "--count", "HEAD..origin/main"]) !== "0")
  guard("main is behind origin/main; pull first.");
const user = output("npm", ["whoami"]);
if (!user) guard("Not logged in to npm; run `npm login` first.");

const published = output("npm", ["view", pkg.name, "version"]);
console.log(`${pkg.name}`);
console.log(`  package.json   ${pkg.version}`);
console.log(`  npm (latest)   ${published ?? "not published yet"}`);
if (user) console.log(`  npm user       ${user}`);

// A first release can ship the current version as it is.
const choices = [
  ...(published ? [] : [["current", pkg.version]]),
  ["patch", bump(pkg.version, "patch")],
  ["minor", bump(pkg.version, "minor")],
  ["major", bump(pkg.version, "major")],
];
const rl = createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (question) => {
  process.stdout.write(question);
  const { value } = await lines.next();
  return (value ?? "").trim();
};
console.log("");
choices.forEach(([name, version], i) =>
  console.log(`  ${i + 1}) ${name.padEnd(8)} ${version}`),
);
const answer = await ask("\nRelease which version? (number, or q) ");
const choice = choices[Number(answer) - 1];
if (!choice) {
  rl.close();
  fail("Nothing released.");
}
const [part, version] = choice;
const confirm = await ask(
  `${dryRun ? "Dry run: " : ""}release v${version}: check, ${part === "current" ? "tag" : "bump and tag"}, npm publish, git push, GitHub release. Continue? (y/N) `,
);
rl.close();
if (confirm.toLowerCase() !== "y") fail("Nothing released.");

run("npm", ["run", "check"]);
if (dryRun) {
  run("npm", ["publish", "--dry-run", "--ignore-scripts"]);
  console.log(`\nDry run done; v${version} was not tagged or published.`);
  process.exit(0);
}
// check already ran above. A current version is tagged only once it is published.
if (part === "current") {
  run("npm", ["publish", "--ignore-scripts"]);
  run("git", ["tag", "-a", `v${version}`, "-m", `v${version}`]);
} else {
  run("npm", ["version", part, "-m", "Release v%s"]);
  run(
    "npm",
    ["publish", "--ignore-scripts"],
    `git tag -d v${version} && git reset --hard HEAD~1`,
  );
}
run("git", ["push", "--follow-tags", "origin", "main"]);
if (output("gh", ["--version"]))
  run("gh", [
    "release",
    "create",
    `v${version}`,
    "--generate-notes",
    "--verify-tag",
  ]);
else console.log("\ngh not found; create the GitHub release by hand.");
console.log(`\nReleased ${pkg.name}@${version}.`);
