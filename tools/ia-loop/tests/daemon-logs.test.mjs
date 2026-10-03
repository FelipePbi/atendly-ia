/**
 * V37 — the daemon's logs rotate by size instead of growing forever, and the
 * output the incident catalogue reads survives a rotation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createOutputCapture, createRotatingLog, stampLine } from '../lib/daemon-logs.mjs';

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'ia-loop-daemon-logs-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test('a log past its size limit rotates to .1, .2 and drops the oldest beyond keep', () => withDir(async (dir) => {
  const path = join(dir, 'run-auto.log');
  const log = createRotatingLog(path, { maxBytes: 20, keep: 2 });
  log.write('first line 123456\n');
  log.write('second line 12345\n');
  log.write('third line 123456\n');
  log.write('fourth line 12345\n');

  assert.equal(readFileSync(path, 'utf8'), 'fourth line 12345\n');
  assert.equal(readFileSync(`${path}.1`, 'utf8'), 'third line 123456\n');
  assert.equal(readFileSync(`${path}.2`, 'utf8'), 'second line 12345\n');
  assert.equal(existsSync(`${path}.3`), false);
}));

test('a log that cannot be written never throws', () => withDir(async (dir) => {
  // A directory where the file should be: every append fails.
  const log = createRotatingLog(dir, { maxBytes: 10, keep: 1 });
  assert.doesNotThrow(() => log.write('anything\n'));
}));

test('the output capture keeps only the tail', () => {
  const capture = createOutputCapture({ maxChars: 10 });
  capture.append('0123456789');
  capture.append('abc');
  assert.equal(capture.text(), '3456789abc');
});

test('log lines carry a timestamp and the daemon tag', () => {
  assert.equal(stampLine(Date.parse('2026-10-03T12:00:05Z'), 'CHILD', 'developer started'),
    '2026-10-03 12:00:05 [daemon:CHILD] developer started\n');
});
