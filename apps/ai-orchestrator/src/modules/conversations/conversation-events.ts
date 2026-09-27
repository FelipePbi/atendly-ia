import type { DiagnosticLogger } from "../../lib/diagnostic-log.js";

/**
 * Entrada da derivação: só o que uma `AiToolCall` de `create_appointment`
 * guarda hoje. Nenhum campo de texto (`outputText`, `Message.body`,
 * `Conversation.state`) entra aqui — o Goal070 §1 exige que o evento venha
 * só do ledger.
 */
export interface ConversationToolCallRecord {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  status: "STARTED" | "SUCCEEDED" | "FAILED";
  arguments: unknown;
  result: unknown;
}

export interface HoldPlacedEvent {
  type: "HOLD_PLACED";
  id: string;
  occurredAt: string;
  date: string;
  startTime: string;
  holdExpiresAt: string;
}

export interface HoldExpiredEvent {
  type: "HOLD_EXPIRED";
  id: string;
  occurredAt: string;
  date: string;
  startTime: string;
}

export interface AppointmentCreatedEvent {
  type: "APPOINTMENT_CREATED";
  id: string;
  occurredAt: string;
  appointmentId: string;
  date: string;
  startTime: string;
}

export type ConversationEvent =
  | HoldPlacedEvent
  | HoldExpiredEvent
  | AppointmentCreatedEvent;

export interface DeriveConversationEventsInput {
  tenantId: string;
  conversationId: string;
  toolCalls: readonly ConversationToolCallRecord[];
  now: Date;
  logger?: Pick<DiagnosticLogger, "warn">;
}

const APPOINTMENT_HOLD_EXPIRED_CODE = "APPOINTMENT_HOLD_EXPIRED";

interface HoldState {
  toolCallId: string;
  occurredAt: Date;
  date: string;
  startTime: string;
  holdExpiresAt: string;
  consumed: boolean;
  superseded: boolean;
  provenExpiredByFailedConfirm: boolean;
}

/**
 * Deriva os eventos de agenda de uma conversa, só a partir do ledger
 * `AiToolCall` de `create_appointment` (Goal070 §1, D-073).
 *
 * Assume um slot único de rascunho, como `Conversation.state.pendingAction`:
 * um `confirm` liga-se ao `prepare` mais recente ainda não consumido nem
 * substituído, pela ordem das chamadas — nunca por `holdId`, que o `result`
 * do `confirm` não traz.
 *
 * Um hold só é `superseded` quando o `prepare` seguinte chega antes dele
 * vencer. Se já venceu (por relógio ou por `confirm` FAILED
 * APPOINTMENT_HOLD_EXPIRED) antes do próximo `prepare`, ele permanece
 * elegível a `HOLD_EXPIRED` (Goal070 §1).
 */
export function deriveConversationEvents(
  input: DeriveConversationEventsInput,
): ConversationEvent[] {
  const logger = input.logger;
  const calls = [...input.toolCalls].sort(compareToolCalls);

  const holds: HoldState[] = [];
  const events: ConversationEvent[] = [];
  let currentHold: HoldState | null = null;

  for (const call of calls) {
    const action = readAction(call.arguments);
    const occurredAt = call.completedAt ?? call.createdAt;

    if (call.status !== "SUCCEEDED") {
      if (
        call.status === "FAILED" &&
        action === "confirm" &&
        readFailureCode(call.result) === APPOINTMENT_HOLD_EXPIRED_CODE &&
        currentHold
      ) {
        currentHold.provenExpiredByFailedConfirm = true;
      }
      continue;
    }

    if (action === "prepare") {
      const parsed = parsePrepareResult(call.result);
      if (!parsed.ok) {
        discard(logger, input, call.id, parsed.field);
        continue;
      }
      if (currentHold && !currentHold.consumed) {
        const previousHoldExpired =
          currentHold.provenExpiredByFailedConfirm ||
          new Date(currentHold.holdExpiresAt).getTime() <= occurredAt.getTime();
        if (!previousHoldExpired) {
          currentHold.superseded = true;
        }
      }
      const hold: HoldState = {
        toolCallId: call.id,
        occurredAt,
        date: parsed.date,
        startTime: parsed.startTime,
        holdExpiresAt: parsed.holdExpiresAt,
        consumed: false,
        superseded: false,
        provenExpiredByFailedConfirm: false,
      };
      holds.push(hold);
      currentHold = hold;
      events.push({
        type: "HOLD_PLACED",
        id: call.id,
        occurredAt: occurredAt.toISOString(),
        date: parsed.date,
        startTime: parsed.startTime,
        holdExpiresAt: parsed.holdExpiresAt,
      });
      continue;
    }

    if (action === "confirm") {
      const parsed = parseConfirmResult(call.result);
      if (!parsed.ok) {
        discard(logger, input, call.id, parsed.field);
        continue;
      }
      if (currentHold && !currentHold.consumed && !currentHold.superseded) {
        currentHold.consumed = true;
      }
      events.push({
        type: "APPOINTMENT_CREATED",
        id: call.id,
        occurredAt: occurredAt.toISOString(),
        appointmentId: parsed.appointmentId,
        date: parsed.date,
        startTime: parsed.startTime,
      });
    }
  }

  for (const hold of holds) {
    if (hold.consumed || hold.superseded) continue;
    const expiresAt = new Date(hold.holdExpiresAt);
    if (!hold.provenExpiredByFailedConfirm && expiresAt.getTime() > input.now.getTime()) {
      continue;
    }
    events.push({
      type: "HOLD_EXPIRED",
      id: `${hold.toolCallId}:expired`,
      occurredAt: hold.holdExpiresAt,
      date: hold.date,
      startTime: hold.startTime,
    });
  }

  return events.sort(compareEvents);
}

function compareToolCalls(
  a: ConversationToolCallRecord,
  b: ConversationToolCallRecord,
): number {
  const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareEvents(a: ConversationEvent, b: ConversationEvent): number {
  const byOccurredAt = a.occurredAt.localeCompare(b.occurredAt);
  if (byOccurredAt !== 0) return byOccurredAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAction(args: unknown): "prepare" | "confirm" | null {
  if (!isRecord(args)) return null;
  return args.action === "prepare" || args.action === "confirm"
    ? args.action
    : null;
}

function readFailureCode(result: unknown): string | null {
  if (!isRecord(result) || result.ok !== false) return null;
  const error = result.error;
  return isRecord(error) && typeof error.code === "string" ? error.code : null;
}

type ParseResult<T> = { ok: true } & T | { ok: false; field: string };

function parsePrepareResult(
  result: unknown,
): ParseResult<{ date: string; startTime: string; holdExpiresAt: string }> {
  if (!isRecord(result) || result.ok !== true) {
    return { ok: false, field: "result" };
  }
  const data = result.data;
  if (!isRecord(data)) return { ok: false, field: "data" };

  const pendingAction = data.pendingAction;
  if (!isRecord(pendingAction)) {
    return { ok: false, field: "pendingAction" };
  }
  if (typeof pendingAction.date !== "string") {
    return { ok: false, field: "pendingAction.date" };
  }
  if (typeof pendingAction.startTime !== "string") {
    return { ok: false, field: "pendingAction.startTime" };
  }

  const hold = data.hold;
  if (!isRecord(hold)) return { ok: false, field: "hold" };
  if (typeof hold.expiresAt !== "string") {
    return { ok: false, field: "hold.expiresAt" };
  }

  return {
    ok: true,
    date: pendingAction.date,
    startTime: pendingAction.startTime,
    holdExpiresAt: hold.expiresAt,
  };
}

function parseConfirmResult(
  result: unknown,
): ParseResult<{ appointmentId: string; date: string; startTime: string }> {
  if (!isRecord(result) || result.ok !== true) {
    return { ok: false, field: "result" };
  }
  const data = result.data;
  if (!isRecord(data)) return { ok: false, field: "data" };

  const appointment = data.appointment;
  if (!isRecord(appointment)) return { ok: false, field: "appointment" };
  if (typeof appointment.id !== "string") {
    return { ok: false, field: "appointment.id" };
  }
  if (typeof appointment.date !== "string") {
    return { ok: false, field: "appointment.date" };
  }
  if (typeof appointment.startTime !== "string") {
    return { ok: false, field: "appointment.startTime" };
  }

  return {
    ok: true,
    appointmentId: appointment.id,
    date: appointment.date,
    startTime: appointment.startTime,
  };
}

function discard(
  logger: Pick<DiagnosticLogger, "warn"> | undefined,
  input: DeriveConversationEventsInput,
  toolCallId: string,
  field: string,
): void {
  logger?.warn(
    {
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      toolCallId,
      field,
    },
    "Discarded create_appointment tool call with unexpected result shape",
  );
}
