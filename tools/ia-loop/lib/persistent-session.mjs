/**
 * IA Loop — persistent agent session.
 *
 * Context per agent is what matters, not a process that stays alive forever.
 * The Claude Code CLI already persists a conversation to disk and resumes it by
 * id, so each turn is a short-lived process:
 *
 *   turn 1: --session-id <uuid>   (creates and persists the conversation)
 *   turn N: --resume <uuid>       (continues it, keeping the same id)
 *
 * That is strictly more robust than holding a long-lived child process: it
 * survives the orchestrator dying, a reboot, or a machine handover, and the
 * same session can later be opened in a visible terminal.
 */

import { randomUUID } from 'node:crypto';

import { SpikeError, invokeAgent } from './claude-process.mjs';
import { SESSION_STATUS } from './session-registry.mjs';

/**
 * Creates a handle to one agent's persistent conversation.
 *
 * `sessionId` may come from a registry loaded off disk, in which case the first
 * send already resumes an existing conversation rather than creating one.
 */
export function createPersistentSession({
  executable,
  role,
  model,
  expectedFamily,
  cwd,
  sessionId = randomUUID(),
  started = false,
  timeoutMs = 180_000,
}) {
  if (!role) throw new SpikeError('INVALID_ARGS', 'role is required');
  if (!model) throw new SpikeError('INVALID_ARGS', 'model is required');
  if (!cwd) throw new SpikeError('INVALID_ARGS', 'cwd is required');

  let turns = 0;
  let hasConversation = started;
  let status = started ? SESSION_STATUS.ACTIVE : SESSION_STATUS.CREATED;
  let lastActivity = null;

  return {
    role,
    model,
    cwd,

    get sessionId() {
      return sessionId;
    },
    get turns() {
      return turns;
    },
    get status() {
      return status;
    },
    get lastActivity() {
      return lastActivity;
    },

    /** Snapshot for the durable registry. */
    toRecord() {
      return { role, model, sessionId, status, cwd, turns, lastActivity };
    },

    /**
     * Sends one message. The first send creates the conversation; every later
     * send resumes it, so context accumulates across separate processes.
     */
    async send({
      prompt, jsonSchema, validatePayload, timeoutMs: perCallTimeout,
      tools = '', permissionMode = null, addDirs = [], safeMode = true,
    }) {
      const outcome = await invokeAgent({
        executable,
        model,
        expectedFamily,
        expectedRole: role,
        prompt,
        jsonSchema,
        validatePayload,
        cwd,
        sessionId,
        persistSession: true,
        resume: hasConversation,
        tools,
        permissionMode,
        addDirs,
        safeMode,
        timeoutMs: perCallTimeout ?? timeoutMs,
      });

      turns += 1;
      lastActivity = new Date().toISOString();

      if (outcome.error) {
        status = SESSION_STATUS.ERROR;
        return outcome;
      }

      // Only mark the conversation as resumable once a turn actually landed;
      // otherwise a later send would try to resume something that never existed.
      hasConversation = true;
      status = SESSION_STATUS.ACTIVE;
      return outcome;
    },
  };
}
