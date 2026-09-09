import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./serve.mjs', import.meta.url));
async function launch(t, args = [], env = {}) {
  const child = spawn(process.execPath, [script, ...args], { env: { ...process.env, INIT_CWD: '', PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } });
  let output = '';
  child.stderr.on('data', chunk => { output += chunk; });
  return await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => {
      output += chunk;
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) resolve(url);
    });
    child.once('exit', code => reject(new Error(`Server exited ${code}: ${output}`)));
    child.once('error', reject);
  });
}

test('selected file stays live and exposes only safe referenced documents', async t => {
  const root = await mkdtemp(join(tmpdir(), 'trip atlas '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'journey 東京.json');
  const docs = paths => ({ version: 1, days: [{ documents: paths.map(path => ({ label: path, path })) }] });
  await mkdir(join(root, 'docs'));
  await writeFile(file, JSON.stringify(docs(['docs/boarding pass.txt', 'escape.txt', '../outside.txt', '/absolute', 'https://example.com', 'trip.json'])));
  await writeFile(join(root, 'docs/boarding pass.txt'), 'first document');
  await writeFile(join(root, 'trip.json'), 'document named trip.json');
  await writeFile(join(root, 'secret.txt'), 'private');
  await symlink(script, join(root, 'escape.txt'));
  const url = await launch(t, ['journey 東京.json'], { INIT_CWD: root });
  const manifest = await fetch(url + '/trips/index.json');
  assert.equal(manifest.headers.get('cache-control'), 'no-store');
  const entry = (await manifest.json()).trips[0];
  assert.equal(entry.label, 'journey 東京.json');
  assert.equal(entry.path, 'selected/_trip.json');
  assert.equal((await (await fetch(url + '/trips/' + entry.path)).json()).version, 1);
  assert.equal(await (await fetch(url + '/trips/selected/trip.json')).text(), 'document named trip.json');
  const document = url + '/trips/selected/docs/boarding%20pass.txt';
  assert.equal(await (await fetch(document)).text(), 'first document');
  await writeFile(join(root, 'docs/boarding pass.txt'), 'edited document');
  assert.equal(await (await fetch(document)).text(), 'edited document');
  for (const path of ['secret.txt', 'escape.txt', '%2e%2e%2foutside.txt', '%2fabsolute', '.git/config']) {
    assert.ok([403, 404].includes((await fetch(url + '/trips/selected/' + path)).status), path);
  }
  assert.equal((await fetch(url + '/trips/japan/trip.json')).status, 404);
  assert.equal((await fetch(url + '/trips/index.json', { method: 'POST' })).status, 405);
  const head = await fetch(document, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  await writeFile(file, '{broken');
  assert.equal(await (await fetch(url + '/trips/selected/trip.json')).text(), '{broken');
  await writeFile(file, JSON.stringify(docs([])));
  assert.deepEqual((await (await fetch(url + '/trips/selected/trip.json')).json()).days[0].documents, []);
  assert.equal((await fetch(document)).status, 404);
  await rm(file);
  await symlink(script, file);
  assert.equal((await fetch(url + '/trips/selected/trip.json')).status, 403);
});

test('no argument preserves the demo manifest', async t => {
  const url = await launch(t);
  const manifest = await (await fetch(url + '/trips/index.json')).json();
  assert.ok(manifest.trips.length > 1);
  assert.equal((await fetch(url + '/trips/' + manifest.trips[0].path)).status, 200);
});

test('CLI reports missing files, directories and extra arguments, and supports help', async () => {
  for (const [args, status, message] of [
    [['/does-not-exist/itinerary.json'], 1, /Cannot read itinerary/],
    [[tmpdir()], 1, /not a regular file/],
    [['one', 'two'], 1, /Usage:/],
    [['--unknown'], 1, /Usage:/],
    [['--help'], 0, /Usage:/],
  ]) {
    const child = spawn(process.execPath, [script, ...args]);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'close');
    assert.equal(code, status);
    assert.match(output, message);
  }
});
