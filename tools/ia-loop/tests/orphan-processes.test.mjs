import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { killProcessTreeSoon, selectLoopOrphans } from '../lib/orphan-processes.mjs';

// Forward slashes on purpose: the selector normalises both separators, and a
// backslash in a JS string literal is an escape waiting to happen.
const ROOT = 'E:/Projetos/atendly-ia/.ai-worktrees';

test('an orphan running inside a Goal worktree is the loop\'s to kill', () => {
  const orphans = [
    { pid: 10, name: 'node.exe', cmd: '"node" E:/Projetos/atendly-ia/.ai-worktrees/goal-090/apps/frontend/node_modules/next/dist/bin/next dev -p 5100' },
    { pid: 11, name: 'node.exe', cmd: 'node E:/Projetos/atendly-ia/apps/bff/node_modules/tsx/dist/cli.mjs watch src/server.ts' },
    { pid: 12, name: 'node.exe', cmd: 'E:/Projetos/relay-ia/packages/daemon/bin/relay.mjs serve' },
  ];
  assert.deepEqual(selectLoopOrphans(orphans, { roots: [ROOT] }).map((o) => o.pid), [10]);
});

test('a parentless Playwright Chromium is killed wherever it runs; a user Chrome is not', () => {
  const orphans = [
    { pid: 20, name: 'chrome-headless-shell.exe', cmd: 'C:/Users/x/AppData/Local/ms-playwright/chromium_headless_shell-1200/chrome-headless-shell.exe --headless' },
    { pid: 21, name: 'chrome.exe', cmd: '"C:/Program Files/Google/Chrome/Application/chrome.exe" --no-startup-window' },
  ];
  assert.deepEqual(selectLoopOrphans(orphans, { roots: [ROOT] }).map((o) => o.pid), [20]);
});

test('the sweeping process never selects itself', () => {
  const orphans = [{ pid: 30, name: 'node.exe', cmd: `node ${ROOT}/goal-1/x.mjs` }];
  assert.deepEqual(selectLoopOrphans(orphans, { roots: [ROOT], selfPid: 30 }), []);
});

test('a test double is killed directly, never handed to taskkill', () => {
  const fake = new EventEmitter();
  fake.pid = 4242;
  let signal = null;
  fake.kill = (s) => { signal = s; };
  killProcessTreeSoon(fake);
  assert.equal(signal, 'SIGKILL');
});
