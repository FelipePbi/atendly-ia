/**
 * IA Loop — the daemon's log files.
 *
 * The supervisor scripts appended to logs in a temp directory forever; one of
 * them reached 5 MB in a day. Everything the daemon and its children print now
 * lands under `.state/daemon/`, one file per process, rotated by size:
 * `run-auto.log` becomes `run-auto.log.1` when it passes the limit, and the
 * oldest beyond `keep` is dropped.
 *
 * Writes are synchronous on purpose. The volume is a few lines a second at
 * most, and a synchronous append is what keeps a crash from losing the very
 * line that explains it.
 */

import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export function createRotatingLog(path, { maxBytes = 10 * 1024 * 1024, keep = 3 } = {}) {
  let size = null;

  const currentSize = () => {
    if (size === null) {
      try { size = statSync(path).size; } catch { size = 0; }
    }
    return size;
  };

  const rotate = () => {
    try {
      rmSync(`${path}.${keep}`, { force: true });
      for (let i = keep - 1; i >= 1; i -= 1) {
        if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`);
      }
      if (existsSync(path)) renameSync(path, `${path}.1`);
    } catch {
      // A file held open by a reader (an editor, `tail`) cannot be renamed on
      // Windows. Keep appending; the next write tries again.
      return;
    }
    size = 0;
  };

  return {
    path,
    write(chunk) {
      const text = typeof chunk === 'string' ? chunk : String(chunk);
      if (text === '') return;
      try {
        mkdirSync(dirname(path), { recursive: true });
        if (currentSize() + Buffer.byteLength(text) > maxBytes) rotate();
        appendFileSync(path, text, 'utf8');
        size = currentSize() + Buffer.byteLength(text);
      } catch {
        // A log that cannot be written must never take the daemon down.
      }
    },
  };
}

/**
 * The tail of what a child printed, kept in memory.
 *
 * The incident catalogue reads the output of ONE run-auto invocation, which is
 * what supervisor2.sh did with `tail -c +$start`. Reading it back from the log
 * file would break the moment the file rotated mid-run; this buffer cannot.
 */
export function createOutputCapture({ maxChars = 512 * 1024 } = {}) {
  let text = '';
  return {
    append(chunk) {
      text += typeof chunk === 'string' ? chunk : String(chunk);
      if (text.length > maxChars) text = text.slice(text.length - maxChars);
    },
    text: () => text,
  };
}

/** `HH:MM:SS`-stamped line, the convention the workers already use. */
export function stampLine(now, tag, message = '') {
  const time = new Date(now).toISOString().replace('T', ' ').slice(0, 19);
  return `${time} [daemon:${tag}]${message ? ` ${message}` : ''}\n`;
}
