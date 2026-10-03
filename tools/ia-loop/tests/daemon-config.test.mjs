/**
 * V37 — the daemon's configuration: defaults that reproduce the supervisor
 * scripts, and environment overrides that can never turn into NaN or a zero
 * that makes the daemon spin.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_CONTAINERS, DEFAULT_TASK_NAME, readDaemonConfig } from '../lib/daemon-config.mjs';

test('defaults reproduce what the supervisor scripts did', () => {
  const config = readDaemonConfig({});
  assert.equal(config.tickMs, 5_000);
  assert.equal(config.workers.crashLimit, 5);
  assert.equal(config.docker.enabled, true);
  assert.deepEqual([...config.docker.containers], [...DEFAULT_CONTAINERS]);
  assert.equal(config.memory.highPercent, 95);
  assert.equal(config.memory.lowPercent, 85);
  assert.equal(config.sweep.enabled, true);
  assert.equal(config.notify.toast, true);
  assert.equal(config.taskName, DEFAULT_TASK_NAME);
});

test('environment overrides are read', () => {
  const config = readDaemonConfig({
    IA_LOOP_DAEMON_TICK_MS: '1000',
    IA_LOOP_DAEMON_CRASH_LIMIT: '3',
    IA_LOOP_DAEMON_CONTAINERS: 'pg, redis ,',
    IA_LOOP_DAEMON_MEMORY_HIGH: '90',
    IA_LOOP_DAEMON_MEMORY_LOW: '70',
    IA_LOOP_DAEMON_TASK_NAME: 'Outra',
  });
  assert.equal(config.tickMs, 1000);
  assert.equal(config.workers.crashLimit, 3);
  assert.deepEqual([...config.docker.containers], ['pg', 'redis']);
  assert.equal(config.memory.highPercent, 90);
  assert.equal(config.memory.lowPercent, 70);
  assert.equal(config.taskName, 'Outra');
});

test('a malformed override falls back to the default instead of spinning', () => {
  const config = readDaemonConfig({
    IA_LOOP_DAEMON_TICK_MS: '10', // below the floor
    IA_LOOP_DAEMON_CRASH_LIMIT: 'abc',
    IA_LOOP_DAEMON_RESTART_BASE_MS: '-5',
    IA_LOOP_DAEMON_MEMORY_HIGH: '150',
  });
  assert.equal(config.tickMs, 5_000);
  assert.equal(config.workers.crashLimit, 5);
  assert.equal(config.workers.restartBaseMs, 5_000);
  assert.equal(config.memory.highPercent, 95);
});

test('a low memory threshold at or above the high one resets both', () => {
  const config = readDaemonConfig({ IA_LOOP_DAEMON_MEMORY_HIGH: '80', IA_LOOP_DAEMON_MEMORY_LOW: '90' });
  assert.equal(config.memory.highPercent, 95);
  assert.equal(config.memory.lowPercent, 85);
});

test('switches: Docker, memory, toast and the sweep can each be turned off', () => {
  const config = readDaemonConfig({
    IA_LOOP_DAEMON_DOCKER: '0', IA_LOOP_DAEMON_MEMORY: 'off', IA_LOOP_DAEMON_TOAST: 'false', IA_LOOP_DAEMON_SWEEP: 'no',
  });
  assert.equal(config.docker.enabled, false);
  assert.equal(config.memory.enabled, false);
  assert.equal(config.notify.toast, false);
  assert.equal(config.sweep.enabled, false);
});

test('the worker sweep switch (IA_LOOP_ORPHAN_SWEEP=0) turns the daemon sweep off too', () => {
  assert.equal(readDaemonConfig({ IA_LOOP_ORPHAN_SWEEP: '0' }).sweep.enabled, false);
});
