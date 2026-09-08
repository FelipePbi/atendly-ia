/**
 * IA Loop — Developer execution profiles.
 *
 * The Developer is no longer a fixed model. For each Goal, and for each
 * correction round, the Tech Lead states which profile the work needs. That
 * choice rides on an inference the cycle ALREADY performs (the planning call
 * that writes the next Goal, and the review call that decides the round), so
 * routing costs no extra model call.
 *
 * Three rules make this safe:
 *
 *   1. The registry is closed. An unknown name is an error, never a guess —
 *      the CLI silently ignores an unknown `--effort`, so validating here is
 *      what stops a typo from quietly downgrading the run.
 *   2. There is no fallback. If the selected model is unavailable the run stops
 *      for a human; it never lands on a different model.
 *   3. A choice is part of the attempt's identity. Recovery, restart and a
 *      capacity wait re-read it; they never recompute it.
 */

import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { SpikeError } from './claude-process.mjs';

/**
 * Effort levels the installed Claude CLI accepts.
 *
 * Verified against `claude --help` (2.1.263): `--effort <level>` takes
 * low, medium, high, xhigh, max. An unknown value only produces a warning and
 * is IGNORED, which would silently run at default effort — hence the closed set.
 */
export const CLI_EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * The profiles the Tech Lead may choose from.
 *
 * `family` is what the fallback detector matches the resolved primary model
 * against; it is not decoration.
 */
export const DEVELOPER_PROFILES = Object.freeze({
  SONNET_MEDIUM: Object.freeze({
    name: 'SONNET_MEDIUM',
    model: 'claude-sonnet-5',
    effort: 'medium',
    family: 'sonnet',
    label: 'Claude Sonnet 5',
    effortLabel: 'Medium',
    selectable: true,
  }),
  OPUS_MEDIUM: Object.freeze({
    name: 'OPUS_MEDIUM',
    model: 'claude-opus-5',
    effort: 'medium',
    family: 'opus',
    label: 'Claude Opus 5',
    effortLabel: 'Medium',
    selectable: true,
  }),
  OPUS_HIGH: Object.freeze({
    name: 'OPUS_HIGH',
    model: 'claude-opus-5',
    effort: 'high',
    family: 'opus',
    label: 'Claude Opus 5',
    effortLabel: 'High',
    selectable: true,
  }),

  /**
   * Compatibility only, and never selectable.
   *
   * A Goal that started before routing existed ran on Opus with the CLI's
   * default effort and NO `--effort` flag at all. Adopting it keeps such an
   * execution byte-identical to how it began, instead of rewriting its history
   * into one of the new profiles.
   */
  LEGACY_OPUS: Object.freeze({
    name: 'LEGACY_OPUS',
    model: 'claude-opus-5',
    effort: null,
    family: 'opus',
    label: 'Claude Opus 5',
    effortLabel: 'CLI default',
    selectable: false,
  }),
});

/** What the Tech Lead is allowed to name. LEGACY_OPUS is deliberately absent. */
export const SELECTABLE_DEVELOPER_PROFILES = Object.freeze(
  Object.values(DEVELOPER_PROFILES).filter((p) => p.selectable).map((p) => p.name),
);

export const DEVELOPER_PROFILE_NAMES = Object.freeze(Object.keys(DEVELOPER_PROFILES));

/**
 * The profile a new Goal gets when nobody said otherwise.
 *
 * Sonnet, not Opus: the point of routing is to stop paying Opus for work that
 * does not need it. The Tech Lead promotes explicitly when it does.
 */
export const DEFAULT_DEVELOPER_PROFILE = 'SONNET_MEDIUM';

export const LEGACY_DEVELOPER_PROFILE = 'LEGACY_OPUS';

function fail(code, message, details = {}) {
  throw new SpikeError(code, message, details);
}

/** Resolves a profile by name. Fails closed: an unknown name is never guessed. */
export function resolveDeveloperProfile(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    fail('UNKNOWN_DEVELOPER_PROFILE', `Developer profile must be a non-empty string, got ${JSON.stringify(name)}`);
  }
  const profile = DEVELOPER_PROFILES[name.trim()];
  if (!profile) {
    fail(
      'UNKNOWN_DEVELOPER_PROFILE',
      `Unknown Developer profile ${JSON.stringify(name)} (known: ${DEVELOPER_PROFILE_NAMES.join(', ')})`,
      { name, known: DEVELOPER_PROFILE_NAMES },
    );
  }
  if (profile.effort !== null && !CLI_EFFORT_LEVELS.includes(profile.effort)) {
    fail('UNSUPPORTED_EFFORT', `Profile ${profile.name} declares effort "${profile.effort}", which this CLI does not accept`);
  }
  return profile;
}

/** Resolves a name that may be absent, falling back to the default. */
export function developerProfileOrDefault(name, fallback = DEFAULT_DEVELOPER_PROFILE) {
  if (name === null || name === undefined || name === '') return resolveDeveloperProfile(fallback);
  return resolveDeveloperProfile(name);
}

/** Validates a name the Tech Lead proposed. LEGACY_OPUS is refused here. */
export function assertSelectableProfile(name, what = 'developerProfile') {
  const profile = resolveDeveloperProfile(name);
  if (!profile.selectable) {
    fail(
      'UNKNOWN_DEVELOPER_PROFILE',
      `${what} ${JSON.stringify(name)} is a compatibility profile and cannot be selected (allowed: ${SELECTABLE_DEVELOPER_PROFILES.join(', ')})`,
      { name, allowed: SELECTABLE_DEVELOPER_PROFILES },
    );
  }
  return profile;
}

/**
 * Proves the model that actually served the call is the one the profile asked
 * for. Any divergence is a fallback, and a fallback is a failure here.
 */
export function assertProfileWasHonoured({ profile, resolvedPrimaryModel }) {
  const known = resolveDeveloperProfile(typeof profile === 'string' ? profile : profile?.name);
  if (resolvedPrimaryModel === null || resolvedPrimaryModel === undefined) {
    fail(
      'RESOLVED_MODEL_UNKNOWN',
      `CLI did not report which model served profile ${known.name}, so a silent fallback cannot be ruled out`,
      { profile: known.name },
    );
  }
  if (!String(resolvedPrimaryModel).toLowerCase().includes(known.family)) {
    fail(
      'MODEL_FALLBACK_DETECTED',
      `Profile ${known.name} requires the "${known.family}" family but the main inference came from "${resolvedPrimaryModel}"`,
      { profile: known.name, expectedFamily: known.family, resolvedPrimaryModel },
    );
  }
  return resolvedPrimaryModel;
}

/** A one-line description for a terminal or a status screen. */
export function describeProfile(name) {
  const profile = resolveDeveloperProfile(name);
  return `${profile.name} · ${profile.label} · effort ${profile.effortLabel}`;
}

/**
 * A durable Goal → profile handoff.
 *
 * The planning call that writes the next Goal is where the Tech Lead states the
 * profile, but the Goal itself is only executed later, by a different process.
 * A tiny store carries the choice across that gap so it survives a restart, and
 * so nothing has to re-derive it from prose.
 */
export function createDeveloperProfileStore(stateDir) {
  const path = join(stateDir, 'developer-profiles.json');

  async function readAll() {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new SpikeError('FILE_UNREADABLE', `Cannot read ${path}: ${error.message}`);
    }
  }

  return {
    path,

    async read(goalId) {
      const all = await readAll();
      return all[goalId] ?? null;
    },

    /** Records the Tech Lead's choice for a Goal that has not started yet. */
    async write(goalId, { profile, reason = null, selectedBy = 'tech_lead', stage = null }) {
      assertSelectableProfile(profile, 'developerProfile');
      const all = await readAll();
      const record = {
        goal: goalId,
        profile,
        reason: typeof reason === 'string' ? reason.slice(0, 200) : null,
        selectedBy,
        stage,
        at: new Date().toISOString(),
      };
      await mkdir(stateDir, { recursive: true });
      const temporary = `${path}.${randomUUID().slice(0, 8)}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ ...all, [goalId]: record }, null, 2)}\n`, 'utf8');
      await rename(temporary, path);
      return record;
    },
  };
}
