import test from "node:test";
import assert from "node:assert/strict";
import {
  isDocument,
  offlineChanges,
  parseOfflineManifest,
} from "./offline.ts";

const file = (url: string, hash: string, size = 10) => ({ url, hash, size });

test("a first sync downloads every listed file", () => {
  const manifest = {
    version: "a",
    files: [file("/", "1"), file("/trips/x/ticket.pdf", "2", 30)],
  };
  assert.deepEqual(offlineChanges(undefined, manifest), {
    download: manifest.files,
    bytes: 40,
    removed: 0,
  });
});

test("a later sync downloads only new and changed files and counts removed ones", () => {
  const saved = {
    version: "a",
    files: [file("/", "1"), file("/old.pdf", "2"), file("/same.pdf", "3")],
  };
  const manifest = {
    version: "b",
    files: [file("/", "1b", 5), file("/same.pdf", "3"), file("/new.pdf", "4", 7)],
  };
  assert.deepEqual(offlineChanges(saved, manifest), {
    download: [file("/", "1b", 5), file("/new.pdf", "4", 7)],
    bytes: 12,
    removed: 1,
  });
});

test("documents are trip files other than the trip list and itineraries", () => {
  assert.ok(isDocument("/trips/selected/tickets/a.pdf"));
  assert.ok(!isDocument("/trips/index.json"));
  assert.ok(!isDocument("/trips/selected/trip.json"));
  assert.ok(!isDocument("/trips/selected-ab12/_trip.json"));
  assert.ok(!isDocument("/assets/index-x.js"));
});

test("the manifest must be a version and a list of absolute URLs with sizes and hashes", () => {
  assert.throws(() => parseOfflineManifest({ files: [] }));
  assert.throws(() =>
    parseOfflineManifest({ version: "a", files: [file("relative", "1")] }),
  );
  assert.deepEqual(
    parseOfflineManifest({ version: "a", files: [file("/", "1")], extra: 1 }),
    { version: "a", files: [file("/", "1")] },
  );
});
