import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readJson } from '../lib/job-store.mjs';

const transient = (code) => Object.assign(new Error(`${code}: transient`), { code });

test('a transient Windows read error is retried, not turned into a crash', async () => {
  let calls = 0;
  const read = async () => {
    calls += 1;
    if (calls < 3) throw transient('UNKNOWN');
    return '{"ok":true}';
  };
  const value = await readJson('x.json', { read, sleep: async () => {} });
  assert.deepEqual(value, { ok: true });
  assert.equal(calls, 3);
});

test('a read error that persists still fails, after the retries', async () => {
  let calls = 0;
  const read = async () => { calls += 1; throw transient('EBUSY'); };
  await assert.rejects(readJson('x.json', { read, sleep: async () => {} }), /FILE_UNREADABLE|Cannot read/);
  assert.equal(calls, 5);
});

test('an absent file is still null at once, with no retry', async () => {
  let calls = 0;
  const read = async () => { calls += 1; throw transient('ENOENT'); };
  assert.equal(await readJson('x.json', { read, sleep: async () => {} }), null);
  assert.equal(calls, 1);
});
